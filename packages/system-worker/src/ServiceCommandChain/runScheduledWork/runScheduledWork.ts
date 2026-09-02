import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedServiceCommandSchema,
  ServiceChainedCommandSchema,
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
import { serviceCommandChainDrizzleSchemas } from '../ServiceCommandChainDbConfig.js';

export const runScheduledWork = Effect.fn(
  'ServiceCommandChain.runScheduledWork',
)(function* (props: {
  aggregateCommandChains: Cloudflare.Env['AGGREGATE_COMMAND_CHAIN'];
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  materializedServiceFrontendRepos: Cloudflare.Env['MATERIALIZED_SERVICE_FRONTEND_REPO'];
  materializedServiceRepos: Cloudflare.Env['MATERIALIZED_SERVICE_REPO'];
  storage: DurableObjectStorage;
}) {
  const { db, deliveryQueue } = props;
  const pendingCommands = {
    name: 'ServiceCommandChain.pendingCommands',
    requested: true,
    drain: Effect.fn('ServiceCommandChain.pendingCommands.drain')(function* () {
      while (true) {
        const halted = db
          .select()
          .from(serviceCommandChainDrizzleSchemas.chainState)
          .where(eq(serviceCommandChainDrizzleSchemas.chainState.id, 1))
          .get();
        if (halted?.haltedAt !== null && halted?.haltedAt !== undefined) {
          return yield* new ZerospinError({
            code: 'service-command-chain-halted',
            message: 'ServiceCommandChain is halted for execution repair',
            ...(halted.failure === null ? {} : { cause: halted.failure }),
          });
        }
        const pending = db
          .select()
          .from(serviceCommandChainDrizzleSchemas.commands)
          .where(isNull(serviceCommandChainDrizzleSchemas.commands.result))
          .orderBy(serviceCommandChainDrizzleSchemas.commands.serviceIndex)
          .limit(1)
          .get();
        if (pending === undefined) return;

        const input = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(EncodedServiceCommandSchema),
        )(pending.command).pipe(
          mapParseError({
            code: 'service-command-chain-pending-command-invalid',
            prefix: `Failed to decode pending service command ${pending.serviceIndex}`,
          }),
        );
        const pendingOccurrence = yield* Schema.decodeUnknownEffect(
          Schema.toType(ServiceChainedCommandSchema),
        )({
          ...input,
          serviceIndex: pending.serviceIndex,
          chainedAt: pending.chainedAt,
          delta: null,
          failedAt: null,
          failure: null,
        }).pipe(
          mapParseError({
            code: 'service-command-chain-pending-occurrence-invalid',
            prefix: `Failed to restore pending service command ${pending.serviceIndex}`,
          }),
        );
        const executed = yield* makeAsync<
          IEncodedResult<
            Schema.Schema.Type<typeof ServiceChainedCommandSchema>,
            IAnyErrorJson
          >,
          IAnyError
        >(
          () =>
            props.materializedServiceRepos
              .getByName(pending.materializedServiceRepoName)
              .execute({ command: pendingOccurrence }),
          ZerospinError.catch({
            code: 'service-command-chain-materializer-rpc-failed',
            message: `Materialized service execution failed for serviceIndex ${pending.serviceIndex}`,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.result);
        if (Result.isFailure(executed)) {
          if (executed.failure.code.includes('execution-in-doubt')) {
            db.insert(serviceCommandChainDrizzleSchemas.chainState)
              .values({
                id: 1,
                haltedAt: new Date(),
                failure: ZerospinError.stringify(executed.failure),
              })
              .onConflictDoUpdate({
                target: serviceCommandChainDrizzleSchemas.chainState.id,
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
          terminal.serviceIndex !== pending.serviceIndex ||
          terminal.chainedAt.getTime() !== pending.chainedAt.getTime()
        ) {
          return yield* new ZerospinError({
            code: 'service-command-chain-materializer-result-conflict',
            message: `MaterializedServiceRepo returned another occurrence for serviceIndex ${pending.serviceIndex}`,
          });
        }
        const returnedCanonicalBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(EncodedServiceCommandSchema),
        )(terminal, { onExcessProperty: 'ignore' }).pipe(
          mapParseError({
            code: 'service-command-chain-materializer-command-invalid',
            prefix: `Failed to encode materializer result ${pending.serviceIndex}`,
          }),
        );
        if (returnedCanonicalBytes !== pending.canonicalBytes) {
          return yield* new ZerospinError({
            code: 'service-command-chain-materializer-command-conflict',
            message: `MaterializedServiceRepo changed command bytes for serviceIndex ${pending.serviceIndex}`,
          });
        }
        const resultBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(ServiceChainedCommandSchema),
        )(terminal).pipe(
          mapParseError({
            code: 'service-command-chain-result-encode-failed',
            prefix: `Failed to encode terminal service command ${pending.serviceIndex}`,
          }),
        );
        yield* Effect.try({
          try: () =>
            db.transaction(tx => {
              const live = tx
                .select()
                .from(serviceCommandChainDrizzleSchemas.commands)
                .where(
                  eq(
                    serviceCommandChainDrizzleSchemas.commands.serviceIndex,
                    pending.serviceIndex,
                  ),
                )
                .get();
              if (
                live === undefined ||
                live.canonicalBytes !== pending.canonicalBytes ||
                live.result !== null
              ) {
                throw new ZerospinError({
                  code: 'service-command-chain-terminal-commit-conflict',
                  message: `Service command ${pending.serviceIndex} changed before terminal commit`,
                });
              }
              tx.update(serviceCommandChainDrizzleSchemas.commands)
                .set({ result: resultBytes })
                .where(
                  eq(
                    serviceCommandChainDrizzleSchemas.commands.serviceIndex,
                    pending.serviceIndex,
                  ),
                )
                .run();
              tx.update(serviceCommandChainDrizzleSchemas.aggregateSubscribers)
                .set({ queuedServiceIndex: pending.serviceIndex })
                .run();
              tx.update(
                serviceCommandChainDrizzleSchemas.materializedServiceSubscribers,
              )
                .set({ queuedServiceIndex: pending.serviceIndex })
                .run();
              tx.update(
                serviceCommandChainDrizzleSchemas.materializedServiceFrontendSubscribers,
              )
                .set({ queuedServiceIndex: pending.serviceIndex })
                .run();
            }),
          catch: cause =>
            ZerospinError.isZerospinError(cause)
              ? cause
              : new ZerospinError({
                  code: 'service-command-chain-terminal-commit-failed',
                  message: `Failed to retain service result ${pending.serviceIndex}`,
                  cause: ZerospinError.prettyUnknownFailure(cause),
                }),
        });
      }
    }),
    hasPending: () =>
      Effect.sync(
        () =>
          db
            .select({
              serviceIndex:
                serviceCommandChainDrizzleSchemas.commands.serviceIndex,
            })
            .from(serviceCommandChainDrizzleSchemas.commands)
            .where(isNull(serviceCommandChainDrizzleSchemas.commands.result))
            .limit(1)
            .get() !== undefined,
      ),
  };

  const aggregateFanout = makeFanoutQueue({
    deliveryQueue,
    name: 'ServiceCommandChain.aggregateSubscribers',
    readSubscribers: () =>
      Effect.sync(() =>
        db
          .select()
          .from(serviceCommandChainDrizzleSchemas.aggregateSubscribers)
          .all()
          .filter(
            subscriber =>
              subscriber.queuedServiceIndex !== null &&
              subscriber.queuedServiceIndex !== subscriber.currentServiceIndex,
          ),
      ),
    subscriberKey: subscriber => subscriber.aggregateCommandChainName,
    processSubscriber: (subscriber, retry) =>
      Effect.gen(function* () {
        const serviceIndex = subscriber.queuedServiceIndex;
        if (serviceIndex === null) return true;
        const row = db
          .select()
          .from(serviceCommandChainDrizzleSchemas.commands)
          .where(
            eq(
              serviceCommandChainDrizzleSchemas.commands.serviceIndex,
              serviceIndex,
            ),
          )
          .get();
        if (row?.result === null || row?.result === undefined) {
          return yield* new ZerospinError({
            code: 'service-command-chain-aggregate-result-missing',
            message: `Service aggregate fanout target ${serviceIndex} is not terminal`,
          });
        }
        const command = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(ServiceChainedCommandSchema),
        )(row.result).pipe(
          mapParseError({
            code: 'service-command-chain-aggregate-command-invalid',
            prefix: `Failed to decode service command ${serviceIndex}`,
          }),
        );
        const delivered = yield* retry(
          makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              props.aggregateCommandChains
                .getByName(subscriber.aggregateCommandChainName)
                .receiveServiceCommand({ command }),
            ZerospinError.catch({
              code: 'service-command-chain-aggregate-rpc-failed',
              message: `Failed to deliver serviceIndex ${serviceIndex} to aggregate`,
            }),
          ).pipe(Effect.flatMap(decodeRpc)),
        ).pipe(Effect.result);
        db.update(serviceCommandChainDrizzleSchemas.aggregateSubscribers)
          .set(
            Result.isSuccess(delivered)
              ? { currentServiceIndex: serviceIndex, lastDeliveryFailure: null }
              : {
                  lastDeliveryFailure: ZerospinError.stringify(
                    delivered.failure,
                  ),
                },
          )
          .where(
            eq(
              serviceCommandChainDrizzleSchemas.aggregateSubscribers
                .aggregateCommandChainName,
              subscriber.aggregateCommandChainName,
            ),
          )
          .run();
        return Result.isSuccess(delivered);
      }),
    hasPending: () =>
      Effect.sync(() =>
        db
          .select()
          .from(serviceCommandChainDrizzleSchemas.aggregateSubscribers)
          .all()
          .some(
            subscriber =>
              subscriber.queuedServiceIndex !== null &&
              subscriber.queuedServiceIndex !== subscriber.currentServiceIndex,
          ),
      ),
  });

  const materializedServices = makeFanoutQueue({
    deliveryQueue,
    name: 'ServiceCommandChain.materializedServices',
    readSubscribers: () =>
      Effect.sync(() =>
        db
          .select()
          .from(
            serviceCommandChainDrizzleSchemas.materializedServiceSubscribers,
          )
          .all()
          .filter(
            subscriber =>
              subscriber.queuedServiceIndex !== null &&
              subscriber.queuedServiceIndex !== subscriber.currentServiceIndex,
          ),
      ),
    subscriberKey: subscriber => subscriber.materializedServiceRepoName,
    processSubscriber: (subscriber, retry) =>
      Effect.gen(function* () {
        const serviceIndex = subscriber.queuedServiceIndex;
        if (serviceIndex === null) return true;
        const delivered = yield* retry(
          makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              props.materializedServiceRepos
                .getByName(subscriber.materializedServiceRepoName)
                .catchup({ throughServiceIndex: serviceIndex }),
            ZerospinError.catch({
              code: 'service-command-chain-materialized-catchup-rpc-failed',
              message: `Failed to catch up service materializer through ${serviceIndex}`,
            }),
          ).pipe(Effect.flatMap(decodeRpc)),
        ).pipe(Effect.result);
        db.update(
          serviceCommandChainDrizzleSchemas.materializedServiceSubscribers,
        )
          .set(
            Result.isSuccess(delivered)
              ? { currentServiceIndex: serviceIndex, lastDeliveryFailure: null }
              : {
                  lastDeliveryFailure: ZerospinError.stringify(
                    delivered.failure,
                  ),
                },
          )
          .where(
            eq(
              serviceCommandChainDrizzleSchemas.materializedServiceSubscribers
                .materializedServiceRepoName,
              subscriber.materializedServiceRepoName,
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
            serviceCommandChainDrizzleSchemas.materializedServiceSubscribers,
          )
          .all()
          .some(
            subscriber =>
              subscriber.queuedServiceIndex !== null &&
              subscriber.queuedServiceIndex !== subscriber.currentServiceIndex,
          ),
      ),
  });

  const serviceFrontendFanout = makeFanoutQueue({
    deliveryQueue,
    name: 'ServiceCommandChain.materializedServiceFrontends',
    readSubscribers: () =>
      Effect.sync(() =>
        db
          .select()
          .from(
            serviceCommandChainDrizzleSchemas.materializedServiceFrontendSubscribers,
          )
          .all()
          .filter(
            subscriber =>
              subscriber.queuedServiceIndex !== null &&
              subscriber.queuedServiceIndex !== subscriber.currentServiceIndex,
          ),
      ),
    subscriberKey: subscriber => subscriber.materializedServiceFrontendRepoName,
    processSubscriber: (subscriber, retry) =>
      Effect.gen(function* () {
        const serviceIndex = subscriber.queuedServiceIndex;
        if (serviceIndex === null) return true;
        const row = db
          .select()
          .from(serviceCommandChainDrizzleSchemas.commands)
          .where(
            eq(
              serviceCommandChainDrizzleSchemas.commands.serviceIndex,
              serviceIndex,
            ),
          )
          .get();
        if (row?.result === null || row?.result === undefined) {
          return yield* new ZerospinError({
            code: 'service-command-chain-frontend-result-missing',
            message: `Service frontend fanout target ${serviceIndex} is not terminal`,
          });
        }
        const command = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(ServiceChainedCommandSchema),
        )(row.result).pipe(
          mapParseError({
            code: 'service-command-chain-frontend-command-invalid',
            prefix: `Failed to decode service command ${serviceIndex}`,
          }),
        );
        const delivered = yield* retry(
          makeAsync<IEncodedResult<unknown, IAnyErrorJson>, IAnyError>(
            () =>
              props.materializedServiceFrontendRepos
                .getByName(subscriber.materializedServiceFrontendRepoName)
                .execute({ command }),
            ZerospinError.catch({
              code: 'service-command-chain-frontend-rpc-failed',
              message: `Failed to deliver serviceIndex ${serviceIndex} to frontend materializer`,
            }),
          ).pipe(Effect.flatMap(decodeRpc)),
        ).pipe(Effect.result);
        db.update(
          serviceCommandChainDrizzleSchemas.materializedServiceFrontendSubscribers,
        )
          .set(
            Result.isSuccess(delivered)
              ? { currentServiceIndex: serviceIndex, lastDeliveryFailure: null }
              : {
                  lastDeliveryFailure: ZerospinError.stringify(
                    delivered.failure,
                  ),
                },
          )
          .where(
            eq(
              serviceCommandChainDrizzleSchemas
                .materializedServiceFrontendSubscribers
                .materializedServiceFrontendRepoName,
              subscriber.materializedServiceFrontendRepoName,
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
            serviceCommandChainDrizzleSchemas.materializedServiceFrontendSubscribers,
          )
          .all()
          .some(
            subscriber =>
              subscriber.queuedServiceIndex !== null &&
              subscriber.queuedServiceIndex !== subscriber.currentServiceIndex,
          ),
      ),
  });

  const drained = yield* deliveryQueue
    .drain({
      lanes: [
        pendingCommands,
        { ...aggregateFanout, requested: true },
        { ...materializedServices, requested: true },
        { ...serviceFrontendFanout, requested: true },
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
