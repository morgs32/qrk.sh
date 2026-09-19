# Explicit session lifecycles design

**Date:** 2026-09-19
**Status:** Approved for planning

## Problem Statement

App-bound frontend providers bundle shared service ownership, backup connection
ownership, session construction, initialization, discovery, and React rendering.
Consumers already know which session they need; requiring a provider registry to
rediscover it adds an unnecessary ownership boundary. The mock provider also
bundles fixture-session creation with React mounting, despite needing no
production application or backup infrastructure.

Sessions should be explicit, synchronously constructed objects with observable
state and an asynchronous resource lifecycle. React should adapt that lifecycle
and subscribe to sessions supplied by the caller. Local command staging should
be named separately from authoritative server execution.

This spec records the final decisions from the design conversation. It replaces
the app/provider/registry ownership design in
[080-spec-app-bound-frontends.md](../specs/080-spec-app-bound-frontends.md) and the
conversation's intervening provider proposals. It describes intended work, not
an implemented or verified cutover.

## Solution

```tsx
const runtime = makeRuntime({ layer: applicationLayer });
const backup = makeBackup();
const frontend = makeAggregateFrontend({ /* authored definition */ });
const session = makeSession({
  frontend,
  runtime,
  layer: sessionLayer,
  backup,
  systemName: 'shopping',
});

// Imperative ownership:
await session.initialize<typeof system>({ generateSignature });
await session.dispose();

// Alternatively, React owns initialization and disposal:
function ShoppingRoot() {
  const { isInitialized } = useInitializeSession<typeof system>({
    session,
    generateSignature,
  });
  return isInitialized ? <Shopping /> : <Loading />;
}

function Shopping() {
  const { data } = useLiveQuery({
    session,
    query: db => db.query.list.findMany(),
  });
  // Render data; stageCommand({ session, contractName, payload }) handles actions.
}
```

The imperative and React examples are alternative owners, not concurrent uses
of the same session. Runtime and backup ownership remain with their caller.
`makeServiceFrontend` and `makeSession` provide the equivalent read-only service
session path.

## User Stories

1. As an application author, I can create a session before mounting React, pass
   it through props or imports, and initialize it imperatively or through a hook.
2. As an application author, I can share a caller-owned runtime and backup
   connection across sessions while giving each session its own local layer.
3. As an application author, I can observe initialization and gate a child
   component explicitly rather than relying on provider rendering behavior.
4. As a component author, I can pass a typed session directly to queries and
   command staging without an app, frontend provider, or registry lookup.
5. As a component author, I can supply changing query inputs once, as a key
   delivered to the query callback, without maintaining a second dependency list.
6. As a test or story author, I can construct detached aggregate and service
   fixture sessions and consume them through the same query/state APIs.
7. As an application author, I receive exact system-selection and signature
   type errors at either initialization entrypoint without importing backend
   definitions at runtime.
8. As a developer, I can load, open, and dispose DevTools imperatively,
   independently of the application's React tree and session lifetimes.

## Implementation Decisions

### Frontend authoring and runtime ownership

1. Keep ordinary `makeAggregateFrontend({ ... })` and
   `makeServiceFrontend({ ... })` factories. They receive no app or runtime and
   return authored definition objects, without generated `Provider` components
   or nested `.frontend` wrappers. Preserve exact model, contract,
   authentication, owner-name, and version inference and intrinsic definition
   validation.
2. Expose `makeRuntime({ layer })` without a system generic. It supplies the
   existing framework runtime services together with the caller's application
   services. Its lifetime belongs to the caller, independently of any session.
3. Expose `makeSession({ frontend, runtime, layer, backup, systemName })`.
   Construction captures the exact frontend, runtime services, and literal
   system name. It creates a stable session and observable store synchronously;
   it acquires no session resources and does not bootstrap. Aggregate and
   service inputs retain their distinct session capabilities and exact types.
4. Move the existing frontend `layer` option to `makeSession`. It supplies
   session-local services, acquired during initialization and released during
   disposal. Preserve the empty-layer default when omitted. The borrowed
   runtime supplies shared services. Validate service requirements against both
   sources, preserving the existing local-service semantics.
5. Keep `guardLayer` on the aggregate frontend: it depends on that frontend's
   typed database and authentication. Initialize its resources in the session's
   lifetime. Separate asynchronous guard acquisition from synchronous session
   construction; do not acquire a layer during render or introduce no-op guards.
