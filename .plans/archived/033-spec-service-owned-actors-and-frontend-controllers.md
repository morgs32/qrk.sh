# Service-owned actors and frontend controllers design

**Date:** 2026-07-24

**Status:** Approved for planning

**Companion design:** [034 — Offline frontend replicas and continuous frontend lineage](./034-spec-offline-frontend-replicas-and-continuous-lineage.md)

## Problem Statement

Services can own models, contracts, mutation adapters, and queries, but they cannot statically declare actors or frontend controllers. The only existing actor/frontend topology is account-owned, and its runtime projection chain depends on `AccountRepo`, `ActorRepo`, account authorization, account commands, and writable frontend sessions.

That account topology does not fit a read-only service frontend. A service frontend must authenticate a caller to an `actorId`, materialize the service data declared by its frontend, and stream later changes without creating an account, user row, actor row, account command path, service query escape hatch, or writable session.

The service topology must still follow the established account-side controller, serialization, capability, repository, and React boundaries wherever its read-only nature does not require a difference. It must also partition projections by `actorId` now even though all actors of one service actor type currently receive identical selected rows.

Persistent browser replicas, cached identity, account command durability, replica commissioning, and cross-generation frontend lineage are shared account-and-service concerns. They are specified once in the companion 034 design rather than duplicated here.

## Solution

Add a parallel service-owned actor/frontend topology. A service controller statically owns service actor controllers. Each service actor declares the service models it may read during authentication, and each service frontend declares the subset that must be fully materialized for its UI.

Admission occurs through `getServiceFrontendApi(...)`. It authenticates once, returns authoritative identity metadata alongside an actor-bound capability, and never creates an actor row. The capability exposes only full-state repair/bootstrap and WebSocket-ticket minting. It has no commands or queries.

The server projection chain is:

1. `ServiceRepo` remains the service source of truth.
2. The singleton `ServiceBlockRepo` archives service blocks and persists actor-specific `ServiceFrontendRepo` subscribers.
3. Each `ServiceFrontendRepo` snapshots its declared model subset at a service cursor, registers that cursor, and catches up from the archive without a gap.
4. Each relevant change advances a contiguous actor/frontend `frontendIndex` and enters the projection's outbox.
5. The one-to-one `ServiceFrontendBlockRepo` durably archives each delivered frontend block and owns its actor-specific WebSocket room.
6. The browser consumes the service state and blocks through the read-only service-session surface defined here and the replica lifecycle defined in 034.

## User Stories

1. As a system author, I want a service controller to declare actors and frontends without routing them through an account.
2. As a system author, I want service authentication to resolve an `actorId` without creating a user or actor row.
3. As a service frontend author, I want to declare the exact service models required by the UI.
4. As a service frontend author, I want authentication to read service data without receiving any write-capable database API.
5. As a caller, I want one successful authentication to bind both state and socket admission to the same actor identity.
6. As a caller, I want authoritative identity metadata before downloading a full state so an existing replica can be used on normal online startup.
7. As a caller, I want all declared rows locally materialized before the provider becomes initialized.
8. As a future system author, I want projections partitioned by `actorId` before actor-specific filtering exists.
9. As a connected client, I want only relevant service changes represented by contiguous frontend blocks.
10. As a connected client, I want every block to carry its complete target so a misrouted block is rejected.
11. As a React consumer, I want a service session with no query, command, staging, push, or mutation-adapter surface.
12. As a deployer, I want service actors and frontends serialized and compatibility-checked with the same rigor as account actors and frontends.
13. As a maintainer, I want the real Durable Object projection chain covered by workerd acceptance tests.

## Implementation Decisions

### 1. Static controller topology

1. Service actors and frontends are first-class service-owned topology. They are not account-backed actors, account projections, or service-triggered account provisioning.
2. Add the public factories `makeServiceActorController` and `makeServiceFrontendController`.
3. Leave `makeActorController`, `makeFrontendController`, and the account controller graph intact. Shared browser and generation changes are owned by 034 rather than hidden in these factories.
4. `makeServiceFrontendController` has this authored shape:

```ts
const catalog = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  signature: Schema.Struct({ subject: Schema.String }),
});
```

5. Its returned controller preserves the literal `systemName`, `serviceName`, `actorName`, `frontendName`, and `version`; exposes `models`, `modelNames`, and `signature`; and has no account name, contracts, guards, command constructor, or mutation adapters.
6. `makeServiceActorController` has this authored shape:

