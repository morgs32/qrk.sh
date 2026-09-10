---
title: Glossary
updated: 2026-09-09
---

# Glossary

## System

The authored application definition produced by `makeSystem`: authentication,
aggregate and service models, contracts, queries, selections, and frontend
controllers. Versions belong to the individual definitions; the System has no
root version.

- [`system.ts`](../examples/shopping/src/zerospin/system.ts) — Defines the Shopping System and its versioned aggregate and service definitions.

## systemId

The `sys_`-prefixed deployment identifier supplied by Worker configuration. It
keys the singleton SystemRepo and is the first identity field for every direct
Repo.

- [`SystemRepo.ts`](../packages/system-worker/src/SystemRepo/SystemRepo.ts) — addresses the singleton SystemRepo by the decoded configured system id.
- [`AggregateChain.ts`](../packages/system-worker/src/AggregateChain/AggregateChain.ts) — includes `systemId` in aggregate-chain instance identity and configures one fixed schema.

## Repo

A direct Durable Object class that owns one keyed database, durable boundary,
and its deferred work. The static runtime has SystemRepo, five command chains,
four domain Repos, and SystemLogRepo.

- [`types.ts`](../packages/core/src/system/types.ts) — enumerates the eleven registered Repo kinds.
- [`Worker.ts`](../examples/shopping/src/Worker.ts) — exports every direct Repo class from a static Worker.

## SystemRepo

The singleton Repo keyed by `{ systemId }`. It owns Repo inspection, and single-use frontend WebSocket tickets; it also routes
WebSocket traffic to finalized command chains and SystemLogRepo.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — Defines frontend tickets and Repo registrations.
- [`SystemRepo.ts`](../packages/system-worker/src/SystemRepo/SystemRepo.ts) — Exposes one-time tickets and Repo inspection.
- [`fetch.ts`](../packages/system-worker/src/SystemRepo/fetch/fetch.ts) — routes system logs and both singular finalized-command sockets.

## GatewayApi

The Worker-hosted root capability with exactly three public getters:
`getSystemApi`, `getAggregateFrontendApi`, and `getServiceFrontendApi`.

- [`GatewayApi.ts`](../packages/system-worker/src/GatewayApi/GatewayApi.ts) — defines the complete public Gateway surface.

## SystemApi

The secret-key child capability bound to `{ systemId }`. It serves the System
spec, aggregate/service queries, singular aggregate/service command
finalization, Repo inspection, and health checks through statically imported
System Worker Effects.

- [`SystemApi.ts`](../packages/system-worker/src/SystemApi/SystemApi.ts) — binds the capability to `systemId` and exposes its health check.
- [`SystemApi.ts`](../packages/system-worker/src/SystemApi/SystemApi.ts) — accepts one aggregate or service command per finalization call.

## AggregateFrontendApi

The authenticated aggregate frontend capability binds `{ systemId, aggregateId, aggregateName, userId, frontendName }` and its frontend lock. Configuration supplies systemId; authentication supplies userId; admission checks bind the caller-selected aggregate and frontend fields. Push returns an AC admission receipt. State supplies a version-pinned published snapshot.

- [`pushCommand.ts`](../packages/system-worker/src/AggregateFrontendApi/pushCommand/pushCommand.ts) — Defines the current ownership and execution contract.

## ServiceFrontendApi

The independently disposable read-only child capability bound to `{ systemId,
serviceName, userId, frontendName, serviceFrontendLock }` plus the authored
SystemWorker route. It serves state and WebSocket tickets.

- [`getServiceFrontendApi.ts`](../packages/system-worker/src/GatewayApi/getServiceFrontendApi/getServiceFrontendApi.ts) — authenticates, authorizes, and constructs the exact five-field child binding.
- [`ServiceFrontendApi.ts`](../packages/system-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts) — exposes state, finalized history, and one-time ticket operations without a push method.

## command chain

A durable ordered history owner. AC retains immutable admitted aggregate inputs. VAC retains terminal execution entries per aggregate version. UVAC retains independent frontend output positions. ServiceAdmittedChain and the versioned service finalized chains retain service admission, execution outcomes, and service frontend output.