6. `systemName` is supplied at real-session construction, not duplicated as app
   configuration. Supply the existing internal command/bootstrap paths with
   that captured name without importing the authored backend system.

### Session initialization, disposal, and React

1. Real sessions expose
   `session.initialize<typeof system>({ generateSignature })` and
   `session.dispose()`. Initialization awaits all resources needed to publish an
   initialized session, including runtime/local-layer readiness, guards, backup
   readiness, and the existing aggregate or service bootstrap workflow.
2. Expose `useInitializeSession<typeof system>({ session, generateSignature })`.
   It owns initialization after commit and disposal on unmount, subscribes to
   session lifecycle state, and returns reactive `{ isInitialized }`. It does
   not construct the session or acquire resources during render. Initialization
   failures propagate to the owning React error boundary rather than leaving a
   permanent loading state.
3. Both real initialization entrypoints check the same system compatibility:
   system name, aggregate/service name and version, selected models/contracts,
   authentication, and the exact signature callback result. The system remains
   type-only. Preserve exact inference rather than widening selections to make
   the single explicit system generic compile. Compile-time fixtures must prove
   both entrypoints enforce the same contract.
4. Keep signature generation as a callback for future authentication. The hook
   supplies the latest callback without restarting the session. Identity changes
   remain an explicit disposal/reinitialization boundary, not automatic mutation
   of an active session's authenticated identity.
5. Reject overlapping initialization of the same session. One session has one
   active lifecycle owner. After disposal, that same object may initialize again;
   replacement initialization waits for all prior asynchronous cleanup to finish.
   StrictMode effect replay must follow that same protocol. A rejected competing
   hook must not dispose the successfully owning hook's session.
6. Disposal cancels pending initialization, prevents late publication, releases
   session-owned resources, and awaits their finalizers. Completion tracking must
   join cleanup already in progress; calling scope close again is not sufficient.
   Disposal does not dispose the borrowed runtime or backup object.
7. A new initialization owns a fresh resource scope and resets readiness until
   publication. Preserve the stable session/store across its lifecycle. Existing
   backup recovery may renew execution IDs without replacing the session object.
8. `isInitialized` means initialized local data is available, not connected,
   current, or writable. Preserve the distinct operational session and backup
   states during recovery. Failed staging while not current must remain explicit.
9. Use Zustand's `useStore(session.store, selector)` directly to observe
   authentication or other state. Remove `useInitializedStateOrThrow`, `useSession`,
   and the proposed `useInitializedSession`; no session lookup hook is needed.
10. No `ZerospinProvider`, `SessionRegistryProvider`, app-specific context,
    ancestor registry, or root-wide session registry remains. Explicit references
    determine access. Exclusivity is per session object rather than a global
    frontend-name reservation. Existing server authentication, backup ownership,
    and identity validation remain intact.

### Backup ownership

1. Expose `makeBackup()` as an imperative object, not a provider or Zustand
   store. Construction immediately starts connecting to the existing backup
   SharedWorker. It is an explicit browser-side resource acquisition and must
   not be performed during React render or server rendering.
2. A real session borrows this object. Its initialization awaits connection
   readiness; callers do not separately initialize or wait for backup. Concurrent
   sessions share its connection, and one session's cancellation must not cancel
   connection establishment needed by another.
3. Sessions retain ownership of their individual backup capabilities and release
   them with their other resources. The connection remains alive even when no
   sessions are initialized. Do not reference-count sessions to close it.
4. The caller invokes `backup.dispose()` after disposing the sessions that use
   it. Disposal owns connection teardown, including pending connection work.
   Preserve current reconnect/revocation behavior and observable failure; eager
   asynchronous startup must not produce an unhandled rejection before a session
   awaits it.
5. Shared application services likewise outlive their borrowing sessions. The
   caller disposes the runtime only after all dependent session cleanup finishes.

### Command staging and live queries

1. Replace `session.executeCommand(...)` with the standalone synchronous
   `stageCommand({ session, contractName, payload })`. Remove the old method;
   add no compatibility alias. Preserve exact contract-name/payload inference
   and the existing encoded result convention. Service sessions are rejected
   at the type boundary because they do not stage aggregate commands.
