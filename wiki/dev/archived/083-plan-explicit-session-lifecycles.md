# Explicit session lifecycles implementation plan

**Date:** 2026-09-19
**Status:** Implemented and verified; archived 2026-09-19
**Source:** [083-spec-explicit-session-lifecycles.md](./083-spec-explicit-session-lifecycles.md)

## Outcome and constraints

1. Implement the complete public API from spec 083: `makeRuntime`, standalone
   `makeAggregateFrontend`/`makeServiceFrontend`, eager `makeBackup`, `makeSession`,
   `makeMockSession`, imperative `initialize`/`dispose`, `useInitializeSession`,
   `stageCommand`, keyed object-form `useLiveQuery`, and imperative `loadDevtools`.
   Consumers receive sessions directly and subscribe to their stores with Zustand.
2. Hard-cut over the old app/provider/registry API and session command method.
   No compatibility overloads, aliases, placeholder hooks, or deferred production
   wiring. Preserve server authentication, command provenance, backup formats,
   recovery, and transport behavior. Do not reset storage or modify vendor trees.
3. Keep the current runtime boundaries: core owns local session state and command
   semantics; frontend owns browser bootstrap/transport; backup-worker owns the
   connection protocol; React owns the hook adapter; DevTools retains its UI and
   store. Expose the agreed application-facing API through the React package's
   intentional barrel, without introducing runtime-module re-exports or a new
   package. Keep the imperative composition functions free of hook/context use.
4. Preserve unrelated work. `TODOS.md` was already modified when this plan was
   prepared; do not overwrite or include those edits as this work. Update only
   terminology actually affected by the implementation and retain surrounding WIP.
5. Use existing shared types and inline single-use shapes. The approved public
   functions are authorized by the spec; additional named types, helpers, or
   runtime-boundary moves still require the repository's explicit approval.

## Implementation sequence

### 1. Establish exact public type contracts before lifecycle rewiring

1. Migrate the existing frontend and compatibility type fixtures to the approved
   unbound factories. Preserve intrinsic validation: model selections, contract
   names, mutation/model compatibility, required aggregate authentication ID,
   exact versions, and authentication schema inference. Remove app arguments,
   generated Provider fields, frontend `layer`, and app/system phantom markers.
   Keep `guardLayer` on aggregate definitions.
2. Move cross-system selection checking to the two initialization entrypoints.
   A session captures its exact frontend and literal `systemName` at construction;
   both `session.initialize<typeof system>({ generateSignature })` and
   `useInitializeSession<typeof system>({ session, generateSignature })` must
   validate system name, owner/version, models/contracts, authentication, and
   signature together. Do not infer the system from a runtime backend import.
3. Prove the hook with only its explicit system generic using positive and
   negative fixtures for multiple owners, versions, and signature shapes. Test
   cross-paired session/signature arguments, not just each property independently.
   Do not replace the requested call shape with currying, widen away correlations,
   or add assertions to make it appear valid. If TypeScript cannot express this
   contract, report that precise blocker before implementing a different API.
4. Prove runtime/local-layer requirements at `makeSession`: the shared runtime
   supplies application services; the optional local layer supplies its own
   outputs and declares inputs satisfied by that runtime. Guards receive the
   appropriate combined services. Prove mocks and both frontend kinds infer
   their exact models, authentication, and consumer capabilities.
5. Keep the existing runtime type's service information rather than adding a
   system binding to it. Add the new API to package barrels only with meaningful
   implementations; type fixtures are a gate, not permission to ship stubs.

### 2. Separate synchronous core state from initialized resources

1. Refactor aggregate and service session construction so creating their stable
   session/store does not run a ManagedRuntime, build layers, open SQLite, or
   acquire backup. Uninitialized state must honestly represent unavailable IDs
   and database fields; do not invent placeholder execution IDs or cast an
   uninitialized state into an initialized shape. Allocate real execution identity
   during initialization using the existing ID services.
2. Keep one canonical session store across initialization, disposal, and
   reinitialization. Extend existing state/types and initialization procedures
   instead of mirroring a core store into a second wrapper store. Adapt existing
   low-level core callers to the same explicit resource-binding requirements.
3. Decouple the aggregate's initialized guard/runtime/delivery bindings from
   its synchronous constructor. Bind them before publishing readiness; clear
   them during disposal. Unbound staging fails explicitly rather than running
   no-op guards or silently taking a mock path.
