# Offline frontend replicas and continuous frontend lineage design

**Date:** 2026-07-27

**Status:** Approved for planning

**Companion design:** [033 — Service-owned actors and frontend controllers](./033-spec-service-owned-actors-and-frontend-controllers.md)

## Problem Statement

The current browser bootstrap always resolves identity and downloads a complete frontend state before a main-thread session becomes usable. The existing SharedWorker can expose partition metadata, but it does not yet own a persistent, convergent frontend replica, the single frontend WebSocket, or account command durability. Provider-owned signature callbacks also disappear when no Provider is mounted, which makes preloading a future frontend version fragile.

That lifecycle prevents offline refresh, repeats large state downloads, duplicates sockets across tabs, and risks losing unpushed account commands when the page is refreshed. It also makes a generation change appear as a new frontend history because physical frontend repositories are generation-scoped even when the logical actor/frontend is continuous.

The browser needs one coherent account-and-service design. Online identity must remain authoritative. A valid cached identity may locate an existing replica only when transport is unavailable. The SharedWorker must own persistence and network convergence, each Provider must retain its own synchronous main-thread database, and account staged commands must survive independently of a disposable materialized replica.

The deployment lifecycle must also prepare a future frontend replica before new JavaScript is activated and preserve one logical `frontendIndex` lineage across generation-scoped server repositories.

## Solution

Move browser replica and network ownership into the existing system/generation/partition SharedWorker. `ZerospinConfig` owns authentication callbacks and long-lived provider capabilities. On a normal online startup it authenticates first, locates the authoritative actor-specific replica, hydrates the main-thread session from that replica, and asks the worker to replay only new frontend blocks. A full network state is used only to create, repair, or commission a replica.

Persist a short-lived, non-secret identity locator in a Config-owned Zustand store backed by `localStorage`. If authentication cannot reach the network, a still-valid locator may open a ready replica. An account session may continue staging commands offline because every full encoded command is first written to a separate partition-owned journal. A service session remains read-only.

The worker owns one socket, one serialized mutation queue, and one persistent database per actor/frontend/version replica. It applies each network or local transaction once, advances a separate local `replicaIndex`, and fans the resulting replica block to every registered Config capability. Each Config applies the worker snapshot before later callbacks and then updates each Provider's separate main-thread database in order.

Commissioning creates and streams a future generation/version replica before page refresh but does not execute old staged commands against code that is not loaded yet. When refreshed JavaScript activates that replica, direct historical contract-payload adapters rematerialize unpushed commands before they become pushable.

On the server, physical block archives remain generation-scoped but form immutable predecessor segments. The logical `frontendIndex` never resets. A generation boundary is a small ordered control block, and ticket admission waits until the successor archive can honor the advertised lineage.

## User Stories

1. As an online user, I want authentication to confirm my identity before any cached actor data is shown.
2. As a returning user, I want a ready local replica to hydrate the UI without downloading another full state.
3. As an offline user, I want a valid cached locator to open my existing replica when the network is unreachable.
4. As an offline account user, I want staged commands and their optimistic state to survive refresh.
5. As a service user, I want the same offline read bootstrap without gaining command APIs.
6. As a user whose authentication resolves a different actor, I want the old replica left untouched and the new identity loaded instead.
7. As a user with multiple tabs or Providers, I want one persistent replica and one socket per actor/frontend/version.
8. As a React consumer, I want each Provider to retain its own main-thread database and synchronous live queries.
9. As a connected client, I want exact archived suffix replay before live delivery.
10. As a connected client, I want a fresh single-use ticket for every reconnect attempt.
11. As a user after a gap or corrupt materialization, I want a transactional full-state repair rather than an index jump.
12. As a direct-mode user, I want the same convergence rules even though persistence and offline startup are unavailable.
13. As a release author, I want to commission the next frontend replica before activating new JavaScript.
14. As a release author, I want old staged command payloads adapted only by compiled current code.
15. As a user crossing generations, I want one continuous frontend history rather than a reset index.
16. As a deployer, I want new write admission to stop at a finite drain boundary while reads remain available.
17. As a maintainer, I want materialized databases to be rebuildable without risking the only durable copy of an account command.
18. As a maintainer, I want real workerd and Chromium acceptance seams for the runtimes that own the behavior.

## Implementation Decisions

### 1. Shared ownership model

1. This design applies to both existing account frontends and the service frontends from 033.
2. Keep separate account and service controller, session, network, repository, wire, registry-table, and replica-state types. Share lifecycle rules, not nullable mega-shapes.
3. `ZerospinConfig` owns browser authentication orchestration, identity-cache access, SharedWorker connections, partition capabilities, and the long-lived account/service provider capabilities.
4. The SharedWorker owns persistent replica databases, the account staged-command journal, one frontend socket per active replica, reconnect, suffix replay, state repair, and fan-out.
5. Every mounted React Provider owns a distinct main-thread in-memory WASM database. Components continue to read and live-query that database synchronously.
6. In worker mode, a Provider does not independently own a frontend WebSocket or account push loop.
7. In direct mode, the Provider owns both, and no durable browser replica is implied.

### 2. `ZerospinConfig` authentication registry

1. Move signature generation off individual Providers and onto the one `ZerospinConfig` wrapper:

```tsx
<ZerospinConfig
  partitionKey="user_123"
  frontendAuthenticators={{
    shopper: {
      frontend: ZerospinShopper,
      generateSignature: () => clerkClient.getToken(),
    },
  }}
>
  {children}
</ZerospinConfig>
```

2. The registry key is exactly `frontendName`. It must equal `entry.frontend.frontend.frontendName` and must be unique across every account and service frontend used by one Config.
3. Separate Config instances may reuse a frontend name because uniqueness is enforced per registry. Their in-memory stores, partition controllers, capabilities, and lifetimes are separate.
4. Each entry carries the statically typed React frontend and its signature generator so Config can authenticate, repair, reconnect, or commission without relying on a mounted Provider.
5. The generator callback stays only in memory. Config retains its latest function reference when React props change and does not reconnect merely because the callback object changed.
6. A generated signature or token is used for one admission attempt and is never persisted, sent to the SharedWorker for storage, or reused as a WebSocket ticket.
7. Account and service Providers no longer accept `generateSignature` props. Config supplies the current in-memory generator to account session/API operations that still require signatures; the service session exposes no such public operation.
8. Config maintains an in-memory SharedWorker registry keyed by `{ systemId, generationId }`. Each entry owns one worker port, its partition capability, provider registrations, and lifetime count.
9. Config unmount releases every worker entry and provider capability it owns. Provider unmount releases only that Provider's main-thread registration; it does not tear down the Config capability or delete persistent data.
10. The registry entry's React frontend is the cold-bootstrap/commission target. A mounted Provider always supplies its own compiled current spec; during a staged rollout the entry may point at the future version with the same static owner names while an old-version Provider remains active.

### 3. Cached identity locator

