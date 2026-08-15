import type { Async } from '@zerospin/core/async/Async';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import type { IAnyError } from '@zerospin/error';
import { Effect, Either, Tracer } from 'effect';

const RETRY_LINKS_KEY = 'deliveryQueueRetryOf';
const ALARM_DELAY_MS = 250;

export const makeDeliveryQueue = (props: {
  hasPending?(): Effect.Effect<boolean, IAnyError, Async>;
  storage: DurableObjectStorage;
}) => {
  const semaphore = Effect.runSync(Effect.makeSemaphore(1));
  let requestSequence = 0;
  const exhaustedRetryLinks: Array<{ traceId: string; spanId: string }> = [];

  const retry = <A>(delivery: Effect.Effect<A, IAnyError, Async>) => {
    let previousAttempt: { traceId: string; spanId: string } | undefined;
    const attempt = Effect.gen(function* () {
      const span = yield* Effect.currentSpan.pipe(Effect.orDie);
      if (previousAttempt !== undefined) {
        span.addLinks([
          {
            _tag: 'SpanLink',
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

  const setAlarmIfEarlier = Effect.fn('DeliveryQueue.setAlarmIfEarlier')(
    function* () {
      const alarmAt = Date.now() + ALARM_DELAY_MS;
      yield* Effect.promise(() =>
        props.storage.transaction(async transaction => {
          const currentAlarm = await transaction.getAlarm();
          if (
            currentAlarm === null ||
            currentAlarm <= Date.now() ||
            alarmAt < currentAlarm
          ) {
            await transaction.setAlarm(alarmAt);
          }
        }),
      );
    },
  );

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
        _tag: 'SpanLink',
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
    alarm?: true;
    lanes: readonly {
      name: string;
      requested: boolean;
      drain(): Effect.Effect<void, IAnyError, Async>;
      hasPending(): Effect.Effect<boolean, IAnyError, Async>;
    }[];
  }): Effect.fn.Return<void, IAnyError, Async> {
    const claimedSequence = yield* Effect.sync(() => {
      requestSequence += 1;
      return requestSequence;
    });
    yield* setAlarmIfEarlier();

    return yield* semaphore.withPermits(1)(
      Effect.gen(function* () {
        if (drainProps.alarm === true) {
          yield* attachAlarmRetryLinks().pipe(
            Effect.catchAllCause(() => Effect.void),
          );
        }

        const laneResults = yield* Effect.forEach(
          drainProps.lanes.filter(lane => lane.requested),
          lane => lane.drain().pipe(Effect.either),
          { concurrency: 'unbounded' },
        );
        const pendingResults = yield* Effect.forEach(
          drainProps.lanes,
          lane => lane.hasPending().pipe(Effect.either),
          { concurrency: 'unbounded' },
        );
        const ownerPending = yield* (
          props.hasPending?.() ?? Effect.succeed(false)
        ).pipe(Effect.either);

        yield* persistRetryLinks().pipe(
          Effect.catchAllCause(() => Effect.void),
        );

        const laneFailure = laneResults.find(Either.isLeft);
        const pendingFailure = pendingResults.find(Either.isLeft);
        const hasPending = pendingResults.some(
          result => Either.isRight(result) && result.right,
        );
        if (
          hasPending ||
          (Either.isRight(ownerPending) && ownerPending.right) ||
          laneFailure !== undefined ||
          pendingFailure !== undefined ||
          Either.isLeft(ownerPending) ||
          claimedSequence !== requestSequence
        ) {
          yield* setAlarmIfEarlier();
        } else {
          yield* Effect.promise(() => props.storage.deleteAlarm());
        }

        if (laneFailure !== undefined) {
          return yield* laneFailure.left;
        }
        if (pendingFailure !== undefined) {
          return yield* pendingFailure.left;
        }
        if (Either.isLeft(ownerPending)) {
          return yield* ownerPending.left;
        }
      }),
    );
  });

  return { drain, retry };
};