```ts
const shopper = makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { credential: Credential, product: Product },
  frontends: {
    catalog: {
      frontendController: catalog,
      authenticate: ({ signature, db }) => Effect.succeed(actorId),
    },
  },
});
```

7. The signature schema remains on the client-safe frontend controller. The server-only `authenticate` callback remains on the actor's frontend binding, matching the account controller split.
8. Each resolved binding contains its registry `name`, `frontendController`, the frontend controller's `models`, and `authenticate`. It does not gain account selections, authorization, actor queries, contracts, adapters, or command constructors.
9. `makeServiceController` accepts `actorControllers` beside its existing fields:

```ts
const app = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { credential: Credential, product: Product },
  contracts: {},
  actorControllers: { shopper },
});
```

10. `actorControllers` may be omitted by an author and defaults to `{}` at the factory boundary. It is always present on the returned controller and in the serialized system specification.
11. Actor `models` and `frontends` may be empty. A service frontend must explicitly provide `models`, but `{}` is valid for a signature-only or identity-only frontend. This preserves the permissive account-controller pattern.
12. The current projection includes every row of every declared frontend model. There are no service actor selections, predicates, per-actor filters, or row-level authorization in this design.
13. Controllers remain static deployed configuration. Durable projection repositories are created lazily; no controller record is created at runtime.

### 2. Compile-time and runtime consistency

1. The system registry key must equal the service controller's `name`.
2. Each `actorControllers` key must equal its actor controller's `name`.
3. Each actor frontend key must equal the bound controller's `frontendName`.
4. A bound frontend's `systemName`, `serviceName`, and `actorName` must exactly equal its owning system, service, and actor names.
5. Each service, actor, and frontend model registry key must equal the referenced model's `modelName` and satisfy the existing reference-closure validation.
6. Actor models must be a subset of the service controller's models. Frontend models must be a subset of the actor controller's models.
7. A subset entry must reference the exact model object from its owning registry. Structurally identical duplicate model objects are rejected at runtime.
8. These rules are expressed in mapped factory types where TypeScript can prove them and repeated at runtime for erased JavaScript callers and structurally compatible duplicates.

### 3. Authentication and actor identity

1. The authentication callback receives the decoded signature and a query-only database view over the service actor's readable models, not merely the frontend projection subset:

```ts
(props: {
  signature: Schema.Schema.Type<FRONTEND['signature']>;
  db: Readonly<
    Pick<IDb<IResourceDbConfig<ACTOR_MODELS>>, 'query'>
  >;
}) => Effect.Effect<IActorId, IAnyError, AUTH_CONTEXT>
```

2. Restricting the database to `query` preserves the established typed relational read path while making `$client`, raw SQL, transactions, inserts, updates, deletes, commands, and finalization unavailable.
3. Authentication returns only an `IActorId`. It does not return or create an actor row, user row, or account.
4. The incoming signature is decoded with the frontend's signature schema before the callback runs. The returned actor ID is decoded at the runtime boundary before any repository identity is derived from it.
5. There is no separate authorization callback, `AuthorizationRepo`, or `ServiceActorRepo`.
6. Missing system/service/actor/frontend names, a signature decode failure, an authentication failure, or an invalid actor ID fails through the existing typed dispatch/capability error boundary. No repository is created on failure.
7. Repeated authentication is authoritative each time and may legitimately resolve a different actor ID. Each successful capability remains permanently bound to the result from its own admission. Cached-identity comparison and identity switching are defined in 034.

### 4. Service frontend admission and API

1. Add a separate `ZerospinApis.getServiceFrontendApi(...)`; do not overload or discriminate the account `getFrontendApi(...)`.
2. Its arguments are `{ publishableKey, serviceName, actorName, frontendName, signature }`.
3. The call authenticates once and returns an admission envelope containing an immutable identity descriptor, the complete serializable service frontend spec, and the actor-bound frontend capability. The identity descriptor contains `actorId`, `systemId`, `generationId`, `systemVersion`, `systemWorkerName`, `serviceName`, `actorName`, `frontendName`, and `frontendVersion`.
4. Returning the descriptor and spec with admission is the deliberate refinement that lets an online caller authenticate, validate its compiled frontend/database definition, and locate an existing browser replica without downloading the full resource snapshot.
5. The bound capability exposes exactly `getFrontendState()` and `createFrontendWebSocketTicket()`.
6. Neither capability method authenticates again. There is no `fetchActor`, service query, actor query, command, staging, push, or finalization method.
7. `getFrontendState()` remains the first-creation and repair source and repeats the bound actor and system identity so every receiving boundary can validate the response.
8. A UI that lacks required local data must add that model to its declared projection. It must not query through the service frontend capability.

