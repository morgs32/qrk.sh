---
title: Glossary
updated: 2026-10-02
---

# Glossary

## System

- [`system.ts`](../examples/shopping/src/zerospin/system.ts) — Defines the Shopping System and its versioned aggregate and service definitions.

## domain module

- [`composeDeclarations.ts`](../packages/core/src/module/composeDeclarations.ts) — factory-owned composition rejects duplicate keys before combining module and local collections.
- [`makeAggregateVersion.ts`](../packages/core/src/aggregate/make/makeAggregateVersion.ts) — combines local declarations and modules, validates the effective owned-model inventory.
- [`makeServiceVersion.ts`](../packages/core/src/service/make/makeServiceVersion.ts) — installs independently authored complete service compositions.

## service

A versioned owner created with `defineService` and `makeServiceVersion`. It owns its models, contracts, queries, and actors. Commands operate on exact owned models. Its retained terminal history supplies actor projections and service sessions.

## receiving obligation pin

The retained receiving service composition for one logical source owner, obligation type, and request ID. Producer version is provenance and is excluded from identity. A service's ordinary request declaration identifies its intake contract, identity field, and actor. Payment intake and processing share this scope; the source actor's service authentication declares their initial receiving version. Fulfillment takes its initial destination from the verified checkout invocation, including in manual compositions. ServiceChain retains the original binding after completion. Intake command admission and execution ownership checks prevent another receiving version from independently accepting or processing the same request.

The pin also retains the first admitted request command ID. An authenticated repeat with identical immutable facts recovers that command's original receiving version and result; changed facts conflict. A new producer version does not rewrite the retained invocation or create another obligation.

- [`admitServiceCommand.ts`](../packages/system-worker/src/ServiceChain/admitServiceCommand/admitServiceCommand.ts) — atomic first intake and original-command resolution.

## service-owned payment attempt

An ordinary immutable request accepted by the payment service from a source payment intent. It retains the accepted quote, original cart-item IDs, stable provider key, provider evidence revision, and acknowledged reporting revision. Uncertainty requires reconciliation of that same request; it does not permit replacement collection. Confirmed decline allows an explicitly new source intent. Known success can be reported again without calling the provider.

## declaration version and composition version

A model, contract, or actor declaration has its own schema/behavior version. A complete service composition has its own exact version in `makeServiceVersion`. Factory names such as `makeFulfillmentServiceModuleV1` identify a construction recipe and do not imply the composition's version.

- [`makeServiceVersion.ts`](../packages/core/src/service/make/makeServiceVersion.ts) — produces literal-keyed service versions.

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
- [`nodeKey.ts`](../packages/core/src/Node/nodeKey.ts) — hashes backend/system, encoded authentication, target, and the complete definition lock. Standalone sessions retain a separate backup key.

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
and returns AC admission acknowledgements on that same socket. `getSnapshot({ nodeId })` supplies a version-pinned
`IAggregateSessionSnapshot` and node reconciliation watermark; `getActorOutputs`
supplies retained browser command occurrences without resubmitting bound owner fields.

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

## aggregate registry and service registry

## command chain

A durable ordered history owner. AC retains admitted aggregate commands; SC retains admitted service commands. AVC and SVC retain full original command fields and ordered operation bodies at each receiving position. Actor repos retain command history separately from the selected outputs delivered by actor chains.

- [`readOwnerResultsPage.ts`](../packages/system-worker/src/readOwnerResultsPage/readOwnerResultsPage.ts) — pages retained owned command occurrences by execution position.
- [`readServiceResultsPage.ts`](../packages/system-worker/src/ServiceVersionChain/readServiceResultsPage.ts) — pages the service's complete receiving order.

## browser command

A browser-delivered `IBrowserCommand` containing only `id`, `commandName`, selected `delta`, and nullable terminal `failure`. Its delivery envelope holds occurrence position, owner progress, and checkpoint hash. The browser resolves a matching unresolved submitted command by ID; another occurrence preserves the first recorded outcome. Failure is exposed only to the submitting node/session/claims.

