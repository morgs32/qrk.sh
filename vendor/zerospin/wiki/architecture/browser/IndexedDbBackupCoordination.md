---
title: IndexedDB Backup Coordination
updated: 2026-09-07
---

# IndexedDB Backup Coordination

One origin-relative SharedWorker owns asynchronous backup SQLite and
`IDBBatchAtomicVFS`. Pages retain synchronous live replicas and independently
acquire one revocable database capability per exact frontend backup key.
The acquisition result distinguishes current-owner reuse from a new grant;
only a new grant restores committed backup state and renews execution identity.
A valid authentication locator and compatible backup allow takeover restoration
without waiting for either the previous page or a server response.

## Trigger

1. `ZerospinApp.Provider` acquires one page connection before initializing its
   selected frontend sessions in parallel.
   - [`makeZerospinApp.tsx`](../../../packages/react/src/makeZerospinApp.tsx) — passes the same `backupWorker` into aggregate and service bootstraps.
2. The connection opens `/__zerospin/backup-worker.js` with the name
   `zerospin-backups`; readiness waits for storage initialization under the
   worker's exclusive `zerospin-backups-lifetime` lock.
   - [`acquireBackupWorker.ts`](../../../packages/backup-worker/src/acquireBackupWorker/acquireBackupWorker.ts) — opens the stable MessagePort RPC session and observes worker lifetime only after `api.ready()` succeeds.
   - [`backupWorker.entry.ts`](../../../packages/backup-worker/src/backupWorker.entry.ts) — holds the exclusive lifetime lock and creates one asynchronous SQLite runtime.

```mermaid
sequenceDiagram
  participant frontendSession
  participant backupWorker as backupWorker: IBackupWorker
  participant BackupWorkerApi
  participant previousFrontend
  participant BackupDbApi
  participant sqlite3

  autonumber 1
  frontendSession->>backupWorker: backupWorker.acquireDb(...)
  autonumber 2
  backupWorker->>BackupWorkerApi: current.api.acquireDb(...)
  Note over BackupWorkerApi: Revoke old target before waiting for SQLite
  autonumber 3
  BackupWorkerApi->>previousFrontend: previous.onRevoked()
  Note over BackupWorkerApi,previousFrontend: Notification is not awaited; a frozen page cannot block takeover
  autonumber 4
  BackupWorkerApi->>BackupDbApi: api.runtime.semaphore.withPermits(...)
  autonumber 5
  BackupDbApi->>sqlite3: sqlite3.open_v2(...)
  autonumber 6
  BackupDbApi-->>BackupWorkerApi: committed snapshot or explicit absence
  autonumber 7
  BackupWorkerApi-->>backupWorker: acquired database capability and baseline
  autonumber 8
  backupWorker-->>frontendSession: acquired db and snapshot
  autonumber 9
  frontendSession->>frontendSession: db.$client.sqlite3.backup(...)
  autonumber 10
  frontendSession->>frontendSession: session.store.setState(...)
  autonumber 11
  frontendSession->>backupWorker: backupDb.applyStatements(...)
  autonumber 12
  backupWorker->>BackupDbApi: stub.applyStatements(...)
  autonumber 13
  BackupDbApi->>sqlite3: sqlite3.exec(...)
  autonumber 14
  BackupDbApi-->>frontendSession: committed acknowledgement
```

## Annotated workflow steps