### 5. Actor-specific server projections

1. Add `ServiceFrontendRepo` as the actor-specific materialized projection of the service frontend's declared models.
2. Add `ServiceFrontendBlockRepo` as its separate one-to-one archive and WebSocket owner.
3. Both repositories are keyed by `{ generationId, serviceName, actorName, actorId, frontendName }`.
4. The repositories are created lazily by the first successful `getFrontendState()` for that actor/frontend and reused by later capabilities with the same identity.
5. If a capability asks for a ticket before that projection has ever completed state initialization, it receives a typed state-required failure. It does not create a partially initialized socket path.
6. The absence of an actor row is irrelevant because `actorId` itself is the durable partition identity.
7. Bootstrap has the following no-gap protocol:
   1. `ServiceRepo` reads every row of the declared frontend model subset and service cursor N from one serialized repository transaction.
   2. `ServiceFrontendRepo` durably installs that snapshot and source cursor N.
   3. `ServiceBlockRepo` atomically registers the subscriber at N and captures its current terminal cursor T.
   4. `ServiceBlockRepo` delivers the exact archived range N+1 through T in ascending order while buffering later live delivery for that subscriber.
   5. The subscriber becomes live only after T is acknowledged.
8. `ServiceBlockRepo` persists the subscriber and uses its alarm-driven outbox/retry delivery pattern. A frontend repo never polls for blocks.
9. `ServiceFrontendRepo` accepts service blocks in exact source-cursor order and records its service source cursor for every accepted block.
10. A service block with no mutation for a declared frontend model advances only the internal source cursor and emits no frontend block.
11. A relevant block applies its resource changes, increments the actor frontend's contiguous `frontendIndex`, and writes one service frontend block to its outbox.
12. `ServiceFrontendBlockRepo` archives the block idempotently before acknowledging delivery. Archive and replay invariants shared with account frontends are defined in 034.

### 6. Approved wire contracts

1. Add exported `IServiceFrontendBlock`, reusing `IFrontendDelta`:

```ts
export type IServiceFrontendBlock = Readonly<{
  serviceName: string;
  actorName: string;
  actorId: IActorId;
  frontendName: string;
  frontendIndex: number;
  lastServiceCursor: IServiceCursorId;
  delta: IFrontendDelta;
}>;
```

2. `frontendIndex` is contiguous within one actor-specific logical service frontend and is the only client convergence watermark.
3. `lastServiceCursor` records the causal service position for provenance. Irrelevant service blocks may cause cursor jumps between emitted frontend blocks without causing `frontendIndex` gaps.
4. The complete service/actor/frontend target is encoded so every receiving layer can reject a misrouted block.
5. Add exported `IServiceFrontendState` with this exact shape:

```ts
export type IServiceFrontendState = {
  actorId: IActorId;
  systemId: ISystemId;
  generationId: string;
  systemVersion: string;
  systemWorkerName: string;
  serviceName: string;
  actorName: string;
  frontendName: string;
  frontendIndex: number;
  resources: readonly IEncodedResourceShape[];
};
```

6. The state deliberately omits `deployId`, `systemEnvironmentId`, account identity, command lifecycle rows, pushed cursors, and `lastServiceCursor`.
7. The server retains the snapshot's service source cursor internally. A client never requests or replays raw service blocks.
8. Define these service wire contracts in the service-session module, parallel to the account session contracts, and expose them through the existing deep package-export convention rather than a new feature barrel.

### 7. WebSocket admission

1. Add the separate `/ws-service-frontend-blocks` route.
2. Use a separate service frontend ticket kind and storage contract rather than reusing account frontend tickets.
3. Tickets are short-lived, single-use, and bound to `generationId`, `serviceName`, `actorName`, `actorId`, and `frontendName`.
4. Consuming a ticket can resolve only the exact `ServiceFrontendBlockRepo` encoded by the actor-bound capability.
5. Ticket minting is also the archive-readiness barrier. It waits until the projection's block outbox and archive cover the state/boundary index promised by the server, and it mints nothing on failure.
6. Resume handshakes, strict suffix replay, cross-generation ancestry, reconnect, repair controls, and fresh-ticket selection use the common account-and-service protocol in 034.

