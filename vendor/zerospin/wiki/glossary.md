---
title: Glossary
updated: 2026-09-26
---

# Glossary

## System

The authored application definition produced by `makeSystem`: identity,
aggregate and service models, contracts, queries, actors, and authored
sessions. Versions belong to the individual definitions; the System has no
root version.

- [`system.ts`](../examples/shopping/src/zerospin/system.ts) — Defines the Shopping System and its versioned aggregate and service definitions.

## domain module

A plain factory result with `models`, `contracts`, and `automations` collections. Aggregate versions and browser sessions compose optional named `modules` alongside flat declarations; service composition versions attach a complete bundle. The module has no separate runtime identity, storage owner, or version axis. Composition rejects duplicate declaration keys without renaming or overriding them. Browser sessions reject automations; service sessions also reject contracts and replicas.

- [`composeDeclarations.ts`](../packages/core/src/module/composeDeclarations.ts) — factory-owned composition rejects duplicate keys before combining module and local collections.
- [`makeAggregateVersion.ts`](../packages/core/src/aggregate/make/makeAggregateVersion.ts) — combines local declarations and modules, then derives service pins from the effective models.
- [`makeService.ts`](../packages/core/src/service/make/makeService.ts) — installs independently authored complete service compositions.

## automation

An authored `makeAutomation` declaration observes a confirmed command, reads the selected state captured by its actor, and returns either a permitted contract command or explicit `null`. Effect layers provide external dependencies. AAVR runs aggregate automations; an internal SAVR actor runs service automations without a browser session.

- [`makeAutomation.ts`](../packages/core/src/automation/makeAutomation.ts) — validates trigger and permitted output declarations.
- [`makeActorAutomations.ts`](../packages/system-worker/src/AggregateActorVersionRepo/automations/makeActorAutomations.ts) — executes aggregate actor invocations and stages saved output.
- [`makeServiceAutomations.ts`](../packages/system-worker/src/ServiceActorVersionRepo/automations/makeServiceAutomations.ts) — executes service invocations and stages saved output.

## automation run and group

One run records an automation's pending, started, succeeded, failed, interrupted, or empty invocation outcome and references a saved output command when one exists. A group belongs to one confirmed occurrence. Its gate completes after sibling outcomes and output staging are durable; later admission and authoritative execution continue separately. Restart never invokes an already started run without a saved result again.

- [`aggregateActorVersionRepoDbConfig.ts`](../packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.ts) — stores aggregate groups, runs, and saved-command references.
- [`serviceActorVersionRepoDbConfig.ts`](../packages/system-worker/src/ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.ts) — stores the corresponding service state.

## declaration version and composition version

A model, contract, or actor declaration has its own schema/behavior version. A complete service composition has a separate version key in `makeService(...).versions`. Factory names such as `makeFulfillmentServiceModuleV1` identify a construction recipe and do not imply the composition's version. A replica pins one concrete source service composition and the exact source model declaration.

- [`makeService.ts`](../packages/core/src/service/make/makeService.ts) — produces literal-keyed service versions.
- [`makeReplica.ts`](../packages/core/src/models/make/makeReplica.ts) — pins source service and model versions.

## systemId

The `sys_`-prefixed deployment identifier supplied through
`makeSystemConfig(system, { systemId })` and embedded in generated Worker configuration. It
keys the singleton SystemRepo and is the first identity field for every direct
Repo. It remains in backend capabilities, tickets, routing, and Repo identities,
but is intentionally absent from `IAggregateSessionSnapshot`,
`IServiceSessionSnapshot`, aggregate/service browser session state, and durable browser node and standalone backup identities. Those session values are scoped by their
API origin or local backup namespace rather than carrying the deployment ID as
application state.

- [`makeWranglerConfig.ts`](../packages/dev-worker/src/makeWranglerConfig.ts) — embeds the configured system ID as the Worker binding.
- [`SystemRepo.ts`](../packages/system-worker/src/SystemRepo/SystemRepo.ts) — addresses the singleton SystemRepo by the decoded configured system id.
- [`AggregateChain.ts`](../packages/system-worker/src/AggregateChain/AggregateChain.ts) — includes `systemId` in aggregate-chain instance identity and configures one fixed schema.
- [`types.ts`](../packages/core/src/aggregateSession/types.ts), [`types.ts`](../packages/core/src/serviceSession/types.ts) — define aggregate and service session snapshots and session state without `systemId`.
- [`nodeKey.ts`](../packages/browser/src/Node/nodeKey.ts) — hashes backend/system, encoded authentication, target, and the complete definition lock. Standalone sessions retain a separate backup key.

