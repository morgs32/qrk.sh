import { Effect } from 'effect';

/**
 * Put the standard three-attempt schedule in the Durable Object coordinator.
 * Persist domain completion and the latest diagnostic, never retry progress.
 *
 * @bad Add `deliveryAttempts`, `nextRetryAt`, `failedAt`, or `succeededAt` columns for ordinary delivery retry bookkeeping.
 * @bad Treat `lastDeliveryError` as retry progress; it is retained operator-visible diagnostic state.
 * @bad Decode persisted payloads or run local validation inside the retry schedule.
 */
export const drainDeliveryOutbox = Effect.fn('LedgerRepo.drainDeliveryOutbox')(
  function* (props: {
    deliveryQueue: {
      drain(props: {
        lanes: readonly {
          name: string;
          requested: boolean;
          drain(): Effect.Effect<void, Error>;
          hasPending(): Effect.Effect<boolean, Error>;
        }[];
      }): Effect.Effect<void, Error>;
      retry<A>(delivery: Effect.Effect<A, Error>): Effect.Effect<A, Error>;
    };
    outbox: {
      readFirstPending(): { id: string; payload: unknown } | undefined;
      hasPending(): boolean;
      markDelivered(props: { deliveredAt: Date; id: string }): void;
      recordDiagnostic(props: { failure: string; id: string }): void;
    };
    targetRepo: {
      handle(payload: unknown): PromiseLike<unknown>;
    };
  }) {
    yield* props.deliveryQueue.drain({
      lanes: [
        {
          name: 'LedgerRepo.outbox',
          requested: true,
          drain: () =>
            Effect.gen(function* () {
              const pending = props.outbox.readFirstPending();
              if (pending === undefined) {
                return;
              }
              const payload = yield* decodePersistedPayload(pending.payload);
              const delivered = yield* props.deliveryQueue
                .retry(
                  makeAsync(() => props.targetRepo.handle(payload)).pipe(
                    Effect.flatMap(decodeRpc),
                  ),
                )
                .pipe(Effect.either);
              if (delivered._tag === 'Left') {
                props.outbox.recordDiagnostic({
                  id: pending.id,
                  failure: delivered.left.message,
                });
                return;
              }
              props.outbox.markDelivered({
                id: pending.id,
                deliveredAt: new Date(),
              });
            }),
          hasPending: () => Effect.sync(() => props.outbox.hasPending()),
        },
      ],
    });
  },
);

declare function decodePersistedPayload(
  payload: unknown,
): Effect.Effect<unknown, Error>;
declare function makeAsync<A>(
  fn: () => PromiseLike<A>,
): Effect.Effect<A, Error>;
declare function decodeRpc<A>(encoded: A): Effect.Effect<A, Error>;
