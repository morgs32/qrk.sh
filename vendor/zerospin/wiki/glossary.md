---
title: Glossary
updated: 2026-10-03
---

# Glossary

## System

- [`system.ts`](../examples/shopping/src/zerospin/system.ts) — Defines the Shopping System and its versioned aggregate and service definitions.

## shape

A map from field names to primitive descriptors. It defines a row's values,
nullability, and relationships, and is used for table properties and contract
payloads.

- [`types.ts`](../packages/shapes/src/types.ts) — defines shapes, primitive descriptors, and inferred row values.

## ShapeForm

A generated form whose shape defines its fields and submitted values. Editable
drafts remain separate from the decoded row delivered after whole-form
validation.

- [`ShapeForm.tsx`](../packages/react/src/primitives/ShapeForm.tsx) — owns form drafts, shape validation, and decoded submission.

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
- [`sessionKey.ts`](../packages/core/src/Node/sessionKey.ts) — hashes the bound definition, backend/system scope, versioned owner identity, and complete authenticated claims. Standalone sessions retain a separate backup key.

## Repo

A direct Durable Object class that owns one keyed database, durable boundary,
and its deferred work. The static runtime has SystemRepo, five command chains,
four domain Repos, and SystemLogRepo.

- [`types.ts`](../packages/core/src/system/types.ts) — enumerates the eleven registered Repo kinds.
- [`DevWorker.ts`](../packages/dev-worker/src/DevWorker.ts) — exports the direct Repo classes from the framework Worker.

## SystemRepo

The singleton Repo keyed by `{ systemId }`. It owns registered aggregate instances
identified by `{ aggregateName, aggregateId }`, Repo inspection, and single-use session WebSocket tickets; it also routes
WebSocket traffic to actor-command chains and SystemLogRepo.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — Defines aggregate identities, session tickets, and Repo registrations.
- [`SystemRepo.ts`](../packages/system-worker/src/SystemRepo/SystemRepo.ts) — Exposes aggregate-ID lookup, one-time tickets, and Repo inspection.
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
`IAggregateSessionSnapshot` and node reconciliation watermark; `getBrowserCommands`
supplies retained browser command occurrences without resubmitting bound owner fields.

- [`onMessage.ts`](../packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts) — Defines the current ownership and execution contract.

## ServiceSessionApi

The independently disposable read-only child capability binds `{ systemId,
serviceName, serviceVersion, identity, actorPath, sessionName,
serviceSessionLock }`. Worker configuration supplies `systemId`; gateway
selection supplies service name/version; identity supplies encoded
identity and the canonical derived `actorPath`; authorization supplies
`sessionName` and the lock. It serves `IServiceSessionSnapshot`, filtered `IServiceBrowserCommand` history
through `getBrowserCommands({ afterExecutedIndex })`, and WebSocket tickets.
The authenticated service socket admits ordinary service commands independently
of this snapshot/history capability.

- [`ServiceAccessApi.authorize`](../packages/system-worker/src/ServiceAccessApi/authorize/authorize.ts) — authorizes verified service access and constructs the session capability.
- [`ServiceSessionApi.ts`](../packages/system-worker/src/ServiceSessionApi/ServiceSessionApi.ts) — exposes snapshots, concrete browser-command history, and one-time ticket operations.

## aggregate registry and service registry

## command chain

A durable ordered history owner. AC retains admitted aggregate commands; SC retains admitted service commands. AVC and SVC retain full original command fields and ordered operation bodies at each receiving position. Actor repos retain command history separately from the selected outputs delivered by actor chains.

- [`readOwnerResultsPage.ts`](../packages/system-worker/src/readOwnerResultsPage/readOwnerResultsPage.ts) — pages retained owned command occurrences by execution position.
- [`readServiceResultsPage.ts`](../packages/system-worker/src/ServiceVersionChain/readServiceResultsPage.ts) — pages the service's complete receiving order.

## browser command

