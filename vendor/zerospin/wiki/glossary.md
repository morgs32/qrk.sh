---
title: Glossary
updated: 2026-09-20
---

# Glossary

## System

The authored application definition produced by `makeSystem`: authentication,
aggregate and service models, contracts, queries, selections, and frontend
controllers. Versions belong to the individual definitions; the System has no
root version.

- [`system.ts`](../examples/shopping/src/zerospin/system.ts) — Defines the Shopping System and its versioned aggregate and service definitions.

## systemId

The `sys_`-prefixed deployment identifier supplied through
`makeSystemConfig(system, { systemId })` and embedded in generated Worker configuration. It
keys the singleton SystemRepo and is the first identity field for every direct
Repo. It remains in backend capabilities, tickets, routing, and Repo identities,
but is intentionally absent from `IAggregateFrontendSnapshot`,
`IServiceFrontendSnapshot`, aggregate/service browser session state, and all
three browser backup-key identities. Those frontend values are scoped by their
API origin or local backup namespace rather than carrying the deployment ID as
application state.

- [`makeWranglerConfig.ts`](../packages/dev-worker/src/makeWranglerConfig.ts) — embeds the configured system ID as the Worker binding.
- [`SystemRepo.ts`](../packages/system-worker/src/SystemRepo/SystemRepo.ts) — addresses the singleton SystemRepo by the decoded configured system id.
- [`AggregateChain.ts`](../packages/system-worker/src/AggregateChain/AggregateChain.ts) — includes `systemId` in aggregate-chain instance identity and configures one fixed schema.
- [`types.ts`](../packages/core/src/session/types.ts), [`types.ts`](../packages/core/src/serviceSession/types.ts) — define aggregate and service frontend snapshots and session state without `systemId`.
- [`makeAggregateFrontendBackupKey.ts`](../packages/frontend/src/makeAggregateFrontendBackupKey.ts), [`makeServiceFrontendBackupKey.ts`](../packages/frontend/src/makeServiceFrontendBackupKey.ts), [`makeStandaloneFrontendBackupKey.ts`](../packages/frontend/src/makeStandaloneFrontendBackupKey.ts) — define the three frontend backup identities without `systemId`.

## Repo

A direct Durable Object class that owns one keyed database, durable boundary,
and its deferred work. The static runtime has SystemRepo, five command chains,
four domain Repos, and SystemLogRepo.

- [`types.ts`](../packages/core/src/system/types.ts) — enumerates the eleven registered Repo kinds.
- [`DevWorker.ts`](../packages/dev-worker/src/DevWorker.ts) — exports the direct Repo classes from the framework Worker.

## SystemRepo

The singleton Repo keyed by `{ systemId }`. It owns Repo inspection, and single-use frontend WebSocket tickets; it also routes
WebSocket traffic to selected-command chains and SystemLogRepo.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — Defines frontend tickets and Repo registrations.
- [`SystemRepo.ts`](../packages/system-worker/src/SystemRepo/SystemRepo.ts) — Exposes one-time tickets and Repo inspection.
- [`fetch.ts`](../packages/system-worker/src/SystemRepo/fetch/fetch.ts) — routes system logs and both singular selected-command sockets.

## GatewayApi

The Worker-hosted root capability with exactly three public getters:
`getSystemApi`, `aggregate`, and `service`.

- [`GatewayApi.ts`](../packages/system-worker/src/GatewayApi/GatewayApi.ts) — defines the complete public Gateway surface.

## SystemApi

The secret-key child capability bound to `{ systemId }`. It serves the System
spec, aggregate/service queries, singular aggregate/service command
finalization, Repo inspection, and health checks through statically imported
System Worker Effects.

- [`SystemApi.ts`](../packages/system-worker/src/SystemApi/SystemApi.ts) — binds the capability to `systemId` and exposes its health check.
- [`SystemApi.ts`](../packages/system-worker/src/SystemApi/SystemApi.ts) — accepts one aggregate or service command per finalization call.

## AggregateFrontendApi

The authenticated aggregate frontend capability binds `{ systemId, aggregateId,
aggregateName, aggregateVersion, authentication, selectionPath, frontendName,
aggregateFrontendLock }`. Worker configuration supplies `systemId`; gateway
selection supplies the aggregate name/version; authentication supplies
`aggregateId`, encoded authentication, and the canonical derived
`selectionPath`; authorization supplies `frontendName` and the lock. Tickets retain those fields
for the SelectionVAC socket, which admits commands only after history validation
and returns AC receipts on that same socket. `getSnapshot({ pendingCommandIds })` supplies a
version-pinned `IAggregateFrontendSnapshot`; `getSelectedCommands({
afterSelectionIndex, aggregateVersion })` supplies retained
`IAggregateSelectedCommand` history and its tip without resubmitting bound owner
fields.

