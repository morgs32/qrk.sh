/*
 * System-worker annotation:
 * Runs the AccountBlockRepo subscriber queue from durable refresh state.
 */

import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Runtime, Tracer } from 'effect';

import type { refreshQueue } from '../refreshQueue/refreshQueue.js';

export const drainActorOutbox = Effect.fn('AccountBlockRepo.drainActorOutbox')(
  function* (props: {
    storage: DurableObjectStorage;
    deliveriesByActorRepoName: Map<
      string,
      Effect.Effect.Success<ReturnType<typeof refreshQueue>>[number]
    >;
    queuedActorRepoNames: string[];
    concurrency: number;
    alarmDelayMs: number;
    refresh: () => Effect.Effect<
      Effect.Effect.Success<ReturnType<typeof refreshQueue>>,
      IAnyError
    >;
    processSubscriber: (
      subscriberDelivery: Effect.Effect.Success<
        ReturnType<typeof refreshQueue>
      >[number],
    ) => Effect.Effect<number | null, IAnyError>;
    getRunning: () => Promise<void> | null;
    setRunning: (running: Promise<void> | null) => void;
  }): Effect.fn.Return<void, IAnyError> {
    const {
      alarmDelayMs,
      concurrency,
      deliveriesByActorRepoName,
      getRunning,
      processSubscriber,
      queuedActorRepoNames,
      refresh,
      setRunning,
      storage,
    } = props;
    const causedBy = yield* Effect.promise(() =>
      storage.get<{
        traceId: string;
        spanId: string;
      }>('telemetryDrainCausedBy'),
    ).pipe(Effect.catchAllCause(() => Effect.succeed(undefined)));
    if (causedBy !== undefined) {
      yield* Effect.promise(() =>
        storage.delete('telemetryDrainCausedBy'),
      ).pipe(Effect.catchAllCause(() => Effect.void));
      const span = yield* Effect.currentSpan.pipe(Effect.orDie);
      span.addLinks([
        {
          _tag: 'SpanLink',
          span: Tracer.externalSpan({
            traceId: causedBy.traceId,
            spanId: causedBy.spanId,
          }),
          attributes: { kind: 'causedBy' },
        },
      ]);
    }
    const runtime = yield* Effect.runtime();

    yield* Effect.tryPromise({
      try: async () => {
        const priorAlarm = await storage.getAlarm();
        await storage.setAlarm(Date.now() + alarmDelayMs);

        const running = getRunning();
        if (running !== null) {
          await running;
          return;
        }

        const nextRunning = (async () => {
          let firstError: unknown;
          let nextRetryAlarmAt: number | null = null;
          try {
            /*
             * 1. Refresh owns idle detection. Durable subscriber rows are the
             * source of truth; the map and array hold only the current wave.
             */
            while (true) {
              deliveriesByActorRepoName.clear();
              queuedActorRepoNames.length = 0;

              for (const subscriberDelivery of await Runtime.runPromise(
                runtime,
              )(refresh())) {
                const actorRepoName =
                  subscriberDelivery.subscriber.actorRepoName;
                if (actorRepoName.length === 0) {
                  throw new Error(
                    'AccountBlockRepo actorRepoName must not be empty',
                  );
                }

                if (!deliveriesByActorRepoName.has(actorRepoName)) {
                  queuedActorRepoNames.push(actorRepoName);
                }
                deliveriesByActorRepoName.set(
                  actorRepoName,
                  subscriberDelivery,
                );
              }

              if (deliveriesByActorRepoName.size === 0) {
                break;
              }

              const claimedDeliveries: Effect.Effect.Success<
                ReturnType<typeof refreshQueue>
              > = [];
              for (const actorRepoName of queuedActorRepoNames) {
                const subscriberDelivery =
                  deliveriesByActorRepoName.get(actorRepoName);
                if (subscriberDelivery !== undefined) {
                  claimedDeliveries.push(subscriberDelivery);
                }
              }
              deliveriesByActorRepoName.clear();
              queuedActorRepoNames.length = 0;

              let nextSubscriberIndex = 0;
              let didFail = false;
              let waveError: unknown;
              const workers: Promise<void>[] = [];
              const workerCount = Math.min(
                concurrency,
                claimedDeliveries.length,
              );

              /*
               * 2. Workers share a synchronous index claim before each await, so
               * every subscriber delivery in this wave is processed once.
               */
              for (
                let workerIndex = 0;
                workerIndex < workerCount;
                workerIndex += 1
              ) {
                workers.push(
                  (async () => {
                    while (true) {
                      const subscriberIndex = nextSubscriberIndex;
                      nextSubscriberIndex += 1;

                      const subscriberDelivery =
                        claimedDeliveries[subscriberIndex];
                      if (subscriberDelivery === undefined) {
                        return;
                      }

                      try {
                        const retryAt = await Runtime.runPromise(runtime)(
                          processSubscriber(subscriberDelivery),
                        );
                        if (
                          retryAt !== null &&
                          (nextRetryAlarmAt === null ||
                            retryAt < nextRetryAlarmAt)
                        ) {
                          nextRetryAlarmAt = retryAt;
                        }
                      } catch (error) {
                        if (!didFail) {
                          didFail = true;
                          waveError = error;
                        }
                      }
                    }
                  })(),
                );
              }

              /*
               * 3. Finish the claimed wave before surfacing the first unexpected
               * processor failure. Subscriber RPC failures are recorded by
               * processSubscriber and do not stop unrelated deliveries.
               */
              await Promise.all(workers);
              if (didFail) {
                throw waveError instanceof Error
                  ? waveError
                  : new Error(ZerospinError.prettyUnknownFailure(waveError));
              }
            }
          } catch (error) {
            firstError = error;
          } finally {
            deliveriesByActorRepoName.clear();
            queuedActorRepoNames.length = 0;
            setRunning(null);
            try {
              const remainingDeliveries =
                await Runtime.runPromise(runtime)(refresh());
              if (remainingDeliveries.length > 0) {
                await storage.setAlarm(Date.now() + alarmDelayMs);
              } else if (nextRetryAlarmAt !== null) {
                await storage.setAlarm(nextRetryAlarmAt);
              } else {
                if (priorAlarm !== null && priorAlarm > Date.now()) {
                  await storage.setAlarm(priorAlarm);
                } else {
                  await storage.deleteAlarm();
                }
              }
            } catch (settledError) {
              if (firstError === undefined) {
                firstError = settledError;
              }
            }
          }

          if (firstError !== undefined) {
            throw firstError instanceof Error
              ? firstError
              : new Error(ZerospinError.prettyUnknownFailure(firstError));
          }
        })();

        setRunning(nextRunning);
        await nextRunning;
      },
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'account-block-queue-drain-failed',
              message: 'AccountBlockRepo failed while running subscriber queue',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    });
  },
);