A terminal command with the shared `IBrowserCommand` fields `id`, `commandName`, selected `delta`, `admission`, and `execution`. `IAggregateBrowserCommand` adds `executedIndex`, `executedHash`, and `aggregateIndex`; `IServiceBrowserCommand` adds `executedIndex`, `serviceHash`, and `serviceIndex`. Delivery uses direct commands or direct arrays. Execution position identifies each occurrence independently of command ID. Matching input settles once, while later repeated-ID occurrences preserve the originating submission's first terminal result. Admission and execution keep their existing status, timing, failure, and result fields for the submitting Node/session/claims. Both are null for other recipients. Private input and claims remain server-side.

- [`BrowserCommandSchema.ts`](../packages/core/src/contracts/BrowserCommandSchema.ts) — defines the shared browser contract.
- [`AggregateNode.ts`](../packages/core/src/AggregateNode/AggregateNode.ts) and [`ServiceNode.ts`](../packages/core/src/ServiceNode/ServiceNode.ts) — retain distinct execution occurrences and commit resources, outcomes, and checkpoints together.

## IActorDelta

`{ upserted, deleted }` for one actor-selection occurrence. Actor repos compute the selection diff. Browser delivery exposes it as `IBrowserCommand.delta` after applying the authenticated session model lock. Local optimistic results retain `stagedDelta`. Authoritative server histories retain ordered owned operation bodies and terminal results.

## session snapshot

The selected resources and checkpoint captured together by an actor repo. Aggregate snapshots contain aggregate/actor/session identity, `aggregateIndex`, `executedIndex`, `executedHash`, resources, and `resolvedThrough` for the requesting node's contiguous terminal command prefix. Service snapshots contain service/actor/session identity, resources, `serviceIndex`, `executedIndex`, `serviceHash`, and the requesting Node's `resolvedThrough`. Neither includes `systemId` or an embedded command history.

- [`types.ts`](../packages/core/src/aggregateSession/types.ts) — defines `IAggregateSessionSnapshot`.
- [`types.ts`](../packages/core/src/serviceSession/types.ts) — defines `IServiceSessionSnapshot`.
- [`getSnapshot.ts`](../packages/system-worker/src/AggregateActorVersionRepo/getSnapshot/getSnapshot.ts) — captures resources/checkpoint, publishes through it, then reads the private outcome prefix from retained actor-chain history.
- [`applyServiceSessionSnapshotTx.ts`](../packages/core/src/serviceSession/applyServiceSessionSnapshot/applyServiceSessionSnapshotTx/applyServiceSessionSnapshotTx.ts) — atomically installs service resources and their checkpoint.

## actorCommands

An aggregate actor’s `commands` and `stagedCommands` retain command lifecycle and unresolved optimistic work. Both actor repos deliver flat browser commands through `browserCommandOutbox`; actor chains retain acknowledged occurrences in `browserCommands`. `getBrowserCommands` reads that receiving history. Snapshots return resources and checkpoints without embedding command history.

- [`AggregateActorVersionRepo.ts`](../packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts) — owns staged commands and selected-output publication.
- [`ServiceActorVersionRepo.ts`](../packages/system-worker/src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts) — publishes service actor outputs in local execution order.

## actor staging

Durable preparation of a caller command against an aggregate actor's derived optimistic state. Successful staging retains its original input, prepared model operations, and ordered submission work together. Confirmed resource rows remain authoritative. Admission delivery can finish while the staging journal remains unresolved; terminal projection or a recognized admission refusal resolves its optimistic contribution. Reconstructing optimism applies retained operations with their captured IDs and timestamps.

- [`stageActorCommands.ts`](../packages/system-worker/src/AggregateActorVersionRepo/optimistic/stageActorCommands.ts) — prepares original contract output and commits accepted staging with its submission work.
- [`makeOptimisticActorDb.ts`](../packages/system-worker/src/AggregateActorVersionRepo/optimistic/makeOptimisticActorDb.ts) — rebuilds the actor's derived view from confirmed resources and unresolved operations.

