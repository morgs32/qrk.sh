# App-owned SharedWorker per persistent session identity design

Date: 2026-09-27

Status: Approved and converted into plan 002. This archived specification records the agreed design; implementation status belongs to the active plan.

## Ownership and identity

1. Replace fixed endpoints and the Vite plugin with an app-owned entry calling `makeSharedWorker({ sqliteWasmUrl })`. Bundle factory code and WASM as ordinary assets.
2. Each SharedWorker owns one persistent Node and its database, authentication, synchronization, and command stream. Tabs selecting the same identity share it. Delete multi-node NodeHost/catalog ownership and older-node observations.
3. Preserve Node/nodeId/nodeIndex. Rename NodeWorker to SharedWorkerApi and BrowserNode to BrowserSessionApi. The former exposes readiness/attachment; the latter owns one tab's attachment.
4. Hash the complete identity into sessionKey: API URL, publishable key, system, aggregate/service kind, target name/version/resolved ID, actor name/version, session name, verified claims, and exact session-lock hash. Exclude credentials.
5. Use `zerospin:${sharedWorkerVersion}:${sessionKey}` for the worker, with physical database/VFS and lifetime-lock names derived from that pair. Generate nodeId once with makeIdFromAbbreviation, CuidFactory, and coreAbbreviations.node = 'node'; persist it across restarts.

## Interfaces and discovery

1. Require `sharedWorker: ({ name }: { name: string }) => SharedWorker` for aggregate and service makeSession. Invoke lazily on connection and reconnection. The app uses a literal `new URL('./zerospin.worker.ts', import.meta.url)` with `{ type: 'module', name }`.
2. Export makeSharedWorker from its defining module and explicitly export sqlite.wasm. The worker entry imports the WASM through `?url`.
3. Add optional expectedClaims to credential initialization. Decode and capture full claims once, compare them exactly online and offline, and thread through useInitializeSession while keeping credentials callbacks fresh. Direct sessions already supply claims.
4. Verify online first using the existing snapshot RPC to resolve target and verified claims. Only classified network unavailability allows offline fallback; credential rejection, claims mismatch, and arbitrary failures do not.
5. Zerospin owns a runtime-scoped native IndexedDB discovery index containing verified identity metadata and eligibility only. No credentials, resources, or commands. Offline reopening requires explicit expected claims and exactly one eligible match for the configuration and exact lock.
6. Publish eligibility only after durable initialization. Offline reopening must reject missing/incomplete storage without creating a replacement node. Transactional invalidation revisions prevent pre-logout operations from republishing eligibility.
7. Readiness returns embedded runtime version. Reject mismatch before attachment; decode the attachment identity and lock and verify its hash against the worker name. Serialize first initialization.
8. Reuse the discovery snapshot for a pristine baseline and successful discovery verification for attachment. Recover existing journals using their persisted nodeId, never replacing pending work with the discovery snapshot.

## Authentication and lifecycle

1. Credential providers are per-tab callbacks. Never retarget an existing node when credentials resolve to another identity; server operations retain server authentication.
2. clearAuthentication affects exactly this persistent identity across attached tabs: invalidate offline discovery, stop synchronization/staging, notify attachments, and preserve data/commands. Stale attachments cannot undo logout; fresh initialization and online verification are required.
3. Attachment disposal releases only that tab. Last known detach stops synchronization, retries, and credential requests; keep the worker idle for reuse until the browser terminates it. No background-delivery guarantee after all tabs close.
4. Scope exclusivity and death detection to runtime version plus session key. Clean up failed/obsolete connection attempts, ports, listeners, callbacks, and lock requests. Propagate initialization failures.
5. Reconnection targets the same identity, verifies readiness, and restores a snapshot before availability. Preserve nodeId and pending ordering.
6. Old locks require explicit reopening through their exact session definition. Do not discover/start them automatically. Already-running older workers remain independent.
7. Different runtime versions neither share storage nor recover each other's work. No migrations, copying, handoff, deletion, or reads of unversioned storage.

## Build and integration

1. Bundle an importable, self-contained factory. Hash bundled runtime bytes containing a fixed version placeholder plus exact WASM bytes, then embed that hash in the bundle and public version module. Exclude timestamps, machine paths, and source maps. Hash before application bundling.
2. Delete nodeWorkerPlugin, its /vite export, fixed worker asset emission, and hardcoded worker URLs. Preserve standalone-backup packaging and routing. Never load runtime code from API_URL.
3. Update upstream callers, examples, fixtures, React initialization, state/DevTools, tests, and current documentation. Preserve unrelated WIP and historical archives.
4. Commit QRK's current tracked/untracked work separately, as authorized. Implement upstream, commit/push, then pull vendor/zerospin from ../zerospin main with --squash using update-vendor. Require a clean consumer checkout; do not author vendor edits.
5. Add Studio's worker entry and factory, expected claims derived from Clerk's user ID using the server's aggregate-ID construction, and remove its plugin. Remove only the two worker/WASM Next rewrites; preserve general asset and backup routing. Update README.
6. The backend SQLite .href issue remains out of scope.

## Verification and completion

1. Extend existing browser-package Playwright coverage through public session/factory interfaces: same-identity sharing and ordering; target/claims/lock/version isolation; detach/idle/reattach; worker death/reconnect; offline lookup; rejected/missing/ambiguous identities; missing storage; logout races and isolation; explicit old-lock recovery; concurrent startup and failure cleanup; mismatch rejection.
2. Add focused tests for discovery transactions/revisions, claim capture, and one-time prefixed IDs; update React lifecycle tests. Verify SSR declarations and both aggregate/service initialization.
3. Verify identical builds hash identically, runtime/WASM changes alter the hash, and unrelated frontend/source-map changes do not. Test isolation with genuinely distinct runtime builds.
4. Run affected Nx build/type/lint/unit/browser checks, QRK Studio/web checks, and manual development/production worker/WASM loading through ordinary assets. Never add/run QRK library-app tests or Shopping browser tests.
5. Audit removed names/endpoints and current docs. Record actual verification and blockers below; keep this plan active until implementation and verification finish.

