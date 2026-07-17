import { Effect } from 'effect';

/**
 * Fanout `storeEvent`: truthy guard on existing cursor; happy-path gate when no successor conflicts.
 *
 * @bad Explicit `!== undefined` / `!== null` on Drizzle `.get()` results.
 * @bad Idempotent silent return on duplicate cursor publish.
 * @bad Put `!successor` on the fail branch (rejects first insert).
 * @bad Wrap sync Drizzle `.get()` / `.run()` in `Effect.sync()` inside generators.
 */
export const storeEvent = Effect.fn('FanoutRepo.storeEvent')(function* (props: {
  event: { cursor: string; prevCursor: string | null };
  db: unknown;
}) {
  const { event } = props;
  const existing = getExistingEvent(event.cursor);

  if (existing) {
    return yield* new ZerospinError({
      code: 'fanout-event-conflict',
      message: 'Fanout event cursor already exists',
    });
  }

  const successor = getSuccessor(event.prevCursor);

  if (!successor || successor.cursor === event.cursor) {
    yield* insertEventAndPayload({ event });
    return;
  }

  return yield* new ZerospinError({
    code: 'fanout-event-fork',
    message: 'Fanout event prevCursor already has a different successor',
  });
});

declare function getExistingEvent(cursor: string): unknown;
declare function getSuccessor(
  prevCursor: string | null,
): { cursor: string } | null;
declare function insertEventAndPayload(props: {
  event: unknown;
}): Effect.Effect<void, unknown, unknown>;
declare class ZerospinError {
  constructor(props: { code: string; message: string });
}
