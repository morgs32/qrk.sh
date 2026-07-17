---
title: bootstrapBrowserSession
type: module
updated: 2026-07-15
sources:
  - path: packages/react/src/ZerospinConfig.tsx
    sha: 9e83737220d92a860a6ea28f737de2904a05009f
    lines: 1-25
  - path: packages/react/src/makeBrowserUserController.ts
    sha: 362f1e6cf3a93f085168d1ca52b617342aec2661
    lines: 1-95
  - path: packages/react/src/makeProvider.tsx
    sha: d547f9229bc9ba246729fdb6f23384ee08adf8e6
    lines: 1-273
  - path: packages/devtools/src/ZerospinDevtools.tsx
    sha: bb2134763133403e029ad91e6f1b7aa0144d62a3
    lines: 1-715
  - path: packages/devtools/src/sessions/sessions/sessionId/SessionPane.tsx
    sha: 975c82be4d660bc179324f702ef872bb8437093e
    lines: 76-124
  - path: packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.tsx
    sha: f505ad204d06f161ed6eea1f4f846a80ec98cc93
    lines: 1-767
  - path: packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsSpanNode.tsx
    sha: 9dd9e24e7fcfff44ef04297eaa1dedc4f189e1ca
    lines: 1-125
  - path: packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.react.spec.tsx
    sha: 5417a7f0f72f6e366491f62cceb903c77b0d770c
    lines: 1-589
  - path: examples/shopping/tests/unit/frontendSessionLogs.spec.tsx
    sha: bdac1c7c78ea6af563e65efaf4fe5eb8137d8d06
    lines: 170-336
  - path: packages/devtools/src/sharedWorker/SharedWorkerRoute.tsx
    sha: 64298b721a9f9d0731dd939556ba8fda7380ac80
    lines: 1-20
  - path: packages/devtools/src/zerospinDevtoolsStore.ts
    sha: cf7e34add34ccdc0bef43bf6bf259f3c00c41a40
    lines: 1-39
  - path: packages/react/src/makeBrowserSession.ts
    sha: 9d6d3a5683d8f1326df554dd9a365bc6223d72cb
    lines: 1-28
  - path: packages/frontend/src/pushStagedCommands.ts
    sha: 09615c19fab4713ceebce820c66ab5d5af8ba6b2
    lines: 1-452
  - path: packages/frontend/src/pushStagedCommands.node.spec.ts
    sha: 5807a2b2f364fbdd38899cdac2c4608e15ee2d18
    lines: 141-408
  - path: packages/frontend/src/fetchActor.ts
    sha: 134e6dfb4973c806b3d37785294e12077193ee08
    lines: 1-65
  - path: packages/frontend/src/fetchFrontendState.ts
    sha: 3d9a183d65e3827eb9d5921aaff34804bc24c83e
    lines: 1-59
  - path: packages/frontend/src/executeActorQuery.ts
    sha: cc3dcbd05e31b00e788d847cf29e89347fc0ea4c
    lines: 1-84
  - path: packages/react/src/usePushQueue.ts
    sha: a811671e5f7da3ccbdad21afb11ce7b3999239a4
    lines: 1-167
  - path: packages/react/src/usePushQueue.react.spec.tsx
    sha: 8e8fdcca52d5e4beec84e7b442df46847c13e80b
    lines: 213-440
  - path: packages/react/src/useApi.ts
    sha: a2d89d8f08b25329f983d117df11cad152969fec
    lines: 1-72
  - path: packages/react/src/bootstrapBrowserSession.ts
    sha: ed86a78ae3550fe71b32f4b2c719517bc13d9e6c
    lines: 1-227
  - path: packages/shared-worker/src/makeSharedWorkerSession.ts
    sha: 623f5b686fa21074e11a53bf1d67167139824b19
    lines: 1-126
  - path: packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts
    sha: 8924a2c4a5b674d4b94c4184c96d7051eecf3ccd
    lines: 1-214
  - path: packages/shared-worker/src/SharedWorker/makeVfsName.ts
    sha: 2e9a1aab9789ac4669635b8671c168c8bd505c54
    lines: 1-11
  - path: packages/shared-worker/src/drizzle/makeIdbSQLite3.ts
    sha: 64a970edc48cc35433c7d173fc5b98c8d1d862e6
    lines: 1-43
  - path: packages/react/src/makeReactFrontend.ts
    sha: bced7ff80f9c91e4a935064d2acbbed5c3edc509
    lines: 61-109
  - path: packages/core/src/session/makeSession.ts
    sha: b4a199dcad160a0bb015b636cede6d57a9a43d3c
    lines: 1-318
  - path: packages/core/src/session/sessionRepoTables.ts
    sha: eae52a5c4cb07c92014ac03e79fa9ab2461b2cff
    lines: 1-64
  - path: packages/core/src/session/sessionCommandShape.ts
    sha: 00eadf4060deb0455a59d005eef88dc94ec3962b
    lines: 1-163
  - path: packages/core/src/session/applyFrontendState.ts
    sha: a05609477a1a2b79211a31d5db53a09e8081f093
    lines: 1-140
  - path: packages/core/src/session/applyFrontendBlock.ts
    sha: 519f6ebc7c050acd1f0b243a263bdfb5f2e0bfa5
    lines: 1-483
  - path: packages/core/src/contracts/applyFrontendMutationTx.ts
    sha: bdd1513dd889fb1d5144b67150b59c599bb442dc
    lines: 1-69
  - path: packages/core/src/session/FrontendBlockSchema.ts
    sha: ff9cd074655165c9dc4630cfadf6fc60bd073289
    lines: 1-35
  - path: packages/react/src/acquireFrontendWebSocket.ts
    sha: 0b6ba95d452db4520308c56b63678324cb5b8898
    lines: 1-143
  - path: packages/logger/src/annotateFunctionSpan.ts
    sha: 33eb4f425d810fd057a18f90b9435117ff2370b9
    lines: 1-248
  - path: packages/devtools/src/sessions/sessions/sessionId/SessionToolbar.tsx
    sha: 4a8b57437815c4de89ae7ed6f2c392fd38b4e342
    lines: 1-125
  - path: packages/devtools/src/sessions/sessions/sessionId/SessionToolbar.react.spec.tsx
    sha: 0d300c0a55581f185d5ee178785b99ad90f9739e
    lines: 28-171
  - path: packages/devtools/src/sessions/sessions/sessionId/commands/SessionsCommandsLayout.tsx
    sha: c2a9dcef9873356888574e9a188d91f79a99c548
    lines: 24-98
  - path: packages/core/src/session/types.ts
    sha: b364102394f1cbea7dc9f2a00e53871efb9fb990
    lines: 73-206
  - path: packages/system-worker/src/FrontendRepo/getFrontendState/getFrontendState.ts
    sha: 7fc72bb5434f710476f781f6190cfe47ed8798e0
    lines: 19-86