- [`onMessage.ts`](../packages/system-worker/src/SelectionVersionedAggregateChain/onMessage/onMessage.ts) — Defines the current ownership and execution contract.

## ServiceFrontendApi

The independently disposable read-only child capability binds `{ systemId,
serviceName, serviceVersion, authentication, selectionPath, frontendName,
serviceFrontendLock }`. Worker configuration supplies `systemId`; gateway
selection supplies service name/version; authentication supplies encoded
authentication and the canonical derived `selectionPath`; authorization supplies
`frontendName` and the lock. It serves `IServiceFrontendSnapshot`, filtered
`IServiceSelectedCommand` history through `getSelectedCommands({
afterServiceIndex, serviceVersion })`, and WebSocket tickets without a push
method.

- [`ServiceAccessApi.authorize`](../packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts) — authorizes verified service access and constructs the frontend capability.
- [`ServiceFrontendApi.ts`](../packages/system-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts) — exposes snapshots, selected-command history, and one-time ticket operations without a push method.

## command chain

A durable ordered history owner. AC retains immutable admitted aggregate inputs. VAC retains terminal execution entries per aggregate version. SelectionVAC retains minimal aggregate selected commands at independent frontend positions. ServiceAdmittedChain and VSC retain service admission and terminal execution outcomes; FSC retains minimal service selected commands.

- [`aggregateChainDbConfig.ts`](../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts) — Stores immutable aggregate inputs with their admitted position and canonical bytes.
- [`selectionVersionedAggregateChainDbConfig.ts`](../packages/system-worker/src/SelectionVersionedAggregateChain/selectionVersionedAggregateChainDbConfig.ts) — Stores each frontend output by its independent primary-key position and retains its aggregate watermark.

## selected command

A minimal frontend occurrence, distinct from the complete source command or
execution entry that produced it. `IAggregateSelectedCommand` contains only
`id`, `selectionIndex`, the consumed `aggregateIndex` watermark,
`IFrontendDelta`, privately deliverable nullable `failure`, and `selectionHash`.
`IServiceSelectedCommand` contains only `id`, `serviceIndex`, `IFrontendDelta`,
and `serviceHash`. Neither shape exposes source payloads, provenance, execution
metadata, repeated target identity, or `systemId`.
`AggregateSelectedCommandSchema` and `ServiceSelectedCommandSchema` are the
strict codecs for those two public shapes.

- [`AggregateSelectedCommandSchema.ts`](../packages/core/src/session/AggregateSelectedCommandSchema.ts) — defines `IAggregateSelectedCommand`'s strict codec and `AggregateFrontendSnapshotSchema`.
- [`ServiceSelectedCommandSchema.ts`](../packages/core/src/serviceSession/ServiceSelectedCommandSchema.ts) — defines `IServiceSelectedCommand`'s strict codec and `ServiceFrontendSnapshotSchema`.
- [`getSelectedCommands.ts`](../packages/system-worker/src/SelectionVersionedAggregateChain/getSelectedCommands/getSelectedCommands.ts) — filters the delta by the frontend lock and exposes failure only to the exact private completion owner.
- [`filterServiceSelectedCommand.ts`](../packages/core/src/serviceSession/filterServiceSelectedCommand.ts) — filters a service delta without changing its ID, position, or history hash.

## IFrontendDelta

The selected frontend mutation payload shared by aggregate and service selected
commands: `{ upserted: IEncodedResourceShape[], deleted: IRef[] }`. It is the
minimal resource projection for one selected occurrence, not a source mutation
journal or execution result.

- [`types.ts`](../packages/core/src/session/types.ts) — defines the exact `IFrontendDelta` shape.
- [`applyAggregateSelectedCommandTx.ts`](../packages/core/src/session/applyAggregateSelectedCommandTx.ts) — applies aggregate selected upserts/deletes with journal reconciliation and checkpoint advancement.
- [`applyServiceSelectedCommandTx.ts`](../packages/core/src/serviceSession/applyServiceSelectedCommandTx.ts) — applies service selected upserts/deletes with service checkpoint advancement.

## frontend snapshot

