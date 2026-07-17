import { Effect } from 'effect';

/**
 * Pass named `Effect.fn` transaction programs directly to `makeTx`.
 *
 * @bad `program: ({ tx }) => Effect.gen(function* () { ... })`.
 * @bad `program: ({ tx }) => Effect.sync(() => { ... })` — sync Drizzle calls belong inline; see `tooling/sync-drizzle-no-effect-sync.ts`.
 * @bad `program: ({ tx }) => Effect.fn('Repo.tx')(function* (tx) { ... })(tx)`.
 * @good Inline sync Drizzle writes inside the named transaction program.
 */
export const applySubscriberBatch = Effect.fn('Subscriber.applyBatch')(
  function* (props: {
    db: unknown;
    events: readonly { cursor: string; payload: unknown }[];
  }) {
    return yield* makeTx({
      db: props.db,
      program: Effect.fn('Subscriber.applyBatch.transaction')(function* ({
        tx,
      }) {
        for (const event of props.events) {
          yield* applyEventInTx({ tx, event });
        }
      }),
    });
  },
);

declare const makeTx: (props: {
  db: unknown;
  program: (props: { tx: unknown }) => Effect.Effect<void, unknown, never>;
}) => Effect.Effect<void, unknown, never>;
declare const applyEventInTx: (props: {
  tx: unknown;
  event: { cursor: string; payload: unknown };
}) => Effect.Effect<void, unknown, never>;
