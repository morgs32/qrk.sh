import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { eq, isNull } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeFanoutQueue } from '../../makeFanoutQueue/makeFanoutQueue.js';
import { aggregateCommandChainDrizzleSchemas } from '../AggregateCommandChainDbConfig.js';

export const runScheduledWork = Effect.fn(
  'AggregateCommandChain.runScheduledWork',
)(function* (props: {
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  materializedAggregateFrontendRepos: Cloudflare.Env['MATERIALIZED_AGGREGATE_FRONTEND_REPO'];
  materializedAggregateRepos: Cloudflare.Env['MATERIALIZED_AGGREGATE_REPO'];
  storage: DurableObjectStorage;
}) {
  const { db, deliveryQueue } = props;
  const pendingCommands = {
    name: 'AggregateCommandChain.pendingCommands',
    requested: true,
    drain: Effect.fn('AggregateCommandChain.pendingCommands.drain')(
      function* () {
        while (true) {
          const halted = db
            .select()
            .from(aggregateCommandChainDrizzleSchemas.chainState)
            .where(eq(aggregateCommandChainDrizzleSchemas.chainState.id, 1))
            .get();
          if (halted?.haltedAt !== null && halted?.haltedAt !== undefined) {
            return yield* new ZerospinError({
              code: 'aggregate-command-chain-halted',
              message: 'AggregateCommandChain is halted for execution repair',
              ...(halted.failure === null ? {} : { cause: halted.failure }),
            });
          }
          const pending = db
            .select()
            .from(aggregateCommandChainDrizzleSchemas.commands)
            .where(isNull(aggregateCommandChainDrizzleSchemas.commands.result))
            .orderBy(
              aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
            )
            .limit(1)
            .get();
          if (pending === undefined) return;

          const input = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(
              Schema.Union([
                EncodedAggregateCommandSchema,
                EncodedServiceCommandSchema,
              ]),
            ),
          )(pending.command).pipe(
            mapParseError({
              code: 'aggregate-command-chain-pending-command-invalid',
              prefix: `Failed to decode pending aggregate command ${pending.aggregateIndex}`,
            }),
          );
          const pendingOccurrence = yield* Schema.decodeUnknownEffect(
            Schema.toType(AggregateChainedCommandSchema),
          )(
            'serviceName' in input
              ? {
                  ...input,
                  aggregateIndex: pending.aggregateIndex,
                  serviceIndex: pending.serviceIndex,
                  chainedAt: pending.chainedAt,
                  delta: null,
                  failedAt: null,
                  failure: null,
                }
              : {
                  ...input,
                  aggregateIndex: pending.aggregateIndex,
                  chainedAt: pending.chainedAt,
                  delta: null,
                  failedAt: null,
                  failure: null,
                },
          ).pipe(
            mapParseError({
              code: 'aggregate-command-chain-pending-occurrence-invalid',
              prefix: `Failed to restore pending aggregate command ${pending.aggregateIndex}`,
            }),
          );
          const executed = yield* makeAsync<
            IEncodedResult<
              Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
              IAnyErrorJson
            >,
            IAnyError
          >(
            () =>
              props.materializedAggregateRepos
                .getByName(pending.materializedAggregateRepoName)
                .execute({ command: pendingOccurrence }),
            ZerospinError.catch({
              code: 'aggregate-command-chain-materializer-rpc-failed',
              message: `Materialized aggregate execution failed for aggregateIndex ${pending.aggregateIndex}`,
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.result);
          if (Result.isFailure(executed)) {
            if (executed.failure.code.includes('execution-in-doubt')) {
              db.insert(aggregateCommandChainDrizzleSchemas.chainState)
                .values({
                  id: 1,
                  haltedAt: new Date(),
                  failure: ZerospinError.stringify(executed.failure),
                })
                .onConflictDoUpdate({
                  target: aggregateCommandChainDrizzleSchemas.chainState.id,
                  set: {
                    haltedAt: new Date(),
                    failure: ZerospinError.stringify(executed.failure),
                  },
                })
                .run();
            }
            return yield* executed.failure;
          }
          const terminal = executed.success;
          if (
            terminal.delta === null ||
            terminal.id !== pending.commandId ||
            terminal.aggregateIndex !== pending.aggregateIndex ||
            terminal.chainedAt.getTime() !== pending.chainedAt.getTime()
          ) {
            return yield* new ZerospinError({
              code: 'aggregate-command-chain-materializer-result-conflict',
              message: `MaterializedAggregateRepo returned another occurrence for aggregateIndex ${pending.aggregateIndex}`,
            });
          }
          const returnedCanonicalBytes = yield* Schema.encodeEffect(
            Schema.fromJsonString(
              'serviceName' in terminal
                ? EncodedServiceCommandSchema
                : EncodedAggregateCommandSchema,
            ),
          )(terminal, { onExcessProperty: 'ignore' }).pipe(
            mapParseError({
              code: 'aggregate-command-chain-materializer-command-invalid',
              prefix: `Failed to encode materializer result ${pending.aggregateIndex}`,
            }),
          );
          if (returnedCanonicalBytes !== pending.canonicalBytes) {
            return yield* new ZerospinError({
              code: 'aggregate-command-chain-materializer-command-conflict',
              message: `MaterializedAggregateRepo changed command bytes for aggregateIndex ${pending.aggregateIndex}`,
            });
          }
          const resultBytes = yield* Schema.encodeEffect(
            Schema.fromJsonString(AggregateChainedCommandSchema),
          )(terminal).pipe(
            mapParseError({
              code: 'aggregate-command-chain-result-encode-failed',
              prefix: `Failed to encode terminal aggregate command ${pending.aggregateIndex}`,
            }),
          );
          yield* Effect.try({
            try: () =>
              db.transaction(tx => {
                const live = tx
                  .select()
                  .from(aggregateCommandChainDrizzleSchemas.commands)
                  .where(
                    eq(
                      aggregateCommandChainDrizzleSchemas.commands
                        .aggregateIndex,
                      pending.aggregateIndex,
                    ),
                  )
                  .get();
                if (
                  live === undefined ||
                  live.canonicalBytes !== pending.canonicalBytes ||
                  live.result !== null
                ) {
                  throw new ZerospinError({
                    code: 'aggregate-command-chain-terminal-commit-conflict',
                    message: `Aggregate command ${pending.aggregateIndex} changed before terminal commit`,
                  });
                }
                tx.update(aggregateCommandChainDrizzleSchemas.commands)
                  .set({ result: resultBytes })
                  .where(
                    eq(
                      aggregateCommandChainDrizzleSchemas.commands
                        .aggregateIndex,
                      pending.aggregateIndex,
                    ),
                  )
                  .run();
                tx.update(
                  aggregateCommandChainDrizzleSchemas.materializedAggregateSubscribers,
                )
                  .set({ queuedAggregateIndex: pending.aggregateIndex })
                  .run();
                tx.update(
                  aggregateCommandChainDrizzleSchemas.materializedAggregateFrontendSubscribers,
                )
                  .set({ queuedAggregateIndex: pending.aggregateIndex })
                  .run();
              }),
            catch: cause =>
              ZerospinError.isZerospinError(cause)
                ? cause
                : new ZerospinError({
                    code: 'aggregate-command-chain-terminal-commit-failed',
                    message: `Failed to retain aggregate result ${pending.aggregateIndex}`,
                    cause: ZerospinError.prettyUnknownFailure(cause),
                  }),
          });
        }
      },
    ),
    hasPending: () =>
      Effect.sync(
        () =>
          db
            .select({
              aggregateIndex:
                aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
            })
            .from(aggregateCommandChainDrizzleSchemas.commands)
            .where(isNull(aggregateCommandChainDrizzleSchemas.commands.result))
            .limit(1)
            .get() !== undefined,
      ),
  };

  const materializedAggregates = makeFanoutQueue({
    deliveryQueue,
    name: 'AggregateCommandChain.materializedAggregates',
    readSubscribers: () =>
      Effect.sync(() =>
        db
          .select()
          .from(
            aggregateCommandChainDrizzleSchemas.materializedAggregateSubscribers,
          )
          .all()
          .filter(
            subscriber =>
              subscriber.queuedAggregateIndex !== null &&
              subscriber.queuedAggregateIndex !==
                subscriber.currentAggregateIndex,
          ),
      ),
    subscriberKey: subscriber => subscriber.materializedAggregateRepoName,
    processSubscriber: (subscriber, retry) =>
      Effect.gen(function* () {
        const aggregateIndex = subscriber.queuedAggregateIndex;
        if (aggregateIndex === null) return true;
        const delivered = yield* retry(
          makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              props.materializedAggregateRepos
                .getByName(subscriber.materializedAggregateRepoName)
                .catchup({ throughAggregateIndex: aggregateIndex }),
            ZerospinError.catch({
              code: 'aggregate-command-chain-materialized-catchup-rpc-failed',
              message: `Failed to catch up aggregate materializer through ${aggregateIndex}`,
            }),
          ).pipe(Effect.flatMap(decodeRpc)),
        ).pipe(Effect.result);
        db.update(
          aggregateCommandChainDrizzleSchemas.materializedAggregateSubscribers,
        )
          .set(
            Result.isSuccess(delivered)
              ? {
                  currentAggregateIndex: aggregateIndex,
                  lastDeliveryFailure: null,
                }
              : {
                  lastDeliveryFailure: ZerospinError.stringify(
                    delivered.failure,
                  ),
                },
          )
          .where(
            eq(
              aggregateCommandChainDrizzleSchemas
                .materializedAggregateSubscribers.materializedAggregateRepoName,
              subscriber.materializedAggregateRepoName,
            ),
          )
          .run();
        return Result.isSuccess(delivered);
      }),
    hasPending: () =>
      Effect.sync(() =>
        db
          .select()
          .from(
            aggregateCommandChainDrizzleSchemas.materializedAggregateSubscribers,
          )
          .all()
          .some(
            subscriber =>
              subscriber.queuedAggregateIndex !== null &&
              subscriber.queuedAggregateIndex !==
                subscriber.currentAggregateIndex,
          ),
      ),
  });

  const materializedAggregateFrontends = makeFanoutQueue({
    deliveryQueue,
    name: 'AggregateCommandChain.materializedAggregateFrontends',
    readSubscribers: () =>
      Effect.sync(() =>
        db
          .select()
          .from(
            aggregateCommandChainDrizzleSchemas.materializedAggregateFrontendSubscribers,
          )
          .all()
          .filter(
            subscriber =>
              subscriber.queuedAggregateIndex !== null &&
              subscriber.queuedAggregateIndex !==
                subscriber.currentAggregateIndex,
          ),
      ),
    subscriberKey: subscriber =>
      subscriber.materializedAggregateFrontendRepoName,
    processSubscriber: (subscriber, retry) =>
      Effect.gen(function* () {
        const aggregateIndex = subscriber.queuedAggregateIndex;
        if (aggregateIndex === null) return true;
        const row = db
          .select()
          .from(aggregateCommandChainDrizzleSchemas.commands)
          .where(
            eq(
              aggregateCommandChainDrizzleSchemas.commands.aggregateIndex,
              aggregateIndex,
            ),
          )
          .get();
        if (row?.result === null || row?.result === undefined) {
          return yield* new ZerospinError({
            code: 'aggregate-command-chain-fanout-result-missing',
            message: `Aggregate fanout target ${aggregateIndex} is not terminal`,
          });
        }
        const command = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(AggregateChainedCommandSchema),
        )(row.result).pipe(
          mapParseError({
            code: 'aggregate-command-chain-fanout-command-invalid',
            prefix: `Failed to decode aggregate fanout command ${aggregateIndex}`,
          }),
        );
        const delivered = yield* retry(
          makeAsync<IEncodedResult<unknown, IAnyErrorJson>, IAnyError>(
            () =>
              props.materializedAggregateFrontendRepos
                .getByName(subscriber.materializedAggregateFrontendRepoName)
                .execute({ command }),
            ZerospinError.catch({
              code: 'aggregate-command-chain-fanout-rpc-failed',
              message: `Failed to deliver aggregateIndex ${aggregateIndex}`,
            }),
          ).pipe(Effect.flatMap(decodeRpc)),
        ).pipe(Effect.result);
        db.update(
          aggregateCommandChainDrizzleSchemas.materializedAggregateFrontendSubscribers,
        )
          .set(
            Result.isSuccess(delivered)
              ? {
                  currentAggregateIndex: aggregateIndex,
                  lastDeliveryFailure: null,
                }
              : {
                  lastDeliveryFailure: ZerospinError.stringify(
                    delivered.failure,
                  ),
                },
          )
          .where(
            eq(
              aggregateCommandChainDrizzleSchemas
                .materializedAggregateFrontendSubscribers
                .materializedAggregateFrontendRepoName,
              subscriber.materializedAggregateFrontendRepoName,
            ),
          )
          .run();
        return Result.isSuccess(delivered);
      }),
    hasPending: () =>
      Effect.sync(() =>
        db
          .select()
          .from(
            aggregateCommandChainDrizzleSchemas.materializedAggregateFrontendSubscribers,
          )
          .all()
          .some(
            subscriber =>
              subscriber.queuedAggregateIndex !== null &&
              subscriber.queuedAggregateIndex !==
                subscriber.currentAggregateIndex,
          ),
      ),
  });

  const drained = yield* deliveryQueue
    .drain({
      lanes: [
        pendingCommands,
        { ...materializedAggregates, requested: true },
        { ...materializedAggregateFrontends, requested: true },
      ],
    })
    .pipe(
      Effect.tapError(() =>
        Effect.promise(() => props.storage.setAlarm(Date.now() + 1_000)),
      ),
    );
  yield* Effect.promise(() =>
    drained.pending
      ? props.storage.setAlarm(Date.now() + 1_000)
      : props.storage.deleteAlarm(),
  );
  return drained;
});
