import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

declare const table: {
  id: unknown;
  updatedAt: unknown;
};

/**
 * Sync Drizzle (`'sync'` SQLite) `db` / `tx` builders are plain synchronous calls.
 * Inside `Effect.fn` / `makeTx` programs, call `.select()`, `.insert()`, `.update()`,
 * `.delete()`, `.all()`, `.get()`, and `.run()` directly — do not wrap them in `Effect.sync`.
 *
 * @bad `yield* Effect.sync(() => tx.select().from(table).get())`.
 * @bad `yield* Effect.sync(() => { tx.insert(table).values(row).run() })`.
 * @bad `return yield* Effect.sync(() => db.select().from(table).all())` in a `makeTx` program.
 * @good Direct sync calls inside `Effect.fn` / `makeTx` transaction programs.
 * @good `store.getState()`, DO KV, compile-only `relational.toSQL()`, and factory init still use `Effect.sync`.
 */
export const applyFanoutBatchInTx = Effect.fn('Repo.applyFanoutBatchInTx')(
  function* (props: { tx: unknown; resourceId: string; appliedAt: Date }) {
    const { tx, resourceId, appliedAt } = props;
    const txDb = tx as {
      select(): {
        from(t: unknown): {
          where(c: unknown): { get(): { updatedAt: Date } | undefined };
        };
      };
      update(t: unknown): {
        set(v: unknown): {
          where(c: unknown): { run(): void };
        };
      };
    };

    const row = txDb.select().from(table).where(eq(table.id, resourceId)).get();

    if (row === undefined) {
      return yield* Effect.fail(new Error('row-not-found'));
    }

    txDb
      .update(table)
      .set({ updatedAt: appliedAt })
      .where(eq(table.id, resourceId))
      .run();
  },
);