- [`BrowserCommandSchema.ts`](../packages/core/src/contracts/BrowserCommandSchema.ts) — defines the shared browser contract.
- [`Node.ts`](../packages/core/src/Node/Node.ts) — correlates IDs and commits resources, outcomes, and checkpoints together.

## IActorDelta

`{ upserted, deleted }` for one actor-selection occurrence. Actor repos compute the selection diff. Browser delivery exposes it as `IBrowserCommand.delta` after applying the authenticated session model lock. Local optimistic results retain `stagedDelta`. Authoritative server histories retain ordered owned operation bodies and terminal results.

## session snapshot

The selected resources and checkpoint captured together by an actor repo. Aggregate snapshots contain aggregate/actor/session identity, `aggregateIndex`, `executedIndex`, `executedHash`, resources, and `resolvedThrough` for the requesting node's contiguous terminal command prefix. Service snapshots contain service/actor/session identity, resources, `executedIndex`, and `serviceHash`. Neither includes `systemId` or an embedded command history.

- [`types.ts`](../packages/core/src/aggregateSession/types.ts) — defines `IAggregateSessionSnapshot`.
- [`types.ts`](../packages/core/src/serviceSession/types.ts) — defines `IServiceSessionSnapshot`.
- [`getSnapshot.ts`](../packages/system-worker/src/AggregateActorVersionRepo/getSnapshot/getSnapshot.ts) — captures resources/checkpoint, publishes through it, then reads the private outcome prefix from retained actor-chain history.
- [`applyServiceSessionSnapshotTx.ts`](../packages/core/src/serviceSession/applyServiceSessionSnapshot/applyServiceSessionSnapshotTx/applyServiceSessionSnapshotTx.ts) — atomically installs service resources and their checkpoint.

## actorCommands

An aggregate actor’s `commands` and `stagedCommands` retain command lifecycle and unresolved optimistic work. Both actor repos deliver flat browser commands through `browserCommandOutbox`; actor chains retain acknowledged occurrences in `browserCommands`. `getActorOutputs` reads that receiving history. Snapshots return resources and checkpoints without embedding command history.

- [`AggregateActorVersionRepo.ts`](../packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts) — owns staged commands and selected-output publication.
- [`ServiceActorVersionRepo.ts`](../packages/system-worker/src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts) — publishes service actor outputs in local execution order.

## actor staging

Durable preparation of a caller command against an aggregate actor's derived optimistic state. Successful staging retains its original input, prepared model operations, and ordered submission work together. Confirmed resource rows remain authoritative. Admission delivery can finish while the staging journal remains unresolved; terminal projection or a recognized admission refusal resolves its optimistic contribution. Reconstructing optimism applies retained operations with their captured IDs and timestamps.

- [`stageActorCommands.ts`](../packages/system-worker/src/AggregateActorVersionRepo/optimistic/stageActorCommands.ts) — prepares original contract output and commits accepted staging with its submission work.
- [`makeOptimisticActorDb.ts`](../packages/system-worker/src/AggregateActorVersionRepo/optimistic/makeOptimisticActorDb.ts) — rebuilds the actor's derived view from confirmed resources and unresolved operations.

## resolvedThrough

Aggregate snapshot reconciliation uses a node identity and contiguous `resolvedThrough` watermark. The browser journal reconciles its own commands through that watermark; projection and node-outcome cursors remain independent during replay.

- [`fetchAggregateSessionSnapshot.ts`](../packages/browser/src/fetchAggregateSessionSnapshot.ts) — requests a snapshot with `nodeId`.
- [`getSnapshot.ts`](../packages/system-worker/src/AggregateActorVersionRepo/getSnapshot/getSnapshot.ts) — derives the requesting node’s contiguous resolved prefix from retained actor-chain history at the captured snapshot checkpoint.

## aggregate and service Repos

Durable resource-state owners. VAR prepares and executes admitted commands per aggregate version. ActorVAR replays locally retained command operations into the aggregate actor projection and emits one selected output per local execution position. Service Repos retain their separate role.