## resolvedThrough

Aggregate and service snapshot reconciliation use a Node identity and contiguous `resolvedThrough` watermark. The browser journal reconciles its own commands through that watermark; projection and node-outcome cursors remain independent during replay.

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

## serviceIndex

The admitted input position in one service's command order. On a service browser terminal or snapshot it is the latest consumed numeric service input watermark, independent of the actor's `executedIndex` and `serviceHash`. A staged row's nullable `admissionIndex` records that submission's acceptance separately from projection progress. Zero means no consumed service input.

- [`retainServiceCommand.ts`](../packages/system-worker/src/ServiceChain/admitServiceCommand/retainServiceCommand.ts) — allocates and retains service admission positions.
- [`serviceNodeTables.ts`](../packages/core/src/ServiceNode/serviceNodeTables.ts) — retains the numeric service projection watermark.

## serviceHash

The commitment to a service's terminal command dispositions. It advances from the previous hash, admitted `serviceIndex`, command ID, and disposition. Service actor outputs and snapshots carry `{ executedIndex, serviceHash }`.

## chain input order

AC orders admitted aggregate commands. Original terminal results attach to existing command positions; replaying versions wait for that result before executing their own program against their own owned state.

## aggregateIndex

The ordered shared aggregate input position, containing admitted commands. On an aggregate browser command or snapshot it is the latest consumed shared input position. A staged journal row's `admissionIndex` records its own acceptance separately from this projection watermark.

- [`AggregateNode.ts`](../packages/core/src/AggregateNode/AggregateNode.ts) — commits aggregate watermark and execution position with the terminal occurrence.
- [`AggregateNodeSynchronization.ts`](../packages/browser/src/AggregateNode/AggregateNodeSynchronization.ts) — validates the admission control against the pending command and records its original admission position.

## disposition

The success or failure of an aggregate occurrence. VAR folds ordered command positions, IDs, and dispositions into a rolling SHA-256 hash. The comparison deliberately excludes resulting state and mutation bytes.

- [`aggregateDispositionHash.ts`](../packages/system-worker/src/aggregateDispositionHash/aggregateDispositionHash.ts) — Defines the current ownership and execution contract.

## session lock

An authored, signed description of the exact session schema and query surface.
Gateway validates the lock and requires authorization to return the same exact
versioned owner and actor identity before constructing a session capability.

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

- [`prepareContractInput.ts`](../packages/core/src/contracts/prepareContractInput.ts) — prepares payload and contract claims once for both callbacks.
- [`runContractGuard.ts`](../packages/core/src/contracts/runContractGuard.ts) — runs the shared guard with prepared input and the supplied invocation database.
- [`executeCommandsTx.ts`](../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts) — retains failures with normal command history and leaves rejected mutations unapplied.

## marketplace

Shopping's service that owns the product catalog and each verified shopper's cart and cart items. Catalog actors read all products; shopper actors read only their cart, its items, and referenced products.

- [`marketplaceServiceV1.ts`](../examples/shopping/src/zerospin/services/marketplace/marketplaceServiceV1.ts) — owns the catalog and carts.

## per-user purchase aggregate

Shopping's `user` aggregate, one per verified Clerk subject. Purchases belong to that aggregate; purchase items reference their local purchase and retain an external product ID, name, price and quantity snapshot. Marketplace checkout freezes authoritative cart items and delivers the purchase to this aggregate through retained async work.

- [`userAggregateV1.ts`](../examples/shopping/src/zerospin/aggregates/user/userAggregateV1.ts) — declares purchases and purchase items.
- [`userActorV1.ts`](../examples/shopping/src/zerospin/aggregates/user/actors/userActorV1.ts) — authorizes the aggregate identity derived from the verified subject.

## invocation arguments

