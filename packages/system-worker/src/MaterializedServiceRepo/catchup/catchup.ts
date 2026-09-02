import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedServiceCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { upsertHelper } from '@zerospin/core/drizzle/upsertHelper';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { eq, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getServiceCommandChain } from '../../ServiceCommandChain/getServiceCommandChain/getServiceCommandChain.js';
import { materializedServiceRepoDrizzleSchemas } from '../MaterializedServiceRepoDbConfig.js';

export const catchup = Effect.fn('MaterializedServiceRepo.catchup')(
  function* (props: {
    db: IDb;
    serviceName: string;
    systemId: string;
    throughServiceIndex: number | undefined;
  }) {
    const service = yield* getByKeyOrThrow({
      record: system.services,
      key: props.serviceName,
      recordKind: 'services',
    });
    const chain = yield* getServiceCommandChain({
      key: { systemId: props.systemId, serviceName: props.serviceName },
    });
    let currentServiceIndex =
      props.db
        .select()
        .from(materializedServiceRepoDrizzleSchemas.materializationState)
        .where(
          eq(materializedServiceRepoDrizzleSchemas.materializationState.id, 1),
        )
        .get()?.serviceIndex ?? 0;

    while (
      props.throughServiceIndex === undefined ||
      currentServiceIndex < props.throughServiceIndex
    ) {
      const page = yield* makeAsync<
        IEncodedResult<
          Readonly<{
            commands: readonly Schema.Schema.Type<
              typeof ServiceChainedCommandSchema
            >[];
            tip: number | null;
          }>,
          IAnyErrorJson
        >,
        IAnyError
      >(
        () =>
          chain.getCommands({
            afterServiceIndex:
              currentServiceIndex === 0 ? null : currentServiceIndex,
          }),
        ZerospinError.catch({
          code: 'materialized-service-catchup-rpc-failed',
          message: 'Failed to pull ServiceCommandChain history',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      if (page.commands.length === 0) {
        if (
          props.throughServiceIndex !== undefined &&
          currentServiceIndex < props.throughServiceIndex
        ) {
          return yield* new ZerospinError({
            code: 'materialized-service-catchup-history-incomplete',
            message: `Service history ended before serviceIndex ${props.throughServiceIndex}`,
          });
        }
        return;
      }

      for (const command of page.commands) {
        if (
          props.throughServiceIndex !== undefined &&
          command.serviceIndex > props.throughServiceIndex
        ) {
          break;
        }
        const expectedServiceIndex = currentServiceIndex + 1;
        if (command.serviceIndex !== expectedServiceIndex) {
          return yield* new ZerospinError({
            code: 'materialized-service-catchup-index-gap',
            message: `MaterializedServiceRepo catchup expected serviceIndex ${expectedServiceIndex}, received ${command.serviceIndex}`,
          });
        }
        if (command.delta === null) {
          return yield* new ZerospinError({
            code: 'materialized-service-catchup-pending-command',
            message: `Service history returned pending serviceIndex ${command.serviceIndex}`,
          });
        }
        const {
          serviceIndex: _serviceIndex,
          chainedAt: _chainedAt,
          delta: _delta,
          failedAt: _failedAt,
          failure: _failure,
          ...inputCommand
        } = command;
        const canonicalBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(EncodedServiceCommandSchema),
        )(inputCommand).pipe(
          mapParseError({
            code: 'materialized-service-catchup-input-encode-failed',
            prefix: `Failed to encode service command ${command.serviceIndex}`,
          }),
        );
        const resultBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(ServiceChainedCommandSchema),
        )(command).pipe(
          mapParseError({
            code: 'materialized-service-catchup-result-encode-failed',
            prefix: `Failed to encode service result ${command.serviceIndex}`,
          }),
        );

        yield* makeTx({
          db: props.db,
          program: Effect.fn('MaterializedServiceRepo.catchup.transaction')(
            function* ({ tx }) {
              const state = tx
                .select()
                .from(
                  materializedServiceRepoDrizzleSchemas.materializationState,
                )
                .where(
                  eq(
                    materializedServiceRepoDrizzleSchemas.materializationState
                      .id,
                    1,
                  ),
                )
                .get();
              if ((state?.serviceIndex ?? 0) !== currentServiceIndex) {
                return yield* new ZerospinError({
                  code: 'materialized-service-catchup-frontier-conflict',
                  message: `MaterializedServiceRepo frontier changed before serviceIndex ${command.serviceIndex}`,
                });
              }
              const retained = tx
                .select()
                .from(materializedServiceRepoDrizzleSchemas.executionClaims)
                .where(
                  or(
                    eq(
                      materializedServiceRepoDrizzleSchemas.executionClaims
                        .serviceIndex,
                      command.serviceIndex,
                    ),
                    eq(
                      materializedServiceRepoDrizzleSchemas.executionClaims
                        .commandId,
                      command.id,
                    ),
                  ),
                )
                .get();
              if (retained !== undefined) {
                if (
                  retained.serviceIndex !== command.serviceIndex ||
                  retained.commandId !== command.id ||
                  retained.canonicalBytes !== canonicalBytes ||
                  retained.chainedAt.getTime() !== command.chainedAt.getTime()
                ) {
                  return yield* new ZerospinError({
                    code: 'materialized-service-catchup-claim-conflict',
                    message: `Service execution ${command.serviceIndex} differs from its retained claim`,
                  });
                }
                if (retained.result === null) {
                  return yield* new ZerospinError({
                    code: 'materialized-service-execution-in-doubt',
                    message: `Service execution ${command.serviceIndex} was claimed without a retained result`,
                  });
                }
                if (retained.result !== resultBytes) {
                  return yield* new ZerospinError({
                    code: 'materialized-service-catchup-result-conflict',
                    message: `Service execution ${command.serviceIndex} differs from its retained result`,
                  });
                }
              } else {
                for (const resource of [
                  ...command.delta.inserted,
                  ...command.delta.updated,
                ]) {
                  const model = yield* getByKeyOrThrow({
                    record: service.models,
                    key: resource.modelName,
                    recordKind: `models owned by service ${props.serviceName}`,
                  });
                  upsertHelper({
                    table: model.drizzleSchema,
                    tx,
                    values: resource,
                  });
                }
                for (const resource of command.delta.deleted) {
                  const model = yield* getByKeyOrThrow({
                    record: service.models,
                    key: resource.modelName,
                    recordKind: `models owned by service ${props.serviceName}`,
                  });
                  tx.delete(model.drizzleSchema)
                    .where(eq(model.drizzleSchema.id, resource.id))
                    .run();
                }
                tx.insert(materializedServiceRepoDrizzleSchemas.executionClaims)
                  .values({
                    serviceIndex: command.serviceIndex,
                    commandId: command.id,
                    canonicalBytes,
                    chainedAt: command.chainedAt,
                    command: canonicalBytes,
                    claimedAt: command.chainedAt,
                    result: resultBytes,
                  })
                  .run();
              }
              tx.insert(
                materializedServiceRepoDrizzleSchemas.materializationState,
              )
                .values({ id: 1, serviceIndex: command.serviceIndex })
                .onConflictDoUpdate({
                  target:
                    materializedServiceRepoDrizzleSchemas.materializationState
                      .id,
                  set: { serviceIndex: command.serviceIndex },
                })
                .run();
            },
          ),
        });
        currentServiceIndex = command.serviceIndex;
      }

      if (
        props.throughServiceIndex !== undefined &&
        currentServiceIndex >= props.throughServiceIndex
      ) {
        return;
      }
      if (page.tip === null || currentServiceIndex >= page.tip) {
        if (props.throughServiceIndex !== undefined) {
          return yield* new ZerospinError({
            code: 'materialized-service-catchup-history-incomplete',
            message: `Service history tip did not reach serviceIndex ${props.throughServiceIndex}`,
          });
        }
        return;
      }
    }
  },
);
