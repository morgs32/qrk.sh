import { Effect } from 'effect';

declare function makeDurableDb(props: {
  storage: unknown;
  dbConfig: unknown;
}): unknown;

declare function makeDbConfig(props: {
  tables: unknown;
}): unknown;

declare function migrateDb(props: {
  db: unknown;
  schema: unknown;
}): Effect.Effect<void, unknown, never>;
declare function makeBoundDORepoConfig(props: unknown): unknown;
declare function makeBoundDORepo(props: {
  boundDORepoConfig: unknown;
}): new () => unknown;

declare const runtime: {
  runSync<A>(effect: Effect.Effect<A, unknown, never>): A;
};

/**
 * Lifecycle names describe the startup phase: `#initialize`, `#provisionSchema`, optional `#bootstrap`.
 *
 * @bad Do not use a vague `#setup` that runs schema provisioning and fanout subscription inside sync init.
 * @bad Do not make `#initialize` write one-time KV defaults, subscribe fanout, or kick queues.
 */
const accountBoundDORepoConfig = makeBoundDORepoConfig({
  abbreviation: 'acctrepo',
  namePattern: 'account',
  managedRuntime: runtime,
  getBinding: () => ({}),
  getDbConfig: Effect.fn('AccountRepo.getDbConfig')(function* ({
    key,
  }: {
    key: { accountId: string };
  }) {
    const tables = { accounts: { accountId: key.accountId } };
    return makeDbConfig({ tables });
  }),
  bootstrap: Effect.fn('AccountRepo.bootstrap')(function* ({
    key,
  }: {
    key: { accountId: string };
  }) {
    yield* Effect.sync(() => {
      void key.accountId;
    });
  }),
});

class AccountRepo extends makeBoundDORepo({
  boundDORepoConfig: accountBoundDORepoConfig,
}) {}

export { AccountRepo };
