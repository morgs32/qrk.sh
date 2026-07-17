# Frontend session logs design

**Date:** 2026-07-12
**Status:** Approved for planning

## Problem Statement

Frontend operations currently cross the `ZerospinApis` and `FrontendApi` RPC boundaries without preserving a usable relationship between browser telemetry and the server telemetry persisted by the SystemWorker. Browser session state has no per-session telemetry collection, and Zerospin DevTools has no Logs view for inspecting browser traces, browser logs, or links to the corresponding server root spans.

The existing `IFrontendApi` abstraction also obscures the concrete Cap'n Web target returned by `getFrontendApi`, while frontend RPC programs are split between core and React despite being non-React browser transport behavior. Existing frontend authentication and leaf retries further blur which boundary owns authentication, telemetry, transport failure, and retry policy.

## Solution

Keep `ZerospinApis.getFrontendApi(auth)` as the untraced capability-construction boundary. It strictly validates and authenticates once, returning either a concrete short-lived `FrontendApi` containing complete auth results or a concrete `FrontendApiFailure`. Authentication and capability-construction outcomes do not produce telemetry.

Each successful `FrontendApi` leaf call creates an independent server trace. A file-local `makeApiHandler` validates the complete positional argument tuple, resolves a fresh raw SystemWorker stub, provides the bound auth results and SystemWorker as Effect services, runs the named leaf handler under a fresh root telemetry layer, persists the completed server telemetry batch through the same raw SystemWorker, disposes the stub, and returns the encoded domain result plus a complete span-link record only when telemetry persistence succeeds.

Browser programs move into a non-React `@zerospin/frontend` package and call the returned concrete target through a logger-owned `makeTraceableApiTarget`. The proxy supplies the current browser span context, unwraps the frontend RPC envelope, and appends the returned cross-store link to the current session telemetry collector. Each session owns its browser telemetry batch and collector. DevTools reads that session state and renders a Logs tab containing local browser trace trees, logs, and links to server trace identifiers.

## User Stories

1. As a frontend developer, I want each browser operation recorded in its owning session, so that simultaneous sessions never mix telemetry.
2. As a frontend developer, I want a successful frontend RPC leaf to link its browser span to the persisted server root span, so that I can continue investigation using the server trace identifier.
3. As a frontend developer, I want server telemetry persisted before a link is exposed, so that every visible server link refers to telemetry the server accepted for storage.
4. As a frontend developer, I want frontend RPC failures represented as domain errors without losing their browser span or server link, so that failed requests remain diagnosable.
5. As a frontend developer, I want transport failures represented distinctly as `Error`, so that broken RPC transport is not mistaken for a decoded domain failure.
6. As a DevTools user, I want a Logs tab next to Commands and Database, so that telemetry is part of the selected session workflow.
7. As a DevTools user, I want traces listed newest first with a stable selection, so that live telemetry does not interrupt the trace I am inspecting.
8. As a DevTools user, I want nested spans and logs rendered in execution order, so that I can understand the local browser operation hierarchy.
9. As a DevTools user, I want unmatched records and unscoped logs kept visible, so that incomplete telemetry is diagnosed rather than silently discarded.
10. As a DevTools user, I want to clear only the selected session's logs, so that other active sessions retain their diagnostic history.

## Implementation Decisions

### Frontend capability and authentication

