# 033 — Service-Owned Actors and Frontend Controllers Implementation Plan

**Source spec:** `../archived/033-spec-service-owned-actors-and-frontend-controllers.md`

**Companion plan:** [`034 — Offline Frontend Replicas and Continuous Frontend Lineage`](./034-plan-offline-frontend-replicas-and-continuous-lineage.md)

## Summary

1. Add first-class service-owned actor and frontend controller factories without routing service readers through account controllers, account rows, actor rows, account commands, or writable sessions.
2. Serialize and compatibility-check the service actor/frontend graph, including one required stored-SystemSpec migration that writes `actorControllers: {}` before the stricter schema decodes old rows.
3. Add a distinct `getServiceFrontendApi(...)` admission path that authenticates once to an `actorId` and returns immutable target metadata, the complete service frontend spec, and a capability limited to state repair/bootstrap and WebSocket-ticket minting.
4. Add actor-specific `ServiceFrontendRepo` and `ServiceFrontendBlockRepo` Durable Objects behind the singleton `ServiceBlockRepo`, with snapshot-plus-catch-up initialization, contiguous frontend indexes, durable outboxes, target-bound blocks, and no empty blocks for irrelevant service changes.
5. Add explicit read-only service session and React surfaces while keeping account and service types, APIs, repositories, tables, routes, and runtime behavior separate.
6. Implement the browser half directly on plan 034's final replica, replay, repair, and lineage substrate; do not create a temporary Provider-owned service socket, account-shaped compatibility path, or service-only persistence mechanism.
7. Verify the complete service branch through controller/type tests, SystemSpec migration and compatibility tests, real workerd Durable Object acceptance, the companion Chromium suite, synchronized architecture documentation, and current Nx targets.

## Relationship to Active Plans and WIP

1. Treat plans 033 and 034 as one coordinated delivery.
   1. Plan 033 owns service-only controllers, serialization, admission, repository projection, wire/session surfaces, route/ticket separation, and service acceptance assertions.
   2. Plan 034 owns the shared account/service browser replica runtime, cached identity policy, command journal, replay/reconnect/repair protocol, commissioning, and continuous cross-generation lineage.
   3. Implement 033's server and controller foundations before the 034 browser runtime consumes them, but do not ship or archive either plan until both plans' shared protocol and acceptance matrix are complete.
   4. Where both plans touch an archive, ticket, session state, or browser bootstrap, write the final 034-aware shape once rather than landing an intermediate 033-only form and replacing it later.
2. Preserve active plans 008 and 009 as the current service/account replication baseline.
   1. Keep the current table-bound references, prefixed repo identities, merged resource/control schemas, grouped service snapshots, AccountRepo watermark alignment, and singleton ServiceBlockRepo durable delivery queue.
   2. Do not restore `replicatedResources`, pre-008 repo names, per-resource service watermarks, or an AccountRepo-owned service queue.
   3. Add the service-frontend subscriber family beside ServiceBlockRepo's account subscribers; do not redirect or weaken account subscription delivery.
3. Extend active plan 031's fixed, server-selected WebSocket admission.
   1. Keep account `/ws-frontend-blocks` tickets and the direct hibernating `FrontendBlockRepo` upgrade boundary.
   2. Add a distinct service ticket storage contract and `/ws-service-frontend-blocks` route; never accept a caller-selected repo name or reuse an account ticket kind.
   3. Let plan 034 extend both routes with in-band resume, suffix replay, transition controls, and fresh-ticket reconnect rather than replacing server-selected routing.
4. Follow active plan 032's controller-version and SystemSpec validation boundary.
   1. Require non-empty authored versions on both new service controller factories at compile time and runtime.
   2. Keep each validation direct in its owning factory; do not add a shared version validator.
   3. Decode the final SystemSpec before persistence and compatibility comparison without moving ownership across CLI, dispatch-worker, or system-worker runtimes.
5. Preserve the current unstaged mutation-schema and documentation WIP byte-for-byte while creating this plan.
   1. The existing changes in `packages/core/src/system/SystemSpecSchema.ts`, `packages/core/src/system/checkSystemCompatibility.ts`, `packages/core/src/system/checkSystemCompatibility.node.spec.ts`, `packages/core/src/system/makeSystemSpec.ts`, `packages/core/src/system/makeSystemSpec.node.spec.ts`, and `packages/core/src/system/types.ts` remove serialized `mutationsJsonSchema` and its compatibility logic.
   2. The existing `TODOS.md`, `wiki/architecture/DeploySystem.md`, and `wiki/glossary.md` edits record the approved topology and only genuinely deferred retention/recovery work.
   3. Build implementation on those edits after their ownership is resolved; never restore mutation-result schema serialization, rewrite the WIP for plan formatting, or add an equivalent compatibility field.
