# Mock React session provider design

**Date:** 2026-07-16
**Status:** Approved for planning

## Problem Statement

React component tests currently reach the production provider bootstrap path. They must mock Cap'n Web, actor lookup, frontend state, signatures, and related browser infrastructure before they can exercise a session database. This couples database-facing component tests to deployment infrastructure even though React sessions already use an isolated in-memory WASM SQLite database.

The core session also owns `pushQueue` and a placeholder `pushStagedCommands` method even though both are React browser-runtime concerns. A mock provider that supports real local staging but intentionally performs no pushing would either inherit blocked queue wakes and a misleading empty push result or add mock-specific exceptions around those misplaced capabilities.

Signature generation is likewise passed beside the session through each frontend program even though it is runtime state needed by that session's remote operations.

## Solution

Add a frontend-bound `makeMockProvider` at `@zerospin/react/mock`. The returned provider replaces both `ZerospinConfig` and the production frontend provider for tests, Storybook, and local demos. It creates a real core session, opens and migrates a real in-memory WASM SQLite database, inserts typed model-row fixtures once, publishes initialized state through the supplied React frontend's existing context, and then supports only local session behavior.

Move signature generation onto `ISession`. Move automatic push queue ownership into the production React provider, notify it through an optional browser-session `onCommandStaged` callback, and register a narrow runnable manual-push capability with DevTools. Mock providers create none of that push infrastructure.

## User Stories

1. As a component author, I want to mount a frontend-bound mock provider with model rows so that `useLiveQuery` exercises real Drizzle and SQLite behavior without a Zerospin deployment.
2. As a component author, I want omitted model fixtures to produce empty migrated tables so that empty-state tests remain terse.
3. As a component author, I want `stageCommand` to run its real transaction and optimistic mutations so that command-driven UI behavior is representative.
4. As a component author, I want remote APIs and pushing to be unavailable so that a mock session never silently invents server behavior.
5. As a component author, I want fixture props captured once so that React rerenders cannot erase local staged or mutated state.
6. As a test author, I want each mock-provider mount to own and close its database so that repeated tests do not accumulate WASM databases.
7. As a production user, I want existing `ZerospinConfig` and generated frontend-provider APIs to remain unchanged so that this testing feature does not migrate authentication ownership.
8. As a maintainer, I want core sessions free of React push machinery so that sessions without `usePushQueue` do not accumulate blocked queue offers.
9. As a DevTools user, I want manual push to retain its current tracing and result behavior after queue ownership moves out of `ISession`.

## Implementation Decisions

