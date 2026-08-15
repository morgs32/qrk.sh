# SharedWorker port authentication and exact-Repo authority implementation plan

**Date:** 2026-08-14
**Status:** Planned
**Source specification:**
[`056-spec-shared-worker-port-authentication-and-exact-repo-authority.md`](../archived/056-spec-shared-worker-port-authentication-and-exact-repo-authority.md)

## 1. Objective and completion boundary

1. Hard-cut the browser runtime to one identity-neutral SharedWorker host whose
   URL contains exactly `apiUrl`, `publishableKey`, and `wasmUrl`, while every
   MessagePort begins unbound and owns its own signature capability,
   authentication state, authenticated root, and `ownerToken`.
2. Move the complete online-first authentication and cold-offline locator
   decision into `SharedWorkerApi.getUserPartitionRepo`. The main thread keeps
   executing the application signature callback, but performs no Zerospin
   authentication and owns no temporary `AuthenticatedApi`.
3. Replace per-registration child ownership in both exact replica Repos with
   one sticky Repo-owned authority tuple containing the selected registration
   ID, its port `ownerToken`, that port's exact current `AuthenticatedApi`
   object, and one aggregate or service child API.
4. Add the native IndexedDB `lastUserPartitionStore`, move all browser replica
   storage into an explicit post-056 namespace, reject non-empty pre-056
   persistence without mutation, and keep legacy `localStorage` entirely out
   of the runtime.
5. Preserve the current user-root catalogs, exact aggregate and service
   replica schemas, aggregate command journal, complete five-way `IPushBlock`,
   repair, authoritative replacement, push ordering, and generation-drain
   behavior. This plan changes browser authentication and authority ownership,
   not server contracts or convergence semantics.
6. Complete the plan only when the SharedWorker, React, DevTools, and Shopping
   consumers pass their focused static, unit, deterministic-browser, and real
   two-page gates; every required late-result fence is tested; and no
   superseded page-authentication, legacy-locator, identity-bearing worker URL,
   or per-registration child path remains active.
7. Preserve unrelated worktree changes, including the existing changes under
   `wiki/index.md`, `wiki/overview.md`, and `.obsidian`, and the current deletion
   of archived Plan 055. Edit overlapping files in place and do not restore or
   reformat unrelated work.

## 2. Fixed contracts, identities, and exclusions

1. Keep the package export
   `@zerospin/shared-worker/acquireUserPartitionRepo`, the
   `sharedWorker.bundle.js` entry, `wa-sqlite-async.wasm`, the fixed worker name
   `zerospin:shared-worker`, and the existing MessagePort/capnweb transport.
2. Change the public `acquireUserPartitionRepo` input to exactly
   `{ systemName, authenticationLock, generateSignature }` and its result to
   exactly `{ api, release, systemId, userId, mode }`, where `mode` is
   `online | existing-only` and `release` remains a main-thread-local
   idempotent Effect.
3. Change the inner `SharedWorkerApi.getUserPartitionRepo` RPC to accept exactly
   `{ systemName, authenticationLock, generateSignature }` and return the
   RPC-serializable `{ api, systemId, userId, mode }`. Do not attempt to send
   the `release` Effect across capnweb and do not add an identity getter RPC.
4. Bind each port at most once to exact `{ systemId, userId, systemName }`:
   authentication supplies `systemId` and `userId`, the request supplies
   `systemName`, and the worker requires the authenticated receipt to match it.
   Eligible offline fallback supplies the two IDs from the untrusted locator
   and retains the requested `systemName`.
5. Keep exact aggregate Repo identity
   `{ systemId, userId, aggregateName, aggregateId, frontendName, aggregateFrontendLockKey }`.
   The bound partition supplies `systemId` and `userId`, Provider selection
   supplies `aggregateId`, the selected frontend supplies both names, the
   complete lock, and the frontend spec, and lock-key validation supplies
   `aggregateFrontendLockKey`.
6. Keep exact service Repo identity
   `{ systemId, userId, serviceName, frontendName, serviceFrontendLockKey }`.
   The bound partition supplies `systemId` and `userId`, the selected frontend
   supplies both names, the complete lock, and the frontend spec, and lock-key
   validation supplies `serviceFrontendLockKey`.
7. Keep the authority tuple inline wherever it is stored or captured. Its
   exact fields are `{ registrationId, ownerToken, authenticatedApi, frontendApi }`;
   introduce no named type alias or interface for it and no loose label that
   hides those fields.
8. Add no token/signature comparison, polling, periodic callback sweep, timed
   lease, server-session-expiry work, Worker-native authentication-provider
   SDK, real Clerk token verification, server RPC, server persistence, or
   remote reset.
9. Keep `makeMockProvider`'s explicit fixture `userId`. It is a separate mock
   API that deliberately does not simulate authentication; only the production
   `ZerospinApp.Provider` loses `userId`.
10. Introduce no compatibility alias, legacy decoder, old/new dual path,
    automatic browser deletion, Drizzle migration, standalone journal index,
    failed-only push result, new public package export, named store type, or
    new authority helper/type abstraction.

## 3. Post-056 persistence epoch and native locator