4. Extract local command staging from `makeAggregateSession` into the canonical
   standalone `stageCommand({ session, contractName, payload })` in the core
   session subsystem. Preserve the synchronous encoded result, local transaction,
   guards, failure records, optimistic mutations, and complete encoded occurrence.
   Remove `executeCommand` from the session interface and implementations.
5. Preserve the real-session post-commit handoff to the existing bootstrap
   delivery capability. A fully initialized mock intentionally has no delivery
   capability. Service sessions do not satisfy the staging argument type. Remove
   `makeBrowserSession` if its remaining body only copies the core session surface;
   do not replace it with another forwarding wrapper.
6. Maintain the distinction between initialized data and current ownership.
   Recovery keeps its existing state transitions; staging still requires current
   ownership. On final disposal, mark the session unavailable and clear closed
   database/schema references so neither queries nor selectors can observe a
   released SQLite handle as ready.

### 3. Implement caller-owned runtime and eager backup

1. Extract `makeRuntime({ layer })` from the current app runtime setup, retaining
   NanoId, monotonic-ID, and Async defaults plus caller service inference. Return
   the ManagedRuntime with its normal caller-owned disposal API. No system type,
   session registry, or backup connection belongs to it.
2. Implement `makeBackup()` at the existing backup connection boundary. Start the
   existing scoped acquisition immediately, retain its readiness outcome, and
   expose caller-owned disposal. Sessions await that shared acquisition without
   inheriting ownership of its fiber or scope. Do not turn a cancelled session
   wait into cancellation of another session's connection.
3. Attach failure handling immediately so a failed eager acquisition cannot
   become an unhandled promise rejection before any session awaits it. Disposal
   must cancel pending work, await connection cleanup, and be safe to repeat.
   Reuse the existing reconnect/capability logic rather than another connection
   manager. A disposed backup is not silently recreated by session initialization.
4. Keep the connection alive with zero sessions. Sessions release only their
   capabilities; the application disposes backup after all borrowing sessions,
   then disposes runtime after session-local finalizers finish. No ref-counted
   auto-close or BackupProvider is introduced.

### 4. Implement real session initialization and React ownership

1. Implement `makeSession` as the imperative browser composition boundary.
   Refactor the existing aggregate/service acquisition Effects to initialize
   the already-created session rather than construct and return registry entries.
   Return readiness to the lifecycle owner while retaining ongoing scoped work.
2. Track one private initialization attempt, its resource scope, startup result,
   and cleanup-completion promise. Admit or reject ownership synchronously before
   returning the initialization promise. Concurrent active initialization rejects;
   an attempt admitted while previous cleanup is finishing waits for completion.
   This makes ownership observable to the hook without adding a public owner API.
3. Build the session-local layer once per initialization against the borrowed
   runtime context. Preserve existing guard semantics: the ordinary local layer
   is session-scoped, while dynamic `guardLayer({ db, authentication })` is still
   evaluated within guarded command execution. Do not turn dynamic guards into
   an initialization-time authentication snapshot or acquire the local layer twice.
4. Initialize guards and await backup readiness before invoking the existing
   aggregate/service bootstrap. Preserve telemetry, real delivery binding,
   DevTools registration, and session-ID renewal subscriptions. Publish readiness
   only after all required bindings are usable; retain existing offline bootstrap
   and recovery behavior.
5. Make disposal stop admission immediately, interrupt startup/ongoing work,
   prevent late publication, release all session resources, and await actual
   completion. Record completion separately from scope-closed state. Failed startup
   cleans up partial acquisition and leaves the object available for a later fresh
   initialization; stale finalizers cannot clear a successor's attempt.
6. Implement `useInitializeSession` with effect-owned startup/disposal and
   Zustand-backed reactive readiness. Depend on session identity, not signature
   callback identity; pass a ref-backed latest-signer callback into initialization.
   A synchronously rejected competing hook never acquires disposal responsibility.
   Cleanup for an accepted attempt starts disposal even if startup is still pending.
7. Surface active startup failures during render through the owning error boundary.
   Cancellation from that hook's cleanup does not become a late React error. Handle
   unmount, session prop replacement, abandoned render, and StrictMode replay with
   the same ownership/completion rules rather than separate replay exceptions.
8. Keep public Promise methods as thin execution boundaries over named Effects.
   Do not add `*Effect` names or shift any trust-boundary checks to another runtime.