1. Preserve `ZerospinApis.getFrontendApi(auth)` and the existing root RPC route; do not add a `/frontend` HTTP route.
2. Implement authentication as one named `Effect.fn` called `FrontendApi.auth`. It strictly validates the authentication tuple, resolves identity, authenticates, authorizes, and returns the complete auth results.
3. Use the canonical term `auth results` and the identifier `authResults`; remove `auth success` terminology in the changed frontend API surface.
4. Auth results contain actor, account name, actor name, frontend name, system ID, SystemWorker name, and system-environment ID.
5. A successful factory call constructs `FrontendApi` with auth results and its existing runtime. The target does not retain a SystemWorker stub.
6. An authentication or capability-construction failure returns `FrontendApiFailure`. Its leaf methods return the encoded factory error with a null link. Cap'n Web transport rejection remains a transport error.
7. Authentication and capability construction are deliberately untraced. They do not persist server telemetry and do not create a browser-to-server link.
8. Remove `IFrontendApi`. Type `getFrontendApi` with the concrete `FrontendApi | FrontendApiFailure` return, and use the concrete classes throughout clients and API wiring.
9. Keep `IPublicApis` only for the deferred SystemApi contract. Do not migrate SystemApi in this change.
10. Give `FrontendApi` explicit raw public method signatures. Make `FrontendApiFailure` structurally match those public methods through the concrete class's existing parameter and return types, without introducing a replacement shared interface.

### Frontend leaf handler boundary

1. Add a file-local `makeApiHandler` in the FrontendApi module. It is policy owned by that boundary and is not exported.
2. Each handler definition supplies a name, a schema for the complete positional parameter tuple, and a named `Effect.fn` handler.
3. Validate `request.args` directly with strict excess-property rejection. Use an empty tuple schema for zero-argument methods and a one-element tuple containing the props schema for one-argument methods. Reject extra positional arguments and excess object fields.
4. Define file-local Effect services named `FrontendAuthResults` and `SystemWorkerApi`. Do not export them.
5. `FrontendAuthResults` exposes the auth results stored by the concrete FrontendApi instance.
6. `SystemWorkerApi` exposes the raw Cloudflare RPC stub typed as `SystemWorker`. It is not an Effect-valued adapter and does not wrap individual methods.
7. A public FrontendApi method provides `this.#authResults` as `FrontendAuthResults` and runs its configured API handler. Do not pass `this` into the configured `Effect.fn`.
8. For every leaf call, `makeApiHandler` resolves a fresh `SystemWorker & Disposable`, provides it as `SystemWorkerApi`, and retains ownership of telemetry persistence and disposal.
9. Leaf handlers yield `FrontendAuthResults` and `SystemWorkerApi`, then call raw SystemWorker methods with the existing `makeAsync(() => systemWorker.method(...)).pipe(Effect.flatMap(decodeRpc))` boundary pattern.
10. Run each leaf under a fresh telemetry collector and layer with a new server root span. The root span has no remote parent; the returned link records the relationship to the browser span instead.
11. Finish and flush the server root before reading the collector. Persist the complete batch outside the telemetry layer through the same raw SystemWorker so telemetry persistence does not trace itself.
12. Dispose the raw SystemWorker after the leaf and persistence attempt on every success and failure path.
13. Return an `ILinkedRpcEnvelope<A, E>` containing `Schema.EitherEncoded<A, E>` and `ISpanLinkRecord | null`.
14. A domain failure is encoded as the envelope result and still receives a server link when its telemetry batch persists successfully.
15. A telemetry-persistence failure does not replace or alter the leaf's domain result. It produces a null link because no persisted server trace may be advertised.
16. Keep `IRpcEnvelope` as the internal full-telemetry propagation contract used by existing repo RPC instrumentation.
17. Add no retry to authentication, `makeApiHandler`, SystemWorker acquisition, server telemetry persistence, or any FrontendApi leaf. Remove the existing frontend authentication and leaf retry schedules.

### Logger API-target tracing

1. Add and export `ILinkedRpcEnvelope` and `makeTraceableApiTarget` from `@zerospin/logger`. These are the only new logger abstractions in this design.
2. `makeTraceableApiTarget` wraps only the concrete target returned by `getFrontendApi`; it does not wrap `ZerospinApis` and does not recursively transform returned RPC targets.
3. Each wrapped method returns `Effect<A, E | Error, TelemetryCollector>`, supplies the current browser span context to the raw API method, decodes the linked envelope, and appends a non-null complete `ISpanLinkRecord` to the active collector.
4. Normalize promise rejection and an invalid envelope to `Error`. Preserve the decoded API error as `E`.
5. Keep `makeTraceableRpcTarget` for existing `IRpcEnvelope` boundaries, but correct its declared error channel to include transport and envelope-validation `Error` where required by its actual behavior.
6. Keep logger generic over the domain error. The frontend programs convert their decoded `IAnyErrorJson` or transport `Error` into the existing `IAnyError` boundary expected by their callers.
7. Do not store the browser-to-server boundary link in LogRepo. LogRepo stores the server telemetry batch; only the browser session collector stores the cross-store link.

