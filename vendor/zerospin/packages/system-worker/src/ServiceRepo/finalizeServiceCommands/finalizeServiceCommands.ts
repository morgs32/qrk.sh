/*
 * System-worker annotation:
 * Implements the ServiceRepo finalize Service Commands operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { applyMutationTx } from '@zerospin/core/contracts/applyMutationTx';
import {
  EncodedExecutedServiceCommandSchema,
  EncodedFailedServiceCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type {
  IAnyMutation,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedServiceCommand,
  IFailedServiceCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { dutils } from '@zerospin/core/utils/dutils';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { IServiceBlock } from '../../types.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

export const finalizeServiceCommands = Effect.fn(
  'ServiceRepo.finalizeServiceCommands',
)(function* (props: {
  writeIndex: number;
  serviceName: string;
  commands: readonly IEncodedCommand<IServiceCommand>[];
  db: IDb;
  key: { generationId: string; serviceName: string };
}) {
  const { writeIndex, serviceName, commands, db, key } = props;

  if (!Number.isSafeInteger(writeIndex) || writeIndex < 1) {
    return yield* new ZerospinError({
      code: 'service-finalization-write-index-invalid',
      message: `Service finalization writeIndex must be a positive safe integer, received ${writeIndex}`,
    });
  }
  if (commands.length === 0) {
    return yield* new ZerospinError({
      code: 'no-commands-provided',
      message: 'No commands provided',
    });
  }
  if (serviceName !== key.serviceName) {
    return yield* new ZerospinError({
      code: 'service-finalization-target-mismatch',
      message: 'Service finalization does not match its bound ServiceRepo',
    });
  }

  const commandBytesById = new Map<string, string>();
  const retainedOutcomes = new Map<
    string,
    Readonly<{
      command:
        | IEncodedCommand<IExecutedServiceCommand>
        | IEncodedCommand<IFailedServiceCommand>;
      appliedMutations: readonly IEncodedAppliedMutation[];
    }>
  >();
  const unseenCommands: IEncodedCommand<IServiceCommand>[] = [];

  // Validate every retained ID before preparing or applying any unseen command.
  for (const command of commands) {
    const commandBytes = yield* Schema.encode(
      Schema.parseJson(EncodedServiceCommandSchema),
    )(command).pipe(
      mapParseError({
        code: 'service-command-comparison-encode-failed',
        prefix: `Failed to encode service command ${command.id} for exact comparison`,
      }),
    );
    const repeatedBytes = commandBytesById.get(command.id);
    if (repeatedBytes !== undefined) {
      if (repeatedBytes !== commandBytes) {
        return yield* new ZerospinError({
          code: 'service-command-outcome-conflict',
          message: `Service command ${command.id} appears with conflicting bytes in one request`,
        });
      }
      continue;
    }
    commandBytesById.set(command.id, commandBytes);

    const retained = db
      .select()
      .from(serviceRepoDrizzleSchemas.serviceCommandOutcomes)
      .where(
        eq(
          serviceRepoDrizzleSchemas.serviceCommandOutcomes.commandId,
          command.id,
        ),
      )
      .get();
    if (retained === undefined) {
      unseenCommands.push(command);
      continue;
    }
    if (retained.commandBytes !== commandBytes) {
      return yield* new ZerospinError({
        code: 'service-command-outcome-conflict',
        message: `Service command ${command.id} conflicts with its retained terminal outcome`,
      });
    }
    const terminalCommand = yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Union(
          EncodedExecutedServiceCommandSchema,
          EncodedFailedServiceCommandSchema,
        ),
      ),
    )(retained.command).pipe(
      mapParseError({
        code: 'service-command-outcome-decode-failed',
        prefix: `Failed to decode retained service command outcome ${command.id}`,
      }),
    );
    const appliedMutations = yield* Schema.decodeUnknown(
      Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
    )(retained.appliedMutations).pipe(
      mapParseError({
        code: 'service-command-outcome-mutations-decode-failed',
        prefix: `Failed to decode retained service command mutations ${command.id}`,
      }),
    );
    retainedOutcomes.set(command.id, {
      command: terminalCommand,
      appliedMutations,
    });
  }

  if (unseenCommands.length > 0) {
    const serviceController = system.services[serviceName];
    const preparedCommands: Array<{
      command: IServiceCommand;
      encodedCommand: IEncodedCommand<IServiceCommand>;
      mutations: Either.Either<readonly IAnyMutation[], IAnyError>;
    }> = [];
    for (const encodedCommand of unseenCommands) {
      let command: IServiceCommand = encodedCommand;
      const mutations = yield* Effect.gen(function* () {
        if (encodedCommand.serviceName !== serviceName) {
          return yield* new ZerospinError({
            code: 'system-runtime-service-command-scope-mismatch',
            message: `Service command ${encodedCommand.id} targets ${encodedCommand.serviceName}, not ${serviceName}`,
          });
        }
        if (serviceController === undefined) {
          return yield* new ZerospinError({
            code: 'service-not-found',
            message: `Service ${serviceName} was not found`,
            extra: { serviceName },
          });
        }
        const contract = Object.values(serviceController.contracts).find(
          candidate => candidate.commandName === encodedCommand.commandName,
        );
        if (contract === undefined) {
          return yield* new ZerospinError({
            code: 'service-contract-not-found',
            message: `Service contract "${encodedCommand.commandName}" was not found`,
          });
        }
        const payload = yield* contract.decodeAndAdaptPayload({
          command: encodedCommand,
        });
        command = { ...encodedCommand, payload };
        const prepared = yield* makeMutations({
          contract,
          models: serviceController.models,
          owner: { kind: 'service', serviceName: serviceController.name },
          command,
        });
        return prepared.mutations;
      }).pipe(Effect.either);
      preparedCommands.push({ command, encodedCommand, mutations });
    }

    const lastOutcome = db
      .select({
        serviceIndex:
          serviceRepoDrizzleSchemas.serviceCommandOutcomes.serviceIndex,
      })
      .from(serviceRepoDrizzleSchemas.serviceCommandOutcomes)
      .orderBy(
        desc(serviceRepoDrizzleSchemas.serviceCommandOutcomes.serviceIndex),
      )
      .get();
    let currentServiceIndex = lastOutcome?.serviceIndex ?? 0;

    const createdOutcomes = yield* makeTx({
      db,
      program: Effect.fn('ServiceRepo.finalizeServiceCommands.transaction')(
        function* ({ tx }) {
          const encodedExecutedCommands: IEncodedCommand<IExecutedServiceCommand>[] =
            [];
          const encodedFailedCommands: IEncodedCommand<IFailedServiceCommand>[] =
            [];
          const appliedMutations: IEncodedAppliedMutation[] = [];
          const outcomes: Array<
            Readonly<{
              command:
                | IEncodedCommand<IExecutedServiceCommand>
                | IEncodedCommand<IFailedServiceCommand>;
              appliedMutations: readonly IEncodedAppliedMutation[];
            }>
          > = [];
          let lastServiceCursor = null;

          for (const preparedCommand of preparedCommands) {
            const { command } = preparedCommand;
            currentServiceIndex += 1;
            const serviceCursor = yield* makeCursor({
              abbreviation: coreAbbreviations.serviceCursor,
            });
            lastServiceCursor = serviceCursor;
            const now = yield* dutils.date();

            const preparedMutations = preparedCommand.mutations;
            const maybeAppliedMutations = Either.isLeft(preparedMutations)
              ? Either.left(preparedMutations.left)
              : yield* withSavepoint({
                  tx,
                  program: Effect.fn(
                    'ServiceRepo.finalizeServiceCommands.commandSavepoint',
                  )(function* ({ tx: savepointTx }) {
                    const commandAppliedMutations: IEncodedAppliedMutation[] =
                      [];
                    const mutations = preparedMutations.right;
                    for (const [
                      mutationIndex,
                      mutation,
                    ] of mutations.entries()) {
                      if (mutation.operationName === 'replicateResource') {
                        return yield* new ZerospinError({
                          code: 'service-contract-cannot-replicate-resource',
                          message: `Service contract ${command.commandName} cannot emit replicateResource`,
                        });
                      }
                      const appliedMutation = yield* applyMutationTx({
                        tx: savepointTx,
                        mutation,
                        commandId: command.id,
                        mutationIndex,
                        appliedAt: now,
                      });
                      commandAppliedMutations.push(
                        yield* encodeAppliedMutation({
                          mutation: appliedMutation,
                        }),
                      );
                    }
                    return commandAppliedMutations;
                  }),
                }).pipe(Effect.either);

            let terminalCommand:
              | IEncodedCommand<IExecutedServiceCommand>
              | IEncodedCommand<IFailedServiceCommand>;
            let commandMutations: readonly IEncodedAppliedMutation[];
            if (Either.isLeft(maybeAppliedMutations)) {
              const failedCommand = {
                ...command,
                serviceCursor,
                serviceIndex: currentServiceIndex,
                failedAt: now,
                failure: ZerospinError.stringify(maybeAppliedMutations.left),
                status: 'failed',
              } satisfies IFailedServiceCommand;
              terminalCommand = yield* Schema.validate(
                EncodedFailedServiceCommandSchema,
              )(
                {
                  ...failedCommand,
                  payload: preparedCommand.encodedCommand.payload,
                },
                { onExcessProperty: 'error' },
              ).pipe(
                mapParseError({
                  code: 'system-runtime-failed-service-command-encoding-invalid',
                  prefix: `Dynamic service command encoding ${serviceName}.${command.commandName} produced an invalid failed command`,
                }),
              );
              encodedFailedCommands.push(terminalCommand);
              commandMutations = [];
            } else {
              const executedCommand = {
                ...command,
                mode: 'authoritative',
                serviceCursor,
                serviceIndex: currentServiceIndex,
                executedAt: now,
                status: 'executed',
              } satisfies IExecutedServiceCommand;
              terminalCommand = yield* Schema.validate(
                EncodedExecutedServiceCommandSchema,
              )(
                {
                  ...executedCommand,
                  payload: preparedCommand.encodedCommand.payload,
                },
                { onExcessProperty: 'error' },
              ).pipe(
                mapParseError({
                  code: 'system-runtime-executed-service-command-encoding-invalid',
                  prefix: `Dynamic service command encoding ${serviceName}.${command.commandName} produced an invalid executed command`,
                }),
              );
              encodedExecutedCommands.push(terminalCommand);
              commandMutations = maybeAppliedMutations.right;
              appliedMutations.push(...commandMutations);
            }

            const commandBytes = commandBytesById.get(command.id);
            if (commandBytes === undefined) {
              return yield* new ZerospinError({
                code: 'service-command-comparison-bytes-missing',
                message: `Service command ${command.id} has no request comparison bytes`,
              });
            }
            const encodedTerminalCommand = yield* Schema.encode(
              Schema.parseJson(
                Schema.Union(
                  EncodedExecutedServiceCommandSchema,
                  EncodedFailedServiceCommandSchema,
                ),
              ),
            )(terminalCommand).pipe(
              mapParseError({
                code: 'service-command-outcome-encode-failed',
                prefix: `Failed to encode service command outcome ${command.id}`,
              }),
            );
            const encodedCommandMutations = yield* Schema.encode(
              Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
            )(commandMutations).pipe(
              mapParseError({
                code: 'service-command-outcome-mutations-encode-failed',
                prefix: `Failed to encode service command mutations ${command.id}`,
              }),
            );
            tx.insert(serviceRepoDrizzleSchemas.serviceCommandOutcomes)
              .values({
                commandId: command.id,
                commandBytes,
                command: encodedTerminalCommand,
                serviceCursor,
                serviceIndex: currentServiceIndex,
                appliedMutations: encodedCommandMutations,
                writeIndex,
              })
              .run();
            outcomes.push({
              command: terminalCommand,
              appliedMutations: commandMutations,
            });
          }

          if (lastServiceCursor === null) {
            return yield* new ZerospinError({
              code: 'service-block-has-no-command-rows',
              message: 'Cannot make a service block with no command rows',
            });
          }

          const block = {
            writeIndex,
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
            .run();

          return outcomes;
        },
      ),
    });
    for (const outcome of createdOutcomes) {
      retainedOutcomes.set(outcome.command.id, outcome);
    }
  }

  const executedCommands: IEncodedCommand<IExecutedServiceCommand>[] = [];
  const failedCommands: IEncodedCommand<IFailedServiceCommand>[] = [];
  for (const requestedCommand of commands) {
    const outcome = retainedOutcomes.get(requestedCommand.id);
    if (outcome === undefined) {
      return yield* new ZerospinError({
        code: 'service-command-outcome-missing',
        message: `Service command ${requestedCommand.id} has no terminal outcome`,
      });
    }
    if (outcome.command.status === 'executed') {
      executedCommands.push(outcome.command);
    } else {
      failedCommands.push(outcome.command);
    }
  }

  return { executedCommands, failedCommands };
});