### 5. Replace registry-based queries with session/key inputs

1. Change `useLiveQuery` to the single object argument from the spec and resolve
   its database directly from the session store. Subscribe to database/readiness
   changes so disposal and reinitialization cannot leave a hook attached to a
   closed or superseded database. Throw when no initialized database exists.
2. Remove the explicit-dependency contract from `useLiveQueryOnDb`. Treat session/
   database identity, key value, and effective watched tables as query-lifecycle
   inputs. Compare array/plain-record keys by value, including nested values;
   an equivalent new object must not rebuild the query. Do not key by callback
   reference or use a lossy string conversion that merges distinct keys.
3. Pass the key to `query(db, key)` with exact inference. Build a new query when
   its effective inputs change; keyless queries use `query(db)`. Use the latest
   callback when rebuilding. Inline callback identity alone neither rebuilds nor
   subscribes; changing captured values must be represented in the key.
4. Preserve synchronous initial results, per-query state, relevant committed-table
   invalidation, and existing post-setup error behavior. Listener installation stays
   in the committed React lifecycle and cleanup precedes replacement. Equivalent
   renders must not cause a resubscribe/update/render loop.
5. Retain explicit `tableNames` for queries whose watched tables cannot be inferred.
   Changing that effective list must update the subscription. Add no global query
   cache, automatic network work, SWR dependency, or readiness fallback.
6. Delete session lookup hooks/context and useInitializedStateOrThrow. Consumers
   use `useStore(session.store, selector)` and handle uninitialized selector values
   explicitly; parent rendering gates do not by themselves narrow TypeScript in
   another component. Do not reintroduce a renamed narrowing/lookup hook.

### 6. Implement both detached mock session kinds

1. Move fixture acquisition out of the mock React provider into
   `makeMockSession({ frontend, runtime, layer?, authentication, resources })`.
   Reuse the same lifecycle admission/disposal behavior as real sessions, with
   no signature or backup requirement. Support the same initialization hook.
2. Retain the aggregate mock's real in-memory schema, fixture validation,
   initialized authentication, local guards, command journal, and optimistic
   mutations. Add the service path using its existing schema and state-application
   procedures, without creating aggregate command capabilities for it.
3. Keep mock-only system/execution metadata local and synthetic; require no
   server system definition, API request, publishable credentials for transport,
   or fake backup capability. Real-session credential requirements remain checked
   at their own construction/initialization boundary.
4. Reinitialize from captured fixture inputs into a fresh disposable database.
   Test partial acquisition, cancellation, normal disposal, empty model fixtures,
   and repeated initialization. Mocks never register production DevTools entries
   or silently install push/recovery infrastructure.

### 7. Make DevTools loading imperative

1. Replace the loader component with `loadDevtools({ defaultOpen })`. Move its
   dynamic import, host element, React root, mount confirmation, and error cleanup
   into that imperative lifetime. Return `open()` and `dispose()` after mounting.
   Keep the existing UI component and separate-root router behavior.
2. Preserve one mounted page shell and deduplicate concurrent loading/opening
   through the existing controller. Failed loads clear pending ownership so a
   later explicit load can retry. Disposal unmounts/removes the shell and unregisters
   console/controller callbacks without clearing a later owner's registrations.
3. Remove errors and registrations requiring an app Provider. Keep real-session
   entries independent of UI loading: loading after sessions initialize still
   shows them; disposing the UI does not dispose sessions; renewed session IDs
   replace old entries. Preserve push pause/manual push and service inspection.

### 8. Complete the in-repository cutover and documentation

1. Migrate Shopping's browser-owned setup to explicit runtime, backup, sessions,
   and DevTools. Eager backup creation belongs in client startup, never component
   render. Mount both initialization hooks before the loading gate so independent
   sessions can start together. Keep existing explicit identity-remount behavior.
2. Pass/import concrete sessions in components. Replace command methods with
   `stageCommand`, query selectors/deps with session/key arguments, and initialized
   state hooks with Zustand selectors. Add Shopping's direct Zustand dependency
   as required by its now-direct import; do not depend on a transitive installation.
3. Give test/browser fixture owners explicit teardown: sessions first, then backup,
   then runtime. Integrate app hot-reload teardown with the same completion order.
   Avoid creating a new application/provider abstraction just to package cleanup.