1. Use a Config-owned vanilla Zustand store with the Zustand persist middleware and `localStorage` storage. Authentication is driven by bootstrap/commission operations, not by a React render hook.
2. The storage key is namespaced by the Zerospin API origin, publishable key, `partitionKey`, frontend kind, complete static owner names, `frontendName`, and frontend version. The plain frontend name remains the public Config registry key, while cache records for an active and future version may coexist. Two Configs with the exact same storage identity intentionally address the same persistent cache/partition even though their in-memory lifetimes remain separate.
3. The cached value contains only replica-locator and validation metadata: `role: 'active' | 'commissioned'`, frontend kind, complete static owner names, `actorId`, account ID when applicable, `systemId`, `generationId`, `systemVersion`, `systemWorkerName`, `authenticatedAt`, and `expiresAt`.
4. Never cache a signature, bearer token, bound RPC capability, WebSocket ticket, database contents, or command payload in this store.
5. Identity cache entries have a fixed 24-hour absolute lifetime. Only a successful online authentication renews `authenticatedAt` and `expiresAt`; offline use never extends them.
6. Parse persisted cache data through an Effect `Schema.parseJson` boundary. Unknown fields, invalid IDs, an invalid timestamp, an expired record, or a mismatch with the current static frontend is a cache miss.
7. A cache miss does not delete a persistent replica. It only prevents that replica from being exposed without fresh authentication.
8. `partitionKey` is the application-controlled browser storage/principal boundary. Changing it creates a distinct Config store, worker partition, identity cache namespace, journal, and replica catalog.
9. Active and commissioned version records remain distinct. Commissioning never overwrites the active bundle's locator; activation of matching new JavaScript promotes its version-specific record to active only after lineage/journal activation succeeds.

### 4. Identity authority and startup lifecycle

1. A cached `actorId` is only a replica locator. It is never supplied to authentication as asserted identity.
2. When network transport is available, Config authenticates before hydrating a main-thread database from a replica.
3. Account admission uses the existing actor-bound `getFrontendApi(...)` and its small `fetchActor()` identity response. Service admission uses the identity descriptor returned beside the bound `getServiceFrontendApi(...)` capability. Neither path downloads resources merely to compare identity.
4. Application-level authentication or authorization failure is authoritative. It is not treated as offline and cannot fall back to cached identity or cached data.
5. Only a transport/unreachability failure may use a valid unexpired locator.
6. On successful online admission, compare the authoritative identity with the cache before exposing local data.
7. If `systemId`, `systemWorkerName`, or the complete authoritative target differs—account ID/name or actor ID/name for an account frontend, and actor ID/name for a service frontend—do not hydrate the old target. Detach any running old-identity registration and invalidate every active or commissioned locator for that Config `partitionKey` plus complete frontend registry identity across all frontend versions. Leave every replica and journal byte intact, acquire or create the new target's replica, and do not cache it before its replica is ready. A recorded successor generation with the same logical target follows lineage transition instead of identity replacement.
8. If identity matches and a ready current-version replica exists, acquisition returns its full local snapshot and then renews the validated locator. Normal startup does not call the network `getFrontendState()`.
9. If no ready replica exists, call the bound frontend capability's `getFrontendState()`, commission a new replica from it, and write the locator only after that replica becomes ready.
10. After local hydration, connect from the replica's persisted `{ replicaGenerationId, frontendIndex }` and replay only newer blocks.
11. If transport is unavailable and a valid locator resolves to a ready replica, hydrate from it and publish an initialized offline session. Account staging remains available; service sessions remain read-only.
12. If transport is unavailable but the locator is absent, expired, invalid, mismatched, or has no ready replica, initialization fails closed.
13. When connectivity returns, Config authenticates and compares identity before opening a socket or pushing journal commands. An offline session never treats a network event alone as renewed authority.
14. `isInitialized` means the main-thread database is readable. It does not mean authentication is current or a socket is online.

### 5. Persistent catalog and database identity

1. Reuse the existing SharedWorker root identity `{ systemId, generationId }` and its `partitionKey` partition.
2. Replace the single account-only registry assumption with separate `accountFrontendReplicas` and `serviceFrontendReplicas` tables. Do not add nullable service fields to one table.
3. An account registry identity includes account ID/name, actor ID/name, frontend name, frontend version, canonical frontend-spec hash, database name, status, `replicaIndex`, and `frontendIndex`.
4. A service registry identity includes service name, actor ID/name, frontend name, frontend version, canonical frontend-spec hash, database name, status, `replicaIndex`, and `frontendIndex`.
5. System ID, generation ID, and partition key remain owned by the worker root/partition and are not redundantly nullable on every row.
6. Registry status is `commissioning`, `ready`, or `failed`.
7. Use a distinct VFS namespace per replica:

```text
zerospin/{systemId}/{generationId}/partitions/{partitionKey}/{kind}/{replicaId}
```

8. Use one constant SQLite filename inside each VFS namespace. Keep the partition catalog VFS separate from every replica VFS so resetting one replica cannot erase the catalog, command journal, or sibling replicas.
9. A frontend controller version always identifies a new replica database. Do not perform an in-place authored model-schema upgrade of an existing replica.
10. Adding, removing, or changing an account or service frontend model changes its persisted projection schema and requires a new system generation. A contract-only/frontend-code version may commission a new browser replica within the same generation.
11. Internal library/catalog migrations remain explicit schema migrations and do not create deprecated fallback fields.
12. An interrupted service commission may be marked failed and rebuilt online. An interrupted account commission is preserved until its journal and possible command ownership are verified.
13. Only `ready` rows are normally acquirable or listed as usable. Failed/quarantined rows remain available to diagnostics.

### 6. Worker runtime and serialized mutation queue

1. One live runtime entry exists per ready or actively commissioning registry row.
2. It owns the open database, a single Effect queue, the current indices, registered Config capabilities, the socket, buffered replay frames, and reconnect fiber.
3. Snapshot installation, server-block application, local account staging, push transitions, terminal command outcomes, full-state replacement, and generation-boundary activation all enter the same queue.
4. The worker drains the queue in order. It may buffer incoming work while fetching a missing suffix or full state, but no later transaction is applied ahead of repair.
5. `frontendIndex` remains the server convergence watermark. Add a distinct persisted `replicaIndex` that advances by exactly one for every committed worker-visible replica transaction, including local command transitions and full-state replacement.
6. A server block never advances `replicaIndex` until its database transaction commits. A failed transaction advances neither index.
7. The catalog preserves the logical replica's next `replicaIndex` across a physical database swap.
8. After each commit, the worker emits one account or service replica block to every registered Config capability. Each Config fans it out to its registered main-thread sessions.
9. A dead Config capability or rejected Config-level RPC is detached without blocking other Configs or rolling back an already committed worker transaction. A failure in one main-thread session behind a live Config capability is isolated by Config under section 8 and never detaches healthy sibling sessions.
10. Port disposal releases every registration owned by that port. When no Config-owned active or commissioning acquisition remains, the worker closes the socket and cancels reconnect work but retains the database and catalog row.
11. Application-specific contract programs and historical payload adapters run only in compiled main-thread code. The worker applies encoded resource deltas, encoded optimistic mutations, and stored inverses generically against tables decoded from the frontend spec.

### 7. Public sync, replica-state, and replica-block contracts

1. Expand the existing account `IFrontendControllerSpec` so each `models` entry contains the complete encoded model definition: identity, abbreviation, version, `encodeShape` properties, indexes, and historical definitions. Preserve its account/actor/frontend identity, version, model names, `IContractSpec` entries, and `signatureJsonSchema`.
2. Add the parallel service frontend controller spec with service/actor/frontend identity, version, model names, complete `encodeShape` model definitions, and `signatureJsonSchema`, but no contracts or writable surface.
3. Compute a canonical spec hash. In online mode Config compares the compiled spec with the authenticated server spec; in offline mode it compares with the hash stored in the replica catalog. A same-version spec mismatch fails closed and requires an authored frontend version bump.
4. The generic SharedWorker decodes this spec to build the authored resource tables and standard account/service replica tables. It does not load application controller JavaScript or contract programs.
5. Add `IFrontendSyncState` as the complete account server state used for first creation and repair. It extends the existing account frontend state with `accountId`, `systemId`, `generationId`, and `systemVersion`, and it carries a non-null `frontendIndex` plus complete pending, executed, and failed pushed-command outcomes represented by that state.
6. Keep the exact `IServiceFrontendState` from 033 as the service server sync state.
7. Expand `IFrontendReplicaState` to contain `replicaIndex`, the complete currently materialized resources, server watermarks/lifecycle rows from `IFrontendSyncState`, full local journal command rows, and their encoded applied-mutation/inverse rows. It is directly sufficient to reproduce the worker's optimistic state without rerunning contract programs.
8. Add `IServiceFrontendReplicaState` as `IServiceFrontendState` plus the replica's local `frontendVersion` and `replicaIndex`.
9. Add `IEncodedFrontendMutation` as the application-independent optimistic mutation description produced by compiled main-thread code. It carries the full command ID, mutation index, model/resource/version/operation identity, and encoded operation, but no applied timestamp or inverse. The worker validates and applies it against the encoded frontend spec and persists the resulting applied mutation/inverse.
10. Add explicit account and service generation-boundary blocks:

