# 034 — Offline Frontend Replicas and Continuous Frontend Lineage Implementation Plan

**Source spec:** `../archived/034-spec-offline-frontend-replicas-and-continuous-lineage.md`

**Companion plan:** [`033 — Service-Owned Actors and Frontend Controllers`](./033-plan-service-owned-actors-and-frontend-controllers.md)

## Summary

1. Move persistent account/service replica, socket, replay, repair, and account push ownership into the existing system/generation/partition SharedWorker while retaining one synchronous main-thread database per mounted Provider.
2. Move signature generation and long-lived provider capabilities to `ZerospinConfig`, authenticate before exposing cached data online, and allow a 24-hour cached identity locator only after transport failure and only for an already-ready exact replica.
3. Add separate account and service replica catalogs, a generation-partition-owned account command journal, a serialized per-replica mutation queue, a local `replicaIndex`, and full encoded replica states/blocks that preserve complete command provenance.
4. Replace latest-only WebSocket delivery with target-bound in-band resume, strict archived suffix replay, state-required repair, fresh-ticket reconnect, and separate account/service lineage transition controls.
5. Preserve one logical frontend index across physical generation-scoped archives through immutable predecessor descriptors and typed generation-boundary blocks, with a finite write-admission drain and no-emission successor preparation.
6. Commission future frontend-version replicas before activation, retain dormant source commands, and use direct compiled historical payload adapters to activate them without moving or losing the only durable intent.
7. Keep explicit direct mode behavior for runtimes without persistence while making an explicitly requested but unavailable SharedWorker fail visibly rather than silently changing correctness mode.
8. Verify the design through core contract and transaction tests, system-worker lifecycle/workerd tests, SharedWorker crash/corruption tests, a real Chromium multi-tab/offline/commissioning suite, synchronized documentation, and current Nx targets.

## Relationship to Active Plans and WIP

1. Implement plan 033's service foundation before consuming service shapes in this plan.
   1. Plan 033 owns `serviceActorController`, `serviceFrontendController`, `serviceSession`, `ServiceFrontendApi`, `ServiceFrontendRepo`, `ServiceFrontendBlockRepo`, the separate service route/ticket, and the read-only React factory.
   2. Plan 034 owns the shared account/service replica lifecycle and must integrate those service surfaces without widening account types or duplicating a service-only worker substrate.
   3. Implement server archive and browser work in their final continuous-lineage shape; do not land a generation-reset service archive or temporary provider-owned service socket.
2. Preserve active plans 008 and 009.
   1. Keep current repo prefixes, table-bound references, grouped service snapshots, AccountRepo alignment, singleton ServiceBlockRepo delivery, and the absence of `replicatedResources`.
   2. Add continuous frontend lineage after the existing authoritative service/account ledger replay; do not reinterpret a service cursor as a browser convergence watermark.
3. Extend active plan 031 rather than recreating WebSocket admission.
   1. Preserve fixed server-selected routes, hash-only short-lived tickets, one-use consumption, and direct hibernating block-repo ownership.
   2. Reconcile the current implementation mismatch before extending the protocol: SystemRepo currently mints a generation-prefixed ticket while `examples/shopping/src/Worker.ts` accepts only one 43-character base64url token.
   3. Make every public Worker validate the actual opaque account/service ticket format produced by the owning mint path, without exposing or accepting a repo name.
4. Preserve plan 032's factory version checks and current SystemSpec validation work.
   1. Extend the existing payload-only contract spec with historical payload definitions.
   2. Do not restore `mutationsJsonSchema`, mutation-result compatibility comparison, or a permanent old-spec decoder.
   3. Coordinate plan 033's one-time `actorControllers: {}` rewrite with this plan's required `historicalDefinitions` fields so stored specs are transformed before strict decode.
5. Preserve archived plan 027's pushed-command semantics and archived plan 028's mock boundary.
   1. Keep `admissionLastAccountCursor`, guard revalidation after service alignment, pushed-block idempotency, and full command provenance through the worker journal and server terminal path.
   2. Keep the local mock provider free of authentication, sockets, persistence, push, and simulated remote updates.
6. Treat the current dirty worktree as existing user WIP.
   1. Do not restore or rewrite the nine tracked mutation-schema, TODO, and wiki changes while implementing this plan.
   2. Preserve unrelated active plans/specs and classify their failures separately from this plan's work.
   3. Do not archive plan 033 or 034 independently while any cross-plan acceptance or documentation requirement remains incomplete.

## Implementation

1. Resolve the implementation-only approval gates before changing runtime boundaries.
   1. Record current `git status --short`, active plans, SystemRepo generation methods, DevZerospinApis routing order, WebSocket ticket shape, SharedWorker schema, and browser ownership before editing.
   2. Present one explicit generation-lifecycle proposal because current HEAD marks G1 drained before preparing G2, while the approved design requires G1 to remain read-routable through G2 preparation and the routing switch.
   3. Obtain approval either to change the existing lifecycle RPC contracts or to add one explicitly named post-switch completion RPC, including its exact SystemRepo/SystemWorker/DevZerospinApis call sites and retry semantics.
   4. Before splitting the much larger SharedWorker runtime into any additional modules, propose each module name, responsibility, and call sites; otherwise keep the implementation explicit in the existing owning modules.
   5. Before adding any internal helper, named store/error type, loop, or export beyond the exact approved public inventory, request explicit approval with its concrete call sites.
   6. Do not add `ALLOWED_CAST`. Stop for explicit authorization if an approved RPC/capability boundary cannot be typed without a cast.