1. Add
   `packages/shared-worker/src/SharedWorker/lastUserPartitionStore.ts` as an
   internal module. Export only these three named Effect functions:
   1. `openLastUserPartitionStore`, returning the opened native
      `IDBDatabase`;
   2. `getLastUserPartition`, accepting the opened database and exact key and
      returning strict `{ key, systemId, userId } | null`; and
   3. `setLastUserPartition`, accepting the opened database and the exact
      `{ key, systemId, userId }` record and returning `void`.
2. Keep the record Schema, database/store names, request-to-Effect adaptation,
   and request/transaction cleanup in that module. Do not create a separate
   schema file, store class, Context service, wrapper API, custom store type, or
   one-call helper.
3. Use the literal native database name
   `zerospin/056/last-user-partition-store`, version `1`, and the object store
   `lastUserPartitions` with key path `key`. Require exactly that compatible
   native layout on later opens; incompatible version/store/key-path/index
   state returns `browser-persistence-reset-required` without an upgrade or
   delete attempt. Scope each returned `IDBDatabase` connection to one
   acquisition, close it after the required read/write and on every failure,
   and close it immediately on `versionchange`; do not retain a host-global
   open connection that can block an explicit reset.
4. Validate every read and write with a strict Effect Schema for exactly
   `{ key: string, systemId: ISystemId, userId: NonEmptyString }`, including
   excess-property rejection. A missing key returns `null`; malformed,
   legacy-shaped, excess, or invalid-ID data returns
   `browser-persistence-reset-required` and is never partially consumed.
5. Build the key in the worker from the Schema-decoded configuration using the
   fixed property order
   `JSON.stringify({ apiUrl, publishableKey, systemName, authenticationLock })`.
   Do not include a signature payload, token, capability, mode, runtime state,
   replica metadata, resource, or journal field.
6. Map native IndexedDB failures at their operation boundaries to exactly:
   1. `open-last-user-partition-store-failed` for enumeration/open/layout-read
      request failures that are not an identified incompatible layout;
   2. `get-last-user-partition-failed` for get/readonly-transaction failures;
      and
   3. `set-last-user-partition-failed` for put/readwrite-transaction failures.
7. Before creating or opening the post-056 native store, use the worker's
   native IndexedDB factory to enumerate existing databases. Inspect every
   database whose name starts with `zerospin/` but not `zerospin/056/` through
   read-only transactions; if any object store contains data, close it and
   return `browser-persistence-reset-required`. Empty legacy databases may be
   ignored, and no database or record is deleted or upgraded by this check.
8. Change
   [`makeVfsName.ts`](../../../packages/shared-worker/src/SharedWorker/makeVfsName.ts)
   to return the literal post-cut prefix
   `zerospin/056/${systemId}/users/${userId}`. Exact aggregate and service VFS
   names continue deriving beneath that user-partition root, so every
   catalog, replica, resource, metadata, and journal database moves to the same
   clean epoch without changing its logical Schema.
9. Extend
   [`makeIdbSQLite3.ts`](../../../packages/shared-worker/src/drizzle/makeIdbSQLite3.ts)
   with a required inline `mode: 'create-or-open' | 'existing-only'` argument.
   Before constructing `IDBBatchAtomicVFS`, enumerate the native databases; if
   the named VFS exists, open it without a version and require version `5`,
   exactly the `blocks` object store with key path
   `[path, offset, version]`, exactly its `version` index with key path
   `[path, version]`, and no extra stores or indexes. Close that preflight
   connection before constructing the VFS. Any incompatible existing layout
   returns `browser-persistence-reset-required` without triggering an upgrade.
   `existing-only` additionally requires the VFS database to exist and omits
   `SQLITE_OPEN_CREATE`; `create-or-open` permits an absent VFS and otherwise
   retains the current create/read-write behavior. Update all shared-worker
   callers and focused tests. Do not add a second SQLite factory or
   compatibility default.
10. Use `existing-only` for the located user partition and every located exact
    replica during offline startup. A missing VFS or SQLite file must fail
    through the existing caller-specific unavailable path without creating an
    IndexedDB database, SQLite file, catalog row, metadata row, or migration
    receipt.
11. Give `migrateUserReplicaDbAsync` the same required acquisition mode. In
    `existing-only`, accept only the exact current baseline and receipt and
    return before its migration transaction; never initialize an empty user
    root. In both exact-replica acquisition effects, skip `migrateDbAsync` in
    `existing-only` after the existing read-only exact-schema validation has
    succeeded, so offline open performs no schema or index repair.
12. Extend the existing `userReplicaOpenPromises` critical section, keyed by
    exact `{ systemId, userId }`, through physical user-partition open,
    validation, the first required locator write, and map publication. Insert a
    new handle into `userReplicaStores` only after that write succeeds. A later
    acquisition of an already-published partition still writes its own
    configuration key before returning, but unrelated identities must continue
    opening concurrently; do not replace the keyed single flight with a
    worker-global tail.
13. If a locator write fails for a newly opened partition, release the
    unpublished authenticated root, close its SQLite database and VFS, leave
    the runtime maps unchanged, and propagate the set-specific error. If the
    partition was already published for another port, fail the new acquisition
    and release only its root/port state; do not close the shared handle.
14. Test the native module in a new focused
    `examples/shopping/tests/browser/lastUserPartitionStore.playwright.spec.ts`
    and add that exact filename to the explicit `include` list in
    `examples/shopping/vitest.playwright.config.ts`. Import the internal module
    directly for this workspace-only test so real Chromium IndexedDB covers
    configuration isolation, same-key last-write wins, missing records, strict
    corruption handling, all three operation failures, locator layout
    incompatibility, pre-056 rejection without mutation, VFS version/store/index
    incompatibility without upgrade, and valid non-empty post-056 reopen. Add
    no `fake-indexeddb` dependency and no public export for the store.