- [`aggregateChainDbConfig.ts`](../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts) — Stores immutable aggregate inputs with their admitted position and canonical bytes.
- [`userVersionedAggregateChainDbConfig.ts`](../packages/system-worker/src/UserVersionedAggregateChain/userVersionedAggregateChainDbConfig.ts) — Stores each frontend output by its independent primary-key position and retains its aggregate watermark.

## aggregate and service Repos

Durable resource-state owners. VAR prepares and executes admitted commands per aggregate version. UVAR replays those terminal entries into aggregate replica state and emits one selected/projected frontend delta per input position. Service Repos retain their separate role.

- [`execute.ts`](../packages/system-worker/src/UserVersionedAggregateRepo/execute/execute.ts) — Defines the current ownership and execution contract.

## suffix

A bounded contiguous page after a consumer cursor. Transport page boundaries do not merge command semantics or allocate batch identities. AC and VAC supply SQL-limited suffixes; UVAR commits one output per command.

- [`makeFanoutQueue.ts`](../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts) — Reads complete rows after the exclusive cursor with a 64-row limit and an optional inclusive upper bound.

## userIndex

The contiguous position of one aggregate frontend output in UVAR's UVAC log.
It advances for aggregate outcomes and independent pinned-service occurrences,
including outputs with an empty delta. Snapshots and WebSocket resume use this
position; an output with `resolution: null` does not acknowledge an aggregate
command.