2. Staging validates payloads, runs guards, applies local optimistic mutations,
   and commits the command occurrence, optimistic records, and session position.
   Preserve current transactional failure behavior and full command provenance.
   Local success does not mean authoritative server execution is confirmed.
3. Real sessions automatically hand staged commands to the existing delivery
   workflow. Mock sessions stop locally. This is a local API/ownership cutover,
   not a redesign of transport, command reconciliation, or server execution.
4. Staging rejects before initialization, after disposal, and when the session
   is not current. There is no implicit initialization, buffering-before-ready,
   or network-pending UI contract added by the rename.
5. Change the public query API to `useLiveQuery({ session, query, key?,
   tableNames? })`. Preserve exact aggregate/service database and query-result
   inference, explicit watched-table support where necessary, and the existing
   result fields `data`, `error`, and `updatedAt`.
6. Remove `deps`. An optional key is the actual input passed to the query callback:

   ```tsx
   const { data } = useLiveQuery({
     session,
     key: { clerkUserId },
     query: (db, { clerkUserId }) =>
       db.query.user.findFirst({
         where: { clerkUserId: { eq: clerkUserId } },
       }),
   });
   ```

7. Key-value changes rebuild and execute the query. Equivalent inline keys and
   new callback identities alone do not restart the subscription. Relevant
   committed database changes rerun the query. Changing external inputs belong
   in the key and are consumed through callback arguments; do not promise
   automatic discovery of arbitrary closure dependencies.
8. Keyless queries remain supported as `query: db => ...`. Query identity and
   subscriptions are scoped to the supplied session/database; borrowing SWR's
   key-as-input convention does not introduce cross-session caching, network
   revalidation, polling, or a dependency on SWR.
9. `useLiveQuery` throws before initialization or when the usable database is
   absent. It does not wait, suspend, or return an implicit initialization-loading
   state. Gate a child component using `useInitializeSession` before it calls
   queries; do not conditionally call hooks in the same component. Preserve live
   query error reporting for failures after successful setup.

### Detached mock sessions

1. Replace `ZerospinMockProvider` and the proposed `MockFrontendProvider` with
   `makeMockSession({ frontend, runtime, layer?, authentication, resources })`.
   It captures typed fixture inputs and uses the same synchronous construction,
   explicit initialization, disposal, and reinitialization ownership model.
2. Mock initialization needs no signature, backup, app, or server system
   definition. The same `useInitializeSession` hook supports mock initialization
   without `generateSignature`; imperative mock initialization is also supported.
   Use the caller-supplied runtime and session-local layer, not a runtime retained
   by a production frontend definition.
3. Support both kinds: aggregates provide real local guards, optimistic staging,
   and journaling; services provide read-only fixture sessions. Both expose
   `session.store` and work with `useLiveQuery` using their exact models and
   authentication types. Omitted model fixtures produce empty tables.
4. Initialize a real disposable in-memory SQLite database, validate and seed
   fixtures, and clean up partial acquisition, late completion, and normal
   disposal. Do not simulate server confirmation, push, sockets, backup, remote
   authentication, or DevTools registration. Caller-supplied effects are not
   sandboxed; the mock simply installs no production networking infrastructure.

### Imperative DevTools

1. Expose `await loadDevtools({ defaultOpen })`, returning a handle with
   `await devtools.open()` and `devtools.dispose()`. Loading mounts the existing
   React UI in its own DOM host/root; the application mounts no loader component.
2. Preserve separate-root rendering, lazy code loading, opening behavior, and
   cleanup on import/mount failure. Disposal unmounts the root and removes its
   host. Existing concurrent-open coordination and stale-owner cleanup must
   continue to protect the mounted shell.
3. Real sessions register during initialization and unregister during disposal,
   independently of whether the UI is loaded. Track renewed session IDs in the
   DevTools registry. Preserve aggregate push controls and service inspection.
4. Remove app-provider dependencies from the loader/controller and their errors.
   Preserve the existing console-open convenience for the loaded DevTools
   lifetime without requiring an application provider.

### Cutover and superseded decisions

1. Hard-cut over in-repository authoring, session consumers, examples, mocks,
   exports, tests, and documentation. Do not retain `makeZerospinApp`, generated
   frontend providers, app types/type markers, lookup contexts, `executeCommand`
   session aliases, or the old two-argument `useLiveQuery`/`deps` API solely for
   compatibility.