Guards and contract programs receive the invocation database as `db`, exposing only synchronous queries typed from their declared models. Programs also receive decoded identity, emit operations through their model methods, and return a value matching their optional result codec; they cannot write through this interface. Aggregate commands require claims. Authenticated service commands receive verified caller claims; direct service commands can pass `null`. Ordinary layers supply capabilities. There is no execution tag map.

Programs and all their dependencies must finish synchronously. They observe existing local state before any emitted operation. Suspension is interrupted and recorded as an execution failure. Materializers commit each command before running the next program. Client staging and pending replay calculate against local state; authoritative execution recalculates against its own materialization, so results can differ.

- [`runProgram.ts`](../packages/core/src/execution/runProgram.ts) — enforces synchronous completion and preserves domain failures.

## mounted session

A caller-owned session from `makeSession` / `makeMockAggregateSession` / `makeMockServiceSession` after
`initialize`, `useInitializeAggregateSession`, or `useInitializeServiceSession` has published readiness. The session
object retains its authored session and Zustand store. Each activation owns its runtime and application services; backup infrastructure is shared. Initialization binds complete command behavior before publishing readiness, and disposal revokes it before teardown. Concurrent active initialization on the same session is rejected.

- [`makeSession.ts`](../packages/browser/src/makeSession/makeSession.ts) — imperative browser composition; construction is sync and acquires no resources.
- [`useInitializeAggregateSession.ts`](../packages/react/src/useInitializeAggregateSession/useInitializeAggregateSession.ts) — effect-owned aggregate startup/disposal and failure subscriptions.
- [`useInitializeServiceSession.ts`](../packages/react/src/useInitializeServiceSession/useInitializeServiceSession.ts) — effect-owned service startup/disposal with Zustand-backed readiness.

## WebSocket ticket

A short-lived, single-use opaque token persisted by SystemRepo for one exact
actor-command chain and authenticated versioned session identity. The browser
exchanges it at the singular-command Worker WebSocket route.

- [`systemRepoDbConfig.ts`](../packages/system-worker/src/SystemRepo/systemRepoDbConfig.ts) — defines aggregate and service ticket rows with exact owner/actor identity fields and chain name.

## command finalization

VAR commits the terminal occurrence, prepared execution entry, resource state, and disposition cursor together. It returns that committed result directly; VAC publication is durable asynchronous work, explicitly awaited by flush.

- [`executeCommandsTx.ts`](../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts) — Commits each terminal execution entry to the results outbox together with aggregate resources and the disposition head.

## main-thread session database

One tab-owned synchronous SQLite view and stable session/store. Synchronized
sessions replay unresolved node commands followed by uncertain local submissions.
Fresh initialization captures confirmed resources, checkpoints, unresolved staged input, and the starting change cursor once. That starts the session's observation window. Incremental imports retain every observed occurrence, rebase optimism synchronously, and advance the tab cursor only on commit. Reconnect, navigation, and DevTools toggling preserve the current session's resource tables and observation history.

- [`bootstrapAggregateSession.ts`](../packages/browser/src/bootstrapAggregateSession.ts)
- [`bootstrapServiceSession.ts`](../packages/browser/src/bootstrapServiceSession.ts)

## sessionKey

The canonical SHA-256 commitment to the bound session definition, backend/system scope, versioned owner identity, and complete authenticated claims. Aggregate identity includes aggregate name/version/ID; service identity includes service name/version. The worker name combines its domain, compiled sharedWorkerVersion, and sessionKey; attachment verifies the bound identity again.

- [`sessionKey.ts`](../packages/core/src/Node/sessionKey.ts) — canonical hashing.
- [`sharedWorkerNames.ts`](../packages/browser/src/sharedWorkerNames.ts) — shared RoutePattern construction and parsing.

## nodeIndex

The local submission position assigned when a Node first durably accepts a command. Positions begin at one and retain the same `nodeId` through retry and reopen. Foreign terminal commands and later repeated-ID occurrences allocate no local submission position. The retained `nextNodeIndex` is the next available position: it starts at one, assigns the current value to a new local submission, and advances to that value plus one in the same transaction.

