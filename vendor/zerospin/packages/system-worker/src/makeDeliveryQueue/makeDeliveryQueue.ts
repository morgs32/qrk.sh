import type { Async } from '@zerospin/core/async/Async';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import type { IAnyError } from '@zerospin/error';
import { Effect, Result, Semaphore, Tracer } from 'effect';

const RETRY_LINKS_KEY = 'deliveryQueueRetryOf';

/*
 * Service delivery owners coordinate requested lanes through this serialized
 * drain and retry policy. Retry trace links survive exhausted attempts so an
 * alarm continuation can link back to the failed delivery.
 *
 * 1. Track serialized drain requests.
 * 2. Wrap delivery attempts with retry provenance.
 * 3. Consume persisted retry links on continuation.
 * 4. Persist newly exhausted retry links.
 * 5. Capture the request sequence before locking.
 * 6. Drain requested lanes and inspect all pending work.
 * 7. Persist retry provenance without replacing lane outcomes.
 * 8. Return delivery or pending-check failures.
 * 9. Report remaining or newly requested work.
 * 10. Return the owner delivery operations.
 */
export const makeDeliveryQueue = (props: {
  hasPending?(): Effect.Effect<boolean, IAnyError, Async>;
  storage: DurableObjectStorage;
}) => {
  const { hasPending, storage } = props;

  // 1 — retain a request sequence and exhausted retry-span links
  const semaphore = Effect.runSync(Semaphore.make(1));
  let requestSequence = 0;
  const exhaustedRetryLinks: Array<{ traceId: string; spanId: string }> = [];

  // 2 — link successive DeliveryQueue.deliverAttempt spans and retain the last exhausted attempt
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

  // 3 — attach stored retryOf links to the current span and delete the stored batch
  const attachAlarmRetryLinks = Effect.fn(
    'DeliveryQueue.attachAlarmRetryLinks',
  )(function* () {
    const retryLinks = yield* Effect.promise(() =>
      storage.get<readonly { traceId: string; spanId: string }[]>(
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
    yield* Effect.promise(() => storage.delete(RETRY_LINKS_KEY));
  });

  // 4 — merge and deduplicate existing and newly captured trace/span pairs
  const persistRetryLinks = Effect.fn('DeliveryQueue.persistRetryLinks')(
    function* () {
      if (exhaustedRetryLinks.length === 0) {
        return;
      }
      const retryLinks = exhaustedRetryLinks.splice(0);
      const existing = yield* Effect.promise(() =>
        storage.get<readonly { traceId: string; spanId: string }[]>(
          RETRY_LINKS_KEY,
        ),
      );
      const unique = new Map<string, { traceId: string; spanId: string }>();
      for (const retryLink of [...(existing ?? []), ...retryLinks]) {
        unique.set(`${retryLink.traceId}:${retryLink.spanId}`, retryLink);
      }
      yield* Effect.promise(() =>
        storage.put(RETRY_LINKS_KEY, [...unique.values()]),
      );
    },
  );

  // 5 — let overlapping requests keep the final pending result true
  const drain = Effect.fn('DeliveryQueue.drain')(function* (drainProps: {
    lanes: readonly {
      name: string;
      requested: boolean;
      drain(): Effect.Effect<void, IAnyError, Async>;
      hasPending(): Effect.Effect<boolean, IAnyError, Async>;
    }[];
  }): Effect.fn.Return<Readonly<{ pending: boolean }>, IAnyError, Async> {
    const { lanes } = drainProps;
    const claimedSequence = yield* Effect.sync(() => {
      requestSequence += 1;
      return requestSequence;
    });
    return yield* semaphore.withPermits(1)(
      Effect.gen(function* () {
        yield* attachAlarmRetryLinks().pipe(
          Effect.catchCause(() => Effect.void),
        );

        // 6 — settle lanes concurrently and also inspect the optional owner hasPending check
        const laneResults = yield* Effect.forEach(
          lanes.filter(lane => lane.requested),
          lane => lane.drain().pipe(Effect.result),
          { concurrency: 'unbounded' },
        );
        const pendingResults = yield* Effect.forEach(
          lanes,
          lane => lane.hasPending().pipe(Effect.result),
          { concurrency: 'unbounded' },
        );
        const ownerPending = yield* (
          hasPending?.() ?? Effect.succeed(false)
        ).pipe(Effect.result);

        // 7 — ignore telemetry-link persistence failures
        yield* persistRetryLinks().pipe(Effect.catchCause(() => Effect.void));

        const laneFailure = laneResults.find(Result.isFailure);
        const pendingFailure = pendingResults.find(Result.isFailure);
        const hasPendingResult = pendingResults.some(
          result => Result.isSuccess(result) && result.success,
        );

        // 8 — prioritize lane failure, then lane pending checks, then owner pending failure
        if (laneFailure !== undefined) {
          return yield* laneFailure.failure;
        }
        if (pendingFailure !== undefined) {
          return yield* pendingFailure.failure;
        }
        if (Result.isFailure(ownerPending)) {
          return yield* ownerPending.failure;
        }

        // 9 — combine lane pending, owner pending, and request-sequence changes
        return {
          pending:
            hasPendingResult ||
            ownerPending.success ||
            claimedSequence !== requestSequence,
        };
      }),
    );
  });

  // 10 — expose the coordinated drain and retry wrapper
  return { drain, retry };
};