2. The initially accepted frontend-oriented provider vocabulary was superseded
   by explicit sessions: `ZerospinProvider`, `useFrontend`/`useMountFrontend`,
   and `useInitializedSession` are not part of the final design. The root-wide
   registry proposal was superseded by passing session objects directly.
3. `BackupProvider` and lazy/ref-counted backup acquisition were superseded by
   eager `makeBackup()` with caller-owned disposal. `MockFrontendProvider` was
   superseded by `makeMockSession`; a React DevTools loader was superseded by
   `loadDevtools`.
4. System typing on an app, frontend factory, runtime, or curried session factory
   was superseded by `initialize<typeof system>` and
   `useInitializeSession<typeof system>`. Runtime-only and layer-only session
   proposals were superseded by accepting both `runtime` and session-local `layer`.
5. Update affected architecture, glossary, source references, and local patterns
   with the implementation, including local command staging terminology. Keep
   existing core callers coherent with the cutover without expanding into a
   transport or backend redesign.

## Testing Decisions

1. Use the public session and React APIs as the main behavioral seam. Cover real
   and mock aggregate/service sessions, synchronous resource-free construction,
   local-layer acquisition, initialized publication, staging, live queries,
   error boundaries, failure cleanup, cancellation, and disposal.
2. Use deterministic lifecycle barriers for duplicate initialization, owner
   rejection, cleanup already in progress, sequential reinitialization, keyed
   component replacement, StrictMode replay, abandoned renders, and late startup
   completion. Verify a rejected owner cannot dispose a successful owner and
   sessions never dispose their shared runtime or backup object.
3. Verify eager backup connection startup, waiting through session initialization,
   sharing across sessions, reconnect/revocation recovery, and explicit disposal
   after session cleanup. Verify signer changes do not restart sessions, identity
   changes use explicit lifecycle boundaries, and recovery preserves session
   identity while renewing execution IDs when required.
4. Verify staging success and failure preserve the local journal and mutation
   semantics; real sessions deliver automatically and mocks produce no RPC,
   backup writes, or server confirmation. Service mocks remain read-only.
5. Verify queries throw before initialization, key-value changes replace the
   query, equivalent inline keys do not churn subscriptions, committed table
   changes update results, switching sessions/databases releases old listeners,
   and existing post-setup query-error behavior is preserved.
6. Use compile-time fixtures for both initialization entrypoints. Reject wrong
   systems, names, versions, models, contracts, authentication, signatures, and
   unsatisfied runtime/local-layer/guard requirements. Preserve exact command
   payloads, service read-only capabilities, fixture rows, query-key parameters,
   and query results. These fixtures must establish the proposed single-system-
   generic API before implementation can be declared complete.
7. Migrate the existing Shopping browser tests to the new public API and verify
   real backup, delivery, recovery, and imperative DevTools loading/opening/
   disposal, including failed imports and renewed session registration. Unit or
   mocked lifecycle tests alone do not establish browser transport correctness.
8. Run appropriate Nx library builds, typechecks, lint, and the complete React
   suite, plus affected core/frontend/live-query/DevTools suites and Shopping
   checks. Check formatting and diffs. Preserve the existing deterministic
   testing seams rather than introducing parallel fake infrastructure.

## Out of Scope

1. Server RPC, trust-boundary, physical schema, persistence-format, or storage
   reset changes; relocating replicas or sockets into the SharedWorker.
2. Compatibility aliases, dual APIs, provider conveniences, implicit session
   lookup, and automatic initialization inside query or staging APIs.
3. SWR adoption, shared query caches, network revalidation, and simulated remote
   behavior for mock sessions.
4. Runtime-boundary moves, unrelated cleanup, new implementation plans, or
   implementation work as part of writing this spec.

## Further Notes

1. Decisions were explicitly confirmed in the design conversation, including
   the three verification seams: public session/React behavior, compile-time
   fixtures, and existing Shopping browser integration.
2. Prior conversation inspection established the current mock's real local
   mutation/journal behavior and the existing app's runtime/backup ownership.
   That inspection is evidence for the cutover, not verification of this design.
3. This document allocates spec/plan number 083. It was archived after creating
   [083-plan-explicit-session-lifecycles.md](../plans/083-plan-explicit-session-lifecycles.md)
   with the same number and topic. Archival records conversion to a plan, not
   completed implementation.