2. Add direct historical contract payload definitions without restoring mutation-result compatibility.
   1. Extend `packages/core/src/contracts/makeContract.ts` with the approved optional second argument of complete historical payload definitions.
   2. Require every historical entry to use the current command name, a unique valid older SemVer, an existing contract payload shape, and one direct old-to-current `adaptPayload` callback.
   3. Reject current-version duplication, duplicate historical versions, command-name mismatch, non-older versions, missing adapters, and invalid payload shapes at factory evaluation.
   4. Keep adapters runtime-only. Decode one historical payload, invoke its direct adapter, validate/encode through the current payload, and never traverse an adapter chain.
   5. Extend the defining contract types and `IContractSpec` with deterministic `historicalDefinitions` containing only command name, version, and payload JSON Schema.
   6. Extend `SystemSpecSchema.ts`, `makeSystemSpec.ts`, and `checkSystemCompatibility.ts` so adding a historical payload is minor, removing one is major, and schema changes use the existing directional rules.
   7. Require an authored current contract version bump when adapter behavior changes because behavior is not serialized or compared.
   8. Add focused factory, typecheck, deterministic serialization, schema, and compatibility tests while preserving the current removal of `mutationsJsonSchema`.

3. Expand account and service frontend specs into complete generic replica-schema inputs.
   1. Update `packages/core/src/frontendController/types.ts` and `makeFrontendControllerSpec.ts` so every account model entry includes identity, abbreviation, version, encoded properties, indexes, and deterministic historical definitions.
   2. Preserve account/actor/frontend identity, frontend version, model names, complete contract specs, and `signatureJsonSchema`.
   3. Use plan 033's `makeServiceFrontendControllerSpec` for the parallel complete service model/signature definition with no contracts or writable fields.
   4. Compute one canonical hash over the complete encoded spec and use the same canonical bytes in Config, catalog, acquisition, and worker validation.
   5. Fail closed when the same frontend version has different canonical spec bytes; require an authored frontend version bump rather than accepting or migrating the mismatch, and require a new system generation as well whenever the mismatch adds, removes, or changes an account or service frontend model/projection schema.
   6. Keep account and service spec types separate. Do not add nullable owner fields, a discriminated mega-spec, application controller code in the SharedWorker, or `modelNames`-only schema reconstruction.
   7. Before extracting a canonical-hash helper not already approved by name, present its exact defining module and all call sites for approval.

4. Define the complete sync, lineage, replica, mutation, and transition wire contracts in core.
   1. Add `IFrontendSyncState` as the complete account server creation/repair state with account/system/generation/system-version identity, non-null frontend index, resources, pending pushed commands, and full executed/failed terminal outcomes.
   2. Keep plan 033's exact `IServiceFrontendState` as the service server sync state.
   3. Expand `IFrontendReplicaState` with frontend version, `replicaIndex`, all current resources/server lifecycle rows, full journal rows, and encoded applied mutation/inverse rows sufficient to reproduce optimistic state without rerunning authored code.
   4. Add the separate `IServiceFrontendReplicaState` with the exact service state, frontend version, and `replicaIndex`, and no command tables.
   5. Add `IEncodedFrontendMutation` with full command ID, mutation index, model/resource/version/operation identity, and encoded operation but no applied timestamp or inverse.
   6. Add the exact approved account and service generation-boundary blocks and wrap ordinary account/service blocks in distinct `IFrontendLineageBlock` and `IServiceFrontendLineageBlock` unions.
   7. Add target-bound `IFrontendReplicaBlock` and `IServiceFrontendReplicaBlock` envelopes with `replicaIndex` and `frontendIndex`; encode server and local command transactions as distinct variants on the one contiguous local index.
   8. Add the exact socket-only `IFrontendLineageTransitionRequired` and `IServiceFrontendLineageTransitionRequired` controls without turning them into archive rows or convergence watermarks.
   9. Preserve complete encoded command shapes at journal, callback, push, replacement, and terminal-table boundaries. Replace the current stripped failed-session row rather than unioning it into the final contract.
   10. Add strict schemas and compile-time tests for every union, target envelope, account/service capability shape, and prohibited service method.

5. Make account and service state/block application synchronous and transactional.
   1. Update `packages/core/src/session/applyFrontendState.ts`, `applyFrontendReplicaState.ts`, and `applyFrontendBlock.ts` plus plan 033's service-session equivalents.
   2. Validate complete target identity, spec/version, lineage, expected frontend index, and expected replica index before any database mutation.
   3. Replace resource and server lifecycle state in one synchronous SQLite transaction on the existing database object: delete old rows, insert the complete replacement, apply healthy journal overlays when applicable, then update watermarks last.
   4. Roll back to the prior complete state and indices on any delete, insert, decode, mutation, or watermark failure.
   5. Emit one committed live-query refresh rather than exposing an empty or partially rebuilt database.
   6. Apply an exact-next replica block once, ignore only a byte-identical stale duplicate, and enter repair on a gap, conflicting duplicate, wrong target, invalid lineage, decode failure, or apply failure.
   7. Treat a boundary as an index/pending-transition transaction with no resource or command-table mutation; never decode it as an empty delta.
   8. Represent a full replacement as one returned replica state at its committed `replicaIndex`, not a fabricated sequence of ordinary blocks.
   9. Add rollback, equal-index content mismatch, wrong-target, gap, duplicate, one-refresh, and same-database-object node tests.

6. Persist complete account terminal truth in FrontendRepo and carry it through generation preparation.
   1. Add inline executed- and failed-pushed-command tables beside the current `FrontendRepo` control tables in `packages/system-worker/src/FrontendRepo/FrontendRepo.ts`.
   2. Store the full encoded terminal command when `handleActorBlocks` removes it from pending state; do not rebuild a session-only row or null provenance.
   3. Update `getFrontendState` to read pending, executed, and failed tables directly rather than returning empty arrays or scanning the full block archive.
   4. Include those complete rows in `IFrontendSyncState` and every full-state repair.
   5. Extend FrontendRepo bootstrap/drain/preparation so successor projections contain all terminal rows before they become state or ticket ready.
   6. Keep full terminal rows indefinitely in the first implementation and add no compaction or retention heuristic.
   7. Add migration and workerd tests for existing projections, terminal persistence, full-state reconciliation, pushed-command idempotency, and generation carry-forward.

