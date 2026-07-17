import { Effect } from 'effect';

declare const encodeRpc: <A, E>(
  effect: Effect.Effect<A, E, never>,
) => Promise<unknown>;
declare const findExisting: (props: {
  db: unknown;
  drizzleSchema: unknown;
  idempotencyKey: string;
}) => Effect.Effect<unknown, never, never>;
declare const getCurrentCursor: Effect.fn.Return<
  string | null,
  never,
  never
> extends Effect.Effect<infer A, infer E, infer R>
  ? (props: {
      storage: DurableObjectStorage;
      cursorAbbreviation: string;
    }) => Effect.Effect<A, E, R>
  : never;

const CURRENT_CURSOR_KV_KEY = 'currentCursor';

/**
 * Durable Object public methods keep workflow visible at the RPC boundary.
 * Reusable Effect substeps live in domain-named modules when shared across methods.
 *
 * @bad Hide the entire publish workflow in a class `publishHelpers` bag.
 * @bad Duplicate KV read + schema decode in every caller instead of a shared substep.
 * @bad Helper that mirrors the public RPC and calls encodeRpc for internal callers.
 */
export class ResourceRepo {
  #db = {} as unknown;
  #props = {
    drizzleSchema: {} as unknown,
    managedRuntime: {} as { runPromise: typeof Effect.runPromise },
    cursorAbbreviation: 'cur',
  };
  ctx = { storage: {} as DurableObjectStorage };

  async publish(props: { idempotencyKey: string }) {
    return this.#props.managedRuntime.runPromise(
      Effect.gen(this, function* () {
        const existing = yield* findExisting({
          db: this.#db,
          drizzleSchema: this.#props.drizzleSchema,
          idempotencyKey: props.idempotencyKey,
        });
        return existing;
      }).pipe(encodeRpc),
    );
  }

  async getCurrentCursor() {
    return this.#props.managedRuntime.runPromise(
      getCurrentCursor({
        storage: this.ctx.storage,
        cursorAbbreviation: this.#props.cursorAbbreviation,
      }).pipe(encodeRpc),
    );
  }
}

export const readCurrentCursor = Effect.fn('Fanout.getCurrentCursor')(
  function* (props: {
    storage: DurableObjectStorage;
    cursorAbbreviation: string;
  }) {
    const { storage } = props;
    return storage.kv.get(CURRENT_CURSOR_KV_KEY) ?? null;
  },
);