## Repo

A direct Durable Object class that owns one keyed database, durable boundary,
and its deferred work. The static runtime has SystemRepo, five command chains,
four domain Repos, and SystemLogRepo.

- [`types.ts`](../packages/core/src/system/types.ts) — enumerates the eleven registered Repo kinds.
- [`DevWorker.ts`](../packages/dev-worker/src/DevWorker.ts) — exports the direct Repo classes from the framework Worker.

## SystemRepo

The singleton Repo keyed by `{ systemId }`. It owns Repo inspection, and single-use session WebSocket tickets; it also routes
WebSocket traffic to actor-command chains and SystemLogRepo.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — Defines session tickets and Repo registrations.
- [`SystemRepo.ts`](../packages/system-worker/src/SystemRepo/SystemRepo.ts) — Exposes one-time tickets and Repo inspection.
- [`fetch.ts`](../packages/system-worker/src/SystemRepo/fetch/fetch.ts) — routes system logs and both singular actor-command sockets.

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

## AggregateSessionApi

The authenticated aggregate session capability binds `{ systemId, aggregateId,
aggregateName, aggregateVersion, identity, actorPath, sessionName,
aggregateSessionLock }`. Worker configuration supplies `systemId`; gateway
selection supplies the aggregate name/version; identity supplies
`aggregateId`, encoded identity, and the canonical derived
`actorPath`; authorization supplies `sessionName` and the lock. Tickets retain those fields
for the ActorVAC socket, which admits commands only after history validation
and returns AC receipts on that same socket. `getSnapshot({ pendingCommandIds })` supplies a
version-pinned `IAggregateSessionSnapshot`; `getActorCommands({
afterSelectionIndex, aggregateVersion })` supplies retained
`IAggregateActorCommand` history and its tip without resubmitting bound owner
fields.

- [`onMessage.ts`](../packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts) — Defines the current ownership and execution contract.

## ServiceSessionApi

The independently disposable read-only child capability binds `{ systemId,
serviceName, serviceVersion, identity, actorPath, sessionName,
serviceSessionLock }`. Worker configuration supplies `systemId`; gateway
selection supplies service name/version; identity supplies encoded
identity and the canonical derived `actorPath`; authorization supplies
`sessionName` and the lock. It serves `IServiceSessionSnapshot`, filtered
`IServiceActorCommand` history through `getActorCommands({
afterServiceIndex, serviceVersion })`, and WebSocket tickets without a push
method.

- [`ServiceAccessApi.authorize`](../packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts) — authorizes verified service access and constructs the session capability.
- [`ServiceSessionApi.ts`](../packages/system-worker/src/ServiceSessionApi/ServiceSessionApi.ts) — exposes snapshots, actor-command history, and one-time ticket operations without a push method.

## command chain

A durable ordered history owner. AC retains admitted aggregate inputs. VAC retains terminal execution entries per aggregate version. ActorVAC retains complete confirmed command rows at independent actor positions. ServiceChain and VSC retain service admission and terminal execution outcomes; the service actor chain retains complete confirmed service command rows. Actor-chain delivery projects the selected browser representation.

- [`aggregateChainDbConfig.ts`](../packages/system-worker/src/AggregateChain/aggregateChainDbConfig.ts) — Stores immutable aggregate inputs with their admitted position and canonical bytes.
- [`aggregateActorVersionChainDbConfig.ts`](../packages/system-worker/src/AggregateActorVersionChain/aggregateActorVersionChainDbConfig.ts) — Stores each session output by its independent primary-key position and retains its aggregate watermark.

## actor command