7. Turn account and service block repositories into strict lineage archives and WebSocket owners.
   1. Extend `FrontendBlockRepo` and plan 033's `ServiceFrontendBlockRepo` tables to store complete target-bound lineage rows and canonical encoded bytes in frontend-index order.
   2. Require the next append to equal terminal plus one. Accept a duplicate index only when its canonical bytes are identical; reject a conflicting duplicate or gap.
   3. Record the immutable predecessor descriptor supplied by SystemRepo; never probe arbitrary Durable Objects to discover ancestry.
   4. Keep physical repositories generation-scoped while exposing one logical suffix across recorded predecessor segments.
   5. After upgrade, require the first client frame `{ replicaGenerationId, frontendIndex }`; keep the ticket immutable and free of a mutable client watermark.
   6. For a target-generation resume, capture terminal T, send C+1 through T exactly once in ascending order, buffer later blocks, send replay-complete, then become live.
   7. For an exact ancestor, send only the source suffix through its first successor boundary, then one non-indexed lineage-transition-required control and close without replay-complete or later indexed blocks.
   8. Return state-required and close for an ahead index, missing suffix, invalid ancestry, wrong target, decode failure, or archive corruption.
   9. Require a fresh short-lived one-use account/service ticket on every connection attempt and never retry a spent or possibly spent ticket.
   10. Reset exponential backoff only after replay-complete; cap reconnect at 30 seconds and suspend source reconnect after a lineage-transition-required control.
   11. Keep account and service ticket tables, routes, controls, archives, schemas, and repository classes distinct.

8. Reorder generation drain, preparation, routing, and predecessor-room shutdown.
   1. Close G1 write admission for new account/service commands first and wait only for work admitted before that gate; offline journal commands do not prolong server drain.
   2. Keep G1 read-routable in `draining` while capturing the exact frozen service, account, account-frontend, and service-frontend projection/archive bounds.
   3. Distinguish `no-local-segment` from `no-lineage`: a post-freeze projection is snapshot-only/read-only and inherits the last real ancestor when one exists without extending the finite drain set.
   4. Extend SystemRepo's `drainBounds` authority with separate account/service frontend predecessor descriptors and the frozen terminal indexes needed by target preparation.
   5. Prepare G2 projections from source snapshots plus only the suffix after each causal watermark through the frozen bounds, in bounded chunks and explicit no-emission mode.
   6. During no-emission replay, mutate target materialized state/source cursors but write no target frontend outbox/archive blocks.
   7. For inherited lineage, set the target internal index to predecessor terminal F and append exactly one boundary at F+1; start a genuinely new logical frontend at baseline without a boundary.
   8. Make target state available only after materialization is coherent and make target tickets available only after the archive covers the state/boundary index they advertise.
   9. Switch ordinary API routing to G2 only after target projection and archive readiness; then stop G1 reads, mark it drained, purge remaining tickets, and signal frozen predecessor block rooms with generation-superseded.
   10. Persist and retry any deferred post-switch cleanup idempotently without reopening admission or routing.
   11. Mark preparation failed visibly when admitted outbox/projection work cannot settle; never accept more work or pretend the target is ready.
   12. Implement this ordering in `SystemRepo`, its same-named lifecycle method folders, SystemWorker, and `DevZerospinApis` only after the runtime-boundary approval in step 1.

9. Add explicit server migrations for lineage, ticket, terminal, and transition state.
   1. Extend `SystemRepo` storage for separate account/service ticket records, typed frozen projection bounds, immutable predecessor descriptors, pending/post-switch cleanup, and any approved lifecycle phase required by step 8.
   2. Migrate existing account ticket records without weakening hash-only, expiry, deploy, or one-use behavior; never interpret an account row as a service ticket.
   3. Migrate FrontendRepo terminal tables and FrontendBlockRepo lineage rows before their strict schemas read old databases.
   4. Add plan 033's ServiceFrontendRepo and ServiceFrontendBlockRepo schemas directly in their final lineage-aware form rather than creating a legacy first version.
   5. Make every migration one-time and idempotent. Add no optional steady-state fields, legacy unions, fallback decode branches, or silent state deletion.
   6. Add raw pre-migration and interrupted-migration workerd tests for every persisted owner.

10. Replace the scaffold SharedWorker catalog with separate persistent account/service catalogs and a durable account journal.
    1. Keep same-generation commissioning strictly for contract-only or frontend-code version changes whose account/service model registries and complete encoded projection schemas are unchanged.
    2. Route every frontend model addition, removal, model-definition change, or projected-schema change through a new system generation and its lineage transition; never treat that change as an in-generation browser replica commission.
    3. Preserve explicit internal catalog/library migrations as storage migrations only; they do not authorize an authored projection-schema change in place.
11. Update `packages/shared-worker/src/SharedWorker/partitionSchemas.ts` with separate `accountFrontendReplicas` and `serviceFrontendReplicas` tables.
12. Store complete owner identity, frontend version, canonical spec hash, database name, `commissioning | ready | failed` status, `replicaIndex`, `frontendIndex`, role, transition/diagnostic state, and no redundant root system/generation/partition fields.
13. Add generation-partition-owned account journal rows outside every replica VFS for the full encoded command, full encoded frontend mutations, source identity/version/generation, staged cursor/time, original payload/version, lifecycle, push provenance, terminal outcome, target migration provenance, and applied overlay data required for repair.
14. Keep service catalogs free of command or journal fields and keep account/service listing tables separate.
15. Preserve the partition catalog VFS separately from every replica VFS and use `zerospin/{systemId}/{generationId}/partitions/{partitionKey}/{kind}/{replicaId}` for one authored frontend-version database.
16. Keep one constant SQLite filename inside each replica namespace; a frontend version always creates a distinct physical database.
17. Generate an explicit migration through `@zerospin/shared-worker:drizzle:partition` and exercise both synchronous and async migration paths.
18. Safely quarantine existing `replicas` rows as legacy account materializations that may contain unique staged commands: preserve their database names/bytes for diagnostics, mark them unusable for cached-ready acquisition, and require explicit recovery rather than deleting, resetting, or silently treating them as new-format replicas.
19. Never auto-delete a legacy command-bearing database, corrupt journal, failed commission, old-version VFS, or catalog row.
    1. If a service commission is interrupted before readiness, mark it failed and rebuild it online under a new database name while preserving the failed row/bytes for diagnostics.
    2. If an account commission is interrupted, preserve it without rebuild or deletion until the separate journal opens successfully and possible unique command ownership is verified.
    3. Cover both branches in focused interruption tests; a generic failed-status retry is not sufficient for the account case.