1. Define `makeMockProvider` directly in `packages/react/src/mock.ts`; do not add a barrel or re-export. The existing package wildcard exposes it as `@zerospin/react/mock`.
2. `makeMockProvider` accepts one `reactFrontend`. The returned component is typed from that frontend and accepts `children`; required `userId`, `accountId`, `actorId`, `generationId`, `systemVersion`, and `systemWorkerName`; and an optional partial `resources` map keyed by the frontend's model keys. Each value is a readonly array of that model's complete resource-row type.
3. Derive `accountName`, `actorName`, and `frontendName` from the supplied frontend controller. Generate a fresh `sessionId` through the React frontend's existing runtime. Initialize `frontendIndex` and `lastRebasedPushedCursor` to `null`, `vfsName` to `null`, and SharedWorker support to disabled.
4. Reuse `makeBrowserUserController(userId, false)` and `makeBrowserSession` only to preserve the existing `IBrowserSession` surface returned by `useSession`; do not mount `ZerospinConfig` or its context and do not initialize a SharedWorker user API.
5. Treat omitted `resources` and omitted model keys as empty arrays. Iterate the frontend models once, inserting supplied rows through each model's real Drizzle schema after the combined frontend/session schema is migrated. Invalid rows fail initialization through the normal database or schema error path.
6. Capture every fixture prop once per provider mount. Prop identity changes do not reseed. A caller remounts with a new React `key` to obtain a fresh database.
7. Render `null` while the database is created, migrated, seeded, and published. Render children only after `isInitialized` is true. Throw initialization errors to the nearest React error boundary without production retry or deployment-error remapping.
8. Close the mock provider's SQLite handle on unmount after child subscriptions release. Do not create or clean up RPC sessions, websockets, SharedWorkers, push fibers, or DevTools registrations.
9. Support only `useSession`, `useLiveQuery`, `useInitializedStateOrThrow`, `stageCommand`, and the React frontend's existing ID generation. Local staging retains the real command tables, optimistic mutations, telemetry, and live-query invalidation.
10. Mock sessions do not support actor APIs, bootstrap RPC, push admission, frontend-block convergence, SharedWorker replication, or DevTools. Their session-owned signature factory fails before a remote request with `mock-session-remote-api-unsupported`.
11. Add `generateSignature` to `makeSession` inputs and `ISession`. Frontend and React programs read it as `yield* session.generateSignature()`. Remove the separate generator parameters and the separate `generateSignature` field from `IReactSessionContext`. Keep `frontendController.signature` as the authored schema and keep frontend-binding `authenticate` unchanged.
12. Remove `pushQueue` and `pushStagedCommands` from core `ISession` and `makeSession`. Core `stageCommand` ends after its successful database transaction and returns the staged command without emitting a browser push wake.
13. Let `makeBrowserSession` accept an optional `onCommandStaged` callback. Its browser-facing `stageCommand` delegates to core staging, invokes the callback only after success, and returns the unchanged result. This is the sole staging notification seam.
14. The production React provider creates and owns the bounded Effect queue, passes its offer operation as `onCommandStaged`, and passes the queue explicitly into `usePushQueue`. Online-resume wakes also target this provider-owned queue. The mock provider omits the callback and creates no queue.
15. `usePushQueue` owns both automatic consumption and the fully wired manual-push callback. It continues to run the named `pushStagedCommands({ session })` Effect with the production React runtime, session telemetry, and existing manual trace bookkeeping, and returns the runnable manual callback to its caller.
16. Add the approved `IDevtoolsSessionEntry` shape containing `{ session: ISession, pushStagedCommands: () => Promise<existing push result> }`. The production provider registers this entry. DevTools reads the entry and invokes the narrow capability instead of calling or mutating a method on `ISession`. Mock providers register no entry.
17. Do not move `generateSignature` to `ZerospinConfig`, do not move signature schemas or `authenticate` to actor controllers, and do not change the current production component props as part of this design.

## Testing Decisions

1. Use one React integration seam as the primary acceptance test: create a mock provider from a concrete React frontend, mount it without `ZerospinConfig` or the production provider, and assert that children appear only after initialization.
2. At that seam, assert seeded and omitted model rows through `useLiveQuery`, real optimistic updates and staged lifecycle rows through `stageCommand`, stable local state across fixture-prop rerenders, an explicit remote-API failure before any request, and database close on unmount.
3. Add a typecheck fixture proving correct per-model rows compile while unknown model keys and rows belonging to another model do not.
4. Update core session tests to prove `makeSession` requires and exposes `generateSignature`, contains no push queue or imperative push method, and stages multiple commands without browser wake fibers.
5. Update production React queue tests to prove successful browser staging offers one provider-owned wake, failed staging offers none, automatic online/resume behavior remains intact, and manual pushes preserve their telemetry pointer and decoded result.
6. Update frontend-program tests so actor fetch, frontend-state fetch, actor query, and staged-command push obtain the signature from their session.
7. Update DevTools store and toolbar tests to prove registration and invocation of `IDevtoolsSessionEntry.pushStagedCommands`, including disabled state, in-flight state, failure handling, and the existing manual trace link.
8. Use the existing `makeReactFrontend` React specs, `makeSession` specs, `usePushQueue` specs, frontend-program specs, and `SessionToolbar` specs as prior-art seams rather than introducing a second mock database implementation.

## Out of Scope

1. Mocking individual Drizzle calls or returning canned `useLiveQuery` results.
2. Mock push admission, pushed-command lifecycles, websocket messages, frontend blocks, deferred/resume delivery, or server convergence.
3. Mock SharedWorker state, IndexedDB persistence, DevTools registration, or session inspection.
4. Reactive fixture reseeding after mount.
5. Production `ZerospinConfig` changes, provider-prop changes, signature-schema ownership changes, or authentication migrations.
6. Reproducing production duplicate-provider guards, provider refs, bootstrap retry policy, or user-facing deployment error mapping in the mock provider.

## Further Notes

1. This is a real local database provider, not a fake database adapter. Its value is that component queries, relations, transactions, optimistic mutations, and live-query invalidation continue to run through production database code.
2. The queue and manual-push migrations are included because they remove production browser concerns from core sessions and allow a mock session to support real staging without mock-only push exceptions.
3. The same-numbered implementation plan lives at `../plans/028-plan-mock-react-session-provider.md`.