## 4. Identity-neutral host and per-port authentication root

1. In
   [`acquireUserPartitionRepo.ts`](../../../packages/shared-worker/src/acquireUserPartitionRepo.ts),
   remove `systemId` and `userId` from the Effect props and SharedWorker URL.
   Preserve the existing explicit URL-string construction required by the
   Turbopack asset behavior, but emit only `apiUrl`, `publishableKey`, and
   `wasmUrl` query parameters.
2. In
   [`startSharedWorker.ts`](../../../packages/shared-worker/src/SharedWorker/startSharedWorker.ts),
   parse and validate only those three runtime parameters. Remove the host-wide
   identity decode and pass no identity into the `SharedWorkerApi` constructor.
   Keep one `SharedWorkerApi` and opaque `ownerToken` per accepted port and keep
   the user-partition and exact-Repo maps worker-global.
3. Reshape the inline state in
   [`SharedWorkerApi.ts`](../../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/SharedWorkerApi.ts)
   to hold:
   1. the once-bound configuration containing exact `systemName`,
      `authenticationLock`, and `generateSignature` fields;
   2. `boundIdentity: null | { systemId, userId, systemName }`;
   3. the current authentication receipt/root;
   4. one pending authentication attempt and its opaque attempt token; and
   5. synchronous disposed/ejected state.
4. Retain the signature `RpcStub` once per port and dispose it only when the
   port is ejected or released. The page callback itself must call the current
   React ref on every invocation; updating the callback prop must not replace
   the worker, port, configuration, or Provider scope.
5. Refactor the existing function-local `getAuthenticatedApi` boundary in
   `SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts`; do not add a
   second helper. Give its existing inline argument an explicit freshness
   choice so it can:
   1. return the current root when it remains usable;
   2. refresh only when the captured failed parent is still current; or
   3. force an authentication attempt begun for the current authority-transfer
      decision even if a cached root exists.
6. Preserve per-port single flight. Concurrent callers awaiting the same
   pending authentication receive the exact same receipt/root object. Install
   a replacement root only while the same `SharedWorkerApi`, `ownerToken`,
   configuration object, pending attempt/token, and port lifetime remain
   current; dispose every late or rejected result.
7. On successful replacement, require exact equality with an existing bound
   `{ systemId, userId, systemName }`, install the new receipt/root first, then
   release the prior root. Do not scan or eagerly reauthorize sibling exact
   Repos; their parent-object checks invalidate and replace stale children on
   their next authority operation.
8. Extend the existing same-named
   [`dispose`](../../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/dispose/dispose.ts)
   Effect so explicit port close and definitive authentication ejection share
   one lifecycle. Synchronously mark the `SharedWorkerApi` terminal, retain the
   definitive error for every later RPC, clear its installable
   attempt/root/configuration fences, and release its root and signature
   capability exactly once. Treat this as logical port ejection: notify and
   release every aggregate and service registration carrying the `ownerToken`;
   the existing main-thread finalizer remains responsible for physically
   closing the MessagePort. If ejection begins inside an exact Repo serializer,
   schedule its `releaseOwner` cleanup after that queue step unwinds and never
   await the same Repo queue recursively.
9. For a later refresh or authority-transfer attempt, classify source and code
   explicitly. A rejected page capability invocation mapped to
   `authentication-signature-capability-failed`, a decoded page-callback
   failure other than `authentication-signature-invalid`, and exactly
   `user-authentication-transport-failed`, `gateway-infrastructure-failure`,
   `system-deploy-activating`, `system-deploy-failed`, or `system-not-ready`
   make that port unusable only for the current selection attempt. Keep its
   registrations attached for delivery, clear only an unusable selected
   authority, and try another port. The initial handshake instead uses only
   Section 5's five-code offline allowlist; callback failure never enters
   offline fallback.
10. Treat a non-transient authentication rejection, configuration rebinding,
    or fresh receipt resolving a different `systemId`, `userId`, or
    `systemName` as port-definitive. Invoke the port disposal/ejection lifecycle
    and never install that result; other ports and exact Repos remain alive.
11. Update
    [`UserPartitionRepo.ts`](../../../packages/shared-worker/src/SharedWorker/UserPartitionRepo/UserPartitionRepo.ts)
    to receive the identity only after binding and to pass each exact Repo its
    `ownerToken`, current-root access, the existing `getAuthenticatedApi`
    callback with its inline freshness argument, and existing registration
    release fencing using inline constructor/Effect shapes. Add no public RPC,
    second callback helper, or named port-authority interface.

## 5. Online-first acquisition and existing-only fallback