20. Implement the exact provider and `PartitionApi` capabilities on serialized replica runtimes.
    1. Define the approved public `AccountFrontendReplicaProviderApi` and `ServiceFrontendReplicaProviderApi` protocol types in `packages/shared-worker/src/makeSharedWorkerSession.ts`; do not add a separate protocol barrel. Construct and own their concrete main-thread `RpcTarget` values in the Config-owned `packages/react/src/makeBrowserPartitionController.ts`, once per replica/tab rather than once per mounted Provider.
    2. Implement `PartitionApi`, the two acquired replica targets, account/service runtime entries, catalogs, serialized queues, sockets, and port-disposal ownership in `packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts`.
    3. Keep `packages/shared-worker/src/makeSharedWorkerSession.ts` as the typed root-session transport and `packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts` as the owning worker implementation; do not duplicate inline protocol shapes between them after the approved types exist.
21. Add the approved public `AccountFrontendReplicaProviderApi` and `ServiceFrontendReplicaProviderApi` Cap'n Web targets with the exact methods and encoded-Either results from the spec.
22. Give the account provider only `getFrontendState`, `createFrontendWebSocketTicket`, `pushCommands`, `handleFrontendReplicaBlock`, and `replaceFrontendState`.
23. Give the service provider only `getFrontendState`, `createFrontendWebSocketTicket`, `handleServiceFrontendReplicaBlock`, and `replaceFrontendState`.
24. Add exact generation-bound `PartitionApi.acquireFrontendReplica` and `acquireServiceFrontendReplica` records, validating root identity, complete target, spec/version/hash, authority, role, and provider capability.
25. Return distinct acquired account/service `RpcTarget` values exposing only `getFrontendState()` and `release()` with encoded-Either results.
26. Add exact account-only `stageFrontendCommand`, `getDormantFrontendCommands`, `importAdaptedFrontendCommands`, and `markFrontendCommandsMigrated` methods with their approved property records and results.
27. Validate complete source and target journal locators at every method; never infer provenance from the currently open root.
28. Make reacquisition by the same Config provider idempotently upgrade `cached-offline -> online` and `commissioned -> active`, never downgrade either dimension, and never add a duplicate ownership count/callback.
29. Let `cached-offline` acquire only an existing exact ready replica and forbid it from create, repair, commission, network, push, or socket behavior.
    1. Return `frontend-identity-changed` for a different authoritative account/actor target, detach the old Config session, invalidate all matching version/role locators, and start the new-identity lifecycle without hydrating the old target.
    2. For state and push, return `frontend-generation-changed` when authority resolves a recorded successor and never install that state into the source replica; for ticket minting, return the successor ticket plus complete target envelope so ancestor resume can proceed.
    3. When generation is unchanged but authoritative frontend version/spec differs, return `frontend-version-changed` from state and push, while ticket mint may return the same-generation new-version envelope only for the permitted model-schema-identical transition.
    4. Fail closed for an unrelated or older generation. Do not coerce any of these authority outcomes into transport failure, cached-offline fallback, or generic state replacement.
30. Keep one runtime entry per ready or actively commissioning catalog row with one database, one serialized Effect queue, indices, registered Config capabilities, socket, buffered replay frames, and reconnect fiber.
31. Process snapshot install, server block, local staging, push transitions, terminal outcomes, replacement, and generation boundary on that one queue; advance neither index on a failed transaction.
32. Detach a dead Config capability without rolling back an already committed worker transaction or blocking healthy capabilities.
    1. On worker port disposal, release every account/service registration owned by that port.
    2. When no Config-owned active or commissioning acquisition remains for a runtime entry, close its socket and cancel queued reconnect/backoff work while retaining its catalog row, replica database, journal, and identity locator.
    3. Reacquisition restarts networking from the retained replica watermark only after a current credential-capable Config is registered.

33. Move authentication, identity locators, and worker ownership into `ZerospinConfig`.
    1. Assign `packages/react/src/ZerospinConfig.tsx` the authenticator registry, cached locator store, worker-root registry, Config-owned acquisitions, lifetime counts, and Config-unmount release.
    2. Assign `packages/react/src/makeBrowserPartitionController.ts` the Config-owned worker root/partition session, concrete account/service provider `RpcTarget`s, per-replica acquisitions and lifetime counts, current authenticator/API capability selection, and session fan-out. These objects survive Provider unmount, operate while no Provider is mounted, and release only at the Config/commission-owner boundaries.
    3. Assign `packages/react/src/bootstrapBrowserSession.ts` online admission, authoritative identity/spec comparison, exact ready-replica lookup, cached-offline fallback, registration of one main-thread session behind the existing Config capability, initial snapshot barrier, and direct-mode selection; it does not construct or own the Config-level provider capability.
    4. Assign `packages/react/src/makeProvider.tsx` Provider-prop removal, one main-thread database per mount, Config fan-out registration, hydration/repair barriers, and Provider-only teardown.
    5. Assign `packages/react/src/makeBrowserSession.ts` the account browser session state/operation wiring and plan 033's separate service session wiring without adding a unified nullable session type. In worker mode, account `stageCommand()` submits prepared full command/mutations directly through `PartitionApi.stageFrontendCommand` and awaits its emitted replica index.
    6. Keep `packages/react/src/acquireFrontendWebSocket.ts` strictly direct-mode: it owns that Provider's resume/replay/reconnect socket only. Implement SharedWorker-mode socket, replay buffer, suffix/state repair, reconnect, and transition controls entirely in `packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts`; the worker never imports or reuses React code.
    7. Keep `packages/react/src/usePushQueue.ts` strictly direct-mode and account-only. In worker mode the SharedWorker host owns batching/push and invokes the Config-owned `AccountFrontendReplicaProviderApi.pushCommands`; service capabilities still have no push method.
    8. Add the approved public hook at `packages/react/src/useCommissionFrontendReplica.ts`; export only that named deep module and do not add a React feature barrel.