```ts
export type IFrontendGenerationBoundaryBlock = Readonly<{
  kind: 'generation-boundary';
  systemId: ISystemId;
  prevGenerationId: string;
  generationId: string;
  accountId: IAccountId;
  accountName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  frontendIndex: number;
}>;

export type IServiceFrontendGenerationBoundaryBlock = Readonly<{
  kind: 'generation-boundary';
  systemId: ISystemId;
  prevGenerationId: string;
  generationId: string;
  serviceName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  frontendIndex: number;
}>;
```

11. Define `IFrontendLineageBlock` as the discriminated archive/WebSocket union of `IFrontendGenerationBoundaryBlock` and a `kind: 'frontend'` resource variant carrying `systemId`, `generationId`, account ID/name, actor ID/name, frontend name, and the existing complete `IFrontendBlock`.
12. Define `IServiceFrontendLineageBlock` as the union of `IServiceFrontendGenerationBoundaryBlock` and a `kind: 'service-frontend'` resource variant carrying `systemId`, `generationId`, service name, actor ID/name, frontend name, and one exact 033 `IServiceFrontendBlock`. The service resource block is wrapped, not widened.
13. `IFrontendReplicaBlock` is a target-bound discriminated worker transaction. Every variant has the common envelope `{ systemId, generationId, accountId, accountName, actorId, actorName, frontendName, frontendVersion, replicaIndex, frontendIndex }`. Its server payload carries one `IFrontendLineageBlock`; its local-command payload carries the resource delta, full encoded lifecycle additions/removals, and applied optimistic mutations needed to mirror one journal/stage/push/rebase commit. Thus a server transaction and a local transaction occupy the same gap-detectable `replicaIndex` sequence.
14. `IServiceFrontendReplicaBlock` has the common envelope `{ systemId, generationId, serviceName, actorId, actorName, frontendName, frontendVersion, replicaIndex, frontendIndex }` plus one `IServiceFrontendLineageBlock` payload.
15. A boundary variant advances the worker's server `frontendIndex`, updates pending-transition state, and performs no resource or command-table mutation. It is never decoded as an empty resource delta.
16. Server lineage blocks carry complete system/generation/account-or-service/actor/frontend identity. Worker replica states/blocks additionally carry their local frontend version, so every receiving layer can reject misrouting before a database mutation without pretending the shared server archive is version-specific.
17. Preserve the full encoded command shapes received at every journal, replica, callback, push, and repair boundary. Worker and main-thread terminal tables must hold those full shapes rather than the current stripped failed-session row; do not rebuild commands field-by-field or null provenance.
18. A full replacement returns a replica state at the newly committed `replicaIndex`; it is not represented as a fake sequence of ordinary blocks.
19. Keep account and service contracts distinct even where fields overlap.
20. Add these exact socket-only, non-indexed transition controls. They are admission-specific instructions, not archive rows, lineage blocks, replica blocks, or convergence watermarks. `generationId` and `frontendVersion` identify the final authenticated target. The first boundary has already been applied at `appliedBoundaryIndex`; `remainingBoundaries` lists every later canonical boundary through that target in ascending order and is empty for a one-generation transition:

```ts
export type IFrontendLineageTransitionRequired = Readonly<{
  kind: 'lineage-transition-required';
  systemId: ISystemId;
  generationId: string;
  accountId: IAccountId;
  accountName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  frontendVersion: string;
  appliedBoundaryIndex: number;
  remainingBoundaries: readonly IFrontendGenerationBoundaryBlock[];
}>;

export type IServiceFrontendLineageTransitionRequired = Readonly<{
  kind: 'lineage-transition-required';
  systemId: ISystemId;
  generationId: string;
  serviceName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  frontendVersion: string;
  appliedBoundaryIndex: number;
  remainingBoundaries: readonly IServiceFrontendGenerationBoundaryBlock[];
}>;
```

### 8. Provider capabilities and acquisition

1. Pass Cap'n Web `RpcTarget` capabilities into the SharedWorker rather than persisting callback stubs.
2. Use the public names `AccountFrontendReplicaProviderApi` and `ServiceFrontendReplicaProviderApi`.
3. Each Config owns at most one provider capability per replica per tab. Multiple Providers in that tab register behind it.
4. `AccountFrontendReplicaProviderApi` exposes these exact Cap'n Web methods; every result is `Promise<Schema.EitherEncoded<RIGHT, IAnyErrorJson>>`:

| Method | Exact arguments | `RIGHT` |
| --- | --- | --- |
| `getFrontendState` | none | `IFrontendSyncState` |
| `createFrontendWebSocketTicket` | none | `{ ticket: string, systemId: ISystemId, generationId: string, accountId: IAccountId, accountName: string, actorId: IActorId, actorName: string, frontendName: string, frontendVersion: string }` |
| `pushCommands` | `readonly IEncodedCommand<IStagedCommand>[]` | `{ pendingCommands: readonly IEncodedCommand<IPushedCommand>[], pushedCommands: readonly IEncodedCommand<IPushedCommand>[], failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[] }` |
| `handleFrontendReplicaBlock` | `IFrontendReplicaBlock` | `void` |
| `replaceFrontendState` | `IFrontendReplicaState` | `void` |

5. `ServiceFrontendReplicaProviderApi` exposes these exact methods and no push method; every result has the same encoded-Either wrapper:

| Method | Exact arguments | `RIGHT` |
| --- | --- | --- |
| `getFrontendState` | none | `IServiceFrontendState` |
| `createFrontendWebSocketTicket` | none | `{ ticket: string, systemId: ISystemId, generationId: string, serviceName: string, actorId: IActorId, actorName: string, frontendName: string, frontendVersion: string }` |
| `handleServiceFrontendReplicaBlock` | `IServiceFrontendReplicaBlock` | `void` |
| `replaceFrontendState` | `IServiceFrontendReplicaState` | `void` |

6. Each no-argument state/ticket call is bound to the provider capability's logical actor/frontend target. Config generates a fresh signature and actor-bound server capability every time. State replacement and push require the same generation/spec; ticket minting may return the same actor/frontend in a recorded successor generation so the source replica can resume through lineage.
7. Account identity-only admission is exactly the existing `getFrontendApi(...)` followed by its small `fetchActor()` response and expanded `makeFrontendSpec()` response. Service admission uses the identity/spec envelope from 033. Neither path fetches resources before replica lookup.
8. A different authoritative account/actor target returns `frontend-identity-changed`; Config immediately detaches the old session and starts the new-identity lifecycle. A state/push request that resolves a successor generation returns `frontend-generation-changed` without applying target state to the source replica, while its ticket request returns the successor ticket plus full target envelope for ancestor resume. If generation is unchanged but authoritative frontend version/spec differs, state and push return `frontend-version-changed`; ticket mint may return the new version envelope for the same generation because model/projection schema changes cannot reuse a generation and the server archive is version-independent. That old-version replica may keep applying compatible server blocks, but account staging/push is suspended until matching compiled code activates the commissioned version. An unrelated or older generation fails closed.
9. Add these exact acquisition boundaries on the generation-bound `PartitionApi`. Every result is an encoded Either; system ID, generation ID, and partition key are already bound by the worker root and are validated against the locator:

| Method | Exact property record |
| --- | --- |
| `acquireFrontendReplica` | `{ accountId: IAccountId, accountName: string, actorId: IActorId, actorName: string, frontendName: string, frontendVersion: string, frontendSpec: IFrontendControllerSpec, frontendSpecHash: string, authority: 'online' \| 'cached-offline', role: 'active' \| 'commissioned', provider: AccountFrontendReplicaProviderApi }` |
| `acquireServiceFrontendReplica` | `{ serviceName: string, actorId: IActorId, actorName: string, frontendName: string, frontendVersion: string, frontendSpec: ReturnType<typeof makeServiceFrontendControllerSpec>, frontendSpecHash: string, authority: 'online' \| 'cached-offline', role: 'active' \| 'commissioned', provider: ServiceFrontendReplicaProviderApi }` |

10. Cap'n Web transports each successful acquisition value as the distinct account or service `RpcTarget`, not as a persisted callback description. Its public surface is exactly `getFrontendState()` returning the corresponding `IFrontendReplicaState` or `IServiceFrontendReplicaState`, and `release()` returning `void`; both use `Promise<Schema.EitherEncoded<RIGHT, IAnyErrorJson>>`. `cached-offline` may acquire only an already-ready matching replica; it cannot create, repair, commission, open a socket, or push.
11. Add these exact account-only main-thread-to-worker methods on `PartitionApi`, preserving the two-method acquired replica capability. In the table, an account target is exactly `{ accountId: IAccountId, accountName: string, actorId: IActorId, actorName: string, frontendName: string, frontendVersion: string }`; a journal-locator target adds `generationId: string`, which may equal the bound root for a same-generation version handoff or identify an ancestor/successor root. Every result uses the encoded-Either wrapper:

| Method | Exact property record | `RIGHT` |
| --- | --- | --- |
| `stageFrontendCommand` | `{ target: account target, baseReplicaIndex: number, command: IEncodedCommand<IStagedCommand>, mutations: readonly IEncodedFrontendMutation[] }` | `{ commandId: string, replicaIndex: number }` |
| `getDormantFrontendCommands` | `{ sourceTarget: journal-locator account target, targetFrontendVersion: string }` | `readonly { command: IEncodedCommand<IStagedCommand>, mutations: readonly IEncodedFrontendMutation[] }[]` |
| `importAdaptedFrontendCommands` | `{ target: account target, sourceTarget: journal-locator account target, baseReplicaIndex: number, commands: readonly { sourceCommand: IEncodedCommand<IStagedCommand>, adaptedCommand: IEncodedCommand<IStagedCommand>, mutations: readonly IEncodedFrontendMutation[] }[] }` | `{ commandIds: readonly string[], replicaIndex: number }` |
| `markFrontendCommandsMigrated` | `{ sourceTarget: account target, target: journal-locator account target, commandIds: readonly string[] }` | `void` |

12. `stageFrontendCommand` and `importAdaptedFrontendCommands` return the exact committed `replicaIndex` that the originating Config must observe through its callback chain before resolving the public operation. Each import entry preserves the byte-exact `sourceCommand` beside the new `adaptedCommand`; their IDs must match. Empty adapted-command imports are idempotent and return the unchanged current index.
13. Every `PartitionApi` method returns an encoded Either, validates complete target identity against its bound root, and preserves full encoded command objects. A generation-bound `PartitionApi` serves only its own journal. Config explicitly calls distinct source and target partitions for a cross-generation handoff and the same partition for a same-generation version handoff. The target import validates `sourceTarget.generationId` against recorded lineage, and the source migration marker records `target.generationId`, so provenance is never inferred from the currently open root.
14. Reacquiring the same replica for the same Config provider is idempotent and atomically upgrades that existing owner from `cached-offline` to `online` and/or from `commissioned` to `active`; it returns the same logical two-method capability, does not add a second ownership count or callback registration, and cannot downgrade either dimension. Online upgrade opens networking only after authoritative identity/spec validation. Active promotion is requested only after every dormant-command import has committed, and only then enables account staging/push.
15. Config owns one worker acquisition per replica/tab for its lifetime once that replica becomes active. Registering or unmounting an individual React Provider changes only Config's local fan-out set and never releases the worker acquisition.
16. Config calls the returned replica API's `release()` on Config unmount, authoritative identity/version transition, or release of a commissioned target that never became active. It detaches that Config-level worker registration and callbacks but does not delete the persistent database, catalog row, identity cache, or command journal.
17. The worker selects the oldest healthy provider capability when it needs state, push, or a ticket. It makes one request at a time; a dead port or rejected Config-level RPC detaches or skips that capability and tries the next.
18. Each Config callback serially applies a worker block or replacement to all of its registered main-thread sessions. If one session application fails, Config moves that session to `repairing` and, before returning the failing callback, installs a repair barrier in that session's existing application chain. The barrier itself starts only after the current worker callback returns, avoiding callback-to-worker deadlock; every later callback remains registered but queues behind that barrier instead of mutating the failed database. Config returns success after the barrier is installed and healthy siblings have committed the transaction once. The barrier reads and synchronously applies worker replica state at J, discards queued blocks at or below J, and applies queued blocks above J in exact `replicaIndex` order. The session rejoins ordinary fan-out only when its applied index catches Config's observed worker index; another gap restarts repair, while repair failure closes only that session and exposes `failed`.
19. A domain authentication failure revokes that specific Config capability and is surfaced to its sessions; the worker may then try the next healthy Config capability sequentially to keep the shared replica online. The rejected Config invalidates every active or commissioned cached locator for that Config `partitionKey` plus complete frontend registry identity across all frontend versions. A previously offline-hydrated rejected Config stops rendering Provider children, closes its main-thread databases, detaches callbacks, and exposes a terminal encoded failure through Config/DevTools. Persistent replica and journal bytes remain untouched.
20. Competing providers never mint tickets or push the same queued journal batch concurrently.

### 9. Snapshot-before-callback ordering

1. There is no hydration-acknowledgement RPC.
2. Acquisition registers the provider as hydration-gated and captures snapshot N inside the worker's serialized queue before returning the two-method replica capability.
3. The first `getFrontendState()` call on that acquired capability returns the captured snapshot N. The worker opens that provider's delivery gate only after the RPC response has been sent, and it schedules every later callback after that response on the same ordered Cap'n Web session. Later state calls capture the then-current committed queue head and do not recreate the initial gate. If the caller releases without requesting state, no callback is delivered.
4. Before invoking the first state call, Config initializes each main-thread session's local application chain with one hydration promise that includes both receiving and synchronously applying snapshot N. A callback received after the response but before application finishes is appended behind that promise and cannot overtake hydration.
5. Snapshot application commits before the hydration promise resolves to React initialization.
6. Full replacement preserves the existing main-thread database object and runs one synchronous SQLite transaction: delete old resource/command rows, insert the complete repaired rows, and update watermarks only after those writes succeed.
7. Transaction rollback leaves the prior state and watermarks intact. The current multi-transaction `applyFrontendState`/`applyFrontendReplicaState` behavior cannot be reused unchanged for replacement.
8. The worker awaits the ordinary RPC completion of `replaceFrontendState(...)` before sending that provider a later block. This promise is the ordering barrier; no extra acknowledgement method is added.
9. A replacement causes one committed live-query refresh rather than exposing an empty or partially rebuilt database.
10. A Provider mounted after the Config acquisition uses the same per-session barrier pattern as repair: Config installs its hydration barrier before requesting a later replica state at J, queues Config callbacks behind it, applies J synchronously, discards queued blocks at or below J, applies higher blocks exactly once, and only then marks that Provider initialized. Remount therefore has no snapshot-to-callback gap even though the Config-level delivery gate is already open.