### 8. Read-only service sessions and React surface

1. Add explicit `makeServiceSession`, `IServiceSession`, `IServiceSessionState`, and `IInitializedServiceSessionState` rather than conditional writable behavior in `makeSession` and `ISession`.
2. The initialized service session contains its session ID, service/actor/frontend identity, system/generation metadata, model/schema/database references, `frontendIndex`, replica metadata, `workerState`, telemetry, and initialization lifecycle.
3. It has no `stageCommand`, staged/pushed/executed/failed command tables, push queue, push pause, contracts, command adapters, or `useApi`.
4. Add explicit `makeReactServiceFrontend({ frontend })` rather than branching inside `makeReactFrontend`.
5. Its public shape mirrors the read-only portions of `makeReactFrontend`: the frontend controller, Provider, React context, runtime/sync access, model-ID creation, initialized-session access, and compatibility with the existing typed `useLiveQuery` path.
6. The service Provider has no signature-generator prop. `ZerospinConfig` owns signature generation for both account and service frontends under 034.
7. Components read only declared models from the Provider's main-thread WASM database. Provider initialization completes only after the initial state has committed to that database.
8. Every Provider retains its own main-thread database even when multiple Providers share one persistent worker replica.

### 9. System-spec serialization and compatibility

1. Serialize `actorControllers` under each service controller. The field is required in `ISystemSpec` and `SystemSpecSchema`, including when empty.
2. A serialized service actor contains `name`, `version`, complete repeated encoded model definitions, and `frontends`.
3. A serialized frontend binding contains its registry `name` and `frontendController`.
4. The serialized service frontend controller contains `serviceName`, `actorName`, `frontendName`, `version`, complete repeated encoded model definitions, and `signatureJsonSchema`.
5. Do not serialize `systemName` redundantly inside the nested controller. Do not serialize `modelNames`, authentication functions, the read-only database facade, callbacks, queries, selections, contracts, guards, commands, or adapters on service actors/frontends.
6. Do not restore `mutationsJsonSchema` or introduce an equivalent mutation-result compatibility field. Contract payload-history changes required by offline account commands are separately defined in 034.
7. The client-facing service frontend spec uses that same complete encoded model definition rather than model-name-only references. It is the generic SharedWorker database-schema input defined further in 034.
8. Compatibility follows the existing account rules:
   1. Adding an actor, frontend, or model surface is minor.
   2. Removing one is major.
   3. Changing an owner/binding identity is major.
   4. Signature widening is minor; narrowing or incompatible change is major.
   5. Model definition changes use the existing directional model comparator and require a new generation.
   6. A version-only change is recorded as an authored version change and does not imply semantic compatibility by itself.
   7. Authentication callback behavior is not inspected because functions are absent from the serialized spec.
9. Adding or removing a service frontend's projected model changes its persisted server projection schema and always requires a new generation, in addition to its minor/major compatibility classification. A service actor authentication-only model-set change does not require a generation unless it also changes a projected model definition or frontend subset.
10. Severity propagates frontend to actor to service to system through the existing component paths.
11. Before the new required schema decodes previously stored system specs, a one-time SystemRepo storage migration adds `actorControllers: {}` to every stored service-controller spec that predates this field. Do not make the new schema optional and do not add a permanent legacy decode path.

### 10. Module and documentation ownership

1. The client-safe controller and its `makeServiceFrontendControllerSpec` encoder live under `packages/core/src/serviceFrontendController/`, parallel to the existing account frontend spec boundary.
2. The server-only actor controller lives under `packages/core/src/serviceActorController/`. Its one-consumer binding shapes stay in that module rather than a new binding package.
3. Extend the existing `packages/core/src/service/` controller types/factory with `actorControllers`.
4. Service session contracts and state application live under `packages/core/src/serviceSession/`.
5. Network programs live in the frontend package, the bound gateway lives in dispatch-worker, and `ServiceFrontendRepo` and `ServiceFrontendBlockRepo` each follow the required same-named system-worker method-folder convention.
6. Import symbols from their defining modules. Do not add a feature `index.ts`, re-export module, unified account/service controller abstraction, or selective SDK barrel export.
7. Implementation must update the architecture gateway, bootstrap, block-flow, deployment, glossary, index, and API reference pages in the same pass as source changes. Existing account documentation must remain accurate until the shared 034 changes are implemented.