### Frontend package and browser programs

1. Add a manually scaffolded, buildable ESM TypeScript package named `@zerospin/frontend`. Do not use the generic Nx JavaScript library generator because its generated CommonJS, Prettier, barrel, and placeholder structure does not match this workspace.
2. Give the package explicit subpath exports and no `index.ts` barrel.
3. Move `fetchActor` and `fetchFrontendState` from core, move `pushStagedCommands` from React, and extract the existing actor-query RPC body into one named `executeActorQuery` Effect used by the React hook.
4. Keep session state, reconciliation, tables, and generic `newSyncRpcSession` in core. Keep providers, hooks, bootstrap orchestration, browser-user orchestration, SharedWorker orchestration, and DevTools integration in React.
5. Use `newSyncRpcSession<ZerospinApis>` directly in the frontend package. Verify emitted JavaScript and declarations do not expose dispatch-worker as a runtime dependency when it is used only for the concrete client type.
6. Preserve `acquireFrontendWebSocket` in React unchanged. Do not move or add WebSocket-specific tracing in this design.
7. Remove the twenty-attempt `fetchActor` retry and the provider/SWR bootstrap retry. Push, actor query, and telemetry persistence remain retry-free.
8. Leave the general transient Durable Object retry utility available for unrelated callers; remove it only from the frontend authentication and leaf paths covered here.

### Per-session telemetry persistence

1. Add `telemetry: ITelemetryBatch` and `telemetryCollector: ITelemetryCollector` to both session-state variants.
2. Construct the collector inline in the existing session initializer using the session store's `set` and `get`. Do not add a separate log-store type, helper, runtime, or Zustand store.
3. Append browser spans, browser logs, and API boundary links without deduplication.
4. Retain telemetry until the selected session is cleared or the session is destroyed. Do not add a record cap in this version.
5. Clearing replaces the selected session's current telemetry batch with an empty batch. Records completed after the clear, including already in-flight work, may append normally.
6. Install the existing telemetry layer explicitly at current session-owned Effect execution sites. Preserve the existing runtime ownership and do not add a generic `runSessionEffect` wrapper.
7. Ensure named browser Effects create the local spans for bootstrap, fetch actor, fetch frontend state, stage command, push staged commands, and actor query.
8. Keep all server spans and logs in LogRepo. The session stores only browser telemetry plus complete boundary links to server roots.

### DevTools Logs tab

1. Add a direct `logs` child route under the selected Session pane and a Logs tab next to Commands and Database.
2. Add exactly two Logs-specific components: `SessionsLogsRoute` and recursive `SessionsLogsSpanNode`. Do not add generic UI helpers, copy components, icon components, or named UI-only types.
3. Render a two-column view with a trace list and selected-trace detail.
4. Build the browser trace set from local spans, non-null-trace local logs, and each boundary link's prior trace ID. Reuse the existing `buildTraceTree` behavior for local span hierarchy.
5. Sort traces newest first. Select the newest trace initially, but do not change the user's selection when newer traces arrive.
6. Sort local roots and child spans by start time and logs by creation time. A link-only trace sorts after traces with local timing until matching local telemetry arrives.
7. Attach a server boundary link beneath its matching local browser span using the link's prior span identity. Show the complete link and provide a copyable server trace ID. Do not fabricate or fetch a remote server span tree.
8. Place trace-associated logs whose span is missing and boundary links whose browser span is missing in an Unattached section.
9. Place logs with a null trace ID in an Unscoped bucket.
10. Update the view reactively as the selected session collector appends telemetry.
11. Clear only the selected session's telemetry and retain the session and every other session unchanged.
12. Do not add search, filtering, server-trace retrieval, or a global telemetry view in this version.