---

# bootstrapBrowserSession

## What this does

`ZerospinConfig` requires a browser `userId`, accepts an optional `isSharedWorkerEnabled` flag that defaults to `false`, constructs one `IBrowserUserController` carrying both values, and provides that controller to React sessions through context (../../packages/react/src/ZerospinConfig.tsx:8-24, ../../packages/react/src/makeBrowserUserController.ts:5-95). `makeProvider` captures the controller's flag for the Provider mount, passes it into the core `ISession`, wraps it as an `IBrowserSession`, and bootstraps that session without adding a SharedWorker staging mirror path (../../packages/react/src/makeProvider.tsx:81-167, ../../packages/react/src/makeBrowserSession.ts:11-25).

`bootstrapBrowserSession` builds the session schema, fetches the actor plus pinned `deployId`/`generationId` and authored `systemVersion` before opening the main-thread WASM DB, and uses `generationId` for every browser persistence and live-delivery boundary. When SharedWorker mode is enabled it opens the root with `{ systemId, generationId }`, stores only the user-scoped `UserApi`, fetches `IFrontendState`, applies that state into the main-thread session DB, publishes initialized state with `generationId` and `systemVersion`, and opens the exact generation-prefixed FrontendBlockRepo websocket. `@zerospin/frontend` owns actor/state fetch, push, and actor-query programs; React supplies their session telemetry layer (../../packages/frontend/src/fetchActor.ts:25-68, ../../packages/react/src/bootstrapBrowserSession.ts:74-190, ../../packages/shared-worker/src/makeSharedWorkerSession.ts:8-119, ../../packages/react/src/acquireFrontendWebSocket.ts:20-81).