- [`AggregateNode.ts`](../packages/core/src/AggregateNode/AggregateNode.ts), [`ServiceNode.ts`](../packages/core/src/ServiceNode/ServiceNode.ts) — allocate submission positions with durable command retention.

## journalIndex

The stable primary key of a retained Node journal row. It is independent of command ID, so distinct executions of a repeated ID remain separate rows. The originating local submission keeps its first terminal outcome; later occurrences allocate new journal rows without another local submission position.

## sessionIndex

The stable primary key and first-retention position of every command row in one session database. Locally staged commands, received staged input, and terminal-only history share this sequence. Updates and duplicate delivery preserve the position; a distinct repeated-ID execution receives a new position. It describes retention order, not originating-session provenance or Node submission order. Restoring retained history preserves the sequence even when the live session identity changes; fresh history starts at one.

- [`sessionRepoDbConfig.ts`](../packages/core/src/aggregateSession/sessionRepoDbConfig.ts), [`serviceSessionRepoTables.ts`](../packages/core/src/serviceSession/serviceSessionRepoTables.ts) — session command and inverse-operation row identities.

## changeIndex

The durable order of Node journal mutations and the tab's committed observation cursor. `afterChangeIndex` resumes an existing tab. Fresh initialization captures its starting cursor with resources, checkpoints, and unresolved commands. Each subscriber independently recovers bounded pages from SQLite and advances only after its application callback commits.

## admissionIndex

The nullable retained acceptance position on staged input: aggregate admission position for aggregate commands or service admission position for service commands. It records acceptance alone. It does not settle execution or advance the contiguous originating outcome cursor.

## outcomeIndex

The largest contiguous `nodeIndex` prefix whose originating local submissions have terminal results. It advances transactionally with terminal settlement and remains independent of execution progress, because replay may include historical outcomes already covered by resource checkpoints.

## durable browser node

A concrete `AggregateNode` or `ServiceNode` owns one SharedWorker persistent SQLite database for its bound session definition, versioned owner identity, and complete claims. Each owns its schema, journal, authentication integration, synchronization, and recovery. Its prefixed `nodeId` survives restart. Local acceptance allocates `nodeIndex` atomically; each row has an independent `journalIndex` and each mutation a durable `changeIndex`. One authenticated baseline initializes fresh storage; later connections resume committed execution and outcome cursors. Conflicts preserve storage and block synchronization.

- [`AggregateNode.ts`](../packages/core/src/AggregateNode/AggregateNode.ts)
- [`ServiceNode.ts`](../packages/core/src/ServiceNode/ServiceNode.ts)
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

A named, cold aggregate session exported by the project's browser-safe
`agents.ts` and registered in its System. Its declaration binds exact aggregate
and system-only admin actor versions, an actor-style database with its runtime
models, displayed model selections, and row-bound ordinary contracts. System
composition checks canonical models, captured selections and mapped-original
contract bindings. Several sessions may use the same admin actor.

- [`makeAgentSession.ts`](../packages/browser/src/makeAgentSession.ts) — constructs the cold session, captured selections and ordinary contract bindings.
- [`makeSystem.ts`](../packages/core/src/system/make/makeSystem/makeSystem.ts) — validates exact registered bindings.

## Agent session

One ordinary aggregate session initialized for one registered aggregate ID for
the lifetime of an open Studio view. It stages ordinary contracts transactionally
in memory, retains their optimistic inverse operations and command identities,
and pushes them through the bounded aggregate-session socket. Reconnect recovers
owned command outcomes before installing a snapshot and replaying pending work.
Closing or switching the view disposes SQLite, the stream and the command journal.

