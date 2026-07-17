# Synchronous Post-Commit Live Query Refresh

Date: 2026-07-13

Status: Implemented

## 1. Goals and non-goals

1. Prevent live queries from executing SQL reentrantly inside SQLite update or commit callbacks.
2. Refresh every affected live-query Zustand store synchronously after a successful autocommit write or outer transaction commit and before the Drizzle write returns.
3. Coalesce all table changes from one commit so each affected live query reruns at most once.
4. Preserve the existing React subscription lifecycle and let `useSyncExternalStore` render the synchronously updated store without making DOM commitment part of the database contract.
5. Keep asynchronous shared-worker SQLite, direct vendor SQLite calls, server repositories, websocket fanout, release naming, and persisted compatibility outside this change.

## 2. Architecture

1. The current failure begins when `sqlite3.step` invokes `update_hook` and the hook synchronously runs a live-query `SELECT` against the same connection. SQLite forbids modifying or querying the connection from that callback, so the callback must only record invalidation state.
2. The synchronous in-memory SQLite client owns the pending changed-table set, the subscriber set, and a boolean recording whether SQLite reached a commit.
3. `update_hook` adds non-null table names to the pending set. `commit_hook` sets the commit boolean and returns zero. Neither callback prepares, steps, or executes SQL.
4. Both `WaSqliteSession` execution paths call the client flush operation only after their active prepared statement has been finalized. An outer `finally` guarantees that committed work is flushed even when a later statement or result mapping fails.
5. The flush checks `get_autocommit`. While an explicit transaction remains active, it retains the pending invalidations without notifying subscribers. After autocommit or outer commit, it resets its internal commit state before notifying subscribers so listener queries cannot recursively flush the same commit.
6. Rollback reaches autocommit without a commit-hook signal, so the flush discards pending table names without rerunning queries. A nested savepoint never flushes separately; table names from a rolled-back savepoint may cause one harmless rerun after a later outer commit.

## 3. API and data flow

1. The object returned by `makeInMemorySQLite3` adds `subscribeToTableChanges(listener: (changedTableNames: ReadonlySet<string>) => void): () => void`.
2. The same object adds `flushTableChanges(): void`.
3. These additions flow into the existing inferred `IWaSqliteClient` shape. No new named type assignment or export is introduced.
4. `makeLiveQuery` subscribes directly through `client.subscribeToTableChanges`; its existing direct `update_hook`, connection `WeakMap`, no-op hook, and one-call subscription wrapper are removed.
5. A live query checks its watched names against the committed changed-table set. The first match executes its already-built query once and synchronously calls the Zustand store's `setState`.
6. The database transaction therefore returns only after every subscribed affected live-query store contains its post-commit data or its post-commit query error.

## 4. Errors and React semantics

1. A live-query rerun failure preserves the last successful data, records the error in that query's store, and does not retroactively fail an already-committed database write.
2. Other subscribed live queries continue refreshing because each `makeLiveQuery` listener contains its own query failure.
3. The React hook keeps `useEffect` only to acquire and release the database listener. It does not use an effect to sequence a procedure after a write.
4. Zustand updates remain synchronous. React reads them through its existing `useSyncExternalStore` integration and prevents tearing, but React may commit the DOM after the database call returns.
5. No microtask queue or library-level `flushSync` is added. A future imperative UI procedure that truly requires a committed DOM must establish that barrier at its React boundary.

## 5. Test seams

1. Extend the real-WASM `makeLiveQuery` specification to verify an autocommit write refreshes the store before `.run()` returns.
2. Verify an explicit transaction leaves the store unchanged inside its callback and refreshes it before `transaction()` returns.
3. Verify a committed delete reruns its query without a nested SQLite step or malformed-image failure.
4. Verify repeated writes and multiple watched tables in one transaction execute the affected live query once.
5. Verify outer rollback discards invalidations and does not rerun the query.
6. Verify nested savepoint work waits for outer commit and accepts one false-positive rerun when savepoint work was rolled back.
7. Verify an aborted autocommit statement discards update-hook invalidations and does not leak them into a later unrelated commit.
8. Verify rerun failure remains query state, does not block a healthy live query, the write succeeds, and a later write recovers the failed query.
9. Add one authenticated shopping Playwright regression that converges Basic T-Shirt to absent, pauses push, stages an add and removal, manually pushes, observes no Fiber failure or malformed-image error, and confirms the item remains absent after reload.
10. Run core, live-query, and React typechecks plus core, live-query, and authenticated shopping Playwright tests through Nx.