- [`types.ts`](../packages/core/src/session/types.ts) — Defines separate frontend and aggregate positions on finalized outputs and complete snapshots.
- [`applyAggregateFrontendCommandTx.ts`](../packages/core/src/session/applyAggregateFrontendCommandTx.ts) — Requires contiguous frontend progress while rejecting a decreasing aggregate watermark.
- [`bootstrapAggregateFrontendSession.ts`](../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — Sends the snapshot frontend position to resume the socket.

## aggregateIndex

The ordered aggregate-command position. On an aggregate frontend output or
snapshot it is the latest consumed aggregate position, which can remain
unchanged across several frontend outputs. The command journal's `pushIndex`
records the aggregate admission receipt rather than frontend output progress.

- [`applyAggregateFrontendCommandTx.ts`](../packages/core/src/session/applyAggregateFrontendCommandTx.ts) — Commits the output's aggregate watermark and frontend position separately.
- [`bootstrapAggregateFrontendSession.ts`](../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — Checks the receipt's command ID and writes its admitted aggregate position to that journal occurrence.

## disposition

The success or failure of an aggregate occurrence. VAR folds ordered command positions, IDs, and dispositions into a rolling SHA-256 hash. The comparison deliberately excludes resulting state and mutation bytes.

- [`aggregateDispositionHash.ts`](../packages/system-worker/src/aggregateDispositionHash/aggregateDispositionHash.ts) — Defines the current ownership and execution contract.

## cutover

AC adopts its bundled configured base as durable desired intent during activation. Its alarm compares that intent with the applied base, requiring forward numeric version order; nonempty chains sample the admitted index and await base and desired VAR flushes in parallel. Matching command IDs and disposition hashes at that checkpoint allow a compare-and-set of the base version. Promotion atomically clears `cutoverFailure`; divergence persists candidate invalidation and that diagnostic. Infrastructure failures retain alarm recovery. Direct retries use only the applied base.

- [`cutover.ts`](../packages/system-worker/src/AggregateChain/cutover/cutover.ts) — Defines the current ownership and execution contract.

## frontend lock

An authored, signed description of the exact frontend schema and query surface.
Gateway validates the lock and requires authorization to return the same exact
target before constructing a frontend capability.

- [`getAggregateFrontendApi.ts`](../packages/system-worker/src/GatewayApi/getAggregateFrontendApi/getAggregateFrontendApi.ts) — decodes the aggregate frontend lock before authentication and authorization.
- [`getServiceFrontendApi.ts`](../packages/system-worker/src/GatewayApi/getServiceFrontendApi/getServiceFrontendApi.ts) — decodes the service frontend lock.

## contract binding

The singular `{ contract, guard? }` registry value for one aggregate or
aggregate-frontend command name. Service command registries store the contract
object itself.

- [`types.ts`](../packages/core/src/contracts/types.ts) — defines `IContractBinding` as `contract` plus an optional guard.
- [`makeFrontendController.ts`](../packages/core/src/frontendController/makeFrontendController.ts) — decodes each aggregate-frontend command as that singular binding.

## guard

A synchronous read-only check on `{ userId, db.query, payload }` attached to
one contract binding. `runGuard` preserves typed failures and maps suspension
to `guard-must-be-synchronous`. Local sessions run the frontend guard before
command identity. VAR provisionally installs requested replica copies in its
command transaction before contract and aggregate binding guards read `db.query`. An
authored rejection rolls the command savepoint back, including provisional
replica changes and enrollment.

- [`runGuard.ts`](../packages/core/src/guards/runGuard.ts) — runs the guard to a synchronous exit and maps async fibers to `guard-must-be-synchronous`.
- [`makeAggregateSession.ts`](../packages/core/src/session/makeAggregateSession.ts) — runs the frontend guard against the adapted payload before command id allocation.
- [`executeCommandsTx.ts`](../packages/system-worker/src/VersionedAggregateRepo/executeCommands/executeCommandsTx.ts) — Installs replica copies inside the command savepoint before running contract and aggregate binding guards.

## mounted frontend

The nominal React application value produced by `makeMountedFrontend`. It
retains the authored controller and a complete version map; aggregate mounts
require current model versions, while service mounts may select historical
models. `makeZerospinApp` rejects any frontend that is not this identity.

- [`makeMountedFrontend.ts`](../packages/react/src/makeMountedFrontend.ts) — brands the class so only `makeMountedFrontend` can construct instances.
- [`resolveMountedFrontend.ts`](../packages/react/src/resolveMountedFrontend.ts) — rejects a configured frontend that is not a `MountedFrontend`.

## WebSocket ticket

A short-lived, single-use opaque token persisted by SystemRepo for one exact
finalized command chain and authenticated frontend target. The browser
exchanges it at the singular-command Worker WebSocket route.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — defines the aggregate and service ticket rows with exact target fields and chain name.

## command finalization

VAR commits the terminal occurrence, prepared execution entry, resource state, and disposition cursor together. It returns that committed result directly; VAC publication is durable asynchronous work, explicitly awaited by flush.

- [`executeCommandsTx.ts`](../packages/system-worker/src/VersionedAggregateRepo/executeCommands/executeCommandsTx.ts) — Commits each terminal execution entry to the results outbox together with aggregate resources and the disposition head.

## main-thread frontend replica

One page-owned synchronous in-memory SQLite database and stable session/store,
with an ownership-period recovery loop, finalized-command socket, and aggregate
push lane. A revoked frontend stays mounted in a non-current state. Reacquiring
its shared backup restores the same live database and renews execution identity.

- [`bootstrapAggregateFrontendSession.ts`](../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — owns each aggregate acquisition period's restoration, socket, reconciliation, and push lane.
- [`bootstrapServiceFrontendSession.ts`](../packages/frontend/src/bootstrapServiceFrontendSession.ts) — owns the independent service acquisition and recovery period.
- [`makeAggregateSession.ts`](../packages/core/src/session/makeAggregateSession.ts) — exposes current state identity through a getter and rejects commands outside current ownership.

## IndexedDB backup worker

The origin's stable SharedWorker running asynchronous backup SQLite through
`IDBBatchAtomicVFS`. `BackupWorkerApi` grants one revocable `BackupDbApi` per
exact `backupKey`; that key includes frontend identity and its complete lock
hash, independently of execution session and app build. Full snapshot copies
and ordered SQL batches share one SQLite semaphore.

- [`backupWorker.entry.ts`](../packages/backup-worker/src/backupWorker.entry.ts) — initializes the fixed IndexedDB namespace and lifetime lock before accepting storage work.
- [`acquireDb.ts`](../packages/backup-worker/src/BackupWorkerApi/acquireDb/acquireDb.ts) — revokes the previous target at takeover arrival and distinguishes current-owner reuse from a new baseline grant.
- [`applyStatements.ts`](../packages/backup-worker/src/BackupDbApi/applyStatements/applyStatements.ts) — checks the bound capability inside the serialized turn and commits or rolls back the whole batch.
- [`makeAggregateFrontendBackupKey.ts`](../packages/frontend/src/makeAggregateFrontendBackupKey.ts) — generates the aggregate route from exact identity fields and the full frontend-lock hash.
- [`makeServiceFrontendBackupKey.ts`](../packages/frontend/src/makeServiceFrontendBackupKey.ts) — generates the corresponding service route.