- [`applyExecutedCommands.ts`](../packages/system-worker/src/AggregateActorVersionRepo/applyExecutedCommands/applyExecutedCommands.ts) — Defines the current ownership and execution contract.

## suffix

A bounded contiguous page after a consumer cursor. Transport page boundaries do not merge command semantics or allocate batch identities. AC and VAC supply SQL-limited suffixes; ActorVAR commits one selected output per retained owner result.

- [`makeFanoutQueue.ts`](../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts) — Reads complete rows after the exclusive cursor with a 64-row limit and an optional inclusive upper bound.

## executedIndex

A contiguous terminal command position within one version history. Failed commands and empty selections still advance it. Actor projections and session synchronization retain this order separately from browser node command positions.

## executedHash

The rolling commitment to aggregate selected history. Each receiving position extends it with the original command ID and the local disposition. Imported application uses the original identity rather than a manufactured receiving command ID. The index/hash advances even when the selected delta is empty. Private terminal failures remain server-filtered.

- [`applyExecutedCommandsTx.ts`](../packages/system-worker/src/AggregateActorVersionRepo/applyExecutedCommands/applyExecutedCommandsTx.ts) — extends history using original command identity.

## serviceHash

The commitment to a service's terminal command dispositions. It advances from the previous hash, admitted `serviceIndex`, command ID, and disposition. Service actor outputs and snapshots carry `{ executedIndex, serviceHash }`.

## chain input order

AC orders admitted aggregate commands. Original terminal results attach to existing command positions; replaying versions wait for that result before executing their own program against their own owned state.

## aggregateIndex

The ordered shared aggregate input position, containing admitted commands. On an aggregate session output or
snapshot it is the latest consumed shared input position. The command journal's `pushIndex`
records the aggregate admission receipt rather than session output progress.

- [`Node.ts`](../packages/core/src/Node/Node.ts) — commits the actor command's aggregate watermark and executed position.
- [`NodeSynchronization.ts`](../packages/browser/src/Node/NodeSynchronization.ts) — validates the admission acknowledgement against the pending command and saves its original admission position in Node.

## disposition

The success or failure of an aggregate occurrence. VAR folds ordered command positions, IDs, and dispositions into a rolling SHA-256 hash. The comparison deliberately excludes resulting state and mutation bytes.

- [`aggregateDispositionHash.ts`](../packages/system-worker/src/aggregateDispositionHash/aggregateDispositionHash.ts) — Defines the current ownership and execution contract.

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

- [`makeOperations.ts`](../packages/core/src/contracts/make/makeOperations.ts) — prepares the shared guard and validates contract identity once.
- [`executeCommandsTx.ts`](../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts) — retains failures with normal command history and leaves rejected mutations unapplied.

## marketplace

Shopping's service that owns the product catalog and each verified shopper's cart and cart items. Catalog actors read all products; shopper actors read only their cart, its items, and referenced products.

- [`marketplaceServiceV1.ts`](../examples/shopping/src/zerospin/services/marketplace/marketplaceServiceV1.ts) — owns the catalog and carts.

## per-user purchase aggregate

Shopping's `user` aggregate, one per verified Clerk subject. Purchases belong to that aggregate; purchase items reference their local purchase and retain an external product ID and a name/price snapshot. Purchase creation and checkout remain deferred.

- [`userAggregateV1.ts`](../examples/shopping/src/zerospin/aggregates/user/userAggregateV1.ts) — declares purchases and purchase items.
- [`userActorV1.ts`](../examples/shopping/src/zerospin/aggregates/user/actors/userActorV1.ts) — authorizes the aggregate identity derived from the verified subject.

## invocation arguments

Guards and contract programs receive the invocation database as `db`, exposing only synchronous queries typed from their declared models. Programs also receive decoded identity, emit operations through their model methods, and return a value matching their optional result codec; they cannot write through this interface. Aggregate commands require claims. Authenticated service commands receive verified caller claims; direct service commands can pass `null`. Ordinary layers supply capabilities. There is no execution tag map.

Programs and all their dependencies must finish synchronously. They observe existing local state before any emitted operation. Suspension is interrupted and recorded as an execution failure. Materializers commit each command before running the next program. Client staging and pending replay calculate against local state; authoritative execution recalculates against its own materialization, so results can differ.

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