The complete server-owned selected state used for browser creation or repair.
`IAggregateFrontendSnapshot` contains aggregate/frontend identity, decoded
authentication, aggregate version, aggregate and selection checkpoints,
resources, and exact-owner reconciliation `selectedCommands` for requested
pending IDs. `IServiceFrontendSnapshot` contains service/frontend identity,
decoded authentication, service version, the service index/hash checkpoint, and
resources. Neither snapshot carries `systemId`.

- [`types.ts`](../packages/core/src/session/types.ts) — defines `IAggregateFrontendSnapshot`.
- [`types.ts`](../packages/core/src/serviceSession/types.ts) — defines `IServiceFrontendSnapshot`.
- [`AggregateSelectedCommandSchema.ts`](../packages/core/src/session/AggregateSelectedCommandSchema.ts) — defines `AggregateFrontendSnapshotSchema` from the selected-command codec and exact snapshot fields.
- [`ServiceSelectedCommandSchema.ts`](../packages/core/src/serviceSession/ServiceSelectedCommandSchema.ts) — defines `ServiceFrontendSnapshotSchema` from the service selected-command codec and exact snapshot fields.
- [`applyAggregateFrontendSnapshotTx.ts`](../packages/core/src/session/applyAggregateFrontendSnapshotTx.ts) — installs aggregate resources and reconciles exact-owner pending commands without reapplying their already-reflected deltas.
- [`applyServiceFrontendSnapshotTx.ts`](../packages/core/src/serviceSession/applyServiceFrontendSnapshotTx.ts) — replaces service resources and commits the versioned checkpoint atomically.

## selectedCommands

Context determines this collection's role. A SelectionVAR or FVSR
`selectedCommands` outbox durably stages newly derived minimal occurrences for
its selected-command chain and deletes acknowledged rows after delivery. An
`IAggregateFrontendSnapshot.selectedCommands` value is instead the bounded,
exact-owner reconciliation subset requested by `pendingCommandIds`; it is not a
copy of the outbox and its deltas are not applied after snapshot resources are
installed. A `getSelectedCommands` result is retained chain history after an
explicit frontend cursor.

- [`SelectionVersionedAggregateRepo.ts`](../packages/system-worker/src/SelectionVersionedAggregateRepo/SelectionVersionedAggregateRepo.ts) — owns aggregate selected-command outbox delivery.
- [`FrontendVersionedServiceRepo.ts`](../packages/system-worker/src/FrontendVersionedServiceRepo/FrontendVersionedServiceRepo.ts) — owns service selected-command outbox delivery.
- [`getSnapshot.ts`](../packages/system-worker/src/SelectionVersionedAggregateRepo/getSnapshot/getSnapshot.ts) — obtains only requested exact-owner reconciliation occurrences through the captured selection position.

## pendingCommandIds

The opaque IDs of restored local aggregate commands whose optimistic mutation
rows are still unresolved. The browser supplies them only to aggregate
`getSnapshot`; SelectionVAC returns matching exact-owner selected occurrences
through the snapshot's captured `selectionIndex` so the local journal can
complete or fail those commands while the snapshot itself supplies resource
state.

- [`fetchAggregateFrontendSnapshot.ts`](../packages/frontend/src/fetchAggregateFrontendSnapshot.ts) — sends pending command IDs through the authorized aggregate frontend capability.
- [`getSnapshot.ts`](../packages/system-worker/src/SelectionVersionedAggregateRepo/getSnapshot/getSnapshot.ts) — performs indexed, cursor-bounded owner reconciliation.

## aggregate and service Repos

Durable resource-state owners. VAR prepares and executes admitted commands per aggregate version. SelectionVAR replays those terminal entries into aggregate replica state and emits one minimal selected command per input position. Service Repos retain their separate role.

- [`execute.ts`](../packages/system-worker/src/SelectionVersionedAggregateRepo/execute/execute.ts) — Defines the current ownership and execution contract.

## suffix

A bounded contiguous page after a consumer cursor. Transport page boundaries do not merge command semantics or allocate batch identities. AC and VAC supply SQL-limited suffixes; SelectionVAR commits one output per command.

- [`makeFanoutQueue.ts`](../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts) — Reads complete rows after the exclusive cursor with a 64-row limit and an optional inclusive upper bound.

## selectionIndex

The contiguous position of one aggregate selected command in SelectionVAR's SelectionVAC log.
It advances for aggregate outcomes and independent pinned-service occurrences,
including commands with an empty delta. Snapshots and WebSocket resume use this
position. Service-derived entries have `failure: null` and no private completion
owner.