1. Visibility, focus, and visible page restoration request ownership of one key.
   Hidden startup waits; hiding an already current frontend retains ownership.
   An acquisition that becomes hidden before publication cannot become current.
   - [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — coalesces visibility, focus, and pageshow signals in the aggregate acquisition queue.
   - [`bootstrapServiceFrontendSession.ts`](../../../packages/frontend/src/bootstrapServiceFrontendSession.ts) — applies the same scoped eligibility rule to the independent service key.
2. The page sends acquisition through its current connection generation.
   A current-owner result reuses its retained capability without restoring.
   - [`acquireBackupWorker.ts`](../../../packages/backup-worker/src/acquireBackupWorker/acquireBackupWorker.ts) — checks readiness and generation, retains revocation callbacks, and returns the existing page capability for `status: 'current'`.
3. A takeover invalidates the previous target immediately and notifies its page
   without awaiting that page. Duplicate stubs share the same revocation state.
   - [`acquireDb.ts`](../../../packages/backup-worker/src/BackupWorkerApi/acquireDb/acquireDb.ts) — marks the previous target revoked before exporting the successor baseline and releases its retained callback.
4. The local `exportSnapshot` Effect enters the new target's runtime semaphore
   and rechecks ownership after waiting. In-flight SQLite work settles before
   the successor reads a baseline.
   - [`exportSnapshot.ts`](../../../packages/backup-worker/src/BackupDbApi/exportSnapshot/exportSnapshot.ts) — checks the current target inside the serialized asynchronous SQLite turn.
5. The worker reuses or opens the logical IndexedDB-backed database and sets
   `PRAGMA synchronous=FULL`, which selects strict IndexedDB commit durability.
   - [`exportSnapshot.ts`](../../../packages/backup-worker/src/BackupDbApi/exportSnapshot/exportSnapshot.ts) — opens the stable VFS path and configures full synchronization before reading persisted contents.
6. An empty schema returns explicit absence; an existing database is copied to
   memory and serialized only after asynchronous backup completion.
   - [`exportSnapshot.ts`](../../../packages/backup-worker/src/BackupDbApi/exportSnapshot/exportSnapshot.ts) — tests schema presence, copies into temporary memory SQLite, and frees serialization resources.
   - [`copySqliteDatabase.ts`](../../../packages/backup-worker/src/copySqliteDatabase/copySqliteDatabase.ts) — awaits async-aware backup initialization, step, and finish; checks completion and releases the schema allocation.
7. The root rechecks the target before returning the grant and disposes failed
   acquisition resources without closing a successor's database.
   - [`acquireDb.ts`](../../../packages/backup-worker/src/BackupWorkerApi/acquireDb/acquireDb.ts) — resolves the grant only after baseline export and rejects intervening revocation.
8. The page retains the returned capability only if its acquisition generation,
   cancellation state, and revocation callback still permit publication.
   - [`acquireBackupWorker.ts`](../../../packages/backup-worker/src/acquireBackupWorker/acquireBackupWorker.ts) — disposes late new grants and duplicates only the accepted returned database stub.
9. The frontend restores received pages into its existing live SQLite connection.
   An absent backup uses normal authoritative initialization.
   - [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — deserializes the received baseline into temporary SQLite and copies it into the retained aggregate database.
   - [`bootstrapServiceFrontendSession.ts`](../../../packages/frontend/src/bootstrapServiceFrontendSession.ts) — restores service contents into its retained connection.
10. Publication renews execution metadata on the existing session/store and
    explicitly invalidates mounted live queries after restoration.
    - [`makeAggregateSession.ts`](../../../packages/core/src/session/makeAggregateSession.ts) — exposes current execution identity from state and captures that ID for each synchronous command.
    - [`makeInMemorySQLite3.ts`](../../../packages/core/src/drizzle/makeInMemorySQLite3.ts) — accepts restored table names because SQLite page copying does not run `update_hook`.
    - [`makeZerospinApp.tsx`](../../../packages/react/src/makeZerospinApp.tsx) — moves DevTools registrations to the current ID while retaining mounted sessions and tracks the actual registered ID for cleanup.
11. Committed main-thread SQL enters the affected frontend's asynchronous FIFO.
    - [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — captures committed transactions and sends one batch at a time through the active `backupDb`.
12. The page mutation boundary checks capability revocation and connection
    generation before dispatch and classifies lost replies as uncertainty.
    - [`acquireBackupWorker.ts`](../../../packages/backup-worker/src/acquireBackupWorker/acquireBackupWorker.ts) — rejects expired database capabilities and races dispatched operations against connection loss without retrying SQL.
13. The bound worker target checks ownership inside the SQLite semaphore and
    awaits the complete transaction, including rollback on failure.
    - [`applyStatements.ts`](../../../packages/backup-worker/src/BackupDbApi/applyStatements/applyStatements.ts) — owns `BEGIN IMMEDIATE`, ordered statements, `COMMIT`, and rollback under an uninterruptible asynchronous turn.
14. The acknowledgement follows the awaited commit. Stale disposal can release
    only resources still owned by its target.
    - [`applyStatements.ts`](../../../packages/backup-worker/src/BackupDbApi/applyStatements/applyStatements.ts) — returns only after SQLite commit finishes.
    - [`dispose.ts`](../../../packages/backup-worker/src/BackupDbApi/dispose/dispose.ts) — checks target identity again before removing the map entry or closing the SQLite handle.

## Exact keys and fixed storage

The aggregate key contains `{ systemId, userId, aggregateId, aggregateName,
frontendName, aggregateFrontendLockKey }`; the service key contains
`{ systemId, userId, serviceName, frontendName, serviceFrontendLockKey }`.
Authentication/admission or the offline authentication locator supplies
system/user identity; the caller selects aggregate ID; authored frontend
controllers supply names and the complete canonical frontend lock hash.
Route parameters encode separators, percent signs, and Unicode. Empty values,
dot segments, controls, malformed Unicode, and oversized keys are rejected
before they can alias another logical VFS path.

- [`makeAggregateFrontendBackupKey.ts`](../../../packages/frontend/src/makeAggregateFrontendBackupKey.ts) — builds `/zerospin/:systemId/:userId/aggregate/:aggregateName/:aggregateId/:frontendName/:aggregateFrontendLockKey/backup.sqlite3` with RoutePattern.
- [`makeServiceFrontendBackupKey.ts`](../../../packages/frontend/src/makeServiceFrontendBackupKey.ts) — builds the corresponding `/service/:serviceName/:frontendName/:serviceFrontendLockKey/backup.sqlite3` route.
- [`acquireDb.ts`](../../../packages/backup-worker/src/BackupWorkerApi/acquireDb/acquireDb.ts) — rejects noncanonical paths and keys whose UTF-8 length reaches the VFS's 4096-byte path limit.

The package uses the fresh `zerospin-backups-idb-v1` IndexedDB namespace and the
VFS's fixed layout. Existing incompatible layouts are rejected before an
IndexedDB upgrade can run.

- [`backupWorker.entry.ts`](../../../packages/backup-worker/src/backupWorker.entry.ts) — validates the existing version, stores, and key paths before VFS initialization.

## Uncertainty, revocation, and worker loss

An uncertain mutation reply never replays its SQL. While the capability remains
current, the frontend diverts later commits, clears queued batches, sends a
full live snapshot, and resumes incremental capture. The single snapshot retry
is restricted to typed uncertainty and ends on revocation. Worker loss closes
the connection generation and its ownership periods; reacquisition restores
committed IndexedDB contents instead of overwriting from obsolete page memory.

- [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — owns the aggregate repair lane and pauses it on revocation or connection loss.
- [`bootstrapServiceFrontendSession.ts`](../../../packages/frontend/src/bootstrapServiceFrontendSession.ts) — owns the equivalent service repair lane independently.
- [`acquireBackupWorker.ts`](../../../packages/backup-worker/src/acquireBackupWorker/acquireBackupWorker.ts) — aborts the old lifetime observer, disposes ports/stubs, clears capabilities, and reconnects with a fresh generation.

## Host assets

`backupWorkerPlugin` serves worker JavaScript and matching asynchronous WASM
before SPA fallback in development and emits both into client build output.
Shopping's PWA configuration explicitly includes these assets for loaded-app
offline restart.

- [`backupWorkerPlugin.ts`](../../../packages/backup-worker/src/backupWorkerPlugin.ts) — supplies MIME-specific development middleware and client asset emission from the separate Node/Vite export.
- [`vite.config.ts`](../../../examples/shopping/vite.config.ts) — installs the asset plugin and explicitly includes worker/WASM in PWA caching.

## Verification

- [`makeAggregateSession.node.spec.ts`](../../../packages/core/src/session/makeAggregateSession.node.spec.ts) — verifies renewed IDs restart command indexing and preserve complete previous journal rows.
- [`makeZerospinAppDevtools.react.spec.tsx`](../../../packages/react/src/makeZerospinAppDevtools.react.spec.tsx) — verifies stable mounting, live browser IDs, renewed registrations, and scoped cleanup.
- [`mainThreadBackupAdverse.playwright.spec.ts`](../../../examples/shopping/tests/browser/mainThreadBackupAdverse.playwright.spec.ts) — contains the real Chromium capability, persistence, and handoff acceptance seam.
- [`backupWorker.preview.spec.ts`](../../../examples/shopping/e2e/backupWorker.preview.spec.ts) — exercises separately emitted frontend builds, takeover from a frozen page, real worker/WASM assets, and offline worker restart.

## Callers

- [Main-thread frontend session bootstrap and recovery](./bootstrapBrowserSession.md)
- [Aggregate frontend submission](./PushSequence.md)
- [Frontend finalized-command WebSocket](./FrontendWebSocket.md)
- [Exact frontend authentication](./Authentication.md)