4. Migrate every in-scope test caller, including core command tests, frontend
   programs, the system-worker frontend replica fixture, Shopping workerd command
   tests, and browser lifecycle fixtures. Do not mechanically rename unrelated
   backend execution APIs: only the session's command API is being renamed.
5. Remove the old app constructor, generated frontend providers, context registry,
   provider runtime types, mock provider, and obsolete exports/files after their
   callers are migrated. Relocate retained factory/acquisition modules out of the
   obsolete makeZerospinApp directory. Historical development documents remain
   historical; current source/docs must not describe the retired API as current.
6. Update browser bootstrap/recovery, backup coordination, push sequence, glossary,
   source README/pattern references, and affected navigation in the same pass.
   Explain explicit resource ownership, local staging, initialization gates, and
   keyed queries. Validate moved source links and preserve numbered diagram/step
   alignment. Do not rewrite unrelated architecture.

## Verification and completion

1. The main seam is public session/React behavior. Extend the existing lifecycle,
   mock, core-command, live-query, and DevTools suites; use deferred barriers rather
   than sleeps for startup, cancellation, predecessor cleanup, and StrictMode.
   Require the full happy, failure, and resumed/reinitialized paths before marking
   an implementation phase complete.
2. Explicit acceptance cases: two sessions share runtime/backup but acquire local
   layers independently; no construction-time session resource acquisition;
   overlapping ownership rejects without harming the winner; disposal joins prior
   cleanup; old readiness/DB handles cannot leak into reinitialization; signer
   refresh does not restart; mocks never contact server/backup; service staging
   fails typechecking; real staging retains its delivery handoff.
3. Query acceptance cases: uninitialized/disposed sessions throw; changed nested
   key values rerun; equivalent inline keys do not churn; key and callback parameter
   types match; query result inference remains exact; watched-table changes update
   listeners; switching session/database releases the previous subscription; live
   mutation commits update data without a callback-identity loop.
4. Compile-time fixtures must demonstrate both generic initialization entrypoints
   reject incompatible selections/signatures equally. Test layers that fulfill a
   guard requirement, omit it, require unavailable inputs, or satisfy it through
   the shared runtime. Do not count widened acceptance as successful inference.
5. Verification results (2026-09-19):

   ```sh
   nx run @zerospin/react:lib                          # pass
   nx run-many -t ts -p @zerospin/core,@zerospin/frontend,@zerospin/backup-worker,@zerospin/live-query,@zerospin/devtools,@zerospin/react,system-worker,shopping  # pass
   nx run-many -t lint -p @zerospin/core,@zerospin/frontend,@zerospin/backup-worker,@zerospin/live-query,@zerospin/devtools,@zerospin/react,system-worker,shopping  # pass (warnings only)
   nx run-many -t test -p @zerospin/core,@zerospin/frontend,@zerospin/backup-worker,@zerospin/live-query,@zerospin/devtools,@zerospin/react  # pass
   nx run system-worker:test                            # pass (212)
   nx run shopping:test --run                           # pass (5)
   nx run shopping:test:workerd                         # pass (4)
   nx run shopping:test:vitest:browser                  # pass (9)
   git diff --check                                     # pass
   ```

6. The Shopping browser target resolves to its existing Vitest/Playwright main
   configuration and must cover real connection acquisition, delivery, adverse
   backup recovery, and DevTools load/open/dispose. Use its existing fixture server
   lifecycle; if starting servers manually, wait for actual readiness output.
   Never treat a fixed delay or mocked tests as browser verification.
7. Search current source and docs for retired APIs, stale imports, provider error
   messages, and query deps. Inspect the final diff against spec 083, including
   exports and direct dependencies. Record actual commands/results and remaining
   blockers in this plan; do not claim checks passed based on old spec results.
8. Archive this plan only after the entire cutover is implemented and verified.
   No changes to application code, runtime behavior, or tests are performed by
   writing this plan itself.

### Notes from verification

1. `loadDevtoolsImportFailure` initially hung (~120s) on a throwing mock getter /
   unsettled load promise; fixed by export-access failure + settle-on-mount path.
2. Shopping `ProductList.spec` failed on `vi.hoisted` + `createStore` TDZ; replaced
   with a stable session identity stub.
3. Browser flow called `useLiveQuery` before readiness; gated behind
   `useInitializeSession` with a child query component.
4. No remaining blockers for archive.
