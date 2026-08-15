# SharedWorker port authentication and exact-Repo authority design

**Date:** 2026-08-14
**Status:** Approved for planning

> This document specifies proposed architecture. It does not describe behavior
> at HEAD, authorize production-code changes, or serve as an implementation
> plan.

## Problem Statement

The current browser bootstrap authenticates once on the page to discover
`{ systemId, userId }`, writes a `localStorage` locator, and then opens a
SharedWorker whose URL is already bound to that identity. The SharedWorker
authenticates a second time and retains an independent `AuthenticatedApi` for
the page's MessagePort
([`makeZerospinApp.tsx:146-352`](../../../packages/react/src/makeZerospinApp.tsx#L146-L352),
[`acquireUserPartitionRepo.ts:193-351`](../../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L193-L351)).

That division has three consequences.

1. Provider accepts a caller-supplied optional `userId`; eligible cold-offline
   fallback requires that value. Provider also contains Zerospin
   authentication, identity comparison, locator persistence, and
   offline-fallback policy.
2. The SharedWorker process is identity-specific even though every connected
   MessagePort already receives its own `SharedWorkerApi`, `ownerToken`, and
   authentication state
   ([`startSharedWorker.ts:37-147`](../../../packages/shared-worker/src/SharedWorker/startSharedWorker.ts#L37-L147),
   [`SharedWorkerApi.ts:24-120`](../../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/SharedWorkerApi.ts#L24-L120)).
3. Every online registration for one exact aggregate or service Repo owns
   another server child capability and its exact parent, even though the exact
   Repo already selects only one registration for server work
   ([`AggregateFrontendReplicaRepo.ts:204-256`](../../../packages/shared-worker/src/SharedWorker/AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts#L204-L256),
   [`ServiceFrontendReplicaRepo.ts:96-148`](../../../packages/shared-worker/src/SharedWorker/ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts#L96-L148)).

Plan 054 has already established the correct browser persistence, convergence,
five-way push result, repair, and generation-replacement behavior. This design
must change authentication and runtime authority ownership without reopening
those settled data lifecycles.

## Solution

Make the SharedWorker host identity-neutral and move the complete Zerospin
authentication handshake into the port-bound `SharedWorkerApi`. The page
continues to execute its application-defined `generateSignature` callback,
but the SharedWorker invokes that capability and owns every resulting
`AuthenticatedApi`.

Each MessagePort binds once to one authenticated or offline-located
`{ systemId, userId, systemName }` partition. Each online port owns one
independent root capability. Each exact aggregate or service Repo owns at most
one child frontend capability, minted through a sticky selected registration's
port root. Other registrations remain complete delivery attachments but own no
server child.

Cold-offline identity discovery moves to a worker-owned native IndexedDB
`lastUserPartitionStore`. The worker always attempts online authentication
first and consults the store only after an eligible transport or readiness
failure.

## User Stories

1. As a page mounting `ZerospinApp.Provider`, I want the worker to return the
   authenticated `systemId` and `userId`, so that the page does not perform
   a duplicate Zerospin authentication.
2. As an application, I want `generateSignature` to continue running in page
   auth state, so that framework-specific token access remains outside the
   SharedWorker.
3. As a browser origin using one Zerospin deployment, I want one SharedWorker
   host to isolate multiple `{ systemId, userId }` partitions, so that worker
   process identity is not coupled to one signed-in user.
4. As one page, I want an independent authenticated root for my MessagePort, so
   that another page cannot lend or revoke my root capability.
5. As two pages attached to one exact replica, I want the exact Repo to share
   one server child while both pages retain independent sinks and delivery
   state, so that redundant child authorization is removed without merging page
   lifecycles.
6. As the selected authority registration, I want my port refreshed first after
   a refreshable child failure, so that authority remains sticky when it is
   still usable.
7. As a sibling page, I want a transient callback or transport failure on
   another port to leave my exact Repo and both delivery registrations intact.
8. As a port whose authentication is rejected or resolves a different identity,
   I want only my port and registrations ejected, so that unrelated ports and
   partitions remain isolated.
9. As an offline returning user, I want the worker to reopen the most recently
   authenticated partition for the exact configuration, so that local reads and
   durable aggregate staging work without a caller-supplied `userId`.
10. As a returning online user, I want an existing-only registration promoted
    only after fresh authentication resolves the same identity, so that an
    offline locator never becomes authenticated authority.
11. As an aggregate replica with active journal work, I want authority loss to
    dispose network capabilities without deleting local intent, so that a later
    same-identity authority can resume it.
12. As a pre-release integrator, I want old browser persistence rejected with a
    precise reset requirement, so that the cutover has no hidden compatibility
    path.

## Implementation Decisions

### 1. Prior-work reconciliation

1. This design preserves Plan 053's worker ownership of steady-state server
   calls, page-executed signature capability, independent per-port root,
   MessagePort `ownerToken`, page-local delivery sinks, port-scoped cleanup,
   and browser-owned SharedWorker process lifetime.
2. This design supersedes Plan 053's page bootstrap authentication,
   identity-bound SharedWorker URL, caller-supplied Provider `userId`,
   main-thread offline locator, and per-registration child ownership.
3. Plan 054's user-root locator catalogs, exact-replica databases, aggregate
   journal, service metadata, transaction boundaries, convergence, repair,
   authoritative generation replacement, and late-generation rejection remain
   unchanged.
4. Aggregate persistence remains generated resource tables plus
   `aggregateFrontendReplicaMetadata { id, systemVersion, frontendIndex, replicaIndex }`
   and
   `aggregateFrontendCommandJournal { commandId, sessionId, sessionIndex, command, mutations, appliedMutationInverses }`.
   Replay order remains the complete command's `command.replicaIndex`; there
   is no sibling journal `replicaIndex` column
   ([`AggregateFrontendReplicaRepo.ts:87-134`](../../../packages/shared-worker/src/SharedWorker/AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts#L87-L134)).
5. Service persistence remains generated resource tables plus
   `serviceFrontendReplicaMetadata { id, systemVersion, frontendIndex, replicaIndex }`.
   It gains no journal, staging, push, pause, or command-outcome state
   ([`ServiceFrontendReplicaRepo.ts:53-69`](../../../packages/shared-worker/src/SharedWorker/ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts#L53-L69)).
6. The user-root `aggregateFrontendReplicas` and
   `serviceFrontendReplicas` tables remain immutable locator catalogs. They
   gain no ordering frontier, authentication state, registration state, or
   mutable replica progress.
7. Generated resource tables remain the only persisted materialized
   projection. Aggregate journal rows remain complete unaccounted local intent;
   acquisition derives outbound state from locator, metadata, resource, and
   active-journal rows. No complete replica-state JSON, persisted
   `previousBlock`, `lastRebasedPushedCursor`, lifecycle product state, or
   browser terminal-outcome history returns.
8. Local handoff, canonical convergence, failed-stage settlement, repair, and
   authoritative replacement retain Plan 054's exact transaction and
   post-commit fan-out boundaries. Staged rows retry byte-identically in
   `command.replicaIndex` order; pushed rows remain active but are not
   resent; canonical accounting or verified failed-stage rejection removes
   rows.
9. The browser-facing push result remains the complete `IPushBlock` with
   `writeIndex`, `guardedAtAggregateCursor`, `pendingCommands`,
   `pushedCommands`, `executedCommands`, `failedStagedCommands`, and
   `failedPushedCommands`
   ([`types.ts:338-349`](../../../packages/core/src/contracts/types.ts#L338-L349)).
   Only the verified failed-staged subset settles locally from that result; the
   complete public result is not narrowed.
10. Canonical blocks and authoritative repair retain exhaustive pending,
    executed, and failed-pushed accounting; replacement/rebase still commits
    before socket reconnect; duplicate or lower same-lineage blocks remain
    no-ops; gaps still repair; and late generation callbacks remain fenced.
11. The archived command-journal RFC's
    `aggregateFrontendReplicaCheckpoint`, standalone journal
    `replicaIndex`, `appliedInverses`, and failed-only public result are
    rejected historical proposals. They must not return during implementation.
12. The reconciled
    [SharedWorker persistence handoff](./2026-08-13-handoff-shared-worker-replica-persistence.md)
    and
    [command-journal RFC](./ActiveSharedWorkerCommandJournal.md) are
    archived with this specification because their remaining correct decisions
    are either implemented by Plan 054 or recorded here.

### 2. Identity-neutral SharedWorker host

1. The SharedWorker URL contains exactly the runtime configuration
   `apiUrl`, `publishableKey`, and `wasmUrl`. It contains neither
   `systemId` nor `userId`.
2. The fixed SharedWorker name remains a host-sharing mechanism. Pages using
   the same effective URL and name connect to the same browser-owned host.
3. Worker-global maps may contain multiple isolated user partitions. A user
   partition is still keyed by exact `{ systemId, userId }`; this design does
   not add `systemName`, authentication state, or runtime progress to the
   persisted locator catalogs.
4. Every accepted MessagePort receives a distinct `SharedWorkerApi` and a
   distinct opaque `ownerToken`. The worker-global partition and exact-Repo
   maps remain shared.
5. Every new `SharedWorkerApi` begins unbound. Before binding, it owns no
   `UserPartitionRepo`, authenticated root, exact-replica registration, or
   partition handle.
6. A port's bound identity is exactly
   `{ systemId, userId, systemName }`. Online authentication supplies
   `systemId` and `userId` and confirms `systemName`; eligible offline
   fallback supplies `systemId` and `userId` from the untrusted locator and
   retains the requested `systemName`.
7. A port binds at most once. Any later result, retry, or call that attempts to
   change any bound identity field is rejected and ejects only that port.
8. No identity getter RPC is added. Identity is published once in the successful
   `acquireUserPartitionRepo` result.

### 3. Provider and acquisition contract

1. `ZerospinApp.Provider` removes its `userId` prop. Provider no longer
   imports or calls Zerospin `authenticate`, reads or writes the legacy
   locator, or chooses an acquisition mode.
2. Provider still constructs the selected `authenticationLock` and retains a
   live ref to `generateSignature`. Updating the callback prop does not
   restart the Provider lifecycle; the next worker invocation executes the
   current ref.
3. The page callback wrapper retains the current
   `Schema.decodeUnknown(selectedAuthenticationSignature.schema)` validation
   and maps invalid output to `authentication-signature-invalid` before
   encoding the RPC result
   ([`makeZerospinApp.tsx:219-234`](../../../packages/react/src/makeZerospinApp.tsx#L219-L234)).
4. The callback returns the application-defined signature payload selected by
   the authentication schema. It is not canonically a raw token. The worker
   invokes it over the MessagePort RPC boundary and performs Zerospin
   authentication inside the worker.
5. `acquireUserPartitionRepo` accepts exactly:

   `{ systemName, authenticationLock, generateSignature }`

6. `acquireUserPartitionRepo` returns exactly:

   `{ api, release, systemId, userId, mode }`

   Here `api` is the bound `UserPartitionRepo`, `release` is the
   idempotent port/RPC finalizer, and `mode` is `online | existing-only`.

7. The function obtains `apiUrl` and `publishableKey` from its existing
   services, creates the identity-neutral SharedWorker URL, opens one
   MessagePort, and transfers the signature capability in the handshake.
8. Provider uses the returned `systemId`, `userId`, and `mode` for
   diagnostics and aggregate/service bootstrap. There is no temporary
   page-owned `AuthenticatedApi` to release.
9. Provider session finalization releases aggregate and service registration
   handles before releasing the port. A failed atomic session bootstrap
   releases every already-acquired registration and then the unpublished port
   root.

### 4. Automatic online-first handshake

1. The port stores the fixed `systemName`, `authenticationLock`, and live
   `generateSignature` capability before starting its first authentication.
2. The worker invokes the page callback, calls the existing frontend
   authentication boundary inside the SharedWorker, reads the returned
   authentication receipt, and requires exact `systemName`.
3. Successful online authentication installs the exact returned
   `AuthenticatedApi` as that port's current root and binds the port to exact
   `{ systemId, userId, systemName }`.
4. The worker opens or reuses the exact `{ systemId, userId }`
   `UserPartitionRepo` and validates its clean-cut persistence before
   publishing it.
5. The worker persists the successful identity in
   `lastUserPartitionStore` after the partition opens and before returning the
   public acquisition result.
6. Only these existing authentication outcomes are eligible for offline
   fallback:
   1. `user-authentication-transport-failed`
   2. `gateway-infrastructure-failure`
   3. `system-deploy-activating`
   4. `system-deploy-failed`
   5. `system-not-ready`

7. Signature generation failure, local
   `authentication-signature-invalid`, signature RPC decoding failure,
   definitive authentication rejection, and any authenticated identity mismatch
   are terminal for the initial acquisition. They never consult the offline
   locator.
8. Eligible fallback reads the last locator for the exact configuration,
   binds the port to that locator's identity, opens only the matching existing
   user partition, and returns `mode: 'existing-only'`.
9. Missing locator data returns `offline-user-locator-unavailable`. It does
   not guess a user, enumerate accounts for selection, or fall back to another
   configuration.
10. Later online promotion reuses the same port configuration and callback.
    Authentication must resolve the port's already-bound
    `{ systemId, userId, systemName }` before a root is installed or any exact
    Repo gains online authority.

### 5. Worker-owned offline locator

1. `lastUserPartitionStore` is a small native IndexedDB module. It is not
   another wa-sqlite, SQLite, or Drizzle database.
2. The module exports exactly these named Effect functions:
   1. `openLastUserPartitionStore`
   2. `getLastUserPartition`
   3. `setLastUserPartition`

3. No named store type, service, wrapper API, repository class, or one-call
   helper is introduced.
4. The persisted record is exactly
   `{ key, systemId, userId }` and is validated with Effect Schema on every
   read and before every write.
5. `key` is the deterministic serialization of exact
   `{ apiUrl, publishableKey, systemName, authenticationLock }`. It contains
   no signature payload, token, capability, mode, runtime state, replica
   frontier, resource, or journal data.
6. The store contains at most one current record per configuration key.
   Successful later authentication for the same key replaces the earlier
   locator; different configurations remain isolated.
7. IndexedDB request/transaction failures use distinct operation-specific error
   codes:
   1. `open-last-user-partition-store-failed`
   2. `get-last-user-partition-failed`
   3. `set-last-user-partition-failed`

8. A missing valid record is not a store-operation failure; the automatic
   fallback maps it to `offline-user-locator-unavailable`.
9. A malformed record, excess or legacy record shape, invalid identifier, or
   incompatible store layout returns
   `browser-persistence-reset-required`. No partial value is used.
10. Locator write failure aborts acquisition. The worker releases the
    unpublished root and closes or releases every partition/database handle
    opened only for that unpublished acquisition. It does not disturb a
    partition handle already published to another port.

### 6. Per-port authenticated root

1. Every online MessagePort owns one independent current
   `AuthenticatedApi`. Roots are never shared across ports, even when two
   signatures resolve the same identity.
2. Initial authentication is single-flight per port. Concurrent work awaiting
   that root observes the same pending attempt and exact resulting object.
3. Exact `AuthenticatedApi` object identity is the freshness fence. The
   design adds no raw token comparison, signature comparison, polling, timed
   lease, periodic callback sweep, or server-session-expiry protocol.
4. Authentication after initial acquisition occurs only when the port has no
   root during online promotion, when a captured current root must be refreshed
   after a refreshable failure, or immediately before another port replaces an
   exact Repo's current authority.
5. Replacing a port root releases the prior root after the replacement is
   installed and fenced. Any exact Repo child minted by the prior object becomes
   stale.
6. Root replacement does not eagerly scan or reauthorize sibling exact Repos.
   Each exact Repo compares its stored parent object with the selected port's
   current root on its next authority operation, disposes its own stale child,
   and reauthorizes lazily.
7. Non-authority registrations retain access to their port root for authority
   selection by this or another exact Repo, but they do not pre-authorize a
   child for the current exact Repo.

### 7. Exact-Repo identity and authority

1. Exact aggregate Repo identity remains
   `{ systemId, userId, aggregateName, aggregateId, frontendName, aggregateFrontendLockKey }`.
   The bound user partition supplies `systemId` and `userId`; Provider's
   aggregate selection supplies `aggregateId`; the source-selected frontend
   supplies `aggregateName`, `frontendName`, the complete lock and frontend
   spec; and the lock-key boundary supplies
   `aggregateFrontendLockKey`.
2. Exact service Repo identity remains
   `{ systemId, userId, serviceName, frontendName, serviceFrontendLockKey }`.
   The bound user partition supplies `systemId` and `userId`; the
   source-selected frontend supplies `serviceName`, `frontendName`, the
   complete lock and frontend spec; and the lock-key boundary supplies
   `serviceFrontendLockKey`.
3. Each exact Repo owns at most one installed server child. A child created
   during fenced authorization is an unpublished candidate until it replaces
   the installed authority; a stale or rejected candidate is disposed and
   never becomes a second authority:
   1. one `AggregateFrontendApi` for an aggregate Repo; or
   2. one `ServiceFrontendApi` for a service Repo.

4. The current authority tuple is exactly the selected registration ID, that
   registration's MessagePort `ownerToken`, the exact parent
   `AuthenticatedApi` object owned by that port, and the Repo-owned aggregate
   or service child minted by that parent. The registration ID is allocated by
   the exact Repo, the `ownerToken` is allocated by the worker host, the
   parent comes from the selected port, and the child comes from exact target
   authorization through that parent.
5. No named type is introduced for the current authority tuple unless a later
   implementation review explicitly approves one. The four fields remain
   explicit at every capture and fence.
6. The authority is sticky to the oldest usable live online registration. A
   newer registration does not replace a healthy current authority.
7. The first online registration for a Repo authorizes and validates the
   Repo-owned child. A subsequent registration first validates the local exact
   target, complete lock, lock key, and byte-exact frontend spec against the
   existing catalog/runtime, then attaches without making another child
   authorization call.
8. Every registration continues to own its delivery sink, delivery gate,
   captured state, buffered blocks, mode, registration order, `ownerToken`,
   and release state. It owns no server child or parent-child pair.
9. Existing-only registrations participate in local state delivery and
   aggregate staging but are never eligible as online authority until their
   port authenticates and promotion validates the same bound identity.
10. Releasing the selected registration disposes the Repo-owned child and
    socket associated with its authority before selecting a replacement.
    Releasing a non-selected registration performs no child disposal.
11. If no online registration remains, the exact Repo disposes its child and
    socket and cancels authority work. It preserves the local runtime,
    persisted resources, metadata, aggregate journal, registered
    existing-only sinks, and resumable aggregate intent.

### 8. Recovery and failure classification

| Condition                                                                                 | Required behavior                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Refreshable child failure under the installed authority                                   | Refresh the selected port first, require the same bound identity, mint and validate a replacement child, then retry the authority operation only through the newly installed tuple.                                    |
| Selected port cannot refresh because its callback or transport is transiently unavailable | Leave every registration owned by that port attached for delivery, dispose or fence its unusable authority, and freshly authenticate the oldest remaining online registration before installing replacement authority. |
| A non-selected candidate has transient callback or transport failure                      | Keep the port and its registrations attached, skip it for this authority attempt, and continue in registration order.                                                                                                  |
| Definitive authentication rejection                                                       | Eject only that MessagePort, release its root and signature capability, and release every registration carrying its `ownerToken`. Other ports and exact Repos continue.                                                |
| Fresh authentication resolves different `systemId`, `userId`, or `systemName`             | Treat the locator or prior root as non-authoritative, eject only that port, and never install the mismatched root.                                                                                                     |
| Fresh same-user root receives definitive exact target, lock, or owner-admission rejection | Fail that exact Repo, notify its registrations, and dispose its child/socket. Do not retry the same shared target through every port.                                                                                  |
| No online candidate is currently usable after transient failures                          | Keep the Repo locally usable, preserve registrations and durable intent, and allow later retry/promotion without treating the transient outage as definitive Repo failure.                                             |
| Store set fails after online authentication and partition open                            | Abort before publication, release the unpublished root, and close or release only unpublished handles.                                                                                                                 |

1. “Fresh” in this matrix means an `AuthenticatedApi` returned by an
   authentication attempt begun for the current recovery or authority-transfer
   decision, not merely a root object that happened to remain cached on the
   candidate port.
2. A definitive child denial is shared exact-target evidence because every
   registration represents the same user, target, complete lock, and byte-exact
   frontend spec. Trying every page cannot change that decision.
3. A transient port failure is not exact-target evidence. It changes authority
   eligibility for the current attempt but does not delete the port's delivery
   attachment.

### 9. Existing-only boundary

1. Existing-only acquisition performs no authentication after the eligible
   online-first failure and locator read.
2. It performs no server child authorization, authoritative state fetch,
   repair, push, manual push wake, websocket ticket creation, or socket open.
3. It may validate and open only the exact clean-cut persisted user partition
   and exact replica databases selected by the locator and frontend inputs.
4. Aggregate sessions retain current local reads, synchronous page staging,
   durable SharedWorker handoff, optimistic resource projection, and active
   journal persistence.
5. Service sessions retain current local reads and delivery of already
   persisted state but gain no mutation behavior.
6. Later `online` promotion first obtains a same-identity port root and only
   then enters ordinary exact-Repo authority selection and authoritative
   replacement.

### 10. Remote-result and socket fencing

1. A late authentication result may install only while the same
   `SharedWorkerApi`, `ownerToken`, binding configuration, pending attempt,
   and port lifetime remain current.
2. A late child-authorization result may install only while the selected
   registration ID, its `ownerToken`, the captured parent, the authority
   selection attempt, and the exact Repo remain current.
3. Every state, ticket, push, repair, or replacement result captures the
   selected registration ID, `ownerToken`, exact parent, and Repo-owned child.
   It may commit only while the complete captured tuple remains installed and
   the captured parent is still the port's current root.
4. Every websocket callback additionally captures the exact socket object. It
   is ignored unless the registration ID, `ownerToken`, parent, child, and
   socket all remain current.
5. Plan 054's generation fencing remains authoritative: a late G1 callback
   cannot mutate G2 state; authoritative replacement or aggregate rebase
   commits before a new-generation socket opens; and generation-relative
   equal, lower, or reset `frontendIndex` values remain valid during that
   replacement
   ([Frontend WebSocket](../../architecture/FrontendWebSocket.md)).
6. Aggregate push continues to use the child as an admitted exact target while
   routing the write through singleton current `SystemRepo`; this design does
   not move current-write authority or add generation identity to browser
   persistence
   ([AggregateFrontendApi](../../architecture/AggregateFrontendApi.md)).

### 11. Clean browser cutover

1. The change requires a clean Zerospin browser-persistence epoch even though
   Plan 054's logical exact-replica schemas remain the design after reset.
2. `lastUserPartitionStore` and every user-partition VFS/database use a
   distinct post-056 IndexedDB namespace. The existing
   `zerospin/{systemId}/users/{userId}` VFS namespace is never opened as
   post-cutover state
   ([`makeVfsName.ts:3-10`](../../../packages/shared-worker/src/SharedWorker/makeVfsName.ts#L3-L10)).
3. The worker-owned native IndexedDB open validates the storage epoch before
   creating or opening a post-056 user partition. Any non-empty pre-056
   Zerospin IndexedDB namespace or incompatible native/SQLite layout returns
   `browser-persistence-reset-required` before mutation.
4. A valid post-056 namespace and valid
   `{ key, systemId, userId }` locator distinguish an ordinary later reopen
   from legacy state. Post-cutover non-empty state must reopen successfully.
5. Runtime code does not read, decode, or probe a legacy `localStorage`
   locator. Its presence is ignored by acquisition and cannot select an
   identity. Clearing that key namespace is an explicit release/development
   workflow requirement, not a page-side runtime validation boundary.
6. No conversion migration, fallback decoder, compatibility field, alternate
   key, dual read/write path, or automatic deletion is added.
7. The release and development reset workflow closes all old Zerospin tabs and
   workers, then explicitly clears only Zerospin-scoped IndexedDB databases and
   Zerospin-scoped `localStorage` keys for the affected origin.
8. The workflow never clears unrelated origin data and never deletes remote,
   shared, or production-like server state.
9. A reset is an explicit operator/user action. Runtime failure reports the
   requirement and leaves bytes untouched.

## Testing Decisions

1. Add a focused native IndexedDB module test for
   `lastUserPartitionStore`. It proves:
   1. distinct serialized configurations are isolated;
   2. a later successful set replaces only the same key;
   3. missing records remain distinguishable from operation failure;
   4. malformed, excess, invalid-ID, and legacy records require reset;
   5. open, get, and set failures retain their distinct codes;
   6. reads and writes pass through Effect Schema; and
   7. prior non-empty IndexedDB persistence is rejected without automatic
      deletion, while valid post-056 non-empty state reopens.

2. Extend
   [`startSharedWorker.invariants.node.spec.ts`](../../../packages/shared-worker/src/SharedWorker/startSharedWorker.invariants.node.spec.ts)
   as the highest deterministic SharedWorker seam. It proves:
   1. one identity-neutral host isolates multiple authenticated
      `{ systemId, userId }` partitions;
   2. concurrent initial work authenticates each online port once;
   3. two distinct signature capabilities resolving the same identity attach to
      one exact Repo and one Repo-owned child;
   4. authority remains on the oldest usable registration;
   5. replacing authority freshly authenticates the next port before child
      installation;
   6. transient callback and transport failure preserve registrations;
   7. authentication rejection and identity mismatch eject only the offending
      port and all registrations carrying its `ownerToken`;
   8. definitive child denial through a fresh same-user root fails only the
      exact Repo and does not probe every port;
   9. one port root replacement invalidates sibling exact-Repo children lazily;
   10. zero online registrations dispose the child/socket while retaining local
       state and aggregate journal work; and
   11. late authentication, child, state, ticket, push, repair, replacement,
       and socket results are rejected by the complete fences.

3. Extend
   [`acquireUserPartitionRepo.node.spec.ts`](../../../packages/shared-worker/src/acquireUserPartitionRepo.node.spec.ts)
   to prove:
   1. the URL contains `apiUrl`, `publishableKey`, and `wasmUrl` but no
      `systemId` or `userId`;
   2. the request is exactly
      `{ systemName, authenticationLock, generateSignature }`;
   3. the result is exactly
      `{ api, release, systemId, userId, mode }`;
   4. the online, eligible offline, ineligible failure, missing-locator,
      corrupt-locator, and locator-write-failure paths follow the required
      ordering; and
   5. release remains idempotent across explicit release, page close, setup
      failure, and BFCache behavior.

4. Extend the focused React tests to prove:
   1. Provider has no `userId` prop or page-side `authenticate()` call;
   2. returned worker identity and mode feed diagnostics and every session;
   3. changing `generateSignature` updates the callback ref without restarting
      the Provider lifecycle;
   4. invalid callback output remains
      `authentication-signature-invalid` and never enters offline fallback;
   5. partial session acquisition releases registrations before the port root;
   6. Provider replacement/unmount preserves the same release ordering; and
   7. existing-only sessions promote only after same-identity worker
      authentication.

5. Retain focused real-browser two-page coverage in
   [`shoppingSharedWorkerMultiPage.playwright.spec.ts`](../../../examples/shopping/e2e/shoppingSharedWorkerMultiPage.playwright.spec.ts)
   and the adverse SharedWorker browser seam. They prove:
   1. two pages share one host and exact Repo while retaining independent ports
      and sinks;
   2. closing the selected page transfers authority and the surviving page
      continues;
   3. a cold-offline launch uses the last valid worker-owned locator;
   4. later online availability promotes only the same identity; and
   5. pre-cutover IndexedDB persistence produces reset-required behavior until
      the scoped reset workflow runs;
   6. valid post-056 non-empty persistence reopens; and
   7. legacy `localStorage` locator values are never read or used.

6. The focused implementation acceptance matrix runs the SharedWorker, React,
   and Shopping Nx build, typecheck, lint, unit, and browser targets. The
   production implementation is incomplete until every applicable target is
   green.
7. The existing SharedWorker invariant seam, focused acquisition/React seams,
   and real-browser Shopping seam are sufficient. This design adds no new
   browser-to-workerd harness.
8. This documentation pass requires only formatting, link, and diff validation.
   The Nx acceptance matrix applies to the later production implementation.

## Out of Scope

1. Raw token equality, signature equality, periodic callback sweeps, timed
   leases, or server-enforced authentication expiry.
2. Worker-native authentication-provider SDK integration. Clerk's ordinary
   React Router integration exposes page auth state through
   [`useAuth()`](https://clerk.com/docs/react-router/reference/hooks/use-auth);
   its documented background-worker client is
   [Chrome-extension-specific](https://clerk.com/docs/references/chrome-extension/create-clerk-client/).
3. A real Clerk token-verification migration in Shopping.
4. Any change to System-owned authentication semantics, Gateway contracts,
   `AuthenticatedApi` server shape, owner authorization, SystemRepo
   current-write ownership, or remote persistence.
5. Any change to Plan 054's command schema, five-way `IPushBlock`, exact
   replica schema, active-journal accounting, repair, generation drain, or
   authoritative replacement behavior.
6. Persisting credentials, signature payloads, tokens, RPC capabilities,
   `AuthenticatedApi`, child frontend APIs, registrations, delivery state, or
   socket state in `lastUserPartitionStore`.
7. A user/account selector for cold-offline startup. The store is deliberately
   last-account-per-configuration.
8. An implementation plan or production-code change during this Spec 056
   documentation pass.

## Further Notes

1. The page-executed signature callback is a capability, not the location of
   Zerospin authentication. All Gateway and server API calls occur inside the
   SharedWorker after this cutover.
2. The offline locator is untrusted routing data. Only a later authenticated
   same-identity receipt can restore online authority.
3. There are no deferred architecture questions in this specification. A later
   implementation plan must reuse prefix and topic
   `056-plan-shared-worker-port-authentication-and-exact-repo-authority.md`
   and archive this specification when that plan is created.