6. Preserve archived plan 027's full pushed-command provenance and archived plan 028's narrow local mock behavior.
   1. Service frontends receive no pushed-command path at all.
   2. Plan 034's account changes must retain `admissionLastAccountCursor`, stale-guard revalidation, pushed-block idempotency, and full encoded commands.
   3. The mock provider remains local-only and gains no remote service query, ticket, socket, push, or simulated live transport behavior.

## Implementation

1. Establish an implementation baseline and lock the pair's ownership before source edits.
   1. Record `git status --short`, the active plan files, and the exact current diffs in the nine tracked WIP files before editing.
   2. Search current production and tests for `makeServiceController`, `serviceControllers`, `getFrontendApi`, `FrontendApi`, `ServiceRepo`, `ServiceBlockRepo`, `FrontendRepo`, `FrontendBlockRepo`, `/ws-frontend-blocks`, `IFrontendState`, and browser bootstrap ownership.
   3. Treat current architecture pages as the description of the account path and the approved specs as the target for the new service path; do not infer target behavior from stale method names.
   4. Keep the approved named inventory from the two specs as the only pre-authorized new functions, types, capabilities, repositories, routes, and hooks.
   5. Before adding any additional helper, wrapper, named type, shared service, data-processing loop, or export not named by the specs, stop and present its exact name, purpose, and call sites for approval.
   6. Do not add an `ALLOWED_CAST` marker. If the approved contracts cannot be expressed without a cast, stop for explicit authorization rather than hiding it.
   7. Resolve one HEAD-sensitive interpretation before coding: recommend that “no repository is created on authentication failure” means no actor-specific `ServiceFrontendRepo` or `ServiceFrontendBlockRepo`, because authentication must query the existing service source of truth through `ServiceRepo`.
   8. If the requirement instead includes a previously uninstantiated `ServiceRepo`, obtain approval for eager service-repo creation during generation preparation; do not silently change deployment lifecycle to satisfy the broader interpretation.

2. Add the client-safe service frontend controller in `packages/core/src/serviceFrontendController/`.
   1. Add `makeServiceFrontendController` with the exact authored inputs `systemName`, `serviceName`, `actorName`, `frontendName`, `version`, `models`, and `signature`.
   2. Preserve the literal five identity/version fields in its inferred return and expose only `models`, `modelNames`, and `signature` beyond them.
   3. Require an explicit `models` property while accepting `{}`; do not default an omitted frontend model registry.
   4. Validate only the ownership available at this factory boundary: every local model registry key, referenced model identity, reference closure, and service ownership. The actor, service-controller, and system registries perform the cross-controller checks once their owning registries exist.
   5. Reject an empty or non-string version directly in this factory, matching the plan 032 boundary without extracting a validator.
   6. Add `makeServiceFrontendControllerSpec` in the same module family. Encode the complete model definitions and signature JSON Schema required by plans 033 and 034, but no system name, account fields, contracts, guards, commands, queries, adapters, authentication callback, or `modelNames`-only substitute.
   7. Keep defining types in `packages/core/src/serviceFrontendController/types.ts`; do not add an `index.ts`, re-export module, conditional account/service controller type, or selective SDK barrel.
   8. Add focused `.node.spec.ts` and `.typecheck.ts` coverage for literal preservation, exact keys and model objects, empty models, signature inference, invalid identity, invalid ownership, and absence of writable/query surface.

3. Add the server-only service actor controller in `packages/core/src/serviceActorController/`.
   1. Add `makeServiceActorController` with `name`, `version`, complete actor-readable `models`, and `frontends` bindings.
   2. Keep each one-consumer binding shape in this module. A resolved binding contains its registry `name`, `frontendController`, that controller's exact models, and `authenticate` callback only.
   3. Type `authenticate` to receive the decoded frontend signature and a read-only `Pick<IDb<IResourceDbConfig<ACTOR_MODELS>>, 'query'>` facade, and to return an `IActorId` Effect with its authentication requirements preserved.
   4. Enforce the checks owned by the actor boundary: each frontend binding key equals the bound controller's `frontendName`, each bound controller's `actorName` equals this actor's `name`, and every frontend model is an exact-object subset of the actor models. Defer service-name/system-name checks to the service and system factories that own those names.
   5. Accept empty actor models and frontends. Do not add selections, predicates, authorization, queries, contracts, adapters, command factories, a `ServiceActorRepo`, or a runtime actor record.
   6. Reject an empty or non-string actor-controller version directly in the factory.
   7. Add direct node and typecheck cases for valid inference and every erased-JavaScript mismatch without extracting a shared registry validator or parameterized test loop.

