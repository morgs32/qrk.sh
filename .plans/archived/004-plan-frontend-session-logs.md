# 004 — Frontend Session Logs Implementation Plan

## Summary

1. Implement the approved linked FrontendApi envelope, session-owned browser telemetry, non-React frontend package, and DevTools Logs route end to end.
2. Preserve the existing root RPC route, SystemApi contract, WebSocket path, LogRepo storage model, and full command objects.
3. Introduce only the abstractions and named types approved by the design. The explicit Logs-route data loops are approved; add no other helpers, wrappers, barrels, or UI-only types.

## Public Contracts

1. Add `ILinkedRpcEnvelope<A, E>` to `@zerospin/logger` with `result: Schema.EitherEncoded<A, E>` and `link: ISpanLinkRecord | null`.
2. Add `makeTraceableApiTarget`, mapping raw linked-envelope methods to ordinary positional methods returning `Effect<A, E | Error, TelemetryCollector>`.
3. Correct `makeTraceableRpcTarget` so its declared failure channel includes transport and malformed-envelope `Error`.
4. Remove `IFrontendApi`. Keep `IPublicApis` only for `getSystemApi`; frontend callers use concrete `ZerospinApis`, `FrontendApi`, and `FrontendApiFailure`.
5. Change FrontendApi leaves to raw `IRpcRequest<[]>` / `IRpcRequest<[props]>` signatures returning linked envelopes, and derive FrontendApiFailure signatures from the concrete class.
6. Extend both session-state variants with `telemetry: ITelemetryBatch` and `telemetryCollector: ITelemetryCollector`.
7. Add `@zerospin/frontend` with explicit exports for `fetchActor`, `fetchFrontendState`, `pushStagedCommands`, and `executeActorQuery`; provide no package root export or `index.ts`.

## Implementation

1. Rework the FrontendApi factory and leaf boundary.
   1. Define one unexported `Effect.fn('FrontendApi.auth')` that strictly validates the single authentication-argument tuple, resolves identity, authenticates, authorizes, and returns actor/account/frontend/system auth results.
   2. Make `ZerospinApis.getFrontendApi(auth)` return `FrontendApi | FrontendApiFailure`, with no telemetry layer, persistence, link, or retry around construction.
   3. Add only the approved file-local `FrontendAuthResults`, `SystemWorkerApi`, and `makeApiHandler` inside the FrontendApi module.
   4. For each leaf, acquire one fresh disposable SystemWorker, then run strict tuple validation and the named leaf Effect under a new `{ root: true }` span and fresh telemetry layer.
   5. Encode success or domain failure, finish the root, flush the collector, and persist that complete server batch through the same unwrapped SystemWorker.
   6. Return a `causedBy` link only when persistence succeeds and both browser context and server root identity exist.
   7. Treat persistence rejection or encoded persistence failure as a null link without changing the leaf result. Dispose the acquired stub after the leaf and persistence attempt on every path.
   8. Remove `retryTransientDoErrors` from frontend authentication and all FrontendApi leaves.

2. Implement logger target tracing.
   1. Validate the complete linked envelope before decoding it.
   2. Supply the current browser span as `request.traceContext`; do not parent the server root to it.
   3. Append only the returned cross-store link to the browser collector; do not merge server telemetry into the browser session.
   4. Extend logger tests for current-span propagation, success, domain failure, null links, transport rejection, malformed envelopes, and the corrected `E | Error` type channel.

3. Manually scaffold `@zerospin/frontend`.
   1. Use ESM, explicit subpath exports, Nx-inferred `ts`, `test`, `lint`, and `lib` targets, TypeScript project references, and version/package visibility consistent with public core/react packages.
   2. Move `fetchActor` and `fetchFrontendState` from core and `pushStagedCommands` from React without rewriting command or reconciliation logic.
   3. Extract the current actor-query body into the named `executeActorQuery` Effect and have the React hook call it.
   4. In each program, explicitly create `newSyncRpcSession<ZerospinApis>`, call `getFrontendApi`, wrap the returned concrete target, and locally convert `IAnyErrorJson | Error` to the existing `IAnyError` caller contract. Do not introduce a shared target-acquisition or error-mapping helper.
   5. Keep the dispatch-worker import type-only and outside the runtime dependency set; inspect emitted JavaScript to prove it is absent.
   6. Link workspace dependencies through their owning package manifests and project references.

