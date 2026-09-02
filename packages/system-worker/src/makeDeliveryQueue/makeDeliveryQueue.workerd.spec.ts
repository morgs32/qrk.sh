import { it } from '@effect/vitest';
import { ZerospinError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect, vi } from 'vitest';

import { managedRuntime } from '../FixtureRepo/FixtureRepo.js';
import { makeFanoutQueue } from '../makeFanoutQueue/makeFanoutQueue.js';

import { makeDeliveryQueue } from './makeDeliveryQueue.js';

describe('makeDeliveryQueue workerd acceptance', () => {
  it.effect('attempts at zero, 250, and 750 milliseconds', () =>
    Effect.promise(() =>
      runInDurableObject(
        env.FIXTURE_REPO.getByName('delivery-queue/attempt-schedule'),
        async (_instance, state) => {
          const firstAttemptTimes: number[] = [];
          const firstQueue = makeDeliveryQueue({ storage: state.storage });
          await managedRuntime.runPromise(
            firstQueue
              .retry(
                Effect.sync(() => {
                  firstAttemptTimes.push(Date.now());
                }),
              )
              .pipe(Effect.withSpan('DeliveryQueueAcceptance.firstAttempt')),
          );

          let secondAttempt = 0;
          const secondAttemptTimes: number[] = [];
          const secondQueue = makeDeliveryQueue({ storage: state.storage });
          await managedRuntime.runPromise(
            secondQueue
              .retry(
                Effect.suspend(() => {
                  secondAttempt += 1;
                  secondAttemptTimes.push(Date.now());
                  return secondAttempt === 2
                    ? Effect.void
                    : Effect.fail(
                        new ZerospinError({
                          code: 'delivery-queue-acceptance-retry',
                          message: 'Retry once',
                        }),
                      );
                }),
              )
              .pipe(Effect.withSpan('DeliveryQueueAcceptance.secondAttempt')),
          );

          let thirdAttempt = 0;
          const thirdAttemptTimes: number[] = [];
          const thirdQueue = makeDeliveryQueue({ storage: state.storage });
          await managedRuntime.runPromise(
            thirdQueue
              .retry(
                Effect.suspend(() => {
                  thirdAttempt += 1;
                  thirdAttemptTimes.push(Date.now());
                  return thirdAttempt === 3
                    ? Effect.void
                    : Effect.fail(
                        new ZerospinError({
                          code: 'delivery-queue-acceptance-retry',
                          message: 'Retry twice',
                        }),
                      );
                }),
              )
              .pipe(Effect.withSpan('DeliveryQueueAcceptance.thirdAttempt')),
          );

          expect(firstAttemptTimes).toHaveLength(1);
          expect(secondAttemptTimes).toHaveLength(2);
          expect(
            (secondAttemptTimes[1] ?? 0) - (secondAttemptTimes[0] ?? 0),
          ).toBeGreaterThanOrEqual(240);
          expect(thirdAttemptTimes).toHaveLength(3);
          expect(
            (thirdAttemptTimes[1] ?? 0) - (thirdAttemptTimes[0] ?? 0),
          ).toBeGreaterThanOrEqual(240);
          expect(
            (thirdAttemptTimes[2] ?? 0) - (thirdAttemptTimes[1] ?? 0),
          ).toBeGreaterThanOrEqual(490);
        },
      ),
    ),
  );

  it.effect(
    'persists exhaustion diagnostics and retry links, then recovers on the next alarm drain',
    () =>
      Effect.promise(() =>
        runInDurableObject(
          env.FIXTURE_REPO.getByName('delivery-queue/alarm-recovery'),
          async (_instance, state) => {
            let attempts = 0;
            let diagnostic: string | null = null;
            let domainOutcomes = 0;
            const firstCollector = makeTelemetryCollector();
            const firstQueue = makeDeliveryQueue({ storage: state.storage });
            const firstDrain = await managedRuntime.runPromise(
              firstQueue
                .drain({
                  lanes: [
                    {
                      name: 'acceptance-lane',
                      requested: true,
                      drain: () =>
                        firstQueue
                          .retry(
                            Effect.suspend(() => {
                              attempts += 1;
                              return Effect.fail(
                                new ZerospinError({
                                  code: 'delivery-queue-acceptance-exhausted',
                                  message: 'Exhaust all attempts',
                                }),
                              );
                            }),
                          )
                          .pipe(
                            Effect.catch(error =>
                              Effect.sync(() => {
                                diagnostic = error.message;
                              }),
                            ),
                          ),
                      hasPending: () => Effect.sync(() => diagnostic !== null),
                    },
                  ],
                })
                .pipe(
                  Effect.withSpan('DeliveryQueueAcceptance.exhaustion'),
                  Effect.provide(makeTelemetryLayer(firstCollector)),
                ),
            );
            const persistedRetryLinks = await state.storage.get<
              readonly { traceId: string; spanId: string }[]
            >('deliveryQueueRetryOf');

            const secondCollector = makeTelemetryCollector();
            const secondQueue = makeDeliveryQueue({ storage: state.storage });
            const secondDrain = await managedRuntime.runPromise(
              secondQueue
                .drain({
                  lanes: [
                    {
                      name: 'acceptance-lane',
                      requested: true,
                      drain: () =>
                        secondQueue
                          .retry(
                            Effect.sync(() => {
                              attempts += 1;
                              domainOutcomes += 1;
                            }),
                          )
                          .pipe(
                            Effect.tap(() =>
                              Effect.sync(() => {
                                diagnostic = null;
                              }),
                            ),
                          ),
                      hasPending: () => Effect.sync(() => diagnostic !== null),
                    },
                  ],
                })
                .pipe(
                  Effect.withSpan('DeliveryQueueAcceptance.alarmWake'),
                  Effect.provide(makeTelemetryLayer(secondCollector)),
                ),
            );

            expect(attempts).toBe(4);
            expect(domainOutcomes).toBe(1);
            expect(diagnostic).toBeNull();
            expect(firstDrain.pending).toBe(true);
            expect(secondDrain.pending).toBe(false);
            expect(persistedRetryLinks).toHaveLength(1);
            expect(firstCollector.flush().links).toHaveLength(2);
            expect(
              secondCollector
                .flush()
                .links.some(link => link.kind === 'retryOf'),
            ).toBe(true);
            expect(await state.storage.getAlarm()).toBeNull();
            expect(
              await state.storage.get('deliveryQueueRetryOf'),
            ).toBeUndefined();
          },
        ),
      ),
  );

  it.effect(
    'isolates one failed subscriber, preserves per-subscriber order, and caps concurrency at 100',
    () =>
      Effect.promise(() =>
        runInDurableObject(
          env.FIXTURE_REPO.getByName('delivery-queue/fanout'),
          async (_instance, state) => {
            const subscribers = Array.from({ length: 101 }, (_, id) => ({
              id,
              remaining: 2,
            }));
            const outcomes = new Map<number, number[]>();
            let active = 0;
            let maximumActive = 0;
            let failedAttempts = 0;
            const queue = makeDeliveryQueue({ storage: state.storage });
            const lane = makeFanoutQueue({
              deliveryQueue: queue,
              name: 'DeliveryQueueAcceptance.fanout',
              readSubscribers: () =>
                Effect.sync(() =>
                  subscribers.filter(subscriber => subscriber.remaining > 0),
                ),
              subscriberKey: subscriber => String(subscriber.id),
              processSubscriber: (subscriber, retry) =>
                Effect.gen(function* () {
                  active += 1;
                  maximumActive = Math.max(maximumActive, active);
                  const delivery = yield* retry(
                    subscriber.id === 0
                      ? Effect.suspend(() => {
                          failedAttempts += 1;
                          return Effect.fail(
                            new ZerospinError({
                              code: 'delivery-queue-acceptance-fanout-failure',
                              message: 'Fail only subscriber zero',
                            }),
                          );
                        })
                      : Effect.sleep(5),
                  ).pipe(Effect.result);
                  active -= 1;
                  if (delivery._tag === 'Failure') {
                    return false;
                  }
                  const subscriberOutcomes = outcomes.get(subscriber.id) ?? [];
                  subscriberOutcomes.push(3 - subscriber.remaining);
                  outcomes.set(subscriber.id, subscriberOutcomes);
                  subscriber.remaining -= 1;
                  return true;
                }),
              hasPending: () =>
                Effect.sync(() =>
                  subscribers.some(subscriber => subscriber.remaining > 0),
                ),
            });
            for (let turn = 0; turn < 4; turn += 1) {
              await managedRuntime.runPromise(
                queue
                  .drain({ lanes: [{ ...lane, requested: true }] })
                  .pipe(Effect.withSpan('DeliveryQueueAcceptance.fanoutDrain')),
              );
            }

            expect(maximumActive).toBe(100);
            expect(failedAttempts).toBe(12);
            expect(subscribers[0]?.remaining).toBe(2);
            for (const subscriber of subscribers.slice(1)) {
              expect(subscriber.remaining).toBe(0);
              expect(outcomes.get(subscriber.id)).toEqual([1, 2]);
            }
          },
        ),
      ),
  );

  it.effect('reports pending while a newer drain is waiting', () =>
    Effect.promise(() =>
      runInDurableObject(
        env.FIXTURE_REPO.getByName('delivery-queue/alarm-race'),
        async (_instance, state) => {
          let releaseOlder: (() => void) | undefined;
          let releaseNewer: (() => void) | undefined;
          let olderEntered = false;
          let newerEntered = false;
          const olderGate = new Promise<void>(resolve => {
            releaseOlder = resolve;
          });
          const newerGate = new Promise<void>(resolve => {
            releaseNewer = resolve;
          });
          const queue = makeDeliveryQueue({ storage: state.storage });
          const olderDrain = managedRuntime.runPromise(
            queue
              .drain({
                lanes: [
                  {
                    name: 'older',
                    requested: true,
                    drain: () =>
                      Effect.promise(() => {
                        olderEntered = true;
                        return olderGate;
                      }),
                    hasPending: () => Effect.succeed(false),
                  },
                ],
              })
              .pipe(Effect.withSpan('DeliveryQueueAcceptance.olderDrain')),
          );
          await vi.waitFor(() => expect(olderEntered).toBe(true));
          const newerDrain = managedRuntime.runPromise(
            queue
              .drain({
                lanes: [
                  {
                    name: 'newer',
                    requested: true,
                    drain: () =>
                      Effect.promise(() => {
                        newerEntered = true;
                        return newerGate;
                      }),
                    hasPending: () => Effect.succeed(true),
                  },
                ],
              })
              .pipe(Effect.withSpan('DeliveryQueueAcceptance.newerDrain')),
          );
          releaseOlder?.();
          await vi.waitFor(() => expect(newerEntered).toBe(true));
          releaseNewer?.();
          await expect(olderDrain).resolves.toEqual({ pending: true });
          await expect(newerDrain).resolves.toEqual({ pending: true });
          expect(await state.storage.getAlarm()).toBeNull();
        },
      ),
    ),
  );
});