- [`makeAgentSession.ts`](../packages/browser/src/makeAgentSession.ts) — owns initialization and disposal without a durable Node, backup or SharedWorker.
- [`AgentPreview.tsx`](../packages/studio/src/AgentPreview.tsx) — displays live rows, ordinary contract controls and connection state.

## Agent contract

A cold declaration from `makeAgentContract({ contractVersion, model, bind })`
that attaches an ordinary contract to rows of one displayed model selection.
Each binding maps a payload field to a compatible decoded row field. Studio
shows these values read-only and renders the remaining payload fields with
`ShapeForm`. Normalization retains the original ordinary contract object;
the declaration adds presentation metadata, not a separate execution capability.

- [`makeAgentContract.ts`](../packages/core/src/agent/makeAgentContract.ts) — validates and freezes row binding metadata.

## Completed purchase

A Shopping purchase with authoritative successful payment evidence and
`paymentState: 'paid'`. A committed pending purchase is not completed. Decline
retains the frozen purchase/items and never restores the consumed cart. Tracking
labels and carrier status remain separate from payment; completed purchases stay
visible throughout tracking changes.

## Tracking refresh

A manually requested carrier observation for a ready label. The ordinary
`updateTrackingInfo` command reserves one sequence and coalesces concurrent work;
its private continuation validates the frozen label identity and sequence before
applying the recorded evidence. Shopping's example reports `in_transit` for
sequence 1 and `delivered` for later sequences.

## executed aggregate command / executed service command

A terminal server command classified by its original owner. It retains the original input, provenance, admission position, and success, rejection, or execution failure. Forwarding preserves that owner; version execution positions and actor/session projections remain separate local facts.

## staged aggregate command

An aggregate command prepared against the actor’s optimistic view, with its staging time and ordered optimistic operations. Admission delivery can complete while the command remains unresolved in the actor journal.

## mapped contract

A server declaration made with `mapContractVersion`. It retains an ordinary contract's identity, payload adaptations, guards, and business failures, then appends synchronous mapper emissions after its base output. The mapper sees immutable base output and pre-application state through its declared model scope. Its required result codec owns authoritative output; owner/actor versions pin mapped behavior. Capability references never register contracts implicitly.

- [`mapContractVersion.ts`](../packages/core/src/contracts/make/mapContractVersion.ts) — declares model and async emission capabilities.

## external contract

A server declaration made with `makeExternalContract`. Its `external.request({ payload })` performs the external work and returns a value validated by `external.response`. The producer records that returned value as immutable `response`, together with `responseRecordedAt` and pending delivery, before the synchronous `program({ payload, response })` executes. The contract's top-level `result` describes the continuation's return value. Emission provenance remains on the retained async operation; browser sessions neither supply nor receive the recorded response.

- [`makeExternalContract.ts`](../packages/core/src/contracts/make/makeExternalContract.ts) — declares the external request, response codec, and synchronous continuation.

## async operation

An explicit emission containing an exact external contract name/version and encoded payload. Its identity is `(commandId, operationIndex)` in the retained owner/version history. Combined `modelOperations` and `asyncOperations` reconstruct complete output in original index order. Only original execution initializes producer lifecycle beside the emission; replay and received history retain immutable output with no production authority. Actor projections skip async entries while preserving model indexes.

- [`asyncOperationsDbConfig.ts`](../packages/system-worker/src/asyncOperations/asyncOperationsDbConfig.ts) — immutable emission and producer-owned lifecycle fields.

## async command

A private backend continuation of an external contract, with its own `payload` and immutable recorded `response` as direct fields. The producing VersionRepo reconstructs it from retained async data and its owner key, without the initiating command row. Admission assigns its ordinary owner position independently of producer work and delivery position. Replay uses the admitted payload and response; continuation rejection never authorizes producer repetition.

## command outbox

Pending durable command delivery to one destination. Acknowledgement follows durable receiver retention and deletes the delivered rows. Receiving history and unresolved optimistic work survive independently. Original aggregate execution enqueues separate version-history and original-result destinations; each acknowledges independently.