4. Extend `makeServiceController` and the system registry with service actor controllers.
   1. Update `packages/core/src/service/makeServiceController.ts` and `packages/core/src/service/types.ts` so authored `actorControllers` is optional at the input boundary, defaults to `{}`, and is always present on the returned controller.
   2. Preserve the existing service models, contracts, mutation adapters, queries, command construction, server-only marker, version validation, and current direct runtime checks.
   3. At the service factory boundary, enforce each actor registry key/name pair, every bound frontend's `serviceName`, and every actor model as an exact-object subset of the service models; retain the actor factory's frontend/actor checks without trying to validate the future system registry here.
   4. Do not merge account/service models or contracts, infer service actors from account actors, or add a generic controller-owner abstraction.
   5. Extend the existing service factory node/typecheck tests with omitted/empty/nonempty actor maps, literal names, model subset and exact-object failures, and wrong binding ownership.
   6. Update `packages/core/src/system/makeSystem.ts` and its node/typecheck coverage so every service registry key equals the service controller name, every nested service frontend's `systemName` equals the owning system name, and the nested service actor/frontend graph is retained without changing account-system inference.

5. Serialize the service actor/frontend graph and migrate stored specs exactly once.
   1. Extend `packages/core/src/system/types.ts`, `makeSystem.ts`, `SystemSpecSchema.ts`, and `makeSystemSpec.ts` with required `actorControllers` under every serialized service controller.
   2. Encode each service actor's `name`, `version`, complete repeated model definitions, and frontend bindings; encode each binding's registry `name` and client-safe service frontend controller.
   3. Encode each service frontend's `serviceName`, `actorName`, `frontendName`, `version`, complete repeated model definitions, and `signatureJsonSchema`; omit redundant `systemName` and every server/runtime function or writable surface listed in the spec.
   4. Preserve deterministic model/history/controller output and the current payload-only contract spec. Do not restore `mutationsJsonSchema` or serialize authentication behavior.
   5. Extend `checkSystemCompatibility.ts` with service actor/frontend add, remove, identity, version, signature, and directional model comparisons; propagate severity frontend to actor to service to system.
   6. Mark projected model additions, removals, and definition changes as requiring a new generation; do not make an authentication-only actor model-set change require one unless it changes a frontend projection or projected definition.
   7. Replace `migrateSystemRepo.ts`'s current permanent early return on `isMigratedRepoExplorer` with ordered idempotent migrations: always run `migrateDb`, raw-read non-null `activeSystemSpec` and `preparingSystemSpec`, write `actorControllers: {}` into every legacy service spec, then record a new one-time migration marker.
   8. Complete that raw rewrite before any query decodes those columns with the required `SystemSpecSchema`, and update SystemRepo's registered table-name list for every new table.
   9. Do not make the schema field optional, accept a legacy union, add a nullable default, or retain a permanent fallback reader.
   10. Add SystemSpec encoding, schema, compatibility, generation-selection, deterministic-ordering, empty-registry, and raw pre-migration storage tests, including a real `SystemRepo/migrateSystemRepo.workerd.spec.ts` seam.

6. Add the distinct service frontend wire and core session surface in `packages/core/src/serviceSession/`.
   1. Define the approved `IServiceFrontendBlock` and `IServiceFrontendState` exactly as specified, reusing `IFrontendDelta` while preserving complete service/actor/frontend target identity.
   2. Keep `frontendIndex` as the only client convergence watermark and `lastServiceCursor` as block provenance only; omit service cursor, deploy/environment/account identity, and command lifecycle data from state.
   3. Add explicit `makeServiceSession`, `IServiceSession`, `IServiceSessionState`, and `IInitializedServiceSessionState` rather than branching or making writable fields optional on `makeSession` and `ISession`.
   4. Give initialized service state its session and target identity, system/generation metadata, model/schema/database handles, frontend/replica indices, `workerState`, telemetry, and initialization lifecycle in the final plan 034 shape.
   5. Expose no `stageCommand`, command tables, push queue, push pause, contracts, adapters, remote query API, or signature generator through the service session.
   6. Add the target-bound service block decoder in `ServiceFrontendBlockSchema.ts` before server repositories consume the contract.
   7. Put service state/block validation and transactional application in this module family only after plan 034 fixes the replica fields. Before adding proposed `applyServiceFrontendState` or `applyServiceFrontendBlock` Effects, request approval with their exact call sites rather than extracting an incidental abstraction silently.
   8. Preserve the existing deep package-export convention; add no feature barrel or re-export from account session modules.
   9. Add node and typecheck coverage for exact target validation, declared-model-only state, contiguous block application, wrong-target/gap rejection, and the absence of account-only methods and tables.