1. Rebuild `SharedWorkerApi.getUserPartitionRepo` in this exact order:
   1. reject a released port;
   2. Schema-decode and store the once-bound request configuration and retained
      callback capability;
   3. attempt worker-side authentication before reading any locator;
   4. on success, validate `systemName`, bind the returned identity, and retain
      that exact root;
   5. after the authentication outcome but before any user-partition VFS open,
      call `openLastUserPartitionStore` for both paths so its storage-epoch and
      locator-layout validation completes before post-056 persistence can
      mutate;
   6. on only an eligible failure, read the exact configuration key from that
      opened store, require a valid record, and bind its untrusted identity
      without installing a root;
   7. open or reuse the exact post-056 `{ systemId, userId }` partition in
      `create-or-open` for online or `existing-only` for fallback;
   8. on online success, write the locator after the partition is valid but
      before publishing a newly opened handle or returning the RPC result; and
   9. close the scoped native-store connection and return
      `{ api, systemId, userId, mode }` only after every required step succeeds;
      close it in the same acquisition's failure finalizer on every earlier
      exit.
2. Permit offline fallback only for these exact initial authentication codes:
   1. `user-authentication-transport-failed`;
   2. `gateway-infrastructure-failure`;
   3. `system-deploy-activating`;
   4. `system-deploy-failed`; and
   5. `system-not-ready`.
3. Keep signature callback failure, `authentication-signature-invalid`, RPC
   signature decode failure, definitive authentication rejection,
   configuration mismatch, and identity mismatch terminal. They must not call
   `getLastUserPartition` or open an offline partition.
4. Map a valid store with no record for the exact key to
   `offline-user-locator-unavailable`. Do not enumerate users, guess another
   configuration, consult legacy `localStorage`, or use a partial record.
5. In `existing-only`, permit only local user-root/catalog reads, exact
   replica open/validation, persisted state delivery, and aggregate staging and
   journal work. Prohibit authentication after fallback, child admission,
   state fetch, repair, push/manual wake, ticket, socket, or any other server
   call until promotion.
6. Keep later aggregate and service promotion on the same registration and
   MessagePort. The existing `online` reacquisition path must first authenticate
   the port, require the already-bound identity, then make that registration
   eligible for ordinary Repo authority selection. A temporary duplicate RPC
   stub may be disposed, but promotion must not create or release a second
   registration or sink.
7. In the main-thread `acquireUserPartitionRepo`, decode the inner result, add
   the existing idempotent MessagePort/RPC `release` Effect locally, and return
   the exact public five-field object. Preserve explicit release, port close,
   non-persisted `pagehide`, BFCache, failed handshake, and duplicate-finalizer
   behavior.

## 6. Exact-Repo acquisition and activation boundary

1. In both
   `UserPartitionRepo/acquireAggregateFrontendReplica/acquireAggregateFrontendReplica.ts`
   and
   `UserPartitionRepo/acquireServiceFrontendReplica/acquireServiceFrontendReplica.ts`,
   keep local target-kind, complete lock, lock-key, byte-exact frontend-spec,
   catalog-row, database-layout, migration-receipt, and persisted metadata
   validation before any optional server authorization.
2. Remove the current eager `onlineCapability` creation before catalog/runtime
   lookup. An existing exact runtime with a healthy installed authority
   validates the registering page's target, lock, key, and spec locally and
   attaches its delivery registration without authorizing another child or
   fetching state. If the runtime has no healthy authority, attach the online
   registration, install the first eligible authority, and complete any
   required authoritative replacement before publishing ready state to it.
3. Allocate the existing string registration ID from the host's monotonic
   numeric allocator and preserve registration-array append order as that ID's
   ordering. Remove `registeredAt`, do not lexicographically sort the string
   IDs, and do not add a second `registrationOrder`; tied wall-clock timestamps
   and two competing counters cannot define the invariant.
4. For the first physical creation, construct an unpublished exact Repo in an
   activating state after the exact database is opened but before server state
   is requested. Attach the provisional registration, admit an unpublished
   child candidate, and install the four-field Repo authority tuple before
   calling `getState`.
5. Fence initial `getState` and the resources/metadata transaction by the
   installed registration ID, `ownerToken`, parent, child, authority-selection
   attempt, exact Repo instance, and current port root. Only after the
   transaction commits may the Repo become ready, its catalog row become
   visible, and its runtime enter the worker-global exact-Repo map.
6. Do not satisfy the initial fence with placeholder catalog metadata, a
   parent-only acquisition check, or a state fetch performed before the Repo
   exists. A rejected/stale candidate or failed initial transaction disposes
   the unpublished child, closes any still-unowned newly-created exact database
   handle, and leaves no catalog/runtime publication. Remove the current
   automatic database-deletion rollback; runtime never deletes browser bytes.
7. For an existing catalog/database whose runtime is not open, construct the
   Repo from the validated persisted state first. An online registration may
   then install the first authority and run the existing authoritative
   replacement requirement; an existing-only registration performs no server
   work.
8. Keep the current per-user-root acquisition serialization and exact database
   cleanup ordering. Do not alter the two catalog tables, their keys, exact
   replica database names, aggregate/service metadata table shapes, migration
   manifests, or logical persistence schemas.

## 7. One aggregate authority per exact Repo

1. In
   [`AggregateFrontendReplicaRepo.ts`](../../../packages/shared-worker/src/SharedWorker/AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts),
   remove `frontendApi`, `authenticatedApi`, `authorizationPromise`, and
   per-registration child ownership from the registration entries. Retain
   exactly the delivery sink, gate, captured snapshot, buffered blocks, mode,
   registration ID, `ownerToken`, release state, and the port-root access
   needed for later authority selection.
2. Replace `getRegistrationFrontendApi`, per-registration child-disposal
   branches, `registeredAt`, and `ticketReplacementRegistrationIds` with one
   inline Repo-owned installed authority and one opaque selection-attempt
   token/promise. Do not introduce a replacement helper name or authority type
   without a separate explicit review.