`IFrontendState.resources` is FrontendRepo's current optimistic snapshot, not an authoritative-only base. Its pushed rows at or below `lastRebasedPushedCursor` are already represented in those resources, so bootstrap inserts the resources and lifecycle rows without replaying pending commands a second time (../../packages/system-worker/src/FrontendRepo/getFrontendState/getFrontendState.ts:47-84, ../../packages/core/src/session/types.ts:89-104, ../../packages/core/src/session/applyFrontendState.ts:60-131).

```mermaid
flowchart TD
  config[ZerospinConfig userId + SharedWorker flag]
  controller[makeBrowserUserController]
  provider[makeProvider]
  core[makeSession core ISession]
  browser[makeBrowserSession IBrowserSession]
  db[main-thread session DB]
  actor[fetchActor]
  sharedRoot[makeSharedWorkerSession systemId + generationId]
  userApi[getUserApi user API]
  devtoolsStore[Zerospin DevTools sharedWorkerUserApi]
  sharedStatus[Shared Worker route]
  frontendRepo[FrontendRepo optimistic state + pushed watermark]
  fetch[fetchFrontendState]
  applyLocal[applyFrontendState]
  store[publish initialized session store]
  telemetry[session-owned telemetry collector]
  toolbar[SessionToolbar manual Push + trace link]
  logs[DevTools trace waterfall + span details]
  websocket[acquire FrontendBlockRepo websocket]
  liveApply[applyFrontendBlock convergence + watermark]

  config --> controller --> provider --> core --> browser
  toolbar -->|manual push| core
  core -->|lastDevtoolsPush| toolbar
  core --> telemetry --> logs
  toolbar -->|traceId query| logs
  provider --> actor --> db --> sharedRoot --> userApi --> frontendRepo --> fetch --> applyLocal --> store
  userApi --> devtoolsStore --> sharedStatus
  store --> websocket --> liveApply --> db
```

## Trigger

1. [`makeProvider`](../../packages/react/src/makeProvider.tsx) creates one core session using the mount-time SharedWorker flag from `ZerospinConfig`, creates its browser-session wrapper, then `useSWRImmutable` runs `bootstrapBrowserSession` and retains its release Effect (../../packages/react/src/makeProvider.tsx:81-163).
2. Once bootstrap publishes initialized state, `makeProvider` enables `usePushQueue`; the browser websocket is already scoped to the same account/actor/frontend identity (../../packages/react/src/makeProvider.tsx:186-196, ../../packages/react/src/bootstrapBrowserSession.ts:154-176).

## Annotated flow

