---
title: Standalone IndexedDB Backup Coordination
updated: 2026-10-05
sources:
  - path: packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts
    sha: cfb9c9b1983411a9e1e7ac5c9322af93b53ed9c1
    lines: 572-1023
  - path: packages/browser/src/BrowserBackup/BrowserBackup.ts
    sha: 507e240db1635c2b4e7c554a05c9c36850928dda
    lines: 29-51
  - path: packages/backup-worker/src/BackupWorkerApi/acquireDb/acquireDb.ts
    sha: ab767d11d48f448ac77c079638179175a2088720
    lines: 87-124
  - path: packages/backup-worker/src/BackupDbApi/exportSnapshot/exportSnapshot.ts
    sha: fb1a8a0018e61d821b9c6a200879d775a2b771ce
    lines: 15-56
  - path: packages/backup-worker/src/BackupDbApi/applyStatements/applyStatements.ts
    sha: ede0913ebb79524ab2029ca546b4ce00a21eb1c1
    lines: 17-58
  - path: packages/core/src/aggregateSession/stageCommand/applySessionCommandTx/applySessionCommandTx.ts
    sha: fb484acbf4731e871c8466825ebfeef2a3b94e12
    lines: 126-156
  - path: packages/core/src/aggregateSession/stageCommand/executeLocalSessionCommandTx/executeLocalSessionCommandTx.ts
    sha: 26cc95a92eebae6561a7c4cc5e5aa45aec5e409a
    lines: 21-39
---

# Standalone IndexedDB backup coordination

This path belongs to standalone sessions. Synchronized aggregate/service sessions
use [durable nodes](./bootstrapBrowserSession.md).

Standalone tabs retain synchronous SQLite and send committed SQL batches to the
backup worker. Initial restore copies the saved database into the live view.
A successful local command does not wait for IndexedDB durability; `backupState`
tracks that asynchronous boundary.

## Trigger

1. `makeStandaloneSession.initialize()` claims a backup key through the shared `BrowserBackup` layer. `backupWorkerPlugin()` serves the stable worker and WASM assets.
2. Ownership acquisition restores saved SQLite or initializes a fresh seed, then publishes the current live session only after its backup boundary is ready.
3. Local command transactions commit synchronous resources and retained history; their committed SQL batches enter asynchronous backup.

```mermaid
sequenceDiagram
  participant makeStandaloneSession
  participant backupWorker as backupWorker: IBackupWorker
  participant backupDb as backupDb: IBackupDb
  participant IndexedDB
  makeStandaloneSession->>backupWorker: backupWorker.acquireDb(...)
  backupWorker->>backupWorker: revoke prior owner
  backupWorker->>IndexedDB: sqlite3.exec(...)
  backupWorker-->>makeStandaloneSession: acquired backupDb + snapshot
  makeStandaloneSession->>makeStandaloneSession: restore and validate retained SQLite
  makeStandaloneSession->>makeStandaloneSession: preserve indexes; replace live sessionId
  makeStandaloneSession->>backupDb: backupDb.applyStatements(...)
  backupDb->>IndexedDB: sqlite3.exec(...)
  backupDb-->>makeStandaloneSession: committed backup
```

## Annotated workflow steps