7. Add generation-scoped Durable Object identities and bindings for the service projection pair.
   1. Extend `packages/system-worker/src/systemWorkerAbbreviations.ts` with the two internal repo prefixes required for `ServiceFrontendRepo` and `ServiceFrontendBlockRepo`, preserving exact literal inference at the owning registry rather than adding scattered assertions.
   2. Key both repositories by `{ generationId, serviceName, actorName, actorId, frontendName }` and add direct `getServiceFrontendRepo` and `getServiceFrontendBlockRepo` lookup boundaries in their same-named repository folders.
   3. Add `ServiceFrontendRepo` and `ServiceFrontendBlockRepo` exports only from the Cloudflare Worker entrypoints that must bind them.
   4. Extend core `IRepoType` with both exact repository literals and propagate bindings through `SystemWorker.ts`, `system-worker/{wrangler.jsonc,wrangler.vitest.jsonc,env-types.d.ts,worker-configuration.d.ts}`, all dispatch-worker workerd configs and declarations, and Shopping/Parking host configs, entrypoints, routes, and generated declarations where they remain generic SystemWorker hosts.
   5. Append one Cloudflare migration tag that introduces both new SQLite Durable Object classes together; do not split one required projection pair across separately deployable migrations.
   6. Regenerate Worker environment declarations through existing Nx `types` targets where available; do not hand-maintain generated output when the owning target generates it.
   7. Register repository table names through the existing SystemRepo registration boundary and preserve generation identity derived from each repo's own name.
   8. Do not add an actor row, controller row, shared account/service namespace, nullable owner key, proxy Durable Object, or custom Cap'n Web transport.

8. Add query-only service authentication without creating projection state on failure.
   1. At the SystemWorker admission boundary, resolve and validate the service/actor/frontend target from the deployed `system` configuration and decode the untrusted incoming signature with that frontend's schema before invoking any trusted ServiceRepo RPC.
   2. Add `ServiceRepo/authenticateServiceFrontend/authenticateServiceFrontend.ts` with the same-named public ServiceRepo method, following the repository method convention and keeping the async class method thin. Pass only the validated target identity fields and already-decoded signature across the Durable Object RPC; ServiceRepo independently re-resolves the trusted binding from its own deployed `system` configuration before invoking `authenticate`, because the callback itself cannot cross RPC.
   3. Pass only the actor controller's readable models through the query-only database facade; make `$client`, raw SQL, transactions, writes, commands, and finalization structurally unavailable.
   4. Return only the callback result from ServiceRepo, then decode it as `IActorId` at the SystemWorker admission boundary before deriving a repository name, registration, ticket target, or bound capability identity.
   5. Use read admission for this read-only service operation and keep signature decoding and returned-identity decoding on the untrusted-to-trusted SystemWorker boundary rather than inside ServiceRepo.
   6. Ensure missing registry entries, signature decode, callback failure, and invalid actor ID leave both service projection repositories and ticket state untouched.
   7. Do not add separate authorization, a `ServiceActorRepo`, actor persistence, account provisioning, query escape hatches, or authentication result caching on the server.