34. Extend `packages/react/src/ZerospinConfig.tsx` with the exact `frontendAuthenticators` registry keyed by `frontendName`, each entry holding the statically typed React frontend and current signature generator.
35. Validate key/controller equality and uniqueness across account and service frontends within one Config; allow separate Configs to reuse a name.
36. Retain the latest generator function reference without reconnecting merely because its React prop identity changes.
37. Remove `generateSignature` from account and service Provider props. Generate a fresh signature for each admission and never persist or reuse it as a ticket.
38. Add a Config-owned vanilla Zustand store with persist middleware and `localStorage`, driven by bootstrap/commission operations rather than render hooks.
39. Namespace cache keys by API origin, publishable key, partition key, frontend kind, complete static owner names, frontend name, and frontend version.
40. Store only role, kind, complete owner/actor/account identity, system/generation/version/worker identity, `authenticatedAt`, and fixed `expiresAt`; never store signatures, tokens, capabilities, tickets, database rows, or commands.
41. Parse through an Effect `Schema.parseJson` boundary and treat unknown fields, invalid identities/timestamps, expiry, or static target mismatch as a cache miss.
42. Use a fixed 24-hour absolute lifetime renewed only by successful online authentication; offline use never extends it.
43. Authenticate before exposing replica data whenever transport is reachable. Never supply cached `actorId` as asserted authentication identity. Treat domain authentication/authorization failure as authoritative and allow cache fallback only for transport/unreachability failure.
    1. Account online admission is exactly `getFrontendApi(...)`, then its small `fetchActor()` identity response and expanded `makeFrontendSpec()` response.
    2. Service online admission is exactly plan 033's `getServiceFrontendApi(...)` identity/spec envelope.
    3. Neither admission path fetches resources before Config compares authority and looks up an exact ready replica; call bound `getFrontendState()` only when no usable ready replica exists or repair is required.
    4. When an offline-hydrated session regains transport, reauthenticate and compare identity/spec before opening a socket, minting a ticket, or pushing a journal batch. A network event alone never renews authority.
44. On any authoritative target mismatch, detach the old registration and invalidate every active/commissioned locator for that Config principal/frontend across all versions while preserving every replica and journal byte.
45. Maintain one in-memory worker root/partition registry per `{ systemId, generationId }`, with one Config-owned provider capability/acquisition per replica per tab and explicit lifetime counts.
    1. Provider unmount releases only its main-thread registration and database; it does not release the Config-owned worker acquisition.
    2. Config unmount releases every worker entry, provider capability, and active/commissioning acquisition it owns, then closes the worker port after those releases settle.
    3. `useCommissionFrontendReplica().release()` releases that commission owner; when it was the last active/commissioning owner, the worker closes the target socket and cancels reconnect while preserving the ready replica, catalog, journal, and locator bytes.

46. Enforce snapshot-before-callback ordering and isolate main-thread session repair.
47. Register a provider as hydration-gated and capture snapshot N inside the worker queue before returning the acquired capability.
48. Make the first acquired `getFrontendState()` return N, open the delivery gate only after its RPC response has been sent, and schedule later callbacks on the same ordered Cap'n Web session.
49. Add no hydration acknowledgement RPC.
50. Initialize every main-thread session application chain with a hydration promise that includes receiving and synchronously committing N before React initialization.
51. Queue an early callback behind that promise so it cannot overtake the snapshot.
52. Keep one Config acquisition alive across Provider teardown/remount; a late Provider installs the same barrier around a current worker snapshot J before joining callback fan-out.
53. Fan each worker transaction serially to every Provider-owned main-thread database, preserving separate database objects and one refresh per committed transaction.
54. If one session application fails, install a repair barrier before returning the callback, let healthy siblings commit, and start repair only after the callback returns to avoid callback-to-worker deadlock.
55. During repair, queue later callbacks, apply worker snapshot J, discard queued blocks at or below J, then apply exact higher `replicaIndex` values until caught up; close/fail only that session if repair cannot converge.
56. Await `replaceFrontendState(...)` completion before sending that Config a later block and use the ordinary RPC promise as the ordering barrier.

57. Move durable account staging, rebase, and push into the worker journal.
58. In SharedWorker mode, have compiled main-thread code run the current contract program without mutating its session database and produce the full encoded staged command plus `IEncodedFrontendMutation[]`.
59. Call `PartitionApi.stageFrontendCommand` with the exact applied `baseReplicaIndex`; reject stale preparation until the session consumes missing worker changes and recomputes against the current state.
60. Commit the full journal row before applying encoded optimistic mutations to the replica, compute/store applied inverses in the replica transaction, and repair an interrupted journal-before-materialization crash idempotently.
61. After commit, increment `replicaIndex` once and fan one complete account replica block to every Config, including the origin; the origin never applies its command independently.
62. Resolve public `stageCommand()` only after its main-thread callback chain has committed that exact replica index.
63. If the worker commit succeeded but local application failed, return the typed durable-stage-application failure with the existing command ID and enter repair; never create a replacement command on retry.
64. During authoritative rebase, reverse stored applied inverses, apply server resource/lifecycle truth, then reapply retained pushed and staged encoded mutations in cursor order while recomputing inverses.
65. Let the worker push through the oldest healthy account provider capability, one batch at a time; service replicas never obtain a push method.
66. Transition staged to pushed only with durable admission evidence and reconcile transport uncertainty by replay/full state and the same byte-identical command ID.
67. Distinguish terminal guard/admission or failed-pushed outcome, authentication revocation, transport uncertainty, and generation-write-admission-closed exactly as specified; do not mislabel all four as terminal command failure.
68. Keep source-generation journal rows and server terminal rows indefinitely and keep successor journal locators rather than moving the only copy during commissioning.