1. Acquire the worker-owned backup database with a revocation callback.
   - [`makeStandaloneSession.ts:572-590`](../../../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts#L572-L590) — Acquisition retains the revocable database capability and marks the current view superseded on takeover. (`packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts:572-590`)
   - [`BrowserBackup.ts:29-51`](../../../packages/browser/src/BrowserBackup/BrowserBackup.ts#L29-L51) — The shared service prevents duplicate claims in one browser context and releases its local claim with the session scope. (`packages/browser/src/BrowserBackup/BrowserBackup.ts:29-51`)
2. Revoke the previous owner before waiting for serialized SQLite access.
   - [`acquireDb.ts:87-104`](../../../packages/backup-worker/src/BackupWorkerApi/acquireDb/acquireDb.ts#L87-L104) — Arrival revokes prior capabilities and installs the newly owned database receiver. (`packages/backup-worker/src/BackupWorkerApi/acquireDb/acquireDb.ts:87-104`)
3. Read the committed IndexedDB database and capture its SQLite snapshot.
   - [`exportSnapshot.ts:15-56`](../../../packages/backup-worker/src/BackupDbApi/exportSnapshot/exportSnapshot.ts#L15-L56) — The serialized read opens backup SQLite with FULL durability and copies populated storage into memory. (`packages/backup-worker/src/BackupDbApi/exportSnapshot/exportSnapshot.ts:15-56`)
4. Return the database capability and snapshot after checking ownership again.
   - [`acquireDb.ts:105-124`](../../../packages/backup-worker/src/BackupWorkerApi/acquireDb/acquireDb.ts#L105-L124) — Export completes before the grant resolves and returns the acquired snapshot. (`packages/backup-worker/src/BackupWorkerApi/acquireDb/acquireDb.ts:105-124`)
5. Restore the synchronous view and validate its fixed schema, backup identity, claims, and metadata.
   - [`makeStandaloneSession.ts:614-701`](../../../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts#L614-L701) — Exact-schema restore rejects unreadable or incompatible backups and restores the last readable local database on failure. (`packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts:614-701`)
6. Change the current live identity without resetting retained row positions or allocation.
   - [`makeStandaloneSession.ts:819-835`](../../../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts#L819-L835) — Restored metadata updates only `sessionId` and persists that change before commands can resume. (`packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts:819-835`)
7. Send committed identity and local command SQL batches to the owned backup database.
   - [`makeStandaloneSession.ts:839-855`](../../../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts#L839-L855) — The scoped queue serializes committed statements through `backupDb.applyStatements`. (`packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts:839-855`)
8. Validate ownership inside the serialized turn and commit the SQL batch atomically.
   - [`applyStatements.ts:17-58`](../../../packages/backup-worker/src/BackupDbApi/applyStatements/applyStatements.ts#L17-L58) — BEGIN IMMEDIATE encloses bound statements and rolls back a failed batch. (`packages/backup-worker/src/BackupDbApi/applyStatements/applyStatements.ts:17-58`)
9. Acknowledge durability independently of synchronous local command success.
   - [`makeStandaloneSession.ts:855-870`](../../../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts#L855-L870) — The lifecycle marks backup ready when the acknowledged queue is empty; uncertain writes enter snapshot repair. (`packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts:855-870`)

## Retained row identity and reset

All locally completed rows retain their `sessionIndex` and original command `sessionId` in the serialized database. Restoring or reacquiring ownership mints a new live session identity while preserving `nextSessionIndex`; the next local command follows the saved history without collisions. Standalone local execution does not retain pending inverse-operation rows.

- [`applySessionCommandTx.ts:126-156`](../../../packages/core/src/aggregateSession/stageCommand/applySessionCommandTx/applySessionCommandTx.ts#L126-L156) — The local occurrence keeps its originating command fields and session index while metadata advances the sole allocator. (`packages/core/src/aggregateSession/stageCommand/applySessionCommandTx/applySessionCommandTx.ts:126-156`)
- [`executeLocalSessionCommandTx.ts:21-39`](../../../packages/core/src/aggregateSession/stageCommand/executeLocalSessionCommandTx/executeLocalSessionCommandTx.ts#L21-L39) — Local execution inserts the completed occurrence and returns it without writing pending inverse operations. (`packages/core/src/aggregateSession/stageCommand/executeLocalSessionCommandTx/executeLocalSessionCommandTx.ts:21-39`)

Explicit `reset()` replaces history with the authored seed and starts a fresh sequence. A later backup and restore preserve that new history's allocator. Changed fixed schemas reject old backups with `standalone-backup-unreadable` until an explicit reset; no rows are translated or automatically deleted.

- [`makeStandaloneSession.ts:1010-1023`](../../../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts#L1010-L1023) — Reset excludes staging, disposes ownership, and forces a fresh seed. (`packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts:1010-1023`)