9. Add `getServiceFrontendApi(...)` and its permanently actor-bound capability.
   1. Extend `packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts` with a separate validated argument record `{ publishableKey, serviceName, actorName, frontendName, signature }`; do not overload or discriminate `getFrontendApi(...)`.
   2. Resolve public key identity and a fresh SystemWorker through the existing dispatch services, then perform service authentication exactly once.
   3. Return one admission envelope containing the immutable approved identity descriptor, the complete serializable service frontend spec, and the actor-bound service capability.
   4. Add the bound gateway under `packages/dispatch-worker/src/ServiceFrontendApi/`, parallel to but distinct from `FrontendApi`, with only `getFrontendState()` and `createFrontendWebSocketTicket()` leaves.
   5. Pin system, deploy/generation, service, actor, actor ID, frontend, and frontend version identity in the capability constructor so callers cannot replace target fields on a leaf call.
   6. Preserve the existing leaf request validation, encoded Either envelope, telemetry collection/persistence, span linking, fresh SystemWorker resolution, and captured-failure capability behavior.
   7. Return the same captured authentication failure from both failure-capability leaves without resolving a repo or minting a ticket.
   8. Add only the explicit package exports needed for the new public capability modules. Do not add a combined gateway, generic owner capability, query leaf, command leaf, `fetchActor`, or service SDK barrel.
   9. Add dispatch node/typecheck tests for argument decoding, single authentication, exact admission metadata/spec, pinned leaf identity, telemetry, transport/domain errors, failure capability, and absent writable/query methods.
   10. Propose and obtain approval for the direct frontend Effects needed by the two leaves—such as `fetchServiceFrontend`, `fetchServiceFrontendState`, and `createServiceFrontendWebSocketTicket`—then place approved files in `packages/frontend/src/` with explicit package exports and no generic account/service client wrapper.

10. Add no-gap service frontend snapshot initialization.
11. Add `ServiceRepo/getServiceFrontendSnapshot/getServiceFrontendSnapshot.ts` and its same-named public method to read every row of the declared service frontend models and nullable service cursor/index N in one serialized repository transaction.
12. Return only the data and source watermark needed by the server projection; do not expose raw service blocks or service cursors to the browser.
13. Define `ServiceFrontendRepo` tables inline beside its owned materialized model tables for initialization state, source cursor/index, contiguous frontend index, and its block outbox; support an empty service baseline whose internal cursor/index are null.
14. On first `getFrontendState()`, install the snapshot and cursor N durably before asking ServiceBlockRepo to register the actor/frontend subscriber at N.
15. Treat lazy creation as registered/discoverable readiness: configure the `makeRepoUtils` calls in `ServiceFrontendRepo/ServiceFrontendRepo.ts` and `ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts` without `repoType`, using the existing optional branch in `packages/system-worker/src/makeRepo/makeRepo.ts` to suppress automatic per-repo registration during bootstrap. Complete snapshot/register/catch-up/archive through T against those deterministic unregistered identities; a retry reuses their state idempotently while ticket lookup continues to see state-required.
16. Before implementation, propose and obtain approval for one exact public `SystemRepo.registerRepos(...)` RPC implemented by `SystemRepo/registerRepos/registerRepos.ts`. Its sole new call site is the successful tail of `ServiceFrontendRepo/getFrontendState/getFrontendState.ts`; it inserts the ready `ServiceFrontendRepo` and `ServiceFrontendBlockRepo` registrations with their table-name lists in one SystemRepo transaction after archive acknowledgement through T. If that RPC is not approved, stop rather than enabling `repoType`, sequentially calling `registerRepo`, or exposing one registered half of the projection pair.
17. Extend ServiceBlockRepo with a separate persisted service-frontend subscriber table and delivery path at `ServiceBlockRepo/subscribeServiceFrontend/subscribeServiceFrontend.ts` and `ServiceBlockRepo/drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.ts`, while retaining the current account subscriber table and queue behavior.
18. In one serialized ServiceBlockRepo operation, register at N, capture terminal cursor T, and deliver exactly N+1 through T in ascending order while later live delivery remains buffered for that subscriber.
19. Do not treat registration as a `waitUntil`-only launch: `getFrontendState` must wait until every block through T is applied and acknowledged before returning the first ready state.
20. For each relevant catch-up block, require `ServiceFrontendBlockRepo/storeServiceFrontendBlocks/storeServiceFrontendBlocks.ts` to archive the emitted frontend block durably before acknowledging upstream delivery; irrelevant blocks still advance only the internal source watermark.
21. Mark the subscriber live only after T is acknowledged. A retry resumes idempotently from the deterministic unregistered state and never polls from ServiceFrontendRepo.
22. Give ServiceBlockRepo one minimum-deadline alarm scheduling authority for account and service-frontend subscriber queues so one drain cannot delete the other's retry alarm; obtain approval before extracting any alarm coordinator helper.
23. Make repeated initialization for the same complete actor/frontend key reuse the ready projection and return its current state rather than reinstalling or duplicating subscriptions.
24. If initialization fails at snapshot, registration, catch-up, or archive delivery, return a typed state-required failure while leaving both repositories unregistered and undiscoverable; retain deterministic bootstrap bytes only for idempotent retry and never expose a partially ready state or socket path.