### 10. Session `workerState` surface

1. Add a read-only `workerState` to both initialized session families and the Config/DevTools frontend listing.
2. It contains `mode`, `status`, `bootstrapSource`, `frontendIndex`, `replicaIndex`, `databaseName`, and a typed encoded failure when present.
3. `mode` is `shared-worker` or `direct`.
4. `status` is one of `authenticating`, `hydrating`, `offline`, `connecting`, `replaying`, `online`, `repairing`, `update-required`, `failed`, or `released`.
5. `bootstrapSource` is `network`, `replica`, or `null` before hydration.
6. State transitions are published atomically with their relevant indices/error. Components must not infer connectivity from `isInitialized`.
7. In direct mode, `replicaIndex` and `databaseName` are null while the same connection/replay/failure statuses remain observable.

### 11. WebSocket resume, replay, and reconnect

1. Keep account and service ticket kinds/routes distinct. Tickets authenticate and select the exact target repository; they do not carry a mutable client watermark.
2. After an accepted upgrade, the client sends the first in-band resume frame `{ replicaGenerationId, frontendIndex }`.
3. The target block repo verifies complete target identity and accepts the claimed generation only when it is the target generation or an exact recorded ancestor.
4. If the claimed generation equals the ticket's target generation, the block repo captures terminal index T, sends the exact archived suffix C+1 through T in ascending order, buffers blocks greater than T, and then sends replay-complete before the socket becomes live-eligible.
5. If the claimed generation is an ancestor, the target block repo traverses canonical ancestry only through the first successor boundary after that claimed generation. It sends the exact contiguous suffix C+1 through that boundary, sends a non-indexed lineage-transition-required control containing the authenticated final target and any later intermediate boundary descriptors, and closes the socket. It sends no indexed block after the first boundary and no replay-complete on that source stream.
6. Backoff resets only after replay-complete on a target-generation stream. A lineage-transition-required close instead suspends source reconnect while Config acquires the separate final-target replica under section 18.
7. Archive append is strict: the next block must be terminal+1. A duplicate index succeeds only when its canonical encoded bytes are identical.
8. The worker applies an exact next ordinary/boundary index once. An identical stale duplicate is ignored. Applying a boundary commits only the boundary index and pending-transition state; it never permits a later-generation ordinary block to mutate the source replica. A gap, conflicting duplicate, wrong target, wrong lineage, decode failure, or apply failure pauses delivery and invokes repair; only a committed full-state replacement may move directly to a later index.
9. A client index ahead of the archive, a missing archived suffix, or invalid ancestry produces a typed state-required control and closes the socket.
10. State-required on the provider's current generation causes the worker to request a full bound state, transactionally replace that same replica, fan out replacement, mint a fresh ticket, and reconnect from the repaired index. If fresh admission instead resolves an authoritative successor generation, the worker does not install successor state into the source replica; it enters the section 18 target-generation transition and leaves the source bytes intact.
11. Every connection attempt mints a fresh short-lived single-use ticket. A spent or possibly spent ticket is never retried.
12. Reconnect uses cancellable exponential backoff capped at 30 seconds while an active or commissioning owner remains.
13. If no connected Config capability can supply credentials/tickets, the replica stays readable offline and reconnect waits for a later capability registration.

### 12. Direct mode

1. SharedWorker-disabled mode is an explicit direct mode, not an implicit replica mode.
2. Direct mode authenticates online, obtains a full state on bootstrap, applies it to the Provider's main-thread database, and owns its socket and account push loop.
3. It uses the same target validation, in-band resume frame, exact suffix replay, gap detection, state-required repair, fresh-ticket reconnect, and 30-second backoff cap.
4. It has no persistent replica, identity-cache bootstrap, cross-tab socket deduplication, commissioning, or offline initialization.
5. On a generation transition, direct mode suspends the source socket and authenticates the target exactly as worker mode does, but fetches target full state directly and transactionally replaces the same main-thread database before reconnecting from the target watermark. It may do so and adapt still-live in-memory staged commands only when the loaded controller's frontend version and canonical compiled-spec hash equal the authenticated target; otherwise it preserves the old session state, exposes a typed frontend-update-required failure, and never applies target data through the wrong schema. No direct-mode command durability across refresh is implied.
6. A same-generation version mismatch likewise suspends account staging/push and reports `update-required`; direct mode cannot commission the target, so matching refreshed code performs a normal online full-state bootstrap. Any unpushed command that existed only in the discarded direct-mode page remains outside this design's durability guarantee.
7. If SharedWorker mode is explicitly enabled but the runtime lacks SharedWorker support, initialization fails visibly. It does not silently change correctness/storage mode.

### 13. Durable account staged-command journal

1. Add a generation-partition-owned account staged-command journal in that partition database, outside every disposable materialized account replica database.
2. Key each row by the complete source account/actor/frontend/generation/version identity and command ID.
3. Persist the full encoded command, the complete `IEncodedFrontendMutation[]` produced for it, staged cursor/time, original contract version/payload, lifecycle status, push provenance, and terminal outcome when known.
4. In worker mode, compiled main-thread code runs the current contract program without mutating its database, encodes the full staged command and mutations, and calls `stageFrontendCommand` with the main-thread session's applied `baseReplicaIndex`.
5. The worker accepts that intent only when the target and base index equal its serialized queue head. A stale caller first consumes missing replica blocks/replacement and retries preparation; stale work is never applied over a newer replica state.
6. The worker commits the journal row before applying its encoded mutations to the authored-schema replica. It computes and stores new applied inverses inside the replica transaction. A crash between journal and materialization commits is repaired idempotently from the journal.
7. During server rebase the worker reverses stored applied inverses, applies the authoritative resource/lifecycle change, and reapplies each retained encoded mutation in pushed- then staged-cursor order while computing new inverses. It never reruns an authored contract program.
8. After the replica transaction commits, advance `replicaIndex` and fan one account replica block to every Provider, including the origin. The origin does not independently double-apply the staged command.
9. The originating `stageCommand()` waits until its local application chain commits that emitted `replicaIndex`, then returns the full staged command. Worker durability and the synchronous local optimistic view are therefore both true when the public promise resolves. If local application fails after worker commit, return a typed durable-stage-application failure carrying the command ID, detach/repair that session, and never create a second command on retry.
10. The worker owns account push through `AccountFrontendReplicaProviderApi.pushCommands`. Direct mode retains Provider-owned push because it has no worker journal.
11. Transition a command from staged to pushed only after durable server admission evidence. A transport failure with unknown admission leaves it reconcilable by command identity and cursor; it is never blindly repushed as a new command.
12. An explicit authoritative guard/admission failure or an `IFailedPushedCommand` terminal outcome durably fails the full command and rolls back/rebases its optimistic effects. Authentication failure revokes the session, transport uncertainty preserves the current journal lifecycle, and generation-write-admission-closed returns the intent to staged/dormant state for target-generation adaptation; none of those three is mislabeled as a terminal command failure.
13. `FrontendRepo` adds dedicated executed- and failed-pushed-command tables and writes the full terminal command while handling the actor block that removes it from pending state. `getFrontendState()` reads those tables instead of returning empty arrays or scanning the entire block archive.
14. Generation preparation carries those terminal tables into the successor projection before it becomes state/ticket ready. Executed and failed outcomes therefore remain durable and visible in replica state across lineage boundaries.
15. A materialized account replica is rebuildable from authoritative server state plus a healthy journal. The journal, not the resource database, is the durable authority for unpushed local commands.
16. Journal and server terminal rows are retained in the first implementation. Compaction requires proof that authoritative server state/archive contains the outcome and that no retained frontend version needs the original payload.
17. Journals remain physically generation-scoped with their existing SharedWorker roots. A successor catalog records predecessor journal locators for dormant commands rather than moving the only copy during commissioning.
18. To resolve transport-uncertain admission, first reconcile replay/full state by command ID. If the command is pending or terminal, accept that authority; if it is absent and the source generation still admits writes, resend the byte-identical full command with the same ID; if the generation is closed, return it to dormant staged state for target adaptation. Never manufacture a replacement command ID.

