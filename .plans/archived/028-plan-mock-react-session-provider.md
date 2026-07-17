# 028 — Mock React Session Provider Implementation Plan

**Source spec:** `../archived/028-spec-mock-react-session-provider.md`

## Summary

1. Make `generateSignature` required session-owned runtime state and update every frontend/browser operation to read it from `ISession`.
2. Remove automatic and manual push machinery from core sessions; let the production React provider own the push queue and register one runnable manual-push capability with DevTools.
3. Add `makeMockProvider({ reactFrontend })` at `@zerospin/react/mock`, backed by real in-memory WASM SQLite and one-shot typed resource fixtures.
4. Support only local session access, live queries, initialized state, optimistic command staging, and existing frontend ID generation in mock mode.
5. Preserve `ZerospinConfig`, production provider props, frontend signature schemas, binding-level authentication, and all unrelated WIP.

## Implementation

1. Move signature generation onto the core session.
   1. Add required `generateSignature: ISignatureFactory` directly to the existing `makeSession` props and `ISession` shape; do not introduce a second options type or authentication object.
   2. Store the exact supplied factory on each session and preserve its identity; do not wrap, memoize, cache, or invoke it during session construction.
   3. Remove `generateSignature` from `IReactSessionContext`, leaving the existing browser session as the context value's only runtime capability owner.
   4. Keep `<Frontend>.Provider generateSignature={...}>` unchanged and pass that factory into `makeSession` at the existing session construction site.
   5. Update every direct `makeSession` caller in core, frontend, React, DevTools fixtures, examples, and tests with its existing signature factory or an explicit local `Effect.succeed(...)` test factory.
   6. Do not move the factory to `ZerospinConfig`, `IBrowserUserController`, `IFrontendController`, or an Effect service replacement.
   7. Keep `frontendController.signature` as the authored schema and keep `frontendBinding.authenticate` in its current frontend-binding location.

2. Make frontend transport programs consume the session-owned signature factory.
   1. Change `fetchActor`, `fetchFrontendState`, `executeActorQuery`, and `pushStagedCommands` to invoke `yield* session.generateSignature()` at the same point where each operation currently obtains or invokes its separate factory.
   2. Remove their explicit `generateSignature` parameters and remove `SignatureFactory` from the environment requirements of the fetch programs.
   3. Keep the no-staged-command fast path in `pushStagedCommands` before signature generation so an empty push remains network- and signature-free.
   4. Update `bootstrapBrowserSession` to receive only the session and browser user controller, call the revised frontend programs, and stop providing a `SignatureFactory` service layer.
   5. Update `acquireFrontendWebSocket` to generate its signature from the supplied session rather than a separate prop.
   6. Update `useApi` and `usePushQueue` to call the revised programs with `{ session }` and remove their separate signature plumbing.
   7. Delete the obsolete `SignatureFactory` Effect service module only after a repository search proves it has no remaining production or test consumer; add no deprecated re-export or compatibility service.
   8. Preserve the existing signature payload, RPC tuple, error mapping, linked telemetry envelopes, and request timing.

3. Remove push machinery from core `ISession`.
   1. Delete `pushQueue` and `pushStagedCommands` from `ISession`, `makeSession`, and every core-session fixture.
   2. Remove Effect `Queue` creation, runtime queue setup, wake offering, shutdown exposure, and the placeholder empty manual-push result from `makeSession`.
   3. End the named core `stageCommand` Effect immediately after its successful SQLite transaction and return the same staged command.
   4. Preserve staging validation, command encoding, optimistic mutation application, telemetry, database errors, and encoded RPC result exactly.
   5. Update core session tests to stage multiple commands without inspecting or draining a push queue.
   6. Do not replace the removed queue with a core event emitter, subscription registry, store flag, callback list, or persisted wake state.