## Testing Decisions

1. Use one end-to-end frontend integration seam as the primary proof: create a browser session, acquire a concrete FrontendApi, execute a traced leaf call, persist server telemetry, collect the returned boundary link in that session, and render the linked browser trace in the DevTools Logs route.
2. At the primary seam, prove successful and domain-failed leaf results, server telemetry persistence, link creation only after persistence, stable session ownership, and a visible copyable server trace ID.
3. Add focused logger tests for `makeTraceableApiTarget`: current-span propagation, success and encoded-domain-error decoding, link collection, null-link behavior, transport rejection normalization, invalid-envelope normalization, and an `E | Error` error channel.
4. Extend the existing `makeTraceableRpcTarget` tests to prove that its public error channel matches its transport and invalid-envelope runtime behavior without changing full-telemetry collection semantics.
5. Add focused FrontendApi boundary tests for strict zero- and one-argument tuple validation, excess positional arguments, excess props, fresh SystemWorker resolution per leaf, service availability, success encoding, domain-error encoding, root completion before persistence, persistence failure producing a null link without replacing the result, and disposal on every path.
6. Prove `FrontendApiFailure` returns its encoded factory error and a null link for every concrete leaf method without resolving a SystemWorker or persisting telemetry.
7. Add session-store tests proving isolation between two sessions, ordered append without deduplication, selected-session clear, post-clear append from later completion, and retention until teardown.
8. Add frontend-program tests proving concrete `ZerospinApis` session typing, API-target wrapping, conversion of decoded and transport failures to the existing caller error contract, and the absence of frontend retries.
9. Add DevTools tests for newest-first trace ordering, stable selection during live updates, nested spans and logs, boundary-link attachment, Unattached records, Unscoped logs, link-only trace ordering, copyable server trace ID, and selected-session-only clear.
10. Preserve existing bootstrap, push/rebase, actor-query, logger DAG, SystemApi, and SystemWorker behavior tests. Update imports and concrete target fixtures without weakening their domain assertions.
11. Verify the new frontend package through its Nx TypeScript, test, lint, and build targets; verify logger, core, React, dispatch-worker, and DevTools through their affected Nx targets; run the primary integration test uncached; and finish with `git diff --check`.
12. Inspect the built frontend package artifacts to confirm explicit subpaths resolve, no barrel was generated, and dispatch-worker code is not included as a browser runtime dependency solely for client typing.

## Out of Scope

1. SystemApi migration to the linked frontend envelope or `makeApiHandler` model.
2. Replacing the root `ZerospinApis` target with pathname-based HTTP dispatch.
3. A general RPC-session abstraction refactor.
4. Recursive proxying of arbitrary RPC targets returned from other RPC methods.
5. WebSocket package movement, callback tracing, or lifecycle telemetry changes.
6. Authentication or capability-factory telemetry.
7. Automatic retries anywhere in the frontend authentication, bootstrap, leaf RPC, push, query, or telemetry-persistence flow.
8. Loading server traces into DevTools, merging server spans into the browser tree, or adding a global cross-session Logs view.
9. Search, filters, retention limits, deduplication, persistence across page reloads, or telemetry export from the browser session.
10. Changes to LogRepo's server telemetry storage model beyond accepting the already-defined telemetry batch persistence call.

## Further Notes

1. `root: true` intentionally starts a new server trace rather than parenting the server root beneath the browser span. `ISpanLinkRecord` is the complete cross-store relationship and preserves both sides without pretending the traces share one store or one parent tree.
2. A null link means server telemetry persistence did not establish a navigable server trace. It does not mean the domain operation failed.
3. The implementation plan must preserve user work already present in the DevTools route files and update affected architecture documentation in the same pass as source movement and terminology changes.
4. Retry placement remains an explicit future decision. This design removes existing frontend retries and does not introduce a replacement policy.