3. Select the first usable live online registration in the append order
   established by the allocator-backed registration IDs. Keep a healthy
   installed tuple sticky when newer registrations attach; local fan-out
   continues to all open delivery gates independently of authority ownership.
4. During first installation, selected-parent refresh, or transfer, keep a
   newly authorized child unpublished until its admission receipt validates
   that the selected port remains bound to exact
   `{ systemId, userId, systemName }` and validates the admitted aggregate
   target `{ aggregateName, aggregateId, frontendName, aggregateFrontendLockKey }`,
   complete aggregate frontend lock, aggregate kind, and byte-exact frontend
   spec. Install only while every selection/port/Repo fence remains current;
   dispose every stale or rejected candidate.
5. Route authoritative state fetch, repair, websocket-ticket creation,
   websocket connection, command push, failed-stage settlement, and
   authoritative replacement through only the installed four-field tuple.
   Never independently sort registrations or borrow a non-installed child for
   an operation.
6. Preserve the complete encoded journal commands and the existing bounded
   transport retry schedule. After a refreshable push failure exhausts that
   schedule, refresh the selected port first, install and fence one replacement
   tuple, and retry the same byte-identical command batch only through that
   tuple; do not create an unbounded retry loop or strip command fields.
7. Before failed-stage rewind/reapply begins and again before its transaction
   commits, require the same installed registration ID, `ownerToken`, parent,
   child, selection state, and current port root. Preserve journal-row byte
   checks, mutation inverses, metadata advance, commit-before-fan-out, and the
   complete five-way `IPushBlock` classification.
8. Preserve synchronous page staging, durable SharedWorker handoff, optimistic
   projection, `sessionIndex`, command-owned `replicaIndex`,
   `appliedMutationInverses`, push pause/manual wake, retry accounting,
   `onlineReplacementInstalled`, materialization repair, server-block
   application, and generation-relative replacement semantics.

## 8. One service authority per exact Repo

1. Apply the same registration hard cut and single installed authority to
   [`ServiceFrontendReplicaRepo.ts`](../../../packages/shared-worker/src/SharedWorker/ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts).
   Registrations retain delivery and port-root access only; one Repo-owned
   `ServiceFrontendApi` child is installed at a time.
2. Keep authority sticky to the oldest usable online registration and validate
   that a candidate's selected port remains bound to exact
   `{ systemId, userId, systemName }` and validates the admitted service target
   `{ serviceName, frontendName, serviceFrontendLockKey }`, complete service
   frontend lock, service kind, and byte-exact frontend spec before
   installation.
3. Route authoritative state, repair, ticket, socket, and replacement work
   through the one installed tuple and apply the same selection/current-root
   fences. Every socket callback additionally captures and checks the exact
   socket object.
4. Preserve service's journal-free, read-only behavior, metadata/resource
   transaction ordering, block ordering, replacement rules,
   `onlineReplacementInstalled`, state fan-out, and generation fencing.
5. Existing-only service registrations may open and receive persisted local
   state but may not authorize a child, fetch/repair state, create a ticket, or
   open a socket until same-identity promotion succeeds.

## 9. Recovery, failure, fencing, and release lifecycle

1. On a refreshable failure from the installed child, invalidate the current
   selection attempt, stop commits through the captured tuple, and refresh the
   selected port using the exact failed parent. If refresh returns the same
   bound identity, admit and install one replacement child, dispose the old
   child after installation, and retry only the failed authority operation.
2. If the selected port's callback or transport is transiently unavailable,
   keep all registrations carrying its `ownerToken` attached for delivery,
   clear/dispose the unusable installed authority, exclude every registration
   carrying that `ownerToken` from the current selection attempt, and force a
   fresh authentication attempt on the oldest remaining online registration
   from another port before admitting its candidate child.
3. If a non-selected candidate has a transient callback, Gateway, or transport
   failure, keep that port and all of its registrations attached, skip every
   registration carrying its `ownerToken` for the current selection attempt,
   and continue in registration order. If no candidate is currently usable,
   leave the Repo locally available and allow a later retry/promotion.
4. If authentication is definitively rejected or a fresh receipt changes any
   bound identity field, synchronously fence and logically eject only that
   port, record the terminal failure for its future RPCs, and prevent its late
   results from installing. Notify and release every aggregate and service
   registration carrying its `ownerToken` outside any currently executing
   exact-Repo serializer; never await a `releaseOwner` call that enqueues behind
   the operation performing the ejection. Do not disturb sibling ports.
5. Treat an explicit aggregate/service lock-unsupported result or a validated
   child/admission target mismatch from a fresh same-user root as definitive
   exact-target evidence. Synchronously invalidate the selection attempt,
   clear the installed tuple and socket fences, set only that exact Repo to
   terminal failed state, notify all its live sinks, dispose the captured
   child/socket, and do not probe the same target through every port. Other
   exact Repos on those ports remain usable.
6. Releasing a non-selected registration disposes its retained sink and buffer
   only. Releasing the selected registration first cancels its selection and
   late-result fences, closes the exact socket, disposes the sole child, clears
   the installed tuple, and then starts ordered replacement selection. Before
   a different port admits a child, invoke the existing authentication access
   with the forced-fresh mode from Section 4.