- [`types.ts`](../packages/core/src/session/types.ts) — defines separate selection and aggregate positions on selected commands and complete snapshots.
- [`applyAggregateSelectedCommandTx.ts`](../packages/core/src/session/applyAggregateSelectedCommandTx.ts) — requires contiguous selection progress while rejecting a decreasing aggregate watermark.
- [`bootstrapAggregateFrontendSession.ts`](../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — Sends the snapshot frontend position to resume the socket.

## selectionHash

The rolling commitment to aggregate selected frontend history. SelectionVAR
advances it for every selected occurrence using the previous hash,
`selectionIndex`, underlying command ID, and true success/failure disposition.
The browser persists and returns the index/hash checkpoint but cannot recompute
it because another origin's failure may be delivered as `null`.

- [`selectionDispositionHash.ts`](../packages/system-worker/src/selectionDispositionHash/selectionDispositionHash.ts) — defines genesis and next-hash computation for the selected history.
- [`bootstrapAggregateFrontendSession.ts`](../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — sends and persists the selection index/hash checkpoint during recovery.

## serviceHash

The rolling commitment to one versioned service's terminal disposition history.
VSR advances it from the previous hash, `serviceIndex`, command ID, and true
success/failure disposition. FVSR carries that upstream commitment unchanged on
every minimal service selected command, including failed, empty, or
frontend-filtered-empty positions. The browser persists `{ serviceIndex,
serviceHash }` and returns both on WebSocket resume. FSC compares that checkpoint
with its durable `commands` row at the supplied index; a missing or mismatched
hash requires complete snapshot replacement rather than replaying from an
untrusted position.

- [`serviceDispositionHash.ts`](../packages/system-worker/src/serviceDispositionHash/serviceDispositionHash.ts) — defines the selected service history's genesis and next-hash computation.
- [`frontendServiceChainDbConfig.ts`](../packages/system-worker/src/FrontendServiceChain/frontendServiceChainDbConfig.ts) — retains each selected occurrence and its `serviceHash` by `serviceIndex`.
- [`onMessage.ts`](../packages/system-worker/src/FrontendServiceChain/onMessage/onMessage.ts) — validates the browser index/hash checkpoint before replay.
- [`bootstrapServiceFrontendSession.ts`](../packages/frontend/src/bootstrapServiceFrontendSession.ts) — sends, applies, and persists the service index/hash checkpoint during recovery and live delivery.

## aggregateIndex

The ordered aggregate-command position. On an aggregate frontend output or
snapshot it is the latest consumed aggregate position, which can remain
unchanged across several frontend outputs. The command journal's `pushIndex`
records the aggregate admission receipt rather than frontend output progress.

- [`applyAggregateSelectedCommandTx.ts`](../packages/core/src/session/applyAggregateSelectedCommandTx.ts) — commits the selected command's aggregate watermark and selection position separately.
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

- [`AggregateAccessApi.authorize`](../packages/system-worker/src/AggregateAccessApi/authorize/authorize.ts) — decodes the aggregate frontend lock before authorization.
- [`ServiceAccessApi.authorize`](../packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts) — decodes the service frontend lock.

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

A caller-owned session from `makeSession` / `makeMockSession` after
`initialize` or `useInitializeSession` has published readiness. The session
object retains its authored frontend and Zustand store; shared runtime and
backup are borrowed, not owned. Concurrent active initialization on the same
session is rejected.

- [`makeSession.ts`](../packages/react/src/makeSession/makeSession.ts) — imperative browser composition; construction is sync and acquires no resources.
- [`useInitializeSession.ts`](../packages/react/src/useInitializeSession/useInitializeSession.ts) — effect-owned startup/disposal with Zustand-backed readiness.

## WebSocket ticket

A short-lived, single-use opaque token persisted by SystemRepo for one exact
selected-command chain and authenticated frontend target. The browser
exchanges it at the singular-command Worker WebSocket route.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — defines the aggregate and service ticket rows with exact target fields and chain name.

## command finalization

VAR commits the terminal occurrence, prepared execution entry, resource state, and disposition cursor together. It returns that committed result directly; VAC publication is durable asynchronous work, explicitly awaited by flush.

- [`executeCommandsTx.ts`](../packages/system-worker/src/VersionedAggregateRepo/executeCommands/executeCommandsTx.ts) — Commits each terminal execution entry to the results outbox together with aggregate resources and the disposition head.

## main-thread frontend replica

One page-owned synchronous in-memory SQLite database and stable session/store,
with an ownership-period recovery loop, selected-command socket, and aggregate
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
