import { Effect, Schedule, Schema } from 'effect';

/**
 * Retry outbox delivery with an Effect schedule and persist only terminal failure state.
 *
 * @bad Add `deliveryAttempts`, `nextRetryAt`, `lastDeliveryError`, `failedAt`, or `succeededAt` columns for ordinary retry bookkeeping.
 * @bad Reimplement exponential backoff by mutating outbox rows between attempts.
 * @bad Advance downstream watermarks before scheduled delivery succeeds.
 */
export const drainDeliveryOutbox = Effect.fn('LedgerRepo.drainDeliveryOutbox')(
  function* (props: {
    outbox: {
      readPending(): readonly {
        id: string;
        payload: unknown;
      }[];
      markDelivered(props: { deliveredAt: Date; id: string }): void;
      markFailed(props: { failure: string; id: string }): void;
    };
    targetRepo: {
      handle(payload: unknown): PromiseLike<unknown>;
    };
  }) {
    const pendingRows = props.outbox.readPending();

    for (const pendingRow of pendingRows) {
      const delivered = yield* makeAsync(() =>
        props.targetRepo.handle(pendingRow.payload),
      ).pipe(
        Effect.flatMap(decodeRpc),
        Effect.retry({
          schedule: Schedule.recurs(2).pipe(
            Schedule.intersect(Schedule.exponential(250, 2)),
          ),
        }),
        Effect.either,
      );

      if (delivered._tag === 'Left') {
        const failure = yield* Schema.encode(
          Schema.parseJson(ZerospinErrorSchema),
        )(delivered.left);
        props.outbox.markFailed({
          id: pendingRow.id,
          failure,
        });
        continue;
      }

      props.outbox.markDelivered({
        id: pendingRow.id,
        deliveredAt: new Date(),
      });
    }
  },
);

declare function makeAsync<A>(
  fn: () => PromiseLike<A>,
): Effect.Effect<A, unknown, unknown>;
declare function decodeRpc<A>(encoded: A): Effect.Effect<A, unknown, unknown>;
declare const ZerospinErrorSchema: Schema.Schema<unknown, unknown>;