4. Put staging notification and the automatic queue at the browser provider boundary.
   1. Add the approved optional `onCommandStaged: () => void` input directly to `makeBrowserSession`; add no named callback type.
   2. In the browser-facing `stageCommand`, await the core encoded result, invoke `onCommandStaged` only when the result has `_tag === 'Right'`, and return the exact encoded result unchanged.
   3. Do not signal on an encoded staging failure, thrown Promise failure, provider teardown, or any database mutation that did not originate through browser `stageCommand`.
   4. Create one capacity-one dropping Effect queue per production provider mount in `makeProvider` using the existing `sessionRuntime`; keep the raw queue handle local to the provider.
   5. Pass an inline `onCommandStaged` callback to `makeBrowserSession` that forks one `Queue.offer` through `sessionRuntime`, matching the current non-blocking wake behavior without adding a wrapper function.
   6. Pass the raw provider-owned queue explicitly into `usePushQueue`; update automatic consumption and browser online-resume wakes to use that queue.
   7. Interrupt the existing consumer fiber on teardown and shut down the provider-owned queue after the consumer is released so no take or offer fiber survives the mount.
   8. Preserve `isPushPaused`, browser online/offline gating, dropping wake coalescing, initialization gating, and automatic push telemetry.

5. Return the manual push capability from `usePushQueue` instead of mutating the session.
   1. Keep the existing named `pushStagedCommands` Effect as the implementation unit and keep the manual React callback as the Promise runtime boundary.
   2. Build one stable manual callback inside `usePushQueue` that checks initialized state, runs `pushStagedCommands({ session: session.coreSession })`, creates the `devtools.pushStagedCommands` span, and records the existing `lastDevtoolsPush` success/error pointer.
   3. Return that callback directly from `usePushQueue`; do not install or remove a method on either the core or browser session.
   4. Keep automatic queue drains separate from manual trace-pointer updates and preserve the exact decoded push result or rejection for the manual caller.
   5. Keep manual push callable while automatic pushing is paused, matching the current DevTools contract.
   6. Add no general command runner, exposed session runtime, push service, or transport interface.

6. Register a narrow DevTools session entry.
   1. Add the explicitly approved `IDevtoolsSessionEntry` with `session: ISession` and `pushStagedCommands: () => Promise<Readonly<{ pendingCommands: readonly IEncodedCommand<IPushedCommand>[]; pushedCommands: readonly IEncodedCommand<IPushedCommand>[]; failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[] }>>`; do not add a second named push-result type.
   2. Change `zerospinDevtoolsStore.sessionsById` and `addSession` to store that entry by `entry.session.sessionId`; retain current duplicate-id and immutable-map behavior.
   3. In the production React provider, call `usePushQueue` before DevTools registration and register `{ session: coreSession, pushStagedCommands }`.
   4. Keep the existing DevTools `useSession` and `useSessionOrThrow` return values as `ISession` by unwrapping `entry.session`, so database, command, and log consumers do not learn about the entry shape.
   5. Update `SessionsLayout` to derive its displayed session array from each entry's `session`.
   6. In `SessionToolbar`, select the current entry directly from the existing route id and store, then invoke `entry.pushStagedCommands`; do not add a one-consumer lookup hook or helper.
   7. Preserve pause controls, staged-row live query, disabled/in-flight button behavior, swallowed UI rejection, manual trace status, and trace link.
   8. Update DevTools tests and fixtures to register explicit entries with local push callbacks. Do not fabricate a push method on `ISession`.

7. Add the frontend-bound mock provider without touching production configuration.
   1. Define and export `makeMockProvider` directly from `packages/react/src/mock.ts`; rely on the existing wildcard package export for `@zerospin/react/mock` and add no barrel or re-export.
   2. Declare `makeMockProvider<FRONTEND extends IFrontendController>` with the `frontend`, `ReactContext`, and `sessionRuntime` fields from `IReactFrontend<FRONTEND>` so the normal `makeReactFrontend` return is accepted, and return a normal React component, not a provider ref, registry, controller class, or mutation of the supplied React frontend.
   3. Inline the returned component's props so they require `children`, `userId`, `accountId`, `actorId`, `generationId`, `systemVersion`, and `systemWorkerName`, plus optional typed `resources`.
   4. Type `resources` inline as `Partial<{ [K in keyof InferFrontendModels<FRONTEND>]: readonly InferResource<InferFrontendModels<FRONTEND>[K]>[] }>`; add no exported fixture type alias.
   5. Capture all initialization props once for the mount. Ignore later prop identity changes and document through tests that a new React `key` is the reset boundary.
   6. Create the session id through `reactFrontend.sessionRuntime`, call `makeSession` with the supplied frontend/runtime and a signature factory that fails with `mock-session-remote-api-unsupported`, and set SharedWorker support to false.
   7. Reuse `makeBrowserUserController(userId, false)` and `makeBrowserSession({ session: coreSession })` only to preserve the existing `IBrowserSession` returned by `useSession`; do not mount `ZerospinConfig` or its context.
   8. Omit `onCommandStaged`, `usePushQueue`, production bootstrap, websocket acquisition, SharedWorker initialization, DevTools registration, provider refs, and production duplicate-provider guards.

