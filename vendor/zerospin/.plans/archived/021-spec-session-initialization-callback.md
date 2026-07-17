# Session Initialization Callback design

**Date:** 2026-07-12
**Status:** Approved for implementation

## Problem Statement

`ISession.asyncIsInitialized` is a permanent Promise latch whose only purpose is to let consumers created before bootstrap wait for the initialized store. `pushStagedCommands` awaits it and then immediately rechecks the same invariant through `getInitializedStateOrThrow`, and because the Promise never rejects, a pre-initialization push hangs forever when bootstrap fails. `useApi` also waits on it even though Provider context is unavailable until the session is initialized. Session readiness needs one contract instead of a Promise that duplicates the store.

## Solution

Replace `asyncIsInitialized` with a one-shot `onInitialized` callback registered directly against the existing session Zustand store. Pre-initialization imperative pushes become an ordering error that throws the existing `session-store-not-initialized` error synchronously, and redundant readiness waits are removed from `pushStagedCommands` and `useApi`.

## User Stories

1. As an imperative session-ref consumer, I want to register a callback that fires once with the initialized session state, so that I can defer work without polling the store or holding a permanent Promise.
2. As a React application author, I want pre-initialization imperative pushes to fail fast with the existing initialization error, so that ordering bugs surface instead of hanging silently.
3. As a test author, I want to await initialization through the same public callback the application uses, so that integration coverage exercises the real readiness surface.

## Implementation Decisions

1. `ISession` gains `onInitialized(handler: (props: { state: IInitializedSessionState<InferFrontendModels<FRONTEND>> }) => void): () => void`; `IBrowserSession` inherits it. No new named state type is introduced.
2. `asyncIsInitialized` is removed from every session surface with no compatibility alias.
3. Each registration is one direct Zustand subscription — no callback registry, handler loop, or shared helper.
4. Registration after initialization invokes the handler synchronously with the current state and returns a noop unsubscribe. Registration before initialization unsubscribes on the first initialized transition and invokes the handler with the captured state in the next microtask, so a throwing handler cannot make bootstrap's `setState` report failure.
5. The callback is success-only and fires at most once per registration. Bootstrap errors and retries remain Provider/SWR-owned; a permanently failed bootstrap leaves pending handlers unfired, and callers may unsubscribe while waiting.
6. The `pushStagedCommands` Effect drops its readiness wait; `getInitializedStateOrThrow` remains the immediate guard. `useApi` drops its readiness wait because Provider gating already guarantees initialization.
7. Imperative `session.pushStagedCommands(): void` keeps its signature. The React-installed callback synchronously throws the existing `session-store-not-initialized` `ZerospinError` before dispatching the push effect; ordinary asynchronous push error behavior is unchanged.
8. Multiple registrations are independent; each handler fires at most once.
9. Exceptions from late synchronous handlers propagate to the registering caller.

## Testing Decisions

1. Core `makeSession` tests own the callback contract: pending registration with one-shot microtask delivery of the exact initialized state, late synchronous delivery, and unsubscribe-before-initialization.
2. React `usePushQueue` tests own the public pre-initialization push throw: synchronous `session-store-not-initialized` with no push performed.
3. The existing Provider integration readiness helper migrates to `onInitialized`, which covers the browser-session surface without a separate suite.
4. `rg -n "asyncIsInitialized"` verifies no stale API remains.
5. `nx run-many -t tsc:typecheck test -p @zerospin/core @zerospin/react` gates the change.

## Out of Scope

1. Initialization-failure callbacks or a bootstrap-failure session state.
2. A Promise compatibility alias.
3. RPC or server-side changes.
4. Redesigning asynchronous push error reporting.
5. Initialization state-machine changes.

## Further Notes

1. Affected architecture documents (`bootstrapBrowserSession.md`, `FrontendApi.md`, `Blockchain.md`) update their narratives, line ranges, and source hashes in the same implementation pass.