7. When zero online registrations remain, close the child/socket, interrupt
   reconnect and authority work, synchronously invalidate the selection
   attempt, clear the installed tuple/socket fences, and keep the local Repo,
   databases, resources, metadata, existing-only delivery sinks, and aggregate
   journal/staging intent. Do not wait for zero total registrations before
   stopping network work.
8. Route sink delivery failure and `releaseOwner` through the same selected vs
   non-selected release semantics. Port close must make the complete tuple
   false synchronously even if asynchronous sink/authority cleanup continues
   in the Repo serializer. Serialize cleanup only after the currently executing
   queue step unwinds so authentication rejection during a Repo operation
   cannot self-deadlock.
9. Fence every late result as follows:
   1. authentication requires the same `SharedWorkerApi`, `ownerToken`,
      configuration, pending attempt/token, binding, and port lifetime;
   2. child admission requires the selected registration ID, `ownerToken`,
      captured parent, selection attempt, exact Repo, and current port root;
   3. state, ticket, push, repair, and replacement require the complete
      installed four-field tuple, exact Repo, selection state, and current
      parent object before any commit; and
   4. websocket callbacks require all of those fields plus the exact socket.
10. Preserve authoritative replacement and generation fencing: commit a
    replacement/rebase before opening the new-generation socket, reject every
    late prior-generation callback, and continue accepting generation-relative
    equal/lower/reset frontend indexes where the current replacement protocol
    permits them.

## 10. React Provider, DevTools, and Shopping cutover

1. In
   [`makeZerospinApp.tsx`](../../../packages/react/src/makeZerospinApp.tsx),
   remove the production Provider's optional `userId`, its import/call of
   `authenticate`, temporary page-owned root, online identity comparisons,
   five-code fallback decision, legacy `localStorage` read/write, and
   `userId`-driven Effect dependency.
2. Keep `makeAuthenticationLock`, the live `generateSignatureRef`, and the
   existing page callback wrapper. The wrapper must still decode with
   `selectedAuthenticationSignature.schema`, map invalid output to
   `authentication-signature-invalid`, and encode the result for the worker.
3. Acquire the worker directly with exact
   `{ systemName, authenticationLock, generateSignature }`; use returned
   `systemId`, `userId`, and `mode` for DevTools root diagnostics and every
   aggregate/service bootstrap call.
4. Preserve atomic Provider publication and finalizer order. On partial
   bootstrap failure or normal unmount/replacement, release every acquired
   aggregate/service registration and its page database before releasing the
   SharedWorker port/root. There is no page `AuthenticatedApi` finalizer after
   the cutover.
5. Add `mode: 'online' | 'existing-only'` to the existing
   `IDevtoolsSharedWorkerRootDiagnostics` interface in
   `packages/devtools/src/types.ts`, render it in
   `sharedWorker/SharedWorkerRoute.tsx`, and update that route's fixture test.
   Do not create another diagnostics type.
6. Update React mocks and tests to remove the obsolete
   `@zerospin/frontend/authenticate` mock and return exact
   `{ api, release, systemId, userId, mode }` acquisition data. Keep
   `makeMockProvider`, its explicit mock `userId`, and its no-transport behavior
   unchanged.
7. In
   [`AuthenticatedRoute.tsx`](../../../examples/shopping/src/routes/AuthenticatedRoute.tsx),
   remove only `userId={clerkUserId}` from `ZerospinApp.Provider`. Retain the
   Clerk user decode for the application-defined `{ clerkUserId }` signature
   and `RequiredUserProvider`.
8. Update Shopping's unit/browser Provider call sites and acquisition mocks to
   the new contract. Remove page-authentication mocks and change the initial
   online expectation from two signature invocations to one worker-requested
   invocation.
9. Remove the now-unused direct `@zerospin/frontend` dependencies from
   `packages/react/package.json` and `examples/shopping/package.json`, then
   refresh `pnpm-lock.yaml` without changing unrelated dependencies. Keep
   `@zerospin/frontend` in `@zerospin/shared-worker`, where authentication now
   runs.

## 11. Deterministic and browser verification coverage

1. Rewrite
   [`acquireUserPartitionRepo.node.spec.ts`](../../../packages/shared-worker/src/acquireUserPartitionRepo.node.spec.ts)
   and extend `acquireUserPartitionRepo.typecheck.ts` to prove:
   1. the worker URL has only `apiUrl`, `publishableKey`, and `wasmUrl`;
   2. the RPC request has only `systemName`, `authenticationLock`, and
      `generateSignature`;
   3. the inner result has `{ api, systemId, userId, mode }` and the public
      result adds only `release`;
   4. the client faithfully propagates each returned mode and each rejected
      worker handshake without inventing page-side fallback; and
   5. release remains idempotent across explicit release, port close, failed
      setup, non-persisted pagehide, and BFCache.
2. Rewrite `SharedWorker/startSharedWorker.node.spec.ts` for the
   identity-neutral URL and one unbound API/root per accepted port.
