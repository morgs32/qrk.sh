import type { Async } from '@zerospin/core/async/Async';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import type { IAnyError } from '@zerospin/error';
import { Effect, Result, Semaphore, Tracer } from 'effect';

const RETRY_LINKS_KEY = 'deliveryQueueRetryOf';

export const makeDeliveryQueue = (props: {
  hasPending?(): Effect.Effect<boolean, IAnyError, Async>;
  storage: DurableObjectStorage;
}) => {
  const semaphore = Effect.runSync(Semaphore.make(1));
  let requestSequence = 0;
  const exhaustedRetryLinks: Array<{ traceId: string; spanId: string }> = [];

  const retry = <A>(delivery: Effect.Effect<A, IAnyError, Async>) => {
    let previousAttempt: { traceId: string; spanId: string } | undefined;
    const attempt = Effect.gen(function* () {
      const span = yield* Effect.currentSpan.pipe(Effect.orDie);
      if (previousAttempt !== undefined) {
        span.addLinks([
          {
            span: Tracer.externalSpan(previousAttempt),
            attributes: { kind: 'retryOf' },
          },
        ]);
      }
      previousAttempt = { traceId: span.traceId, spanId: span.spanId };
      return yield* delivery;
    }).pipe(Effect.withSpan('DeliveryQueue.deliverAttempt'));

    return attempt.pipe(
      Effect.retry({ schedule: defaultRetrySchedule }),
      Effect.tapError(() =>
        Effect.sync(() => {
          if (previousAttempt !== undefined) {
            exhaustedRetryLinks.push(previousAttempt);
          }
        }),
      ),
    );
  };

  const attachAlarmRetryLinks = Effect.fn(
    'DeliveryQueue.attachAlarmRetryLinks',
  )(function* () {
    const retryLinks = yield* Effect.promise(() =>
      props.storage.get<readonly { traceId: string; spanId: string }[]>(
        RETRY_LINKS_KEY,
      ),
    );
    if (retryLinks === undefined || retryLinks.length === 0) {
      return;
    }
    const span = yield* Effect.currentSpan.pipe(Effect.orDie);
    span.addLinks(
      retryLinks.map(retryOf => ({
        span: Tracer.externalSpan(retryOf),
        attributes: { kind: 'retryOf' },
      })),
    );
    yield* Effect.promise(() => props.storage.delete(RETRY_LINKS_KEY));
  });

  const persistRetryLinks = Effect.fn('DeliveryQueue.persistRetryLinks')(
    function* () {
      if (exhaustedRetryLinks.length === 0) {
        return;
      }
      const retryLinks = exhaustedRetryLinks.splice(0);
      const existing = yield* Effect.promise(() =>
        props.storage.get<readonly { traceId: string; spanId: string }[]>(
          RETRY_LINKS_KEY,
        ),
      );
      const unique = new Map<string, { traceId: string; spanId: string }>();
      for (const retryLink of [...(existing ?? []), ...retryLinks]) {
        unique.set(`${retryLink.traceId}:${retryLink.spanId}`, retryLink);
      }
      yield* Effect.promise(() =>
        props.storage.put(RETRY_LINKS_KEY, [...unique.values()]),
      );
    },
  );

  const drain = Effect.fn('DeliveryQueue.drain')(function* (drainProps: {
    lanes: readonly {
      name: string;
      requested: boolean;
      drain(): Effect.Effect<void, IAnyError, Async>;
      hasPending(): Effect.Effect<boolean, IAnyError, Async>;
    }[];
  }): Effect.fn.Return<Readonly<{ pending: boolean }>, IAnyError, Async> {
    const claimedSequence = yield* Effect.sync(() => {
      requestSequence += 1;
      return requestSequence;
    });
    return yield* semaphore.withPermits(1)(
      Effect.gen(function* () {
        yield* attachAlarmRetryLinks().pipe(
          Effect.catchCause(() => Effect.void),
        );

        const laneResults = yield* Effect.forEach(
          drainProps.lanes.filter(lane => lane.requested),
          lane => lane.drain().pipe(Effect.result),
          { concurrency: 'unbounded' },
        );
        const pendingResults = yield* Effect.forEach(
          drainProps.lanes,
          lane => lane.hasPending().pipe(Effect.result),
          { concurrency: 'unbounded' },
        );
        const ownerPending = yield* (
          props.hasPending?.() ?? Effect.succeed(false)
        ).pipe(Effect.result);

        yield* persistRetryLinks().pipe(Effect.catchCause(() => Effect.void));

        const laneFailure = laneResults.find(Result.isFailure);
        const pendingFailure = pendingResults.find(Result.isFailure);
        const hasPending = pendingResults.some(
          result => Result.isSuccess(result) && result.success,
        );

        if (laneFailure !== undefined) {
          return yield* laneFailure.failure;
        }
        if (pendingFailure !== undefined) {
          return yield* pendingFailure.failure;
        }
        if (Result.isFailure(ownerPending)) {
          return yield* ownerPending.failure;
        }
        return {
          pending:
            hasPending ||
            ownerPending.success ||
            claimedSequence !== requestSequence,
        };
      }),
    );
  });

  return { drain, retry };
};