69. Implement worker-owned network convergence and explicit direct mode.
70. In worker mode, let one replica runtime own the only socket, resume watermark, replay buffer, reconnect fiber, state-required repair, and account push loop across all tabs/Providers.
71. Select the oldest healthy provider capability for state, ticket, or push, issue one request at a time, and try the next after a dead/rejected Config capability.
72. When no credential-capable Config remains, keep the replica readable offline and wait for later registration without deleting state.
73. On a domain authentication failure, revoke only that Config capability, invalidate all its matching cached locators, stop rendering its offline-hydrated children, close its main-thread databases, and preserve persistent bytes while other healthy providers may keep the shared replica online.
74. Publish `workerState` transitions atomically with relevant indices/errors; do not infer online status from `isInitialized`.
75. In direct mode, authenticate online, fetch a full state, commit it to the Provider database, and retain Provider-owned socket and account push behavior.
76. Give direct mode the same target validation, resume, suffix replay, gap detection, state-required replacement, fresh-ticket reconnect, and 30-second backoff cap.
77. Give direct mode no persistent catalog/replica, cached offline startup, cross-tab socket sharing, commissioning, or command durability across refresh.
78. On a generation transition, suspend the source socket, authenticate the target, and transactionally replace the same main-thread database only when the loaded controller version/hash matches. Adapt still-live in-memory staged commands only under that same exact compiled-code match; otherwise retain the old readable state and commands, suspend account staging/push, and expose `update-required`.
    1. Direct mode makes no refresh-durability promise for those in-memory commands: matching code may carry them only during the live transition, while a page refresh performs ordinary online bootstrap and may lose unpushed direct-mode intent.
    2. A same-generation version mismatch likewise remains `update-required`; direct mode cannot commission it, and matching refreshed code performs a normal full-state bootstrap.
79. If SharedWorker mode was explicitly enabled but unavailable, fail visibly; do not silently fall back to direct mode.

80. Add future-replica commissioning and dormant-command activation.
81. Add exact `useCommissionFrontendReplica(ReactFrontend)` returning `{ commission, release }`, with each method returning `Promise<Either.Either<void, IAnyError>>`.
82. Reject commissioning in direct/unsupported mode and for a candidate not yet ordinarily routable; create no partial target.
83. Authenticate through Config, request target full state, create/migrate/hydrate the version-specific database, mark it ready, open its own target socket, and persist a `commissioned` locator only after readiness.
84. Keep commissioned replicas current on server data but forbid user staging, command execution, and push.
85. Leave dormant source-version commands in their generation journal and do not adapt or optimistically apply them while only old JavaScript is loaded.
86. On matching target JavaScript activation, open each recorded source partition, read dormant commands, and run direct compiled old-to-current payload adapters plus current contract programs without mutating a main-thread database.
87. Submit byte-exact source command, source locator, adapted same-ID command, and current encoded mutations to the target journal; commit target intent/materialization before marking the source migrated.
88. Make transfer idempotent: the same command ID succeeds only for identical target bytes, and a crash between target commit and source marker loses or duplicates nothing.
89. Enable target push only after every required import commits, then replace the main-thread state, promote the target owner/locator to active, and release the source acquisition last.
90. Fail closed on a missing historical definition/adapter while retaining source journal bytes, source replica, and commissioned target.
91. Apply the same version-specific replica switch to service frontends without command adaptation.
92. For a same-generation contract-only/frontend-code version change with byte-compatible model/projection definitions, create no generation boundary or artificial frontend-index increment; continue compatible old-version archive consumption but suspend repair/staging/push until matching target code activates. Reject any model/projection-schema change from this path and require a new system generation.

93. Implement single- and multi-generation client transitions without repointing source databases.
94. Let a ticket target the authenticated final generation while the resume frame reports the source replica generation/index.
95. Settle every remaining source-generation pushed outcome before the first boundary marker.
96. On transition control, persist pending transition state and acquire a separate target-generation replica, reusing an already commissioned target when available.
97. Before target state reaches the main-thread database, require loaded frontend version and canonical spec hash to equal the authenticated target.
98. If compiled code does not match, keep the target commissioned/streaming, retain source database/acquisition/journal, suspend account staging/push, and expose `update-required`.
99. With matching code, transactionally replace the existing main-thread database from target snapshot J, discard target callbacks at or below J, activate dormant commands, switch `replicaGenerationId`, promote the target locator without extending auth expiry, and release source last.
100. For a multi-generation skip, consume only the source's remaining contiguous indexed suffix and next boundary, then use the informational ordered later-boundary descriptors to acquire the final target directly.
101. Do not advance the source worker through informational intermediate descriptors or expose later indexed blocks before final-target state establishes the new watermark.
102. Adapt each dormant command directly from its original payload version to final current code and retain its original source journal locator.
103. Resume a persisted pending transition when a later matching Config/Provider appears; never discard source state merely because no matching code was mounted when the control arrived.