8. Initialize and release the real mock database in one mount lifecycle.
   1. Use `useSWRImmutable` with the stable browser session as its key and `shouldRetryOnError: false`, matching the existing one-shot provider lifecycle without using production bootstrap or its error mapping.
   2. Derive frontend database models with `getFrontendDbModels`, combine them with `sessionRepoTables` through `makeResourceDbConfig`, and call `makeInMemoryWasmSqliteDb` once; let the following `applyFrontendState` call perform the single migration rather than calling the already-migrated factory and migrating twice.
   3. Flatten the optional partial resource map into `IEncodedResourceShape[]` using the one approved explicit loop over `Object.values(resources ?? {})`; treat missing row arrays as empty and add no fixture defaults or row factories.
   4. Reuse `applyFrontendState` with the flattened resources and empty pushed, executed, and failed command arrays so migration and production resource insertion remain one implementation.
   5. Publish the core session store once with the required ids, controller-derived account/actor/frontend names, supplied deployment metadata, `frontendIndex: null`, `lastRebasedPushedCursor: null`, `vfsName: null`, the real db/schema/models, and `isInitialized: true`.
   6. Render `null` until publication succeeds, then provide `{ session: browserSession }` through the supplied React frontend's existing `ReactContext` and render children.
   7. Surface initialization, schema, and fixture errors to the nearest React error boundary without retry or production deployment-error rewriting.
   8. If initialization fails after the database opens, close it before surfacing the error.
   9. Track the returned close operation with the same unmounted/release-ref pattern used by the production provider. On normal unmount, schedule the one SQLite close in `queueMicrotask` so child live-query effects finish their same-pass cleanup first.
   10. If async initialization resolves after unmount, close the resulting database immediately and never publish children.
   11. Do not reseed on rerender and do not expose an imperative reset, update, block-delivery, or database-mocking API.

9. Add focused mock-provider and ownership-migration coverage.
   1. Add a React integration spec beside `mock.ts` using an existing concrete frontend fixture and the returned mock provider without `ZerospinConfig` or the production provider.
   2. Prove children remain absent during initialization and receive `useSession` and `useInitializedStateOrThrow` only after the real database is published.
   3. Seed at least two model tables, read their relation-aware rows through `useLiveQuery`, and prove omitted models and an omitted `resources` prop produce empty tables.
   4. Stage a real command through the browser session, then prove optimistic resource changes, staged lifecycle rows, and live-query invalidation without any queue, RPC, or push result.
   5. Rerender with different resource prop identities and prove the database is not reseeded; remount under a new key and prove a fresh database receives the new fixtures.
   6. Invoke an actor API path and prove `mock-session-remote-api-unsupported` occurs before any RPC construction.
   7. Spy on the SQLite close boundary and prove successful unmount, failed initialization, and late initialization each close exactly once.
   8. Add `mock.typecheck.ts` coverage for valid partial model maps, omitted resources, unknown model keys, wrong-model rows, and missing required identity/runtime props.
   9. Update core, frontend, React, and DevTools focused tests for the required session signature, removed core push members, successful-only browser staging wake, provider queue consumption, returned manual push callback, and DevTools entry invocation.
   10. Preserve existing production bootstrap, online/offline, manual trace, live-query, and frontend-program assertions rather than weakening them to accommodate the migration.

