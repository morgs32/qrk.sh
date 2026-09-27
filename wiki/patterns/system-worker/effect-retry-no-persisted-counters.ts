import {
  encodeError,
  makeZerospinError,
  type PublicFailureSchema,
} from '@zerospin/error';
import { Effect, Result } from 'effect';

/**
 * Put the standard three-attempt schedule in the Durable Object coordinator.
 * Persist domain completion and the latest diagnostic, never retry progress.
 *
 * @bad Add `deliveryAttempts`, `nextRetryAt`, `failedAt`, or `succeededAt` columns for ordinary delivery retry bookkeeping.
 * @bad Treat `lastDeliveryFailure` as retry progress; it is retained operator-visible diagnostic state.
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
      markAcknowledged(props: { acknowledgedAt: Date; id: string }): void;
      recordDiagnostic(props: {
        failure: typeof PublicFailureSchema.Type;
        id: string;
      }): void;
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
                    Effect.flatMap(readResult),
                  ),
                )
                .pipe(Effect.result);
              if (Result.isFailure(delivered)) {
                props.outbox.recordDiagnostic({
                  id: pending.id,
                  failure: yield* encodeError(
                    makeZerospinError({
                      code: 'delivery-failed',
                      message: delivered.failure.message,
                    }),
                  ),
                });
                return;
              }
              props.outbox.markAcknowledged({
                id: pending.id,
                acknowledgedAt: new Date(),
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
declare function readResult<A>(encoded: A): Effect.Effect<A, Error>;