3. Extend
   [`startSharedWorker.invariants.node.spec.ts`](../../../packages/shared-worker/src/SharedWorker/startSharedWorker.invariants.node.spec.ts)
   as the deterministic authority seam. It must prove:
   1. one host isolates multiple authenticated `{ systemId, userId }`
      partitions;
   2. concurrent initial work authenticates each online port exactly once;
   3. online success, eligible fallback, ineligible failure, missing/corrupt
      locator, locator-write failure, and epoch rejection execute in the exact
      required order against mocked native-store operations, with no
      user-partition open before epoch validation and correct unpublished-handle
      cleanup;
   4. initial callback/schema errors never consult the locator, while later
      callback, transport/readiness, rejection, and mismatch outcomes follow
      the exact transient-versus-definitive classification;
   5. distinct signature callbacks resolving the same identity share one exact
      Repo and one Repo-owned child;
   6. the oldest healthy authority is sticky and a non-selected release does
      not dispose its child/socket;
   7. selected release disposes child/socket before freshly authenticating and
      installing the next port;
   8. transient callback/Gateway/transport failure preserves registrations;
   9. definitive rejection or identity mismatch logically ejects only the
      offending `ownerToken` across aggregate and service Repos, makes later
      RPCs reject the terminal error, and completes cleanup without reentering
      or deadlocking the calling exact-Repo queue;
   10. definitive child denial fails only the exact Repo and performs no sibling
       child authorization;
   11. replacing one port root invalidates sibling exact-Repo children lazily;
   12. zero online registrations retains local replica state and aggregate
       journal/staging work while stopping network work; and
   13. late authentication, child, state, ticket, push, repair, replacement,
       failed-stage transaction, and socket results fail their complete fences.
4. Replace tests that inspect or expect per-registration children, including
   the current unsupported-authority sibling failover case. Keep and strengthen
   the observable socket/push race, bounded push retry, full push-result
   validation, materialization repair, atomic staging, journal recovery,
   offline reopen, service read-only, and generation drain/reopen cases.
5. Extend the React lifecycle seams in
   `makeZerospinAppDevtools.react.spec.tsx`,
   `makeZerospinAppDevtoolsImportFailure.react.spec.tsx`,
   `makeZerospinApp.typecheck.tsx`, and
   `bootstrapBrowserCapabilities.node.spec.ts` to prove:
   1. production Provider rejects a `userId` prop and never calls page-side
      `authenticate`;
   2. worker-returned identity/mode feed diagnostics and every session;
   3. changing `generateSignature` updates the callback ref without restarting
      Provider;
   4. invalid callback output remains `authentication-signature-invalid` with
      no fallback;
   5. partial bootstrap releases registrations before the port; and
   6. normal Provider replacement and unmount release every aggregate/service
      registration and page database before the port; and
   7. existing-only promotion authenticates the same bound identity before
      becoming online.
6. Extend
   `examples/shopping/tests/browser/reactAndSharedWorkerFlow1.playwright.spec.ts`
   and `reactSharedWorkerAdverse.playwright.spec.ts` for the new Provider shape,
   one worker-side authentication invocation, locator-write failure, reset
   rejection, valid post-056 reopen, and ignored legacy `localStorage` values.
   Add `lastUserPartitionStore.playwright.spec.ts` to the explicit include list
   in `examples/shopping/vitest.playwright.config.ts`.
7. Replace the current page-global `WebSocket` stub for cold-offline coverage;
   it cannot affect a SharedWorker global. Reuse the child-process ownership,
   graceful/forced stop, and Gateway-readiness polling already in
   `tests/browser/adverse-fixture/adverseFixtureGlobalSetup.ts`. Register
   test-only `stopAdverseFixture` and `startAdverseFixture` browser commands in
   `vitest.playwright.config.ts`; the restart path must preserve the fixture's
   `.wrangler` state and must not repeat the global setup's initial clean.
   Sequence the test as online seed, existing CDP SharedWorker target closure,
   adverse-fixture stop, new Provider mount, exact
   `user-authentication-transport-failed` existing-only fallback,
   adverse-fixture restart plus readiness, `online` dispatch, and same-identity
   promotion. Keep this entirely in test-fixture code: do not claim
   `BrowserContext.routeWebSocket` covers SharedWorker traffic and do not add a
   Gateway RPC, DevWorker endpoint, production transport seam, or fragile raw
   CDP child-session interception.
8. Retain and extend
   [`shoppingSharedWorkerMultiPage.playwright.spec.ts`](../../../examples/shopping/e2e/shoppingSharedWorkerMultiPage.playwright.spec.ts)
   to prove two pages retain independent ports/sinks while sharing one host and
   exact Repo, selected-page close transfers authority, the surviving page
   continues, and the worker process survives. Keep exact child-count ownership
   in the deterministic invariant seam unless an already-existing diagnostic
   exposes it; do not add a production diagnostic solely for that assertion.
9. In browser cleanup, delete only test-created names after each case. Runtime
   production code never deletes. Add the documented operator reset proof:
   close all old Zerospin pages/workers, delete only IndexedDB databases whose
   names begin with `zerospin/`, remove only `localStorage` keys beginning with
   `zerospin:`, and leave remote/server and unrelated origin state untouched.

## 12. Current documentation and dependency synchronization

1. After source behavior is complete, use the repository's
   `update-architecture` workflow to update and re-anchor:
   1. `wiki/architecture/Authentication.md` for page capability versus
      worker-side authentication and per-port roots;
   2. `wiki/architecture/bootstrapBrowserSession.md` for the automatic
      handshake, returned identity/mode, finalizers, offline fallback, and
      promotion;
   3. `wiki/architecture/AggregateFrontendApi.md` and
      `ServiceFrontendApi.md` for one Repo-owned child and sticky authority;
   4. `wiki/architecture/FrontendWebSocket.md` and
      `ServiceFrontendProjection.md` for full tuple/socket fencing and
      replacement;
   5. `wiki/architecture/SourceSelectedFrontends.md` and
      `Blockchain.md` for identity/authority ownership; and
   6. `wiki/architecture/RpcErrorBoundaries.md` and `DevLifecycle.md` for
      acquisition errors and the explicit browser-reset workflow.