25. Apply service blocks and publish only relevant contiguous service frontend blocks.
26. Add `ServiceFrontendRepo/ServiceFrontendRepo.ts` with direct `getFrontendState`, `handleServiceBlocks`, `drainServiceFrontendBlockOutbox`, and repo-lookup method folders; every public method delegates to its same-named `Effect.fn`, including `ServiceFrontendRepo/getFrontendState/getFrontendState.ts`.
27. Accept ServiceBlocks only in exact source-cursor order and durably advance the internal service source cursor for every accepted block.
28. For an irrelevant block, commit only the source cursor and emit no frontend block or frontend-index increment.
29. For a relevant block, apply only mutations for the frontend's declared models, increment the actor-specific `frontendIndex` by one, and write one complete `IServiceFrontendBlock` to the outbox in the same transaction.
30. Preserve the exact encoded resource delta and complete service/actor/actor ID/frontend target; reject any mismatch before a database mutation.
31. Add `ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts` with the exact `ServiceFrontendBlockRepo/storeServiceFrontendBlocks/storeServiceFrontendBlocks.ts` append method and a repo-lookup method folder, then drain the projection outbox to it and acknowledge only after idempotent archive append; plan 034 owns its replay/handshake method folders.
32. Keep ordinary retry scheduling in Effect and persist only terminal failure state; do not add delivery-attempt counters, polling, skipped indexes, or silent resubscription.
33. Implement the final strict archive, duplicate-byte, replay, readiness, predecessor, and retention rules directly with plan 034; do not first add a latest-only room or generation-reset index.

34. Add the distinct service WebSocket ticket and route boundary.
35. Add a separate `serviceFrontendWebSocketTickets` table plus `createServiceFrontendWebSocketTicket` and `consumeServiceFrontendWebSocketTicket` same-named SystemRepo method folders with hash-only credential storage, exact target binding, short expiry, one-use consumption, and the current cleanup/admission policy.
36. Bind tickets to generation, service, actor name, actor ID, and frontend name, and derive the `ServiceFrontendBlockRepo` target only from the actor-bound capability.
37. Before resolving a ServiceFrontendRepo stub, check the expected actor-specific repo name in SystemRepo registrations; if absent, return state-required so ticket-before-state cannot instantiate the projection it is meant to reject.
38. Make ticket minting wait until the projection is initialized and its outbox/archive covers the state or boundary index advertised to the caller.
39. Return a typed state-required/readiness failure and mint nothing when that bound cannot be proven.
40. Add exact `/ws-service-frontend-blocks` handling in SystemWorker and the explicit public Worker entrypoints that already forward the account route.
41. Validate upgrade and public routing input, consume the separate service ticket, and forward directly to the hibernating `ServiceFrontendBlockRepo`; keep stateless Workers and SystemRepo out of the socket lifetime.
42. Keep account and service error surfaces and ticket kinds distinct while preserving generic external invalid-ticket responses and no raw-ticket logging or telemetry.
43. Implement plan 034's first-frame resume, strict suffix replay, transition/state-required controls, and reconnect behavior in the same final route/archive pass.

44. Add the read-only service React surface on the final Config-owned runtime.
45. Add explicit `makeReactServiceFrontend({ frontend })` under `packages/react/src/` rather than a kind branch inside `makeReactFrontend`.
46. Return the service frontend controller, Provider, React context, runtime/sync access, model-ID construction, initialized-session access, and existing typed `useLiveQuery` compatibility required by the spec.
47. Remove signature generation from the service Provider; register the frontend and generator through plan 034's `ZerospinConfig.frontendAuthenticators` registry.
48. Give every mounted Provider its own main-thread in-memory WASM database and mark it initialized only after a complete worker/direct snapshot commits synchronously.
49. Read only declared projection models from that database. Do not add `useApi`, commands, staging, push controls, command panes, or remote query fallback.
50. Integrate worker mode with the exact service provider/acquisition/replica contracts from plan 034 and integrate direct mode with the same validation/replay/repair rules but no persistence or offline startup.
51. Keep the account React factory and account session writable surface intact except for the shared Config/provider ownership changes explicitly assigned to plan 034.