### 14. Commissioning future replicas

1. Add the public hook:

```ts
const { commission, release } =
  useCommissionFrontendReplica(ReactFrontend);
```

2. `commission()` and `release()` each return `Promise<Either.Either<void, IAnyError>>`.
3. Commissioning requires enabled, available SharedWorker persistence. In direct mode or an unsupported runtime, `commission()` returns a typed failure and creates no partial target.
4. A commissioned replica is specifically a future frontend controller version, normally in a successor generation, prepared before it becomes the active page's current replica. Acquiring the already-current frontend version is idempotent but is not called commissioning.
5. Commissioning never bypasses server generation admission. For a successor-generation target, the server has already completed preparation, promoted that generation into ordinary API routing, and left the old page/session running against its predecessor; commissioning occurs after server promotion but before page refresh activates the target JavaScript. A candidate generation that is not yet ordinarily routable returns a typed target-not-routable failure rather than gaining a pre-promotion public API.
6. `commission()` authenticates through the Config registry, requests a full target state, creates/migrates/hydrates the target database, marks its row ready, opens its own target socket, and persists the new version-specific locator with `role: 'commissioned'` only after readiness.
7. A commissioned target consumes server blocks and remains current on authoritative data, but it accepts no user staging, command execution, or push.
8. Existing staged commands are retained in the partition journal as dormant source-version commands. They are not adapted or optimistically applied to the commissioned target while only the old JavaScript is active.
9. `release()` removes that commission owner and closes the socket when no other owner needs it. It does not delete the ready replica or journal data.
10. On refreshed-page activation, the compiled target controller validates and directly adapts every dormant unpushed payload before the target session initializes.
11. Config opens the recorded source-generation partition locally, reads dormant commands from its journal, and lets compiled target code decode/adapt each payload, validate it, run the current contract program, and produce the current full command plus `IEncodedFrontendMutation[]` without mutating a main-thread database.
12. Config submits each byte-exact source command, its source-generation locator, the adapted current command, and current `IEncodedFrontendMutation[]` to the target-generation journal. This works online or during a cache-authorized offline target startup because both journals are local persistent state.
13. Adaptation preserves command ID and original provenance while producing a current-version encoded payload. The target worker persists both source and adapted command bytes and durably commits each adapted journal row before the source journal records its migrated target generation.
14. The transfer is idempotent: retrying the same command ID succeeds only for identical target bytes. A crash after target commit but before the source marker therefore cannot lose or duplicate intent.
15. Only after every required target journal/materialization transaction commits does the target enable push. The source journal remains retained for recovery.
16. If any required historical definition or adapter is missing or fails, activation fails closed. Original journal bytes and the old replica remain intact.
17. Pushed source-generation commands are not reissued. Generation drain settles them or authoritative state/replay reconciles their terminal outcome before activation.
18. A same-generation authoritative frontend-version/spec change is a version transition, not a generation transition: fresh state/push calls return `frontend-version-changed`, account staging/push is suspended, and the old session enters `update-required`.
19. Because same-generation model/projection schema changes are forbidden, the old-version replica may continue consuming the generation's version-independent resource archive with freshly authenticated tickets while it remains gap-free. If it needs full-state repair, it cannot install the different-version state and remains `update-required` until matching code activates the target.
20. Config commissions a distinct target-version replica in the same worker generation, streams it from the shared server archive, preserves the old version's active locator and journal rows, and emits no generation boundary or artificial `frontendIndex` change.
21. When matching target-version JavaScript mounts, it performs the same source-command adaptation and journal-first activation protocol, replaces the main-thread database from the target-version replica, promotes that version's locator/owner to active, and only then releases the old-version acquisition. Service frontends perform the same replica switch without command adaptation.

### 15. Historical contract payload definitions

1. Extend `makeContract` to mirror the model factory's second-argument pattern:

```ts
const SubmitOrder = makeContract(
  {
    commandName: 'submitOrder',
    version: '2.0.0',
    payload: currentPayload,
    mutations: mutationSchema,
    program,
  },
  [
    {
      commandName: 'submitOrder',
      version: '1.0.0',
      payload: historicalPayload,
      adaptPayload: ({ payload }) =>
        Effect.succeed(currentPayloadInput),
    },
  ],
);
```

2. Each historical entry must use the same command name, a unique older SemVer, a payload shape expressed with the existing contract payload primitives, and one direct old-to-current adapter.
3. The current compiled contract must contain a direct adapter for every retained staged-command version. Adapter chains are not followed.
4. The adapter receives a decoded historical payload and returns input for the current payload validator. Current encoding/validation runs before the adapted command is committed.
5. Extend `IContractSpec` with `historicalDefinitions`, each containing `commandName`, `version`, and `payloadJsonSchema`. The adapter function is runtime-only and omitted.
6. This payload JSON Schema is appropriate because contract payloads already cross the command JSON boundary. It does not restore `mutationsJsonSchema`; mutation result/program schemas remain absent from serialization and compatibility.
7. Compatibility treats adding a historical definition as a minor compatible surface addition, removing one as major, and changing its payload schema with the existing directional schema rules.
8. Runtime factory validation rejects a current-version duplicate, duplicate historical versions, command-name mismatch, a non-older version, or a missing adapter.
9. Adapter behavior cannot be compared from the serialized spec. Authors must bump the current contract version when changing it.

### 16. Continuous logical frontend lineage

1. A logical account or service actor/frontend `frontendIndex` never resets when a new system generation becomes active.
2. Physical `FrontendBlockRepo` and `ServiceFrontendBlockRepo` instances remain generation-scoped and store immutable lineage segments.
3. Each successor segment records an immutable predecessor descriptor supplied by SystemRepo. A block repo never probes arbitrary predecessor Durable Objects to discover history.
4. If the predecessor's terminal frontend index is F, the successor segment stores one generation-boundary block at F+1. Its first ordinary resource block is F+2.
5. A boundary block has exactly the account or service shape defined in section 7. It contains no resource snapshot, graph snapshot, command payload, signature, or ticket.
6. The target full state comes from an already commissioned replica or a bound `getFrontendState()` repair. The boundary itself is not hydration data.
7. The successor archive can serve one logical suffix by traversing its recorded predecessor segments. Once successor API routing is promoted, SystemRepo signals the frozen predecessor block repositories to close existing sockets with the generation-superseded close code. Those clients mint a fresh successor ticket, present their predecessor watermark, and receive the canonical boundary through successor replay; the predecessor room never fabricates or forwards a block archived by another generation.
8. Archives and predecessor descriptors are retained indefinitely in the first implementation. Missing ancestry is corruption and returns state-required rather than silently resetting the index.

### 17. Finite generation drain and projection freeze