10. Synchronize architecture documentation and remove stale ownership descriptions.
   1. Use the repository `update-architecture` workflow to update `wiki/architecture/bootstrapBrowserSession.md` after the source changes.
   2. Document session-owned signature generation, provider-owned automatic push queue, browser-session successful-staging notification, DevTools capability registration, and the mock provider's local-only database lifecycle.
   3. Update the architecture flow, trigger, annotated steps, callers, source paths, line ranges, source hashes, and wiki log entry according to the repository wiki rules.
   4. Search wiki, patterns, comments, and tests for claims that core `makeSession` owns `pushQueue`, exposes `pushStagedCommands`, or receives signature generation separately from the session; update only directly stale references.
   5. Do not add a new LLM-wiki pattern unless implementation reveals a reusable rule beyond this approved design.

## Testing and Verification

1. Run focused typecheck and unit tests through Nx after each ownership layer is coherent.

   ```text
   nx run @zerospin/core:ts
   nx run @zerospin/core:test
   nx run @zerospin/frontend:ts
   nx run @zerospin/frontend:test
   nx run @zerospin/react:ts
   nx run @zerospin/react:test
   nx run @zerospin/devtools:ts
   nx run @zerospin/devtools:test
   ```

2. Run lint for all four changed packages through Nx.

   ```text
   nx run-many -t lint -p @zerospin/core @zerospin/frontend @zerospin/react @zerospin/devtools
   ```

3. Run the package library builds so public declaration output proves `@zerospin/react/mock`, session types, and DevTools entry types are publishable.

   ```text
   nx run-many -t lib -p @zerospin/core @zerospin/frontend @zerospin/react @zerospin/devtools
   ```

4. Run affected checks after the focused targets pass and classify unrelated active-plan or WIP failures separately.

   ```text
   nx affected -t ts,test,lint
   ```

5. Verify stale production ownership is gone and the intended authored authentication ownership remains.

   ```text
   rg -n "pushQueue|pushStagedCommands" packages/core/src/session
   rg -n "generateSignature" packages/frontend/src packages/react/src packages/core/src/session
   rg -n "signature:|authenticate:" packages/core/src/frontendController packages/core/src/frontendBinding examples/*/src/zerospin
   ```

6. Run architecture freshness after updating the affected page.

   ```text
   .llmwiki/freshness.sh --stale-only
   ```

7. Audit the final diff.

   ```text
   git diff --check
   git status --short
   ```

8. Confirm the diff contains no new `ALLOWED_CAST`, unapproved `as const`, compatibility signature path, mock transport, RPC fake, barrel export, dependency, fixture builder, or unrelated cleanup.
9. Keep this plan active until the mock provider behavior, signature migration, queue migration, DevTools manual push, focused checks, affected checks, and architecture freshness are all implemented and verified.

## Guardrails

1. Preserve all unrelated WIP and active plan files; do not normalize or refactor adjacent session, frontend, React, or DevTools code.
2. Do not add an `ALLOWED_CAST` marker. Stop for explicit user permission if an unavoidable assertion would require one.
3. Do not add `as const` unless TypeScript demonstrably requires it and the user explicitly approves it.
4. The only approved new named type is `IDevtoolsSessionEntry`; inline the mock-provider props, fixture map, callback, and push result using existing types.
5. The only approved new abstractions are `makeMockProvider` and the optional `onCommandStaged` callback. Add no helper, wrapper, utility, service, registry, transport, fixture builder, barrel, or one-consumer shape file.
6. Use only the approved explicit fixture-seeding loop. Do not add iteration abstractions for session migration, queue ownership, DevTools registration, or call-site updates.
7. Keep `pushStagedCommands` as the named Effect and keep Promise execution at React/DevTools runtime boundaries.
8. Keep full staged, pushed, executed, and failed command objects intact; do not narrow or rebuild command payloads during the ownership migration.
9. Preserve production `ZerospinConfig`, `<Frontend>.Provider` props, `frontendController.signature`, and frontend-binding `authenticate` exactly.
10. Add no mock pushing, actor API response, websocket event, frontend block, SharedWorker, DevTools session, reactive reseed, reset API, provider ref, duplicate-provider policy, retry, or deployment-error mapping.
11. Ship the signature, queue, manual-push, DevTools, mock-provider, error, cleanup, typing, test, and documentation behavior in one complete pass; do not leave compatibility members or follow-up stubs.
12. Do not archive this plan until every required behavior and verification target is green.