A public selected occurrence projected from a complete retained source command. The public `IAggregateActorCommand` contains only
`id`, `executedIndex`, the consumed `aggregateIndex` watermark, `actorDelta`
(`IActorDelta`), privately deliverable nullable `failure`, and `executedHash`.
`IServiceActorCommand` contains only `id`, `serviceIndex`, `actorDelta`
(`IActorDelta`), and `serviceHash`. Actor version repos and chains retain the
unfiltered selection diff as `actorDelta` alongside original command input.
Delivery filters it through the session lock, and the session stores the filtered copy as `actorDelta`.
Neither public shape exposes source payloads, provenance, full execution metadata,
repeated target identity, or `systemId`. `AggregateActorCommandSchema` and
`ServiceActorCommandSchema` are the strict codecs for those two public shapes.

- [`AggregateActorCommandSchema.ts`](../packages/core/src/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts) — defines `IAggregateActorCommand`'s strict codec and `AggregateSessionSnapshotSchema`.
- [`ServiceActorCommandSchema.ts`](../packages/core/src/serviceSession/ServiceActorCommandSchema.ts) — defines `IServiceActorCommand`'s strict codec and `ServiceSessionSnapshotSchema`.
- [`getActorCommands.ts`](../packages/system-worker/src/AggregateActorVersionChain/getActorCommands/getActorCommands.ts) — filters the delta by the session lock and exposes failure only to the exact private completion owner.
- [`filterServiceActorCommand.ts`](../packages/core/src/serviceSession/filterServiceActorCommand.ts) — filters a service delta without changing its ID, position, or history hash.

## IActorDelta

`{ upserted, deleted }` for one actor-selection occurrence. Stored `actorDelta`
is the unfiltered selection diff. Session `actorDelta` is that same shape
after session-lock filtering. Local session outcomes stay on `stagedDelta`
(`{ inserted, updated, deleted, mutations }`). Execution results stay on
`executionDelta` (`{ inserted, updated, deleted }` with full deleted resources).

- [`types.ts`](../packages/core/src/aggregateSession/types.ts) — defines the exact `IActorDelta` shape.
- [`applyAggregateActorCommandTx.ts`](../packages/core/src/aggregateSession/applyAggregateActorCommand/applyAggregateActorCommandTx/applyAggregateActorCommandTx.ts) — applies aggregate selected upserts/deletes with journal reconciliation and checkpoint advancement.
- [`applyServiceActorCommandTx.ts`](../packages/core/src/serviceSession/applyServiceActorCommand/applyServiceActorCommandTx/applyServiceActorCommandTx.ts) — applies service selected upserts/deletes with service checkpoint advancement.

## session snapshot

The complete server-owned selected state used for browser creation or repair.
`IAggregateSessionSnapshot` contains aggregate/session identity, decoded
identity, aggregate version, aggregate and selection checkpoints,
resources, and exact-owner reconciliation `actorCommands` for requested
pending IDs. `IServiceSessionSnapshot` contains service/session identity,
decoded identity, service version, the service index/hash checkpoint, and
resources. Neither snapshot carries `systemId`.

- [`types.ts`](../packages/core/src/aggregateSession/types.ts) — defines `IAggregateSessionSnapshot`.
- [`types.ts`](../packages/core/src/serviceSession/types.ts) — defines `IServiceSessionSnapshot`.
- [`AggregateActorCommandSchema.ts`](../packages/core/src/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts) — defines `AggregateSessionSnapshotSchema` from the actor-command codec and exact snapshot fields.
- [`ServiceActorCommandSchema.ts`](../packages/core/src/serviceSession/ServiceActorCommandSchema.ts) — defines `ServiceSessionSnapshotSchema` from the service actor-command codec and exact snapshot fields.
- [`applyAggregateSessionSnapshotTx.ts`](../packages/core/src/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshotTx/applyAggregateSessionSnapshotTx.ts) — installs aggregate resources and reconciles exact-owner pending commands without reapplying their already-reflected deltas.
- [`applyServiceSessionSnapshotTx.ts`](../packages/core/src/serviceSession/applyServiceSessionSnapshot/applyServiceSessionSnapshotTx/applyServiceSessionSnapshotTx.ts) — replaces service resources and commits the versioned checkpoint atomically.

## actorCommands

