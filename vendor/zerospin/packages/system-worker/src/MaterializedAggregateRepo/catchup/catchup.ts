import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
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

import { getAggregateCommandChain } from '../../AggregateCommandChain/getAggregateCommandChain/getAggregateCommandChain.js';
import { materializedAggregateRepoDrizzleSchemas } from '../MaterializedAggregateRepoDbConfig.js';

export const catchup = Effect.fn('MaterializedAggregateRepo.catchup')(
  function* (props: {
    db: IDb;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
    };
    throughAggregateIndex: number | undefined;
  }) {
    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: props.key.aggregateName,
      recordKind: 'aggregates',
    });
    const chain = yield* getAggregateCommandChain({ key: props.key });
    let currentAggregateIndex =
      props.db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.materializationState)
        .where(
          eq(
            materializedAggregateRepoDrizzleSchemas.materializationState.id,
            1,
          ),
        )
        .get()?.aggregateIndex ?? 0;

    while (
      props.throughAggregateIndex === undefined ||
      currentAggregateIndex < props.throughAggregateIndex
    ) {
      const page = yield* makeAsync<
        IEncodedResult<
          Readonly<{
            commands: readonly Schema.Schema.Type<
              typeof AggregateChainedCommandSchema
            >[];
            tip: number | null;
          }>,
          IAnyErrorJson
        >,
        IAnyError
      >(
        () =>
          chain.getCommands({
            afterAggregateIndex:
              currentAggregateIndex === 0 ? null : currentAggregateIndex,
          }),
        ZerospinError.catch({
          code: 'materialized-aggregate-catchup-rpc-failed',
          message: 'Failed to pull AggregateCommandChain history',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      if (page.commands.length === 0) {
        if (
          (page.tip !== null && page.tip > currentAggregateIndex) ||
          (props.throughAggregateIndex !== undefined &&
            currentAggregateIndex < props.throughAggregateIndex)
        ) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-catchup-history-incomplete',
            message: `Aggregate history ended after aggregateIndex ${currentAggregateIndex} before its observed target`,
          });
        }
        return;
      }
      const pageLast = page.commands[page.commands.length - 1];
      if (
        pageLast === undefined ||
        page.tip === null ||
        page.tip < pageLast.aggregateIndex
      ) {
        return yield* new ZerospinError({
          code: 'materialized-aggregate-catchup-tip-invalid',
          message: 'Aggregate history returned commands beyond its terminal tip',
        });
      }

      for (const command of page.commands) {
        const expectedAggregateIndex = currentAggregateIndex + 1;
        if (command.aggregateIndex !== expectedAggregateIndex) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-catchup-index-gap',
            message: `MaterializedAggregateRepo catchup expected aggregateIndex ${expectedAggregateIndex}, received ${command.aggregateIndex}`,
          });
        }
        if (
          props.throughAggregateIndex !== undefined &&
          command.aggregateIndex > props.throughAggregateIndex
        ) {
          break;
        }
        if (
          command.delta === null ||
          (!('serviceName' in command) &&
            (command.aggregateId !== props.key.aggregateId ||
              command.aggregateName !== props.key.aggregateName))
        ) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-catchup-command-invalid',
            message: `Aggregate history returned an invalid occurrence at aggregateIndex ${command.aggregateIndex}`,
          });
        }
        const canonicalBytes = yield* Effect.gen(function* () {
          if ('serviceName' in command) {
            const {
              aggregateIndex: _aggregateIndex,
              serviceIndex: _serviceIndex,
              chainedAt: _chainedAt,
              delta: _delta,
              failedAt: _failedAt,
              failure: _failure,
              ...inputCommand
            } = command;
            return yield* Schema.encodeEffect(
              Schema.fromJsonString(EncodedServiceCommandSchema),
            )(inputCommand);
          }
          const {
            aggregateIndex: _aggregateIndex,
            chainedAt: _chainedAt,
            delta: _delta,
            failedAt: _failedAt,
            failure: _failure,
            ...inputCommand
          } = command;
          return yield* Schema.encodeEffect(
            Schema.fromJsonString(EncodedAggregateCommandSchema),
          )(inputCommand);
        }).pipe(
          mapParseError({
            code: 'materialized-aggregate-catchup-input-encode-failed',
            prefix: `Failed to encode aggregate command ${command.aggregateIndex}`,
          }),
        );
        const resultBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(AggregateChainedCommandSchema),
        )(command).pipe(
          mapParseError({
            code: 'materialized-aggregate-catchup-result-encode-failed',
            prefix: `Failed to encode aggregate result ${command.aggregateIndex}`,
          }),
        );

        yield* makeTx({
          db: props.db,
          program: Effect.fn('MaterializedAggregateRepo.catchup.transaction')(
            function* ({ tx }) {
              const state = tx
                .select()
                .from(
                  materializedAggregateRepoDrizzleSchemas.materializationState,
                )
                .where(
                  eq(
                    materializedAggregateRepoDrizzleSchemas
                      .materializationState.id,
                    1,
                  ),
                )
                .get();
              if ((state?.aggregateIndex ?? 0) !== currentAggregateIndex) {
                return yield* new ZerospinError({
                  code: 'materialized-aggregate-catchup-frontier-conflict',
                  message: `MaterializedAggregateRepo frontier changed before aggregateIndex ${command.aggregateIndex}`,
                });
              }
              const retained = tx
                .select()
                .from(
                  materializedAggregateRepoDrizzleSchemas.executionClaims,
                )
                .where(
                  or(
                    eq(
                      materializedAggregateRepoDrizzleSchemas.executionClaims
                        .aggregateIndex,
                      command.aggregateIndex,
                    ),
                    eq(
                      materializedAggregateRepoDrizzleSchemas.executionClaims
                        .commandId,
                      command.id,
                    ),
                  ),
                )
                .get();
              if (retained !== undefined) {
                if (
                  retained.aggregateIndex !== command.aggregateIndex ||
                  retained.commandId !== command.id ||
                  retained.canonicalBytes !== canonicalBytes ||
                  retained.chainedAt.getTime() !== command.chainedAt.getTime()
                ) {
                  return yield* new ZerospinError({
                    code: 'materialized-aggregate-catchup-claim-conflict',
                    message: `Aggregate execution ${command.aggregateIndex} differs from its retained claim`,
                  });
                }
                if (retained.result === null) {
                  return yield* new ZerospinError({
                    code: 'materialized-aggregate-execution-in-doubt',
                    message: `Aggregate execution ${command.aggregateIndex} was claimed without a retained result`,
                  });
                }
                if (retained.result !== resultBytes) {
                  return yield* new ZerospinError({
                    code: 'materialized-aggregate-catchup-result-conflict',
                    message: `Aggregate execution ${command.aggregateIndex} differs from its retained result`,
                  });
                }
              } else {
                for (const resource of [
                  ...command.delta.inserted,
                  ...command.delta.updated,
                ]) {
                  const model = yield* getByKeyOrThrow({
                    record: aggregate.models,
                    key: resource.modelName,
                    recordKind: `models owned by aggregate ${props.key.aggregateName}`,
                  });
                  upsertHelper({
                    table: model.drizzleSchema,
                    tx,
                    values: resource,
                  });
                }
                for (const resource of command.delta.deleted) {
                  const model = yield* getByKeyOrThrow({
                    record: aggregate.models,
                    key: resource.modelName,
                    recordKind: `models owned by aggregate ${props.key.aggregateName}`,
                  });
                  if ('sourceModel' in model) {
                    upsertHelper({
                      table: model.drizzleSchema,
                      tx,
                      values: resource,
                    });
                  } else {
                    tx.delete(model.drizzleSchema)
                      .where(eq(model.drizzleSchema.id, resource.id))
                      .run();
                  }
                }
                tx.insert(
                  materializedAggregateRepoDrizzleSchemas.executionClaims,
                )
                  .values({
                    aggregateIndex: command.aggregateIndex,
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
                materializedAggregateRepoDrizzleSchemas.materializationState,
              )
                .values({ id: 1, aggregateIndex: command.aggregateIndex })
                .onConflictDoUpdate({
                  target:
                    materializedAggregateRepoDrizzleSchemas.materializationState
                      .id,
                  set: { aggregateIndex: command.aggregateIndex },
                })
                .run();
            },
          ),
        });
        currentAggregateIndex = command.aggregateIndex;
      }

      if (
        props.throughAggregateIndex !== undefined &&
        currentAggregateIndex >= props.throughAggregateIndex
      ) {
        return;
      }
      if (page.tip === null || currentAggregateIndex >= page.tip) {
        if (props.throughAggregateIndex !== undefined) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-catchup-history-incomplete',
            message: `Aggregate history tip did not reach aggregateIndex ${props.throughAggregateIndex}`,
          });
        }
        return;
      }
    }
  },
);