1. [`ZerospinConfig`](../../packages/react/src/ZerospinConfig.tsx) requires `userId`, defaults optional `isSharedWorkerEnabled` to `false`, creates `makeBrowserUserController(userId, isSharedWorkerEnabled)` synchronously, and provides the controller to child providers (../../packages/react/src/ZerospinConfig.tsx:8-24).
2. [`makeProvider`](../../packages/react/src/makeProvider.tsx) requires that controller context before creating a provider session; it captures the controller's `isSharedWorkerEnabled` value for the Provider mount, creates the core session with that value, then exposes `makeBrowserSession({ session: coreSession, browserUserController })` through React context and refs (../../packages/react/src/makeProvider.tsx:81-131, ../../packages/core/src/session/makeSession.ts:45-252).
3. [`bootstrapBrowserSession`](../../packages/react/src/bootstrapBrowserSession.ts) builds frontend models from `session.frontend`, merges `sessionRepoTables`, and calls [`fetchActor`](../../packages/frontend/src/fetchActor.ts) before opening the migrated in-memory WASM SQLite DB on the main thread (../../packages/react/src/bootstrapBrowserSession.ts:69-94, ../../packages/frontend/src/fetchActor.ts:21-64).
4. `fetchActor` opens `newSyncRpcSession<ZerospinApis>`, resolves the bound FrontendApi, and uses `makeTraceableApiTarget` so a domain Left becomes the existing `IAnyError` and a promise rejection becomes `async-failed`; it makes one attempt (../../packages/frontend/src/fetchActor.ts:40-63). [`makeProvider`](../../packages/react/src/makeProvider.tsx) configures `useSWRImmutable` with `shouldRetryOnError: false` and maps terminal deploy/auth/transport failures to user-facing hints (../../packages/react/src/makeProvider.tsx:136-174, ../../packages/react/src/makeProvider.tsx:228-253).
5. `fetchActor` returns `{ actor, deployId, generationId, systemId, systemVersion, systemWorkerName, systemEnvironmentId }` from a FrontendApi capability already pinned to the active hosted deploy. Bootstrap retains the generation and authored version, then calls `makeSharedWorkerSession({ systemId, generationId })` when the session enables SharedWorker mode. The client puts both identities and the WASM URL into the worker URL; the host rejects a missing value, keys its user store by `systemId/generationId/userId`, and derives the IndexedDB VFS name as `zerospin/{systemId}/{generationId}/users/{userId}`. Disabled mode skips this boundary and leaves `sharedWorkerSession` null (../../packages/frontend/src/fetchActor.ts:25-68, ../../packages/react/src/bootstrapBrowserSession.ts:74-109, ../../packages/shared-worker/src/makeSharedWorkerSession.ts:8-119, ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:39-60, ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:133-185, ../../packages/shared-worker/src/SharedWorker/makeVfsName.ts:1-11).
6. The SharedWorker client API is root-scoped: bootstrap calls `api.getUserApi({ userId })` and stores the returned user-scoped API in `browserUserController.store.sharedWorkerUserApi` and `zerospinDevtoolsStore`; downstream React code does not receive root SharedWorker methods. The Shared Worker route reads that DevTools value and renders disabled for `null` or enabled for a connected handle (../../packages/react/src/bootstrapBrowserSession.ts:98-117, ../../packages/react/src/makeBrowserUserController.ts:5-38, ../../packages/shared-worker/src/makeSharedWorkerSession.ts:12-27, ../../packages/devtools/src/zerospinDevtoolsStore.ts:6-38, ../../packages/devtools/src/sharedWorker/SharedWorkerRoute.tsx:5-18).
7. Bootstrap always fetches `IFrontendState` through the linked-envelope [`fetchFrontendState`](../../packages/frontend/src/fetchFrontendState.ts) program, replaces the main-thread DB from its resource and command-lifecycle snapshots with `applyFrontendState`, and copies the resolved actor/account/system worker values, `generationId`, authored `systemVersion`, frontend index, and pushed rebase watermark into the initialized session store (../../packages/react/src/bootstrapBrowserSession.ts:110-171, ../../packages/frontend/src/fetchFrontendState.ts:32-58, ../../packages/core/src/session/applyFrontendState.ts:26-131).
8. Bootstrap passes `generationId` into `acquireFrontendWebSocket` only after publishing initialized state. The room name is exactly `frtbrepo_{generationId}/{accountId}/{accountName}/{actorName}/{actorId}/{frontendName}`. `releaseBrowserSession` closes that websocket scope, clears the user-scoped SharedWorker handle from the browser and DevTools stores, and releases the SharedWorker root session (../../packages/react/src/bootstrapBrowserSession.ts:152-212, ../../packages/react/src/acquireFrontendWebSocket.ts:20-81, ../../packages/react/src/acquireFrontendWebSocket.ts:133-153).

## Browser session staging

1. Core [`makeSession`](../../packages/core/src/session/makeSession.ts) accepts optional `isPushPaused`, `isSharedWorkerEnabled`, and `runtime` inputs (`ManagedRuntime` or captured `Runtime.Runtime`); React passes both flags and `sessionRuntime`, and callers without a runtime get `defaultSessionRuntime`. It eagerly creates `session.pushQueue` as `Queue.bounded(1)`, exposes a one-shot `session.onInitialized` readiness callback, defines `stageCommandEffect`, and runs the staging transaction under that session's telemetry layer before offering the queue wake (../../packages/react/src/makeProvider.tsx:109-123, ../../packages/core/src/session/makeSession.ts:50-88, ../../packages/core/src/session/makeSession.ts:178-307).
2. The rollback metadata is session-local: `sessionRepoTables` adds `optimisticAppliedMutations`, and `sessionCommandShape` stores one JSON array of encoded applied mutations per command id. Pushed session rows preserve the full frontend/staged provenance plus pushed cursor/time so response and block rebases can order them against the server watermark (../../packages/core/src/session/sessionRepoTables.ts:35-58, ../../packages/core/src/session/sessionCommandShape.ts:1-149).
3. [`makeBrowserSession`](../../packages/react/src/makeBrowserSession.ts) wraps the core `ISession` and delegates `stageCommand` directly to `session.stageCommand`; no SharedWorker forwarding runs in the React package (../../packages/react/src/makeBrowserSession.ts:11-25).

## Browser session push