This name is used for selected-delivery collections, not physical tables.
A ActorVAR or FVSR `commands` outbox durably stages newly derived minimal occurrences for
its actor-command chain and deletes acknowledged rows after delivery. An
`IAggregateSessionSnapshot.actorCommands` value is instead the bounded,
exact-owner reconciliation subset requested by `pendingCommandIds`; it is not a
copy of the outbox and its deltas are not applied after snapshot resources are
installed. A `getActorCommands` result is retained chain history after an
explicit session cursor.

- [`AggregateActorVersionRepo.ts`](../packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts) — owns aggregate actor-command outbox delivery.
- [`ServiceActorVersionRepo.ts`](../packages/system-worker/src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts) — owns service actor-command outbox delivery.
- [`getSnapshot.ts`](../packages/system-worker/src/AggregateActorVersionRepo/getSnapshot/getSnapshot.ts) — obtains only requested exact-owner reconciliation occurrences through the captured selection position.

## pendingCommandIds

The opaque IDs of restored local aggregate commands whose optimistic mutation
rows are still unresolved. The browser supplies them only to aggregate
`getSnapshot`; ActorVAC returns matching exact-owner selected occurrences
through the snapshot's captured `executedIndex` so the local journal can
complete or fail those commands while the snapshot itself supplies resource
state.

- [`fetchAggregateSessionSnapshot.ts`](../packages/browser/src/fetchAggregateSessionSnapshot.ts) — sends pending command IDs through the authorized aggregate session capability.
- [`getSnapshot.ts`](../packages/system-worker/src/AggregateActorVersionRepo/getSnapshot/getSnapshot.ts) — performs indexed, cursor-bounded owner reconciliation.

## aggregate and service Repos

Durable resource-state owners. VAR prepares and executes admitted commands per aggregate version. ActorVAR replays those terminal entries into aggregate replica state and emits one minimal actor command per input position. Service Repos retain their separate role.

- [`applyExecutedCommands.ts`](../packages/system-worker/src/AggregateActorVersionRepo/applyExecutedCommands/applyExecutedCommands.ts) — Defines the current ownership and execution contract.

## suffix

A bounded contiguous page after a consumer cursor. Transport page boundaries do not merge command semantics or allocate batch identities. AC and VAC supply SQL-limited suffixes; ActorVAR commits one output per command.

- [`makeFanoutQueue.ts`](../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts) — Reads complete rows after the exclusive cursor with a 64-row limit and an optional inclusive upper bound.

## executedIndex

The single contiguous position shared by AVR/AVC executed source rows and
the actor output derived from each row. AVR's `head.executedIndex` allocates it
across `aggregateCommands` and `serviceCommands`. It advances for both kinds,
including commands with an empty delta. Snapshots and WebSocket resume use this
position. Service-derived entries have `failure: null` and no private completion
owner.

- [`types.ts`](../packages/core/src/aggregateSession/types.ts) — defines the executed position and aggregate watermark on actor commands and complete snapshots.
- [`applyAggregateActorCommandTx.ts`](../packages/core/src/aggregateSession/applyAggregateActorCommand/applyAggregateActorCommandTx/applyAggregateActorCommandTx.ts) — requires contiguous executed progress while rejecting a decreasing aggregate watermark.
- [`bootstrapAggregateSession.ts`](../packages/browser/src/bootstrapAggregateSession.ts) — Sends the snapshot session position to resume the socket.

## executedHash

The rolling commitment to aggregate selected session history. ActorVAR
advances it for every selected occurrence using the previous hash,
`executedIndex`, underlying command ID, and true success/failure disposition.
The browser persists and returns the index/hash checkpoint but cannot recompute
it because another origin's failure may be delivered as `null`.

- [`executedDispositionHash.ts`](../packages/system-worker/src/executedDispositionHash/executedDispositionHash.ts) — defines genesis and next-hash computation for the selected history.
- [`bootstrapAggregateSession.ts`](../packages/browser/src/bootstrapAggregateSession.ts) — sends and persists the executed index/hash checkpoint during recovery.

## serviceHash