104. Implement fail-closed full-state repair and physical-corruption policy.
105. Enter `repairing` on a logical gap, wrong target, invalid block, equal-index content mismatch, or application failure.
106. Repair same-generation authority in place and convert successor-generation authority into the target-transition path; never install successor state into an ancestor database.
107. For account repair, replace authoritative resources/server lifecycle rows then reapply only healthy journal overlays not represented by pending state/watermarks, in pushed then staged order.
108. For a physically corrupt service replica online, build a new database name, hydrate it, atomically repoint the catalog, fan replacement, and quarantine old bytes; offline, fail and wait for network.
109. For a corrupt new-format account materialization, verify the separate journal first, rebuild from server state plus that journal, and atomically repoint only after success.
110. For a corrupt journal or legacy database that may contain the only staged commands, fail visibly and preserve all bytes for the deferred operator recovery tooling.
111. Commit catalog repoint, status, database name, and indices in one partition transaction before Provider replacement.
112. Treat equal frontend index with unequal canonical resource/server-lifecycle content as corruption rather than preferring local rows.
113. Add online/offline service rebuild, healthy-journal account rebuild, corrupt-journal preservation, legacy quarantine, rollback, and catalog-swap tests.

114. Expose separate diagnostics and session `workerState` without leaking credentials or command payloads.
115. Add `workerState` to account and service initialized session families and Config/DevTools frontend listings.
116. Include `mode`, `status`, `bootstrapSource`, `frontendIndex`, `replicaIndex`, `databaseName`, and typed encoded failure exactly as approved.
117. Support `shared-worker | direct`, every approved lifecycle status, and `network | replica | null` bootstrap source; keep direct-mode replica index/database name null.
118. Preserve separate account and service replica listing APIs with target identity, version, database name, status, indices, active provider count, socket/reconnect state, and last encoded failure.
119. Add DevTools views for active/commissioned role, pending generation transition, worker state, journal health, and separate catalog families.
120. Never expose database handles, signature/token values, WebSocket tickets, raw command payloads, or journal bytes in listing/DevTools state.
121. Update the existing DevTools stores, session routes, SharedWorker route, tests, and direct session registration without adding a combined nullable registry API.

122. Add the complete acceptance matrix at the two highest runtime seams.
123. Extend Shopping workerd generation and frontend flows to prove finite freeze bounds, pre/post-freeze projection classification, no-emission successor replay, exactly one boundary, continuous account/service indexes, archive ticket readiness, exact ancestor resume, transition control, fresh tickets, state-required failures, terminal account outcomes, admitted-write settlement, and predecessor-room shutdown.
124. Add a real Chromium React/SharedWorker suite with SharedWorker explicitly enabled and actual IndexedDB/VFS behavior rather than mocked server/socket behavior.
125. Prove online auth before hydration, ready-replica startup without full state, transport-only cached offline startup, auth rejection/expiry refusal, all-version locator invalidation, and byte preservation.
126. Prove two tabs/Providers share one worker replica/socket while retaining separate main-thread databases and one refresh per committed worker transaction.
127. Prove snapshot-before-callback, Provider remount, one-session repair isolation with a concurrent block, fresh-ticket reconnect, gap replacement in the same database object, port disposal releasing every owned registration, Config unmount releasing every capability/acquisition, and zero-owner socket/reconnect shutdown without deleting retained bytes. Prove `useCommissionFrontendReplica().release()` has the same last-owner behavior.
128. Prove journal-first offline staging, refresh survival, generic rematerialization without rerunning contracts, one later push, terminal rejection rollback, auth revocation, uncertainty reconciliation with the same ID, and closed-generation dormancy.
129. Prove successor and permitted model-schema-identical same-generation commissioning, no dormant execution before activation, matching-code activation, unmatched-code `update-required`, direct-mode live staged-command treatment, and explicit SharedWorker-unavailable failure. Inject interrupted service commissioning and prove online failed-row rebuild; inject interrupted account commissioning and prove preservation until journal/unique-command ownership is verified.
130. Add focused Node tests for cache TTL/parsing/invalidation, provider authority outcomes, provider failover, zero-owner disposal, queue/base-index ordering, callback repair barriers, capability rejection, canonical/model-schema generation gates, both interrupted-commissioning policies, crash recovery, command retry/handoff idempotency, historical adapters, and corruption.
131. Add compile-time tests for registry key equality, provider/PartitionApi signatures, two-method acquired APIs, target-bound unions, and service read-only absence.

132. Synchronize architecture and reference documentation after implementation.
133. Use the update-architecture workflow only after the source topology is final.
134. Update `wiki/architecture/bootstrapBrowserSession.md` for Config-owned authentication, online-first identity, cached-offline fallback, worker/direct modes, hydration barriers, and Provider databases.
135. Update `wiki/architecture/FrontendWebSocket.md` for first-frame resume, replay-complete, state-required, transition-required, reconnect, distinct service route, and superseded rooms.
136. Update `wiki/architecture/Blockchain.md` for account/service lineage blocks, terminal tables, frontend index continuity, journal ownership, and physical generation segments.
137. Update `wiki/architecture/DeploySystem.md` for finite write drain, frozen projection bounds, no-emission target preparation, archive readiness, routing switch, and deferred cleanup.
138. Update `FrontendApi.md`, the plan 033 service gateway/repo pages, SharedWorker/API references, React/session references, `wiki/index.md`, and `wiki/glossary.md`.
139. Refresh every source path, line range, hash, diagram, and wiki log entry; leave the approved retention/recovery TODOs deferred and accurate.

140. Perform the final atomic-removal and invariant audit.
141. Prove online startup never exposes cached identity before authoritative comparison and domain auth failure never falls back to cache.
142. Prove one active worker replica owns one serialized queue/socket and every worker-visible commit advances `replicaIndex` exactly once after durability.
143. Prove every target boundary validates complete identity, frontend version where local, spec hash where required, and exact next index before mutation.
144. Prove full encoded commands survive main thread, journal, worker callbacks, push, server terminal tables, repair, and generation handoff.
145. Prove account and service catalogs/APIs/states/blocks/routes remain separate and service sessions expose no command/query/push surface.
146. Prove source databases/journals survive version/generation transition and are released only after target snapshot and dormant-command activation commit.
147. Prove there is no automatic deletion, in-place authored replica schema migration, adapter chain, silent direct fallback, generation-reset index, fake boundary delta, or legacy persisted-state fallback.
148. Keep both plans active until focused, workerd, real-browser, corruption, documentation, affected, and repository-hygiene checks all pass.