52. Add the real Shopping service-owned acceptance fixture without expanding product behavior.
53. Declare one Shopping service actor and read-only service frontend using existing service models, a deterministic test authentication seam, and an explicit projected model subset.
54. Export/bind the two new Durable Objects and route through the actual Shopping Worker, dispatch capability, SystemWorker, ServiceRepo, ServiceBlockRepo, ServiceFrontendRepo, and ServiceFrontendBlockRepo.
55. Use two signatures that resolve two actor IDs and prove no account, user, or actor row is created.
56. Prove authentication can query actor-readable service models but cannot receive a writable database surface.
57. Prove admission authenticates once, returns exact identity/spec metadata, and pins state and ticket leaves to that actor.
58. Force a mutation between snapshot N and subscriber registration and prove exactly-once catch-up through T.
59. Prove relevant changes produce contiguous frontend indexes and causal service cursors, while irrelevant model changes advance only the internal source cursor and emit no block.
60. Prove two actor-specific repos receive identical currently unfiltered logical rows while retaining distinct repo names, states, tickets, and archives.
61. Prove lazy creation/reuse, ticket expiry/single use/target binding/readiness, archived suffix plus live delivery, and every injected error branch required by the spec.
    1. Put invalid returned-actor-ID and actor-bound target-mismatch injections in `packages/dispatch-worker/src/ServiceFrontendApi/ServiceFrontendApi.node.spec.ts`, asserting failure after the required ServiceRepo authentication call but before any actor-specific projection repo lookup, registration, or ticket mutation.
    2. Put registration/catch-up replay failure injection in `packages/system-worker/src/ServiceBlockRepo/subscribeServiceFrontend/subscribeServiceFrontend.node.spec.ts`, asserting both projection registrations remain absent and an exact retry resumes through T once.
    3. Put identical-retry and conflicting-duplicate archive cases in `packages/system-worker/src/ServiceFrontendBlockRepo/storeServiceFrontendBlocks/storeServiceFrontendBlocks.node.spec.ts`, asserting idempotent success only for byte-identical indexed blocks.
62. Keep browser persistence, multi-tab fan-out, offline bootstrap, repair, and direct-mode cross-product assertions in plan 034's Chromium suite rather than duplicating them here.

63. Synchronize documentation only after the final source behavior exists.
64. Use the repository's update-architecture workflow after implementation, not during an intermediate controller-only phase.
65. Add or update the distinct service gateway documentation and update `wiki/architecture/FrontendApi.md` without describing account and service capabilities as one API.
66. Update `wiki/architecture/Blockchain.md` with the parallel `ServiceRepo -> ServiceBlockRepo -> ServiceFrontendRepo -> ServiceFrontendBlockRepo` path while retaining the existing service-to-account path.
67. Update `wiki/architecture/FrontendWebSocket.md`, `bootstrapBrowserSession.md`, and `DeploySystem.md` for the service ticket route, projection readiness, shared 034 resume protocol, required SystemSpec migration, and generation behavior.
68. Update `wiki/glossary.md`, `wiki/index.md`, overview links, and enabled API reference pages for the new factories, sessions, capability, blocks, state, repositories, and exact actor-specific identity.
69. Add source-backed public API pages under the currently empty `wiki/api/` only for enabled exported surfaces; keep gateways in architecture pages.
70. Refresh every affected source path, line range, and `git hash-object` SHA and append the required wiki log entry.
71. Preserve the existing `TODOS.md` retention/recovery items as deferred. Do not implement or erase them while documenting the first retained-indefinitely version.

72. Perform the final service-branch audit before considering plan 033 complete.
73. Prove no service frontend admission creates or requires an account, user, actor row, AccountRepo, ActorRepo, AuthorizationRepo, account command, or service query leaf.
74. Prove every public and persisted service state, ticket, and plan 034 lineage/replica envelope validates complete system/generation/service/actor/actor ID/frontend identity before mutation or routing. Validate raw `IServiceFrontendBlock` against only its approved service/actor/actor ID/frontend target fields; do not add system or generation fields to that 033 wire contract.
75. Prove service actor/frontend models are exact-object subsets and serialized as complete definitions, while runtime callbacks and writable surfaces are absent from the spec.
76. Prove old stored service specs are rewritten once before strict decode and no optional or fallback schema remains.
77. Prove the no-gap snapshot/register/catch-up sequence, irrelevant-block suppression, contiguous frontend index, idempotent archive, and archive-readiness ticket barrier at the highest workerd seam.
78. Search for a service command/query/push/staging surface, a unified account/service type, caller-selected service repo name, and temporary provider-owned service socket; the searches must find no production path.
79. Keep both plans active until plan 034's worker, browser, lineage, repair, and commissioning acceptance cases also pass.

## Testing and Verification

1. Build the new core definitions before checking consumers.

   ```text
   nx run @zerospin/core:lib --skip-nx-cache
   nx run @zerospin/core:ts --skip-nx-cache
   nx run @zerospin/core:test --skip-nx-cache
   nx run @zerospin/core:lint --skip-nx-cache
   ```