4. Make telemetry session-owned.
   1. Construct the collector inline in `makeSession`'s existing Zustand initializer using its `set` and `get`; keep one stable collector per session.
   2. Implement collector operations as ordered array appends with no deduplication. Clearing replaces only that session's telemetry with `emptyTelemetryBatch()`.
   3. Install the session telemetry layer directly around current runtime executions for `stageCommand`, bootstrap, push queue/manual push, and actor query. Add no generic runner.
   4. Ensure named spans cover bootstrap, fetch actor, fetch frontend state, stage command, push staged commands, and actor query.
   5. Disable SWR bootstrap retry and remove the twenty-attempt fetchActor retry.
   6. Leave `acquireFrontendWebSocket`, SharedWorker orchestration, session database ownership, and generic transient retry utilities unchanged.

5. Add the Logs UI with exactly two new components.
   1. Register a direct `logs` child route and add a text tab beside Commands and Database without a new icon component.
   2. In `SessionsLogsRoute`, reactively read selected-session telemetry and use the approved explicit annotated loops to group spans, non-null-trace logs, and links by browser `priorTraceId`.
   3. Sort traces newest first by earliest local timing, with link-only traces last, and preserve a valid user selection as new telemetry arrives.
   4. Reuse `buildTraceTree`; render each span through recursive `SessionsLogsSpanNode` with ordered child spans and logs.
   5. Attach links under the matching browser span, display the complete link, and provide a copy action for the server trace ID.
   6. Put trace-associated records with missing spans under Unattached and null-trace logs under Unscoped.
   7. Clear only the selected session's telemetry.
   8. Do not add search, filters, retention caps, remote trace loading, or global logs.

6. Synchronize documentation.
   1. Update `FrontendApi.md`, `bootstrapBrowserSession.md`, and affected DeploySystem telemetry/retry statements through the architecture workflow.
   2. Update wiki index/glossary citations and pattern examples that reference removed frontend interfaces or moved paths.
   3. Refresh architecture source hashes and line citations and append the required `wiki/log.md` entry.

## Test and Verification Plan

1. Add focused FrontendApi and FrontendApiFailure boundary tests, logger proxy tests, frontend-package tests, session isolation tests, and DevTools Logs tests described by the approved design.
2. Add one uncached React integration seam covering a real session, concrete FrontendApi, successful and domain-failed traced leaves, persistence-backed links, session isolation, and navigation to the real Logs UI.
3. Preserve and update existing bootstrap, push/rebase, actor-query, logger DAG, SystemApi, SystemWorker, shopping, and API fixtures without weakening assertions.
4. Run affected `ts`, `lint`, `test`, and `lib` targets through Nx, the logger and system-worker workerd suites, the primary integration test uncached, and `git diff --check`.
5. Inspect `packages/frontend/dist` to confirm all four subpaths emit JavaScript and declarations, no barrel exists, and emitted JavaScript contains no dispatch-worker runtime import.

## Guardrails

1. No persisted-state migration is required because browser telemetry is session-memory state.
2. The only new named type is the approved `ILinkedRpcEnvelope`; method props and UI derivation shapes remain inline.
3. The only new abstractions are those explicitly approved by the design.
4. The approved Logs-route loops are the only newly introduced data-processing loops outside moved existing code.
5. Add no `ALLOWED_CAST`, compatibility overload, `as const`, retry, hidden fallback, partial implementation, or unrelated cleanup.
6. Preserve current dirty `.plans` and DevTools work and edit overlapping files microscopically.
