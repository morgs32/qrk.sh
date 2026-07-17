/*
 * System-worker annotation:
 * Implements the ServiceRepo finalize Service Commands operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { applyMutationTx } from '@zerospin/core/contracts/applyMutationTx';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type {
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedServiceCommand,
  IFailedServiceCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { dutils } from '@zerospin/core/utils/dutils';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { IServiceBlock } from '../../types.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

export const finalizeServiceCommands = Effect.fn(
  'ServiceRepo.finalizeServiceCommands',
)(function* (props: {
  serviceName: string;
  commands: readonly IServiceCommand[];
  db: IDb;
}) {
  const { serviceName, commands, db } = props;

  if (commands.length === 0) {
    return yield* new ZerospinError({
      code: 'no-commands-provided',
      message: 'No commands provided',
    });
  }

  const lastCursorRow = db
    .select({
      serviceIndex: serviceRepoDrizzleSchemas.serviceCursors.serviceIndex,
    })
    .from(serviceRepoDrizzleSchemas.serviceCursors)
    .orderBy(desc(serviceRepoDrizzleSchemas.serviceCursors.serviceIndex))
    .get();
  let currentServiceIndex = lastCursorRow?.serviceIndex ?? 0;
  const serviceController = system.serviceControllers[serviceName];

  if (serviceController === undefined) {
    const failedAt = yield* dutils.date();
    const failure = ZerospinError.stringify(
      new ZerospinError({
        code: 'service-not-found',
        message: `Service ${serviceName} was not found`,
        extra: { serviceName },
      }),
    );

    const failedCommands: IFailedServiceCommand[] = [];
    for (const command of commands) {
      currentServiceIndex += 1;
      const serviceCursor = yield* makeCursor({
        abbreviation: coreAbbreviations.serviceCursor,
      });
      failedCommands.push({
        ...command,
        serviceCursor,
        serviceIndex: currentServiceIndex,
        failedAt,
        failure,
        status: 'failed',
      });
    }

    return {
      executedCommands: [],
      failedCommands,
    };
  }

  return yield* makeTx({
    db,
    program: Effect.fn('ServiceRepo.finalizeServiceCommands.transaction')(
      function* ({ tx }) {
        const executedCommands: IExecutedServiceCommand[] = [];
        const failedCommands: IFailedServiceCommand[] = [];
        const appliedMutations: IEncodedAppliedMutation[] = [];
        let lastServiceCursor = null;

        for (const command of commands) {
          currentServiceIndex += 1;
          const serviceCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.serviceCursor,
          });
          lastServiceCursor = serviceCursor;
          const now = yield* dutils.date();

          if (command.serviceName !== serviceName) {
            failedCommands.push({
              ...command,
              serviceCursor,
              serviceIndex: currentServiceIndex,
              failedAt: now,
              failure: ZerospinError.stringify(
                new ZerospinError({
                  code: 'service-command-name-mismatch',
                  message: `Service command ${command.id} targets ${command.serviceName}, not ${serviceName}`,
                }),
              ),
              status: 'failed',
            });
            tx.insert(serviceRepoDrizzleSchemas.serviceCursors)
              .values({
                commandId: command.id,
                serviceCursor,
                serviceIndex: currentServiceIndex,
                appliedAt: now,
              })
              .onConflictDoNothing()
              .run();
            continue;
          }

          const contract = yield* getByKeyOrThrow({
            record: serviceController.contracts,
            key: command.commandName,
            recordKind: 'service contracts',
          });
          const maybeMutations = yield* makeMutations({
            contract,
            models: serviceController.models,
            owner: {
              kind: 'service',
              serviceName: serviceController.name,
            },
            command,
          }).pipe(Effect.either);

          if (Either.isLeft(maybeMutations)) {
            failedCommands.push({
              ...command,
              serviceCursor,
              serviceIndex: currentServiceIndex,
              failedAt: now,
              failure: ZerospinError.stringify(maybeMutations.left),
              status: 'failed',
            });
            tx.insert(serviceRepoDrizzleSchemas.serviceCursors)
              .values({
                commandId: command.id,
                serviceCursor,
                serviceIndex: currentServiceIndex,
                appliedAt: now,
              })
              .onConflictDoNothing()
              .run();
            continue;
          }

          for (const [
            mutationIndex,
            mutation,
          ] of maybeMutations.right.mutations.entries()) {
            if (mutation.operationName === 'replicateResource') {
              return yield* new ZerospinError({
                code: 'service-contract-cannot-replicate-resource',
                message: `Service contract ${command.commandName} cannot emit replicateResource`,
              });
            }
            const appliedMutation = yield* applyMutationTx({
              tx,
              mutation,
              commandId: command.id,
              mutationIndex,
              appliedAt: now,
            });
            appliedMutations.push(
              yield* encodeAppliedMutation({ mutation: appliedMutation }),
            );
          }

          tx.insert(serviceRepoDrizzleSchemas.serviceCursors)
            .values({
              commandId: command.id,
              serviceCursor,
              serviceIndex: currentServiceIndex,
              appliedAt: now,
            })
            .onConflictDoNothing()
            .run();
          executedCommands.push({
            ...command,
            mode: 'authoritative',
            serviceCursor,
            serviceIndex: currentServiceIndex,
            executedAt: now,
            status: 'executed',
          });
        }

        if (lastServiceCursor === null) {
          return yield* new ZerospinError({
            code: 'service-block-has-no-command-rows',
            message: 'Cannot make a service block with no command rows',
          });
        }

        const encodedExecutedCommands: IEncodedCommand<IExecutedServiceCommand>[] =
          [];
        for (const command of executedCommands) {
          const contract = yield* getByKeyOrThrow({
            record: serviceController.contracts,
            key: command.commandName,
            recordKind: 'service contracts',
          });
          encodedExecutedCommands.push(
            yield* encodeCommand({ contract, command }),
          );
        }
        const encodedFailedCommands: IEncodedCommand<IFailedServiceCommand>[] =
          [];
        for (const command of failedCommands) {
          const contract = yield* getByKeyOrThrow({
            record: serviceController.contracts,
            key: command.commandName,
            recordKind: 'service contracts',
          });
          encodedFailedCommands.push(
            yield* encodeCommand({ contract, command }),
          );
        }
        const block = {
          executedCommands: encodedExecutedCommands,
          failedCommands: encodedFailedCommands,
          appliedMutations,
          lastServiceCursor,
          serviceIndex: currentServiceIndex,
        } satisfies IServiceBlock;
        const encodedBlock = yield* Schema.encode(
          Schema.parseJson(ServiceBlockSchema),
        )(block).pipe(
          mapParseError({
            code: 'service-block-encode-failed',
            prefix: 'Failed to encode finalized service block',
          }),
        );

        tx.insert(serviceRepoDrizzleSchemas.serviceBlockOutbox)
          .values({
            lastServiceCursor,
            serviceIndex: currentServiceIndex,
            block: encodedBlock,
            publishedAt: null,
            failure: null,
          })
          .onConflictDoNothing()
          .run();

        return { executedCommands, failedCommands };
      },
    ),
  });
});