The rolling commitment to one versioned service's terminal disposition history.
VSR advances it from the previous hash, `serviceIndex`, command ID, and true
success/failure disposition. FVSR carries that upstream commitment unchanged on
every minimal service actor command, including failed, empty, or
session-filtered-empty positions. The browser persists `{ serviceIndex,
serviceHash }` and returns both on WebSocket resume. FSC compares that checkpoint
with its durable `commands` row at the supplied index; a missing or mismatched
hash requires complete snapshot replacement rather than replaying from an
untrusted position.

- [`serviceDispositionHash.ts`](../packages/system-worker/src/serviceDispositionHash/serviceDispositionHash.ts) — defines the selected service history's genesis and next-hash computation.
- [`serviceActorVersionChainDbConfig.ts`](../packages/system-worker/src/ServiceActorVersionChain/serviceActorVersionChainDbConfig.ts) — retains each selected occurrence and its `serviceHash` by `serviceIndex`.
- [`onMessage.ts`](../packages/system-worker/src/ServiceActorVersionChain/onMessage/onMessage.ts) — validates the browser index/hash checkpoint before replay.
- [`bootstrapServiceSession.ts`](../packages/browser/src/bootstrapServiceSession.ts) — sends, applies, and persists the service index/hash checkpoint during recovery and live delivery.

## aggregateIndex

The ordered aggregate-command position. On an aggregate session output or
snapshot it is the latest consumed aggregate position, which can remain
unchanged across several session outputs. The command journal's `pushIndex`
records the aggregate admission receipt rather than session output progress.

- [`applyAggregateActorCommandTx.ts`](../packages/core/src/aggregateSession/applyAggregateActorCommand/applyAggregateActorCommandTx/applyAggregateActorCommandTx.ts) — commits the actor command's aggregate watermark and executed position.
- [`bootstrapAggregateSession.ts`](../packages/browser/src/bootstrapAggregateSession.ts) — Checks the receipt's command ID and writes its admitted aggregate position to that journal occurrence.

## disposition

The success or failure of an aggregate occurrence. VAR folds ordered command positions, IDs, and dispositions into a rolling SHA-256 hash. The comparison deliberately excludes resulting state and mutation bytes.

- [`aggregateDispositionHash.ts`](../packages/system-worker/src/aggregateDispositionHash/aggregateDispositionHash.ts) — Defines the current ownership and execution contract.

## cutover

AC adopts its bundled configured base as durable desired intent during activation. Its alarm compares that intent with the applied base, requiring forward numeric version order; nonempty chains sample the admitted index and await base and desired VAR flushes in parallel. Matching command IDs and disposition hashes at that checkpoint allow a compare-and-set of the base version. Promotion atomically clears `cutoverFailure`; divergence persists candidate invalidation and that diagnostic. Infrastructure failures retain alarm recovery. Direct retries use only the applied base.

- [`cutover.ts`](../packages/system-worker/src/AggregateChain/cutover/cutover.ts) — Defines the current ownership and execution contract.

## session lock

An authored, signed description of the exact session schema and query surface.
Gateway validates the lock and requires authorization to return the same exact
target before constructing a session capability.

- [`AggregateAccessApi.authorize`](../packages/system-worker/src/AggregateAccessApi/authorize/authorize.ts) — decodes the aggregate session lock before authorization.
- [`ServiceAccessApi.authorize`](../packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts) — decodes the service session lock.

## contract binding

The `{ contract }` registry value used by session and service command maps. Aggregate actor versions select callable contract versions from the aggregate module's canonical declarations.

- [`types.ts`](../packages/core/src/contracts/types.ts) — defines bindings and contract interfaces.
- [`makeAggregateActorVersion.ts`](../packages/core/src/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts) — validates direct actor ownership and selected models.

## actor selection

A complete-row Drizzle `findMany()` query owned by an actor version. Its captured SQL and serializable bindings are locked with the actor's model bindings. Named inputs come only from the identity fields derived from the actor path; command-only claims are excluded. Registering a model does not select its rows.

- [`makeActorDbVersion.ts`](../packages/core/src/models/make/makeActorDbVersion.ts) — builds queries without storage and captures execution on the current transaction.
- [`makeActorIdentity.ts`](../packages/core/src/identity/make/makeActorIdentity/makeActorIdentity.ts) — derives identity codecs and typed placeholder names from the identity schema and path.

## guard