1. [`makeProvider`](../../packages/react/src/makeProvider.tsx) mounts [`usePushQueue`](../../packages/react/src/usePushQueue.ts) once the session store is initialized (../../packages/react/src/makeProvider.tsx:186-196).
2. [`makeSession`](../../packages/core/src/session/makeSession.ts) exposes `isPushPaused`, defaults `lastDevtoolsPush` to `null`, and supplies an empty Promise-returning `session.pushStagedCommands` boundary. [`usePushQueue`](../../packages/react/src/usePushQueue.ts) installs the real imperative callback on mount; a pre-initialization call still throws `session-store-not-initialized` synchronously (../../packages/core/src/session/makeSession.ts:71-153, ../../packages/core/src/session/makeSession.ts:292-313, ../../packages/react/src/usePushQueue.ts:28-74).
3. The imperative callback runs only manual calls under `devtools.pushStagedCommands`, captures the current trace id directly, and writes `{ traceId, completedAt, status }` on either Effect exit before preserving the decoded result or rejection. The automatic online queue consumer remains independently gated by `enabled && !isPushPaused`, runs under the session telemetry layer, and never updates the pointer (../../packages/react/src/usePushQueue.ts:28-92, ../../packages/react/src/usePushQueue.ts:94-166, ../../packages/react/src/usePushQueue.react.spec.tsx:213-299, ../../packages/react/src/usePushQueue.react.spec.tsx:320-342).
4. [`pushStagedCommands`](../../packages/frontend/src/pushStagedCommands.ts) reads staged rows in staged-cursor order. With no rows it returns stable empty admission partitions without signing or opening an RPC session; otherwise it sends the full encoded shapes through one linked `FrontendApi.pushCommands` call and returns the exact decoded response only after the local rebase commits (../../packages/frontend/src/pushStagedCommands.ts:55-101, ../../packages/frontend/src/pushStagedCommands.ts:103-448, ../../packages/frontend/src/pushStagedCommands.node.spec.ts:141-259).
5. In one local transaction, the response path rewinds every staged overlay and each locally overlaid pushed command newer than the session's prior watermark, removes their optimistic metadata, transitions recovered pending/new successes to `pushedCommands`, and records rejected staged rows as local failures (../../packages/frontend/src/pushStagedCommands.ts:94-246).
6. The response path then replays pushed commands newer than the unchanged local watermark in pushed order and commands staged while the RPC was in flight in staged order. Each command runs in a savepoint; a replay failure removes that lifecycle row and records a local failed command without rolling back successful siblings (../../packages/frontend/src/pushStagedCommands.ts:248-430).

```mermaid
sequenceDiagram
  participant Toolbar as SessionToolbar
  participant Push as usePushQueue / pushStagedCommands
  participant Session as Session SQLite
  participant FrontendApi
  participant FrontendRepo

  opt Manual DevTools push
    Toolbar->>Push: session.pushStagedCommands()
    Push->>Push: devtools.pushStagedCommands root
  end
  Push->>Session: read staged commands by stagedCursor
  alt No staged commands
    Push-->>Toolbar: stable empty admission result
  else Staged commands exist
    Push->>FrontendApi: pushCommands(full encoded staged rows)
    FrontendApi->>FrontendRepo: via SystemWorker
    FrontendRepo->>FrontendRepo: guard + optimistic admission + pushed block
    FrontendRepo-->>Push: pending + pushed + failed
    Push->>Session: rewind all staged and local pushed overlays
    Push->>Session: transition lifecycle rows
    Push->>Session: replay pushed newer than watermark
    Push->>Session: replay concurrently staged rows
  end
  opt Manual DevTools push
    Push->>Session: store lastDevtoolsPush
    Push-->>Toolbar: decoded result or rejection
  end
```

### DevTools boundary

Each session state owns one stable telemetry collector, an ordered non-deduplicating batch, and nullable `lastDevtoolsPush` state. `SessionToolbar` owns the visible Pause push, single-flight Push, and timestamped success/failure trace link; the manual React boundary updates that pointer, while automatic queue pushes never do. The Commands sidebar retains its staged count without a push glyph (../../packages/core/src/session/types.ts:107-166, ../../packages/core/src/session/makeSession.ts:88-153, ../../packages/react/src/usePushQueue.ts:28-92, ../../packages/devtools/src/sessions/sessions/sessionId/SessionToolbar.tsx:39-125, ../../packages/devtools/src/sessions/sessions/sessionId/commands/SessionsCommandsLayout.tsx:24-80, ../../packages/devtools/src/sessions/sessions/sessionId/SessionToolbar.react.spec.tsx:28-170).

