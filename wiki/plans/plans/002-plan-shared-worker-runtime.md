# App-owned SharedWorker runtime

Status: Design revision in progress. One worker per persistent session identity is agreed; offline identity discovery and lifecycle decisions below remain unresolved. Implementation has not begun.

## Intent

Replace Zerospin's fixed worker endpoints and Vite plugin with an app-owned entry calling `makeSharedWorker()`. Bundle worker code and WASM as ordinary application assets. Commit fully to this design: no legacy loader, compatibility aliases, or fallback endpoints.

Each persistent session identity owns separate storage within its worker runtime version. Different versions run concurrently without sharing databases or handing off ownership. Pending commands remain with the version that recorded them; a new version does not recover that work automatically.

## Implementation

1. Use one SharedWorker per persistent session identity and runtime version. One worker owns one `Node`, its database, and its command stream; multiple tabs for the same identity share that worker.
   1. Preserve `Node`, `nodeId`, and `nodeIndex` as domain concepts. Drop the repo-wide replacement of browser-node terminology.
   2. Delete the multi-node hosting responsibility of `NodeHost`; do not retain it under another name. Determine the remaining RPC names after settling the attachment lifecycle.
   3. Derive `sessionKey` deterministically from the complete persistent session identity: API URL, publishable key, system, aggregate/service kind, target name/version and resolved ID, actor name/version, session name, verified claims, and session-lock hash. Credentials are excluded.
   4. Use `zerospin:${sharedWorkerVersion}:${sessionKey}` for the worker name. Derive physical storage and lifetime-lock identity from the same pair. The browser origin provides the surrounding isolation scope.
   5. Keep the deterministic lookup key distinct from `nodeId`. Generate `nodeId` with `makeIdFromAbbreviation` and the project's CuidFactory when creating the database, persist it, and reuse it after restart. Settle its abbreviation during implementation using the existing abbreviation registry.
2. Export `makeSharedWorker` from its defining module. Accept `{ sqliteWasmUrl: string }`; own storage initialization, the shared runtime, connection handling, and cleanup. No new named configuration type is needed.
3. Add required `sharedWorker: ({ name }: { name: string }) => SharedWorker` configuration to aggregate and service `makeSession` calls. Thread it through both bootstrap paths into connection management. Invoke it lazily for connection and reconnection, never at module evaluation. Zerospin computes the name after resolving the persistent identity. Each call returns a fresh connection handle to the matching shared worker.
4. Replace the self-starting worker bundle with an importable factory bundle and explicit WASM asset export. The application entry imports the factory and its bundler-resolved WASM URL, then calls the factory. The tab constructs the worker with a literal `new URL('./zerospin.worker.ts', import.meta.url)` for bundler discovery.
5. Generate `sharedWorkerVersion` deterministically from bundled runtime code and WASM bytes before embedding the version itself. Exclude timestamps and source maps. Embed the same identity in the worker and expose it through readiness; reject a tab/worker version mismatch before attachment.
6. Isolate physical IndexedDB/VFS storage and lifetime locks by runtime version and persistent session identity. Validate the attachment identity and lock against the selected worker before opening storage. Disposing one tab session releases only its connection; other connections to the same node remain operational. Identity discovery storage and its ownership remain to be settled below.
7. Keep exclusivity and death detection scoped to the runtime-version/session-key pair. Different versions and different session identities never block one another. Propagate initialization failures and clean up failed connection attempts.
8. Delete `nodeWorkerPlugin`, its package export, fixed-endpoint asset emission, and hardcoded worker URLs. Update all affected upstream callers, examples, tests, and current documentation to the new interface and vocabulary.
9. Add QRK's app-owned worker entry and wire `userSession`. Remove the studio plugin and the two worker/WASM-specific Next rewrites. Preserve general asset routing and unrelated standalone-backup routing. Update the README and consumer references to renamed upstream interfaces.
10. Implement Zerospin changes upstream, commit and push there, then consume via the prescribed vendor workflow. Preserve unrelated WIP in both repositories; do not directly author vendor changes. Resolve a dirty-checkout restriction before any subtree operation rather than stashing or committing unrelated changes.

## Interface sketch

```ts
// App-owned zerospin.worker.ts
import { makeSharedWorker } from '@zerospin/browser/makeSharedWorker';
import sqliteWasmUrl from '@zerospin/browser/sqlite.wasm?url';

makeSharedWorker({ sqliteWasmUrl });
```

```ts
// Property added to the existing makeSession configuration:
sharedWorker: ({ name }) =>
  new SharedWorker(new URL('./zerospin.worker.ts', import.meta.url), {
    type: 'module',
    name,
  }),
```

## Verification

1. Verify development and production worker/WASM loading through QRK's ordinary `/assets/` routing, without special worker rewrites.
2. Verify tabs with the same persistent session identity and runtime version share one worker and node. Different targets, claims, locks, or runtime versions select separate workers and physical databases. Disposing one connection leaves the others operational.
3. Verify different runtime versions run concurrently using physically separate databases and locks.
4. Verify runtime/WASM changes alter the version, while identical builds and unrelated frontend changes do not.
5. Verify pending commands survive restarting the same version and remain invisible to another version.
6. Verify initialization failure, worker termination, reconnection, version mismatch, and SSR-safe session declarations.
7. Verify the multi-node host and fixed-endpoint loader are removed, affected terminology is consistent, and Node/nodeId/nodeIndex retain their command-stream meaning. Verify nodeId is generated through makeIdFromAbbreviation once per new database and survives restart.
8. Run affected upstream checks and QRK typechecking, lint, and manual browser checks. Never add or run library-app tests. Keep this plan active until implementation and verification finish.

## Defaults and exclusions

1. No migration, copying, automatic deletion, or cross-version handoff of stored data. Existing unversioned storage remains untouched and is not read by the new runtime.
2. No runtime code fetched from `API_URL`.
3. Session-lock versions and worker-runtime versions remain distinct concepts.
4. The backend SQLite `.href` failure is a separate fix.

## Design decisions still to resolve

1. Identity discovery before worker construction: how offline initialization selects a previously verified target and claims, whether a durable discovery index is needed, who owns it, and how account switching or ambiguous matches are handled. A remembered identity is not authorization for server access. The earlier suggestion of a tab-accessible index is a proposal, not an approved storage design.
2. Bootstrap and attachment: exact online identity-resolution operation, readiness/version checks, identity validation, initial snapshot ownership, and concurrent first-attachment behavior. Avoid duplicate bootstrap requests or accepting an incompatible attachment into an already initialized node.
3. Authentication lifecycle: credential responders across tabs, expiration, rejection versus network failure, logout scope, and cancellation of in-flight discovery or attachment.
4. Recovery across session-lock changes: separate workers retain separate command streams; settle whether older identities are explicitly reopened only or automatically discovered and started. Cross-runtime-version recovery remains excluded.
5. Worker lifecycle: initialization failure cleanup, final-connection behavior, background synchronization, restart/reconnect, and lifetime-lock acquisition/death detection without blocking unrelated identities.
6. Verification seams: exercise the agreed discovery, attachment, persistence, and recovery behavior through the public session/factory interface where practical, with focused lower-level coverage for deterministic build identity.

Resolve these choices one at a time before finalizing the matching 002 spec and marking this plan ready for implementation. Keep this plan active until implementation and verification finish.