1. Generation drain first closes G1 write admission for new account/service commands and waits only for work admitted before that gate.
2. Offline unpushed commands are not server-admitted work and do not prolong G1 drain.
3. After admitted work and pushed-command outcomes settle, G1 SystemRepo freezes the exact set of pre-close actor/frontend projections and each frontend block archive's terminal bound.
4. Extend the existing generation `drainBounds` authority with account and service frontend predecessor descriptors. Distinguish `no-local-segment` from `no-lineage`: a missing G1 projection inherits the last recorded logical ancestor when one exists, while only a genuinely new logical frontend identity receives no lineage prefix.
5. G1 remains read-routable in `draining` while G2 prepares. Existing state queries continue to hit G1 until the routing switch.
6. G2 may create and register its own projections during preparation, but external write admission remains locked until activation.
7. G2 seeds projections from source snapshots with causal watermarks and replays only source blocks after those watermarks through the frozen terminal bounds, reading long suffixes in bounded chunks. This is an explicit bootstrap/no-emission mode: replay mutates the G2 projection and its source cursor but cannot write a G2 frontend outbox or archive block. Pre-watermark source history remains reachable through its immutable lineage and is not re-applied to materialized state.
8. A G1 projection lazily requested after freeze is snapshot-only/read-only. It does not subscribe for new writes, join the frozen drain set, or extend drain indefinitely.
9. A post-freeze projection is tagged `no-local-segment`. It inherits the last ancestor's terminal `frontendIndex` without emitting a G1 block. Because no G1 writes can follow its snapshot, G2 bypasses the empty G1 segment and links to that ancestor; if no ancestor exists, it begins at baseline as a genuinely new lineage.
10. After no-emission catch-up reaches the frozen bound, a projection with inherited lineage sets its internal `frontendIndex` to predecessor terminal F and appends exactly one archived boundary at F+1; a genuinely new lineage starts at baseline without a boundary. Only later live G2 changes may emit ordinary blocks, beginning at F+2 when a boundary exists.
11. New capability routing switches to G2 only after its repositories and required archive boundaries are ready. Only then does G1 stop accepting reads and become drained and its predecessor block rooms receive the generation-superseded close signal.
12. `getFrontendState()` may return from a ready materialized projection before every corresponding archive delivery finishes. `createFrontendWebSocketTicket()` is the strict readiness barrier and waits for the block archive through the promised snapshot/boundary index.
13. Failure to reach that archive bound fails ticket minting. It never returns a socket that cannot replay the state it claims.
14. Closing admission makes the drain work set finite; it does not guarantee that broken admitted work succeeds. A permanently failing outbox/projection marks generation preparation failed and blocks the routing switch visibly rather than accepting more work or pretending G2 is ready.

### 18. Multi-generation client transition

1. Socket acquisition always reports `{ replicaGenerationId, frontendIndex }`; the fresh ticket selects the target generation and exact frontend.
2. A client may resume from the target generation or any exact recorded ancestor.
3. When crossing one generation, replay settles every remaining source-generation account command outcome before emitting the boundary marker. The target repo then sends lineage-transition-required and closes that source stream without replay-complete.
4. At the marker and transition control, Config acquires the separate target-generation worker replica, using an already commissioned target when available or creating it from target state otherwise. The source-generation persistent database is not repointed into a different generation.
5. Before any target state reaches a main-thread database, Config requires the mounted Provider's `frontendVersion` and canonical compiled-spec hash to equal the authenticated target. If they do not match, the target stays commissioned/streaming, the source database and acquisition remain intact, account staging/push is disabled, and the source session exposes `update-required`; matching refreshed code resumes activation from that prepared target.
6. With matching compiled code, if the target replica is at index J beyond the boundary, Config transactionally replaces the existing main-thread database from that target snapshot, discards queued target blocks at or below J, and resumes target callbacks at J+1.
7. Config switches the session's `replicaGenerationId`, promotes the target version's cached locator/owner to active without extending authentication expiry, and releases the source acquisition only after the target snapshot and any dormant-command activation have committed.
8. This target switch is safe because source-generation pushed commands settled before its boundary and no target-generation local commands are accepted before activation.
9. When a client skips multiple generations, replay every remaining ordinary block from its source generation and its next contiguous boundary. The lineage-transition-required control contains the authenticated final target plus the ordered canonical later boundary descriptors; it does not send later indexed markers across omitted deltas.
10. The source worker does not advance through the informational intermediate descriptors. After the compiled-code gate succeeds, Config acquires/creates the final-generation replica, applies that replica's state at J to the main-thread database as one full replacement, and then resumes exact final-target application at J+1. This target-state replacement is the only permitted apparent index jump.
11. Dormant unpushed commands adapt directly from their source contract version to the final current contract version. They do not require every intermediate JavaScript bundle.
12. Each dormant command retains its original generation-journal locator, so a client that skips generations transfers it directly from that source journal into the final target journal.
13. If the transition control arrives while no target Config capability or matching compiled Provider exists, persist a pending transition, leave the source replica and journal intact, close the obsolete socket, and wait. A later matching Config/Provider authenticates, obtains/activates target state, and reconnects.

### 19. Full-state repair and corruption policy

1. A usable database with a logical gap, target mismatch, invalid block, equal-index content mismatch, or failed application enters `repairing` and requests authoritative full state. Same-generation authority repairs that replica in place; authoritative successor-generation admission converts the operation into the section 18 target transition and never writes successor state into an ancestor database.
2. Repair replaces resource and server command-lifecycle tables transactionally, then reapplies only healthy local journal overlays not already represented by the state's pending set and `lastRebasedPushedCursor`, in pushed- then staged-cursor order, before publishing the repaired account snapshot.
3. A physically corrupt service replica is disposable as an authority. When online, create a fresh database under a new name, hydrate it, atomically repoint the catalog row, fan out replacement, and quarantine the old database for explicit later cleanup. Offline, report failure and wait for network repair.
4. A new-format physically corrupt account materialization is rebuildable only after the separate journal is opened and verified. Rebuild from server state plus that journal, atomically repoint, and preserve the old database until the swap succeeds.
5. A corrupt journal, or a legacy account database that may contain the only copy of staged commands, fails visibly and is never auto-deleted or silently reset.
6. Catalog repoint and status/index changes commit in one partition-database transaction. Provider replacement happens only after the new target is durable.
7. Equal `frontendIndex` with unequal canonical resource/server-lifecycle contents is corruption; local content is not silently preferred merely because its index matches.

### 20. Listing, diagnostics, retention, and documentation

1. Preserve account replica listing and add a separate service replica listing API. Do not add a combined nullable/discriminated registry API.
2. Listings expose target identity, frontend version, database name, status, indices, active-provider count, socket/reconnect state, and last encoded failure. They never expose database handles, signatures, tickets, or raw command payloads.
3. DevTools displays the session `workerState`, separate account/service replicas, commissioned/active state, pending generation transitions, and journal health.
4. Replica databases, lineage archives, predecessor descriptors, and journal rows have no automatic retention deletion in the first implementation.
5. Explicit operator reset, safe archive compaction, old-version VFS garbage collection, and corrupt-journal export/recovery are separate future work recorded in `TODOS.md`.
6. Implementation must update the browser bootstrap, frontend WebSocket, block-chain, deploy-generation, React/session, SharedWorker, DevTools, glossary, index, and API reference documentation in the same pass as source changes.

## Testing Decisions