## Testing and Verification

1. Build and verify core contracts, factories, transaction application, and SystemSpec behavior first.

   ```text
   nx run @zerospin/core:lib --skip-nx-cache
   nx run @zerospin/core:ts --skip-nx-cache
   nx run @zerospin/core:test --skip-nx-cache
   nx run @zerospin/core:lint --skip-nx-cache
   ```

2. Generate and test the new SharedWorker partition migration before runtime tests.

   ```text
   nx run @zerospin/shared-worker:drizzle:partition --skip-nx-cache
   nx run @zerospin/shared-worker:lib --skip-nx-cache
   nx run @zerospin/shared-worker:ts --skip-nx-cache
   nx run @zerospin/shared-worker:test --skip-nx-cache
   nx run @zerospin/shared-worker:lint --skip-nx-cache
   ```

3. Run authoritative server and dispatch checks, including both current dispatch workerd targets.

   ```text
   nx run system-worker:lib --skip-nx-cache
   nx run system-worker:ts --skip-nx-cache
   nx run system-worker:test --skip-nx-cache
   nx run system-worker:lint --skip-nx-cache
   nx run system-worker:test:workerd --skip-nx-cache
   nx run @zerospin/dispatch-worker:test:workerd:dev-seeds-clean --skip-nx-cache
   nx run @zerospin/dispatch-worker:test:workerd:dev-seeds-non-clean --skip-nx-cache
   ```

4. Run frontend, React, and DevTools package checks after server and worker contracts are coherent.

   ```text
   nx run-many -t lib,ts,test,lint -p @zerospin/frontend @zerospin/react @zerospin/devtools --skip-nx-cache --nxBail
   ```

5. Run Shopping's highest server and real-browser seams.

   ```text
   nx run shopping:ts --skip-nx-cache
   nx run shopping:lint --skip-nx-cache
   nx run shopping:test:workerd --skip-nx-cache
   nx run shopping:test:vitest:browser --skip-nx-cache
   nx run shopping:test:playwright --skip-nx-cache
   ```

6. Run the complete resolved package set and affected graph after focused checks pass.

   ```text
   nx run-many -t lib,ts,test,lint -p @zerospin/core system-worker @zerospin/shared-worker @zerospin/dispatch-worker @zerospin/frontend @zerospin/react @zerospin/devtools --skip-nx-cache --nxBail
   nx affected -t lib,ts,test,lint --skip-nx-cache --nxBail
   ```

7. Search for stale and prohibited surfaces.

   ```text
   rg -n "mutationsJsonSchema|ws-subscriber|replicatedResources" packages examples wiki
   rg -n "generateSignature" packages/react/src examples/shopping
   rg -n "accountFrontendReplicas|serviceFrontendReplicas|replicaIndex|IEncodedFrontendMutation|lineage-transition-required" packages examples wiki
   rg -n "ServiceFrontend.*(pushCommands|stageCommand|execute.*Query)|service.*command journal" packages
   ```

8. Validate architecture freshness and final repository hygiene.

   ```text
   .llmwiki/freshness.sh --stale-only
   git diff --check
   git status --short
   ```

9. Classify any pre-existing WIP, active-plan failure, or unrelated aggregate-target failure separately with exact evidence; do not fix outside this plan merely to make aggregate checks green.
10. Keep this plan active until the complete server, worker, browser, direct-mode, commissioning, transition, repair, corruption, documentation, and negative-surface matrix is implemented and verified.

## Guardrails

1. Preserve unrelated WIP, active plan behavior, and source-spec decisions. Do not normalize or rewrite files outside the exact implementation surface.
2. Do not add `ALLOWED_CAST`, opportunistic `as const`, bolt-on intersection types, or assertions that hide factory or capability typing defects.
3. Add no helper, wrapper, utility, service, named type, interface, runtime module split, data-processing loop, public RPC, export, or barrel beyond the exact approved inventory without a separate proposal and explicit approval.
4. Keep account and service controllers, sessions, network programs, provider capabilities, repositories, registry tables, state/block unions, listings, tickets, and routes distinct.
5. Authenticate online before hydration; use cached identity only after transport failure, never after domain rejection, and never extend its expiry offline.
6. Persist no signatures, bearer tokens, bound RPC capabilities, WebSocket tickets, database handles, or raw command payloads in identity cache or diagnostics.
7. Keep full encoded command shapes and byte-exact source/adapted provenance through journal, replica, callback, push, terminal, repair, and migration boundaries.
8. Do not rerun authored contract programs in the SharedWorker. Run current programs and historical payload adapters only in compiled main-thread code.
9. Do not migrate authored resource schemas in place between frontend versions; create a new physical replica database and preserve old bytes until an atomic switch succeeds.
10. Do not skip or reset a frontend index, treat a boundary as an empty delta, accept a conflicting duplicate, retry a spent ticket, or silently continue after missing ancestry.
11. Do not delete or compact replica databases, journals, lineage archives, predecessor descriptors, terminal rows, or possible unique intent automatically.
12. Do not silently fall back from explicitly enabled SharedWorker mode to direct mode, let `isInitialized` imply connectivity, or let a dead Provider tear down a Config-owned acquisition.
13. Do not stage, adapt, or push commands into a commissioned replica before matching target code activates and every journal import commits.
14. Do not ship partial happy-path-only behavior. Offline, auth failure, transport uncertainty, reconnect, repair, deferred transition, commissioning, direct mode, corruption, and documentation must land in the same completed pair.
