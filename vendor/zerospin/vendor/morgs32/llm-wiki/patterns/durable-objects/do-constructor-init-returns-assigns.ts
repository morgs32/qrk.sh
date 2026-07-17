import { Effect } from 'effect';

declare const runtime: {
  runSync<A>(effect: Effect.Effect<A, unknown, never>): A;
  runPromise<A>(effect: Effect.Effect<A, unknown, never>): Promise<A>;
};

declare function migrateDb(props: {
  db: unknown;
  schema: unknown;
}): Effect.Effect<void, unknown, never>;
declare function drizzle(
  storage: unknown,
  props: { schema: unknown; relations: unknown },
): unknown;
declare function invariant(value: unknown, message: string): asserts value;

declare const AsyncLive: unknown;

const IS_BOOTSTRAPPED_KV_KEY = 'isBootstrapped';

/**
 * `#initialize` returns values; the constructor assigns fields. Migrate and wake work run inside `blockConcurrencyWhile`.
 *
 * @bad Entire init including migrate inside the block with fields mutated only inside `#initialize`.
 * @bad Sync init outside the block but assignments hidden in `#initialize` — still needs definite-assignment assertions.
 */
class ResourceRepo {
  readonly #db: unknown;
  readonly #props: {
    drizzleSchema: unknown;
    drizzleRelations: unknown;
    parseName(name: string): Effect.Effect<void, unknown, never>;
  };

  #initialize = Effect.fn('ResourceRepo.initialize')(
    function* (this: ResourceRepo) {
      const fanoutName = this.ctx.id.name;
      invariant(fanoutName, 'ResourceRepo must be accessed via idFromName');

      yield* this.#props.parseName(fanoutName);
      const db = drizzle(this.ctx.storage, {
        schema: this.#props.drizzleSchema,
        relations: this.#props.drizzleRelations,
      });

      return { db };
    },
  );

  #migrate = Effect.fn('ResourceRepo.migrate')(function* (this: ResourceRepo) {
    yield* migrateDb({ db: this.#db, schema: this.#props.drizzleSchema });
  });

  constructor(
    private readonly ctx: {
      id: { name: string | null };
      storage: {
        kv: {
          get(key: string): string | null;
          put(key: string, value: string): void;
        };
      };
      blockConcurrencyWhile(fn: () => Promise<void>): void;
    },
    _env: unknown,
    props: ResourceRepo['#props'],
  ) {
    this.#props = props;
    invariant(ctx.id.name, 'ResourceRepo must be accessed via idFromName');

    const { db } = runtime.runSync(
      this.#initialize().pipe(Effect.provide(AsyncLive)),
    );
    this.#db = db;

    ctx.blockConcurrencyWhile(async () => {
      if (ctx.storage.kv.get(IS_BOOTSTRAPPED_KV_KEY) === 'true') {
        return;
      }

      await runtime.runPromise(this.#migrate().pipe(Effect.provide(AsyncLive)));
      this.queue.kick();
      ctx.storage.kv.put(IS_BOOTSTRAPPED_KV_KEY, 'true');
    });
  }

  queue = { kick: () => {} };
}

export { ResourceRepo };