2. Regenerate and validate Worker bindings after adding the two Durable Objects.

   ```text
   nx run system-worker:types --skip-nx-cache
   nx run shopping:types --skip-nx-cache
   nx run parking:types --skip-nx-cache
   ```

3. Run focused package checks through the resolved Nx projects.

   ```text
   nx run-many -t lib,ts,test,lint -p @zerospin/dispatch-worker system-worker @zerospin/frontend @zerospin/react --skip-nx-cache --nxBail
   nx run @zerospin/dispatch-worker:test:workerd:dev-seeds-clean --skip-nx-cache
   nx run @zerospin/dispatch-worker:test:workerd:dev-seeds-non-clean --skip-nx-cache
   nx run system-worker:test:workerd --skip-nx-cache
   ```

4. Run the real Shopping and route seams.

   ```text
   nx run shopping:ts --skip-nx-cache
   nx run shopping:lint --skip-nx-cache
   nx run shopping:test:workerd --skip-nx-cache
   ```

5. After the companion browser runtime is integrated, run its service acceptance coverage.

   ```text
   nx run @zerospin/shared-worker:test --skip-nx-cache
   nx run @zerospin/react:test --skip-nx-cache
   nx run shopping:test:vitest:browser --skip-nx-cache
   ```

6. Run the complete affected graph only after focused failures are resolved within scope.

   ```text
   nx affected -t lib,ts,test,lint --skip-nx-cache --nxBail
   ```

7. Search the final source for forbidden service surfaces and stale topology.

   ```text
   rg -n "getServiceFrontendApi|ServiceFrontendApi|ServiceFrontendRepo|ServiceFrontendBlockRepo|ws-service-frontend-blocks" packages examples wiki
   rg -n "service.*(stageCommand|pushCommands|execute.*Query)|ServiceActorRepo|ws-subscriber" packages examples
   rg -n "mutationsJsonSchema" packages/core/src/system wiki/architecture wiki/glossary.md
   ```

8. Validate documentation and repository hygiene.

   ```text
   .llmwiki/freshness.sh --stale-only
   git diff --check
   git status --short
   ```

9. Classify any pre-existing WIP or unrelated aggregate-target failure separately with exact evidence; do not modify unrelated files merely to make an aggregate command green.
10. Keep this plan active until every service controller, migration, admission, projection, ticket, workerd, companion-browser, documentation, and negative-surface check is complete and verified.

## Guardrails

1. Preserve unrelated WIP and every still-active plan boundary. Do not restore, normalize, reformat, or absorb current mutation-schema, TODO, or wiki edits without explicit scope.
2. Do not add `ALLOWED_CAST`, opportunistic `as const`, bolt-on intersection return types, or assertions that hide a factory/base-type defect.
3. Add no helper, wrapper, utility, service, named type, interface, registry abstraction, data-processing loop, export, or barrel beyond the approved spec inventory without a separate exact proposal and explicit approval.
4. Keep account and service controller, API, session, repository, route, ticket, table, block, state, and replica contracts distinct even when fields overlap.
5. Do not create service actor/account/user rows, account subscriptions, account commands, service frontend commands, queries, guards, mutation adapters, or authorization callbacks.
6. Do not add actor-specific filtering, selections, predicates, row-level authorization, or remote query fallback; project every row of each explicitly declared service frontend model.
7. Keep public system-worker repo methods in same-named folders and keep async Durable Object/RPC methods as thin encoded boundaries around named Effects.
8. Keep one-consumer table shapes inline in the owning repo and import symbols from defining modules; add no feature `index.ts` or non-entrypoint re-export.
9. Preserve full encoded blocks and command objects across every ledger, outbox, archive, callback, and repair boundary; do not rebuild provenance field-by-field.
10. Do not make the required SystemSpec field optional or add legacy decode branches, compatibility columns, nullable defaults, or deprecated persisted-state fallbacks.
11. Do not add archive compaction, retained-snapshot floors, subscriber/projection garbage collection, operator reset, or corrupt-journal recovery; retain the approved state indefinitely and leave the recorded TODOs intact.
12. Do not ship a partial service branch. Authentication, state, live delivery, replay, failure, deferred/resume, browser, workerd, and documentation behavior must land together with the companion 034 substrate.
13. Do not add admin/Repo Explorer methods for the new repositories without separate approval; acceptance can observe lazy creation through existing SystemRepo registrations.