### 11. Failure and retention policy

1. Invalid target identity, invalid ordering, a missing required archive row, or an impossible client index fails closed and invokes the 034 state-repair protocol. It never skips an index.
2. Service frontend blocks, predecessor descriptors, and subscriber state are retained indefinitely in the first implementation. There is no silent compaction.
3. Expired and consumed tickets may be deleted according to the existing ticket cleanup policy because they are not replay history.
4. Archive compaction, subscriber garbage collection, and projection garbage collection require a later design with an explicit retained-snapshot floor and are not inferred during implementation.

## Testing Decisions

1. Add a shopping workerd service-frontend acceptance flow beside the existing public frontend/WebSocket flows. It must use the real controller graph, dispatch capability, Durable Object repositories, outboxes, ticket route, and WebSocket upgrade.
2. The server acceptance flow must prove:
   1. Two signatures resolve distinct actor IDs without actor or user rows.
   2. Admission authenticates once, returns authoritative identity, and binds state and ticket calls to that identity.
   3. Authentication can query actor-readable service models but has no writable database surface.
   4. `getFrontendState()` returns the approved metadata and only the declared frontend model subset.
   5. Actor-specific frontend and block repositories are created lazily and reused.
   6. A mutation between snapshot cursor N and subscriber registration is delivered exactly once during catch-up.
   7. Relevant mutations create contiguous `frontendIndex` values and causal `lastServiceCursor` values.
   8. Irrelevant mutations advance only the internal service watermark and emit no empty frontend block.
   9. Distinct actor repositories receive currently identical logical service changes while retaining distinct identities and archives.
   10. Tickets are target-bound, expiring, single-use, and unavailable before projection/archive readiness.
   11. An older client index receives an ordered archived suffix and then a live block through the common 034 protocol.
3. Add compile-time controller tests for literal names, exact registry ownership, exact model-object references, signature input inference, actor-readable authentication models, and the absence of writable/query/command methods.
4. Add system-spec tests for complete serialization, empty registries, deterministic ordering, compatibility severity, generation selection, and the one-time stored-spec migration.
5. Add focused node tests only for failure branches that workerd cannot deterministically inject, including invalid decoded actor IDs, target mismatch, registration/replay failure, and archive idempotence.
6. Service React persistence, worker fan-out, repair, offline bootstrap, and direct-mode acceptance are owned by 034's real-browser suite rather than duplicated here.
7. The eventual implementation plan must run affected core, dispatch-worker, system-worker, frontend, React, shared-worker, and shopping targets through Nx.

## Out of Scope

1. Creating account-owned actors, users, accounts, or account resources from service commands.
2. Persisting a service actor row merely because authentication returned an actor ID.
3. Actor-specific row filtering, selections, predicates, or authorization beyond authentication.
4. `ServiceActorRepo`, service authorization callbacks, or service actor query execution.
5. Service frontend commands, staged commands, pushed commands, mutation adapters, or command lifecycle state.
6. Any remote query fallback for data omitted from the service frontend projection.
7. Unifying account and service controller factories, APIs, session types, repository types, or registry tables.
8. Archive compaction, retention floors, or automatic garbage collection.
9. An implementation plan, issue-tracker publication, or production rollout from this design.

## Further Notes

1. Actor-specific server identity is final. Sharing service projections across actor IDs was considered and rejected.
2. Authentication belongs on the actor/frontend binding while the signature schema belongs on the client-safe frontend controller, matching the account pattern.
3. The authenticated admission descriptor is intentionally smaller than `IServiceFrontendState`; it enables replica lookup without turning normal startup into a full-state download.
4. A separate `fetchActor` remains unnecessary for service frontends.
5. Persistent SharedWorker ownership is not described as a service-only mechanism here because the account path now adopts the same substrate in 034.
6. A hydration acknowledgement RPC was considered and rejected. The transport-ordering guarantee is specified in 034.
7. Exact actor and frontend model-object identity is required even though the serialized spec repeats complete model definitions.
8. The required stored-spec migration is a deliberate one-time migration, not a compatibility fallback for deprecated persisted shapes.
9. This design is complete and approved for conversion into an implementation plan together with its companion where their implementation phases overlap.