2. Update `wiki/api/SharedWorkerSession.md` and
   `wiki/api/ReactFrontends.md` for the exact request/result shapes,
   identity-neutral URL, native locator, post-056 VFS, production Provider
   props, existing-only boundary, port binding, and single-child ownership.
3. Update `wiki/dev/diagrams/BrowserFrontendLifecycle.md` only after the code
   path is current. Keep every Mermaid message immediately preceded by its own
   contiguous `autonumber N` and keep exactly one matching ordered annotated
   workflow step per message.
4. Update the root `README.md` with the explicit scoped browser reset procedure.
   Do not add a reset command or runtime deletion API.
5. Let the source-first wiki workflow reconcile `wiki/index.md`,
   `wiki/overview.md`, and `wiki/glossary.md`, including Provider lifecycle,
   user-partition root, existing-only, browser reset, and exact-Repo authority
   terminology. Merge the already-dirty `wiki/index.md` and `wiki/overview.md`
   rather than overwriting their unrelated changes.
6. Refresh every changed source citation and `#Lx-Ly` anchor, and describe only
   implemented behavior. Keep the archived Spec 056, persistence handoff, and
   command-journal RFC as historical records; do not revive their superseded
   failed-only result or standalone journal/checkpoint design.

## 13. Verification matrix

1. Run the SharedWorker build, typecheck, lint, and Node/invariant tests
   separately:

   ```text
   nx run @zerospin/shared-worker:lib --skipNxCache
   nx run @zerospin/shared-worker:ts --skipNxCache
   nx run @zerospin/shared-worker:lint --skipNxCache
   nx run @zerospin/shared-worker:test --skipNxCache
   ```

2. Run the directly changed DevTools gates:

   ```text
   nx run @zerospin/devtools:lib --skipNxCache
   nx run @zerospin/devtools:ts --skipNxCache
   nx run @zerospin/devtools:lint --skipNxCache
   nx run @zerospin/devtools:test --skipNxCache
   ```

3. Run the React production/type/lifecycle gates:

   ```text
   nx run @zerospin/react:lib --skipNxCache
   nx run @zerospin/react:ts --skipNxCache
   nx run @zerospin/react:lint --skipNxCache
   nx run @zerospin/react:test --skipNxCache
   ```

4. Run the Shopping consumer, native-IDB browser, SharedWorker browser, and real
   multi-page gates:

   ```text
   nx run shopping:build --skipNxCache
   nx run shopping:ts --skipNxCache
   nx run shopping:lint --skipNxCache
   nx run shopping:test --skipNxCache
   nx run shopping:test:vitest:browser --skipNxCache
   nx run shopping:test:playwright --skipNxCache
   ```

5. Require the active main-thread/URL/locator stale-path search to return no
   results, apart from explicit negative assertions:

   ```text
   rg -n "@zerospin/frontend/authenticate|zerospin:user-locator|offline-system-id-invalid|signatureCallCount\)\.toBe\(2\)" packages/react examples/shopping wiki/api wiki/architecture wiki/dev/diagrams
   rg -n "rawSystemId|rawUserId|searchParams\.get\('systemId'\)|searchParams\.get\('userId'\)|\?systemId=|&userId=" packages/shared-worker wiki/api wiki/architecture wiki/dev/diagrams
   ```

6. Require the active per-registration child/selection stale-path search to
   return no production results:

   ```text
   rg -n "getRegistrationFrontendApi|authorizeFrontendApi|authorizationPromise|registeredAt|ticketReplacementRegistrationIds" packages/shared-worker/src/SharedWorker --glob '!*.spec.ts'
   ```

7. Confirm the old VFS literal occurs only in reset-detection tests/docs and is
   never passed to `IDBBatchAtomicVFS` by active acquisition. Confirm runtime
   persistence/acquisition code never calls `indexedDB.deleteDatabase` or
   another deletion/reset helper, and confirm locator code in
   `packages/react/src/makeZerospinApp.tsx` and `packages/shared-worker` never
   calls `localStorage`. Do not flag DevTools' unrelated UI preference
   persistence.
8. Review the final source diff to ensure there is no change to server APIs,
   SystemRepo current-write ownership, user-root/replica Drizzle schemas,
   migration SQL, aggregate journal row shape, service journal-free shape, or
   the complete five-array `IPushBlock` result.
9. Format only the exact changed files, run `./node_modules/.bin/oxfmt --check`
   over the same explicit list, validate all changed Markdown links and Mermaid
   numbering, then run scoped `git diff --check`, `git status --short`, and a
   final diff review. Do not bulk-format or repair unrelated WIP.
10. If a gate fails because of unrelated pre-existing work, record the exact
    command and failure separately; do not modify unrelated files to make it
    green.
11. Keep this plan under `wiki/dev/plans/` until all applicable gates pass.
    After the hard cutover is fully implemented and verified, move this
    unchanged filename to `wiki/dev/archived/`.
