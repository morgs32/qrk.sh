import { Effect, Runtime } from 'effect';

declare function buildInverseMutationsFromInverseRows(props: {
  models: unknown;
  rows: readonly unknown[];
}): Effect.Effect<readonly unknown[], unknown, never>;

declare function makeResourceOperations(props: {
  mutations: readonly unknown[];
}): Effect.Effect<readonly unknown[], unknown, never>;

declare function makeEncodedResourceOperation(props: {
  operation: unknown;
}): Effect.Effect<unknown, unknown, never>;

declare function commitResourceOperation(props: {
  models: unknown;
  op: unknown;
  tx: unknown;
}): void;

declare const inverseMutationDrizzleSchema: { order: unknown };
declare const db: {
  select(): { from(t: unknown): { orderBy(c: unknown): { all(): unknown[] } } };
  transaction(fn: (tx: unknown) => void): void;
};

/**
 * Pre-resolve Effect work before `db.transaction`, or use `Runtime.runSync` inside the sync callback when required.
 *
 * @bad `yield*` inside `db.transaction(tx => { … })` — the callback is not a generator.
 * @bad `yield* Effect.sync(() => tx.select()…)` inside `Effect.fn` / `makeTx` — see `tooling/sync-drizzle-no-effect-sync.ts`.
 */
export const rewindAndApply = Effect.fn('rewindAndApply')(function* (props: {
  frontend: { models: unknown };
}) {
  const { frontend } = props;

  const inverseRows = db
    .select()
    .from(inverseMutationDrizzleSchema)
    .orderBy(inverseMutationDrizzleSchema.order)
    .all();

  const inverseMutations = yield* buildInverseMutationsFromInverseRows({
    models: frontend.models,
    rows: inverseRows,
  });

  const rewindOps = yield* makeResourceOperations({
    mutations: inverseMutations,
  });

  const encodedRewindOps = yield* Effect.all(
    rewindOps.map(operation => makeEncodedResourceOperation({ operation })),
  );

  yield* Effect.try({
    try: () =>
      db.transaction(tx => {
        for (const op of encodedRewindOps) {
          commitResourceOperation({ models: frontend.models, op, tx });
        }
      }),
    catch: () => new Error('transaction-failed'),
  });
});

// When Effects must run inside the callback: capture runtime via yield* Effect.runtime() and Runtime.runSync.