A synchronous contract callback run during local staging, pending replay, and authoritative execution before mutations. A named guard version declares payload and business-failure codecs and exposes a typed Effect service; layers provide its implementation. Aggregate layers override matching actor defaults on the server. Browser sessions use local implementations. Authoritative guards run inside the mutation transaction, with current database and identity services. Admission does not run guards or retain separate guard verdicts.

- [`makeGuardVersion.ts`](../packages/core/src/guards/makeGuardVersion.ts) — defines version-specific services and validates payloads and failures.
- [`makeMutations.ts`](../packages/core/src/contracts/make/makeMutations.ts) — prepares the shared guard and validates contract identity once.
- [`executeCommandsTx.ts`](../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts) — retains failures with normal command history and leaves rejected mutations unapplied.

## provisioner

An aggregate actor that owns provisioning contracts such as user creation. Provisioner and operator currently use the explicit credential verification and actor identity API; autonomous actor APIs and identity rules are deferred.

- [`provisionerV1.ts`](../examples/shopping/src/zerospin/aggregates/shopper/actors/provisionerV1.ts) — selects the intended user by Clerk identity and owns user creation.

## invocation arguments

Guards receive the invocation database as `queryDb`. Programs receive decoded identity as an argument. Aggregate commands require claims. Service commands pass `null`. Ordinary layers supply capabilities. There is no execution tag map.

Programs and all their dependencies must finish synchronously. They observe existing local state before any returned mutation or new replica enrollment. Suspension is interrupted and recorded as an execution failure. Materializers commit each command before running the next program.

- [`runProgram.ts`](../packages/core/src/execution/runProgram.ts) — enforces synchronous completion and preserves domain failures.

## mounted session

A caller-owned session from `makeSession` / `makeMockAggregateSession` / `makeMockServiceSession` after
`initialize` or `useInitializeSession` has published readiness. The session
object retains its authored session and Zustand store; shared runtime and
backup are borrowed, not owned. Concurrent active initialization on the same
session is rejected.

- [`makeSession.ts`](../packages/browser/src/makeSession/makeSession.ts) — imperative browser composition; construction is sync and acquires no resources.
- [`useInitializeSession.ts`](../packages/react/src/useInitializeSession/useInitializeSession.ts) — effect-owned startup/disposal with Zustand-backed readiness.

## WebSocket ticket

A short-lived, single-use opaque token persisted by SystemRepo for one exact
actor-command chain and authenticated session target. The browser
exchanges it at the singular-command Worker WebSocket route.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — defines the aggregate and service ticket rows with exact target fields and chain name.

## command finalization

VAR commits the terminal occurrence, prepared execution entry, resource state, and disposition cursor together. It returns that committed result directly; VAC publication is durable asynchronous work, explicitly awaited by flush.

- [`executeCommandsTx.ts`](../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts) — Commits each terminal execution entry to the results outbox together with aggregate resources and the disposition head.

## main-thread session replica

One tab-owned synchronous SQLite view and stable session/store. Synchronized
sessions replay unresolved node commands followed by uncertain local submissions.
A node snapshot rebuilds confirmed resources and optimism without copying completed
history into the tab.

- [`bootstrapAggregateSession.ts`](../packages/browser/src/bootstrapAggregateSession.ts)
- [`bootstrapServiceSession.ts`](../packages/browser/src/bootstrapServiceSession.ts)

## durable browser node

A SharedWorker-owned persistent SQLite database for one authenticated target and
full definition. Its prefixed `nodeId`, generated once with `makeIdFromAbbreviation`, survives restart; `nodeIndex` is allocated
atomically with command retention. It owns confirmed resources, flat command
history, authentication coordination, shared push state, and server synchronization.

- [`Node.ts`](../packages/browser/src/Node/Node.ts)
- [`makeSharedWorker.ts`](../packages/browser/src/makeSharedWorker.ts)

## IndexedDB backup worker

The standalone session storage path. It owns asynchronous backup SQLite through
`IDBBatchAtomicVFS`, grants revocable capabilities, and persists snapshots and SQL
batches. Synchronized sessions use durable nodes.

- [`backupWorker.entry.ts`](../packages/backup-worker/src/backupWorker.entry.ts)
- [`makeStandaloneSession.ts`](../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts)
