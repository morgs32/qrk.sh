# App-bound frontend design

**Date:** 2026-09-13
**Status:** Implemented and verified

## Problem Statement

`makeZerospinApp` combines shared application infrastructure with a fixed catalog
of frontend sessions. This couples their mounting, authentication callbacks,
initialization, and disposal. Frontends need explicit React lifetimes while
sharing application services and the backup-worker connection.

## Solution

```tsx
const App = makeZerospinApp<typeof system, AppServices>({
  systemName: 'shopping',
  layer: applicationLayer,
});
const Shopper = App.makeFrontend(ShopperFrontendV2);

<App.Provider>
  <Shopper key={user.id} generateSignature={generateSignature}>
    <Outlet />
  </Shopper>
</App.Provider>;
```

`AppServices` explicitly identifies custom application services; it defaults to
`never` when there are none. The system is referenced only through its type.
The frontend component also acts as the typed selector for `useSession(Shopper)`
and `useLiveQuery(Shopper, ...)`.

## User Stories

1. As an application author, I can mount a frontend where its session is needed
   and release it when that subtree unmounts.
2. As an application author, I can share application services and one backup-worker
   connection across independently mounted frontends.
3. As a frontend author, I receive compile-time errors for incompatible controllers
   or unsatisfied service requirements.
4. As a component author, I can consume a mounted frontend through existing typed
   hooks, including ancestor frontends beneath nested mounts.
5. As an application author, I can refresh signature generation without replacing
   a session, and explicitly remount when identity changes.

## Implementation Decisions

1. Replace the frontend catalog argument with
   `makeZerospinApp<SYSTEM, APP_SERVICES>({ systemName, layer })`. Constrain the
   system name, preserve framework service defaults, and require API URL and
   publishable key through the application layer.
2. Expose `App.makeFrontend(controller)` for aggregate and service controllers.
   Move the system compatibility rules from `checkZerospinApp` into this binding.
   Preserve concrete controller, model, contract, and authentication inference.
3. Validate remaining controller initialization requirements against application
   services and framework defaults. Retain controller `layer` and `guardLayer`;
   introduce no additional frontend layer prop.
4. Obtain resources from the matching mounted app Provider. Reject missing or
   mismatched Providers and preserve the existing one-app-Provider-per-page rule.
5. The app owns the managed runtime, shared services, parent resource scope, and
   DevTools loader. Acquire the backup connection lazily for the first frontend,
   share concurrent acquisition, and retain it until app unmount. One caller's
   cancellation must not cancel acquisition needed by another frontend.
6. Each frontend owns its current signer, local services, session/store, live
   replica, backup capability, bootstrap/recovery lifecycle, WebSocket, and
   DevTools registration. Aggregate frontends also own execution wiring,
   optimism, and push controls through existing bootstrap procedures.
7. Gate each frontend's children until initialization succeeds. Siblings
   initialize independently; nested frontends initialize sequentially. Surface
   startup failures from the affected frontend to React error boundaries.
8. The component carries its controller and models as the exact hook selector.
   Preserve ancestor sessions in nested context; sibling or absent mounts do not
   provide hook access.
9. Reject duplicate active controller names within an app Provider, including
   separate factory calls. A remount waits for predecessor cleanup before acquiring
   its session, and cannot release a successor's reservation.
10. Signer updates refresh future calls without restarting the session. Identity
    changes require explicit remounting. Preserve existing authentication-mismatch
    checks and backup identity semantics.
11. Prevent late publication after unmount. Finish frontend cleanup before shared
    infrastructure disposal, including finalization already in progress when the
    app unmounts. Retain mounted session identity during backup reacquisition and
    the same-system check across frontend bootstraps.
12. Remove `App.frontends`, app-level `generateSignature`, and `checkZerospinApp`.
    Migrate package exports, Shopping, mocks, type fixtures, and affected docs in
    the same cutover. Keep mocks within their existing supported capabilities.

## Testing Decisions

1. Use the existing React lifecycle suite for independent mounts, sequential
   nested startup, ancestor lookup, duplicate rejection, app binding, signer
   refresh, partial startup failure, and unmount during initialization.
2. Verify shared application acquisition, frontend-local acquisition, lazy
   single-flight backup acquisition, reuse across remounts, and completion of
   frontend cleanup before backup and runtime disposal.
3. Use compile-time fixtures for owner/version compatibility, explicit application
   service typing, missing local-layer and guard-layer inputs, exact signatures,
   model/query inference, and mock selector compatibility.
4. Migrate and run Shopping's existing browser tests for real backup acquisition,
   WebSocket delivery, command execution, revocation, and recovery. Mocked lifecycle
   tests alone do not verify browser transport behavior.
5. Run relevant Nx type, lint, and test targets and check formatting and diffs.

## Out of Scope

1. Standalone context-only factories or shared sessions across duplicate mounts.
2. Automatic identity switching or parallel startup for nested frontends.
3. Server RPC changes, persistence format changes, or storage resets.
4. Moving sockets or live replicas into the SharedWorker.
5. New implementation plans or unrelated cleanup.

## Further Notes

1. Existing frontend bootstrap procedures retain authentication and transport
   behavior; React changes their ownership and composition.
2. The backup connection remains after the last frontend unmounts, until app
   teardown.
3. Effect scope closure marks a scope closed before asynchronous finalizers finish.
   Repeated closure is not a join operation; the app must await actual frontend
   completion before disposing shared resources.
4. Verified with React tests (32 passing), Shopping unit tests (5 passing),
   Shopping browser tests (9 passing), both projects' type and lint targets,
   formatting checks, and scoped diff checks.