## main-thread session database

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

- [`Node.ts`](../packages/core/src/Node/Node.ts)
- [`makeSharedWorker.ts`](../packages/browser/src/makeSharedWorker.ts)

## IndexedDB backup worker

The standalone session storage path. It owns asynchronous backup SQLite through
`IDBBatchAtomicVFS`, grants revocable capabilities, and persists snapshots and SQL
batches. Synchronized sessions use durable nodes.

- [`backupWorker.entry.ts`](../packages/backup-worker/src/backupWorker.entry.ts)
- [`makeStandaloneSession.ts`](../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts)

## contract result

The value returned by one successful contract program, independently of its emitted operations. Its authored version declares an optional result codec; omission means no value, encoded as null. Original local staging retains its result through replay. A server mapping validates the original result before running its mapper and declares a separate, required authoritative result codec. Browser staging and definition locks use the original declaration. Authoritative success retains its own result and executing contract version, atomically with owned output application.

## Agent

A named System declaration binding one exact aggregate version and a dedicated
system-only aggregate actor version to a serializable query of complete
projected model rows. The current Studio preview observes that view without
executing instructions or submitting commands.

- [`makeAgent.ts`](../packages/core/src/agent/makeAgent.ts) — declares the binding and model-row query.
- [`makeSystem.ts`](../packages/core/src/system/make/makeSystem/makeSystem.ts) — validates registered aggregate/actor versions and the projected query model.

## Agent session

One agent's read-only view of one aggregate ID for the lifetime of an open
Studio view. Closing or switching the view releases the session; reopening
begins with a fresh snapshot. Its displayed connection state distinguishes
current stream delivery from retained rows during recovery.

- [`makeAgentSession.ts`](../packages/browser/src/makeAgentSession.ts) — owns transient snapshot/stream observation and disposal.
- [`AgentPreview.tsx`](../packages/studio/src/AgentPreview.tsx) — displays live model rows and connection state.

## executed aggregate command / executed service command

A terminal server command classified by its original owner. It retains the original input, provenance, admission position, and success, rejection, or execution failure. Forwarding preserves that owner; version execution positions and actor/session projections remain separate local facts.

## staged aggregate command

An aggregate command prepared against the actor’s optimistic view, with its staging time and ordered optimistic operations. Admission delivery can complete while the command remains unresolved in the actor journal.

## mapped contract

A server declaration made with `mapContractVersion`. It retains an ordinary contract's identity, payload adaptations, guards, and business failures, then appends synchronous mapper emissions after its base output. The mapper sees immutable base output and pre-application state through its declared model scope. Its required result codec owns authoritative output; owner/actor versions pin mapped behavior. Capability references never register contracts implicitly.

- [`mapContractVersion.ts`](../packages/core/src/contracts/make/mapContractVersion.ts) — declares model and async emission capabilities.

## async operation

An explicit emission containing an exact async contract name/version and encoded payload. Its identity is `(commandId, operationIndex)` in the retained owner/version history. Combined `modelOperations` and `asyncOperations` reconstruct complete output in original index order. Only original execution initializes producer lifecycle beside the emission; replay and received history retain immutable output with no production authority. Actor projections skip async entries while preserving model indexes.

- [`asyncOperationsDbConfig.ts`](../packages/system-worker/src/asyncOperations/asyncOperationsDbConfig.ts) — immutable emission and producer-owned lifecycle fields.

## async command

A private backend continuation with its async contract's own payload and immutable external observation. The producing VersionRepo reconstructs it from retained async data and its owner key, without the initiating command row. Admission assigns its ordinary owner position independently of producer work and delivery position. Replay uses the admitted input and observation; continuation rejection never authorizes producer repetition.

## command outbox

Pending durable command delivery to one destination. Acknowledgement follows durable receiver retention and deletes the delivered rows. Receiving history and unresolved optimistic work survive independently. Original aggregate execution enqueues separate version-history and original-result destinations; each acknowledges independently.