Browser-owned `Effect.fn` procedures opt into `annotateFunctionSpan`, which snapshots the original argument tuple before execution and a successful result before the span closes. The snapshot traversal masks sensitive keys and `Redacted` values, avoids getters, converts non-JSON values to markers, and bounds depth, collection size, string size, and total visited values; shared core/database and Worker procedures do not opt in (../../packages/logger/src/annotateFunctionSpan.ts:3-248, ../../packages/react/src/bootstrapBrowserSession.ts:26-224, ../../packages/react/src/acquireFrontendWebSocket.ts:9-142, ../../packages/frontend/src/fetchActor.ts:13-65, ../../packages/frontend/src/fetchFrontendState.ts:11-59, ../../packages/frontend/src/executeActorQuery.ts:9-84, ../../packages/frontend/src/pushStagedCommands.ts:35-452, ../../packages/shared-worker/src/makeSharedWorkerSession.ts:1-126).

`ZerospinDevtools` registers a direct `logs` child route and the session pane exposes Logs beside Commands and Database. The route groups local spans/logs and returned links by browser trace, selects a valid `traceId` query or falls back to the newest trace when absent/stale, and updates the query on trace-row selection. For the selected trace it computes one timing range, renders the span hierarchy as proportional status-colored waterfall bars, preserves a still-present span selection, and shows span identity, timing, attributes, attached logs, and server links in a fixed details pane. Clear affects only the selected session and atomically clears its telemetry and push pointer before removing the trace query; the route and shopping integration tests cover query selection, manual Push linking, and clear behavior (../../packages/devtools/src/ZerospinDevtools.tsx:31-37, ../../packages/devtools/src/ZerospinDevtools.tsx:328-338, ../../packages/devtools/src/sessions/sessions/sessionId/SessionPane.tsx:76-124, ../../packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.tsx:18-283, ../../packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.tsx:371-760, ../../packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsSpanNode.tsx:3-125, ../../packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.react.spec.tsx:150-531, ../../examples/shopping/tests/unit/frontendSessionLogs.spec.tsx:170-340).

## Frontend reads and live blocks

1. Browser bootstrap reads frontend state through `FrontendApi.getFrontendState` after SharedWorker setup (or after skipping it when `isSharedWorkerEnabled` is false). `applyFrontendState` recreates the main-thread database from FrontendRepo's current optimistic resources and inserts its pending lifecycle rows without replaying commands already included at `lastRebasedPushedCursor` (../../packages/react/src/bootstrapBrowserSession.ts:130-174, ../../packages/core/src/session/applyFrontendState.ts:26-131).
2. Each live message runs in its own root `acquireFrontendWebSocket.frontendBlock` span. After decoding with the core [`FrontendBlockSchema`](../../packages/core/src/session/FrontendBlockSchema.ts), the span records the `frontendIndex`; duplicate or older blocks finish successfully with `outcome: stale`, while a newer block applies with the prior session watermark, advances both `frontendIndex` and `lastRebasedPushedCursor`, and records `outcome: applied`. Decode or apply failure ends that root span as an error and still escapes the callback without advancing the store watermarks (../../packages/react/src/acquireFrontendWebSocket.ts:86-135, ../../packages/core/src/session/FrontendBlockSchema.ts:17-35).
3. [`applyFrontendBlock`](../../packages/core/src/session/applyFrontendBlock.ts) rewinds staged overlays and only locally overlaid pushed mutations newer than the prior watermark, applies the convergence rows/deletes, reconciles the complete pending snapshot and terminal outcomes through the block watermark, then replays newer pushed commands before staged commands (../../packages/core/src/session/applyFrontendBlock.ts:50-238, ../../packages/core/src/session/applyFrontendBlock.ts:240-480).
4. A staged replay failure becomes a local failed command. A pushed replay failure also remains locally failed; a later authoritative execution is ignored for that id, while a later authoritative failure replaces the local failure details (../../packages/core/src/session/applyFrontendBlock.ts:240-299, ../../packages/core/src/session/applyFrontendBlock.ts:301-480).
5. The browser release path closes the FrontendBlockRepo websocket scope through `releaseBrowserSession` (../../packages/react/src/acquireFrontendWebSocket.ts:133-140, ../../packages/react/src/bootstrapBrowserSession.ts:170-197).