1. Use two highest acceptance seams because Durable Objects and Chromium SharedWorker/IndexedDB behavior cannot be proven by one deterministic Node harness.
2. Add or extend a shopping workerd acceptance flow for both account and service frontends. It must prove:
   1. Frozen generation bounds are finite while reads remain routable.
   2. Pre-freeze projections receive exact predecessor bounds, post-freeze projections receive `no-local-segment`, empty generations bypass to the last ancestor, and only new logical frontends receive no lineage.
   3. G2 snapshots at source watermarks and catches up through frozen bounds without a gap or frontend-block emission, then appends exactly one inherited-lineage boundary before live writes open.
   4. Logical `frontendIndex` continues across typed account/service boundary variants and generation-scoped archives.
   5. Ticket mint waits for the advertised archive bound.
   6. A successor-generation ticket accepts an exact ancestor resume watermark, sends the exact contiguous suffix through the first boundary, sends lineage-transition-required, and closes without replay-complete; the separately acquired target replica then reconnects from its target watermark and becomes live only after replay-complete.
   7. Missing suffix, ahead index, invalid target, invalid ancestry, and conflicting duplicate return state-required.
   8. A fresh ticket is required on reconnect and tickets remain target-bound/single-use.
   9. Account full state contains pending and complete executed/failed outcomes needed for reconciliation.
   10. Already-admitted G1 pushes settle while later admission is rejected without prolonging drain.
   11. A multi-generation resume emits the source's contiguous indexed suffix and next boundary, then a non-indexed transition control; no later indexed block is exposed until final-target full-state replacement establishes the new watermark.
   12. Promoting successor API routing causes each frozen predecessor block room to close its existing sockets with generation-superseded, after which fresh admission selects the successor archive.
3. Add a real Chromium React/SharedWorker acceptance flow with SharedWorker explicitly enabled. It must prove:
   1. Online auth occurs before any replica is exposed.
   2. Matching identity hydrates from a ready replica without a full-state request.
   3. Transport failure plus a valid cache initializes offline; auth rejection and expired cache do not, and a later auth rejection revokes an already hydrated offline session, invalidates every version/role locator for that Config frontend/principal, and preserves persistent bytes.
   4. An account/actor target mismatch never flashes or hydrates the old target, invalidates every version/role locator for that Config frontend/principal, and leaves old replica/journal data intact.
   5. Worker snapshot commits before initialization and before any later block callback.
   6. Two Providers/tabs share one persistent replica and socket while keeping separate main-thread databases.
   7. One worker transaction persists once, advances one `replicaIndex`, and refreshes each observed live query once; failure in one main-thread session repairs or fails only that session while healthy siblings remain current, and a block arriving during that repair queues behind snapshot J and is applied exactly once after J.
   8. Provider teardown/remount reuses the Config-owned persistent replica; Config-level release closes runtime ownership without deleting data.
   9. Forced socket closure obtains a fresh ticket and resumes from persisted lineage/index.
   10. A gap triggers state replacement in the same main-thread database object before later callbacks.
   11. Offline account staging computes command mutations in compiled main-thread code, commits the full command/mutations to the worker journal first, survives refresh, rematerializes optimistically without rerunning the contract program, and later pushes once.
   12. An authoritative guard/admission rejection or failed pushed-command outcome durably fails the full command and rolls back/rebases optimistic state; authentication failure revokes the session, transport uncertainty preserves and reconciles the existing command ID, and a closed generation returns the command to dormant staged state.
   13. After successor server routing is promoted while the old page remains mounted, commissioning builds and streams the future replica without applying dormant staged commands or overwriting the active-version identity locator; a non-routable candidate cannot be commissioned.
   14. With matching compiled code, a generation boundary suspends source delivery; Config acquires the target-generation replica, transactionally replaces the same main-thread database object at the target watermark, activates adapted dormant commands, and releases the source acquisition only after the target is committed and current.
   15. Without matching compiled code, that target remains commissioned and streaming while the source session stays readable but cannot stage/push and reports update-required; refreshed matching code then performs the replacement/activation without losing source journal data.
   16. A same-generation version change lets the gap-free old replica keep consuming the version-independent archive, returns frontend-version-changed for state/push, suspends account staging/push, commissions without a boundary/index change, and activates only after matching target JavaScript adapts historical payloads.
   17. Direct mode owns its socket/push, full-state transitions to a target generation when the loaded controller matches, reports update-required for unmatched generation or same-generation versions, and lets matching refreshed code bootstrap without claiming persistence or offline startup.
   18. Explicit SharedWorker mode fails rather than silently downgrading when support is unavailable.
4. Add focused Node tests for identity-cache parsing/TTL, all-version locator invalidation, active-versus-commissioned locator selection, transport-versus-domain failure classification, interrupted commissioning, provider selection/failover, queue ordering, stale `baseReplicaIndex`, per-session callback rejection isolation with a concurrent repair block, Config-capability rejection failover, equal-index mismatch, transaction rollback, catalog swap, journal-before-materialization recovery, byte-identical same-command-ID retry after transport uncertainty, idempotent cross-generation journal handoff, and direct historical payload adapters.
5. Add physical-corruption tests proving online service rebuild, account rebuild with a healthy journal, and fail-closed preservation of a corrupt journal/legacy command-bearing database.
6. Add compile-time tests proving Config registry key/controller matching, frontend-name uniqueness where statically knowable, exact account/service provider and `PartitionApi` method shapes, two-method replica APIs, account/service boundary unions, and the absence of query/command/push methods on service sessions.
7. Add contract-spec tests for deterministic historical-definition serialization and compatibility severity without restoring mutation-result schema comparison.
8. Existing prior art includes shopping workerd frontend/WebSocket flows, FrontendRepo bootstrap/service-replication tests, `makeReactFrontend` tests, `bootstrapBrowserSession` tests, SharedWorker host tests, and frontend replica-state application tests.
9. The eventual implementation plan must run affected core, dispatch-worker, system-worker, frontend, shared-worker, React, DevTools, and shopping targets through Nx.

## Out of Scope

1. Service frontend commands, staged commands, push, or mutation adapters.
2. Treating cached identity as authentication or using cache after a domain auth rejection.
3. Caching signatures, tokens, RPC capabilities, or WebSocket tickets.
4. Remote query fallback for an incomplete frontend projection.
5. Row-level service actor filtering or authorization beyond 033 authentication.
6. In-place authored schema migration of a replica database between frontend versions.
7. Adapter chains through intermediate contract versions.
8. Automatic deletion of replicas, journals, lineage archives, or possibly unique staged-command data.
9. Archive compaction, retained-snapshot floors, or production garbage-collection policy.
10. Silent SharedWorker-to-direct-mode fallback.
11. An implementation plan, issue-tracker publication, or production rollout from this design.

## Further Notes

1. Authentication-before-hydration is deliberately different from optimistic cached-user rendering: online startup never exposes the cached actor before the authoritative comparison.
2. Normal startup uses the worker replica plus block suffix, not a network full-state reconciliation. Full state is exceptional creation, repair, and commissioning input.
3. Worker-owned block intake was selected over main-thread forwarding because it gives one socket, one persisted application point, one gap detector, and convergence even when no Provider is mounted.
4. Config-owned capabilities were selected over Provider-owned callbacks because reconnect and commissioning must survive Provider teardown.
5. The account staged-command journal makes the materialized database disposable without making unique local intent disposable.
6. A commissioned replica is intentionally forward-looking. It does not pretend that an old JavaScript bundle can execute new contract adapters.
7. Contract historical definitions adapt payloads only. Existing model/mutation compatibility continues to govern emitted mutations after the current contract program runs.
8. Continuous `frontendIndex` is logical; generation-scoped repositories remain physical deployment units joined by immutable predecessor descriptors.
9. Boundary markers are ordering facts, not graph snapshots.
10. The ticket remains authentication/admission only; the first socket frame carries the changing resume watermark.
11. The no-acknowledgement design relies on a local serialized application chain in addition to transport ordering, so early callback delivery cannot overtake hydration.
12. The fixed 24-hour identity-cache lifetime governs offline exposure only. Online authentication remains authoritative regardless of cache age.
13. This design supersedes the earlier TODOs that deferred cached identity, persistent account replicas, staged-command persistence, and account suffix replay.
14. This design is complete and approved for conversion into an implementation plan.
