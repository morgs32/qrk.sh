# Plan 072 — Shared IndexedDB backups and frontend handoff

**Date:** 2026-09-07
**Status:** Implementation in place; four prerequisite bindings repaired; integration verification blocked by inherited React typing/mock issues
**Source:** [Spec 072](../archived/072-spec-shared-indexeddb-backups-and-frontend-handoff.md)

## Required outcome

1. Keep synchronous live SQLite replicas and authored execution on the main
   thread. Put asynchronous backup SQLite and `IDBBatchAtomicVFS` directly in
   one SharedWorker shared by participating app builds on the same origin.
2. Retain one logical database per exact `backupKey`, generated with Remix
   `RoutePattern` and the complete SHA-256 frontend-lock key. Execution
   `sessionId` and app bundle identity do not select the backup database.
3. Return one revocable database RpcTarget per ownership period. Its mutations
   are `overwriteDb({ snapshot })` and `applyStatements({ statements })`.
   Delete numeric `backupClientId` and router-to-dedicated-leader forwarding.
4. Visibility, focus, and visible page restoration request ownership. A real
   handoff revokes the old target and restores committed backup state without
   waiting for the old page or the server. Repeated signals from the current
   owner preserve its live database, pending queue, and execution session ID.
5. Pause superseded frontends in place. A subsequent acquisition restores the
   shared backup and renews the execution session ID without remounting the app.
   Preserve original command occurrence bytes and server reconciliation.
6. Keep the asynchronous in-memory backup queue. Losing undelivered local
   changes is accepted; replaying uncertain SQL or accepting stale-owner writes
   is not. Backup acknowledgements use full/strict persistence initially.
7. Never migrate backups or upgrade an existing IndexedDB storage layout.
   Initialize empty storage, reuse compatible backups, and rebuild incompatible
   disposable state. Ship no OPFS fallback or compatibility aliases.

## Source map and intended ownership

| Area                        | Before cutover                                                                              | Planned change                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Backup package              | `packages/opfs-backup-worker/`                                                              | Rename to `packages/backup-worker/` / `@zerospin/backup-worker`; own storage, capabilities, page acquisition, and emitted assets. |
| Worker setup                | `opfsBackupWorker.entry.ts`, `opfsBackupLeader.entry.ts`                                    | Replace with one `backupWorker.entry.ts`; remove dedicated-worker setup and leader election.                                      |
| RPC methods                 | `OpfsBackupRouter/`, `OpfsBackupLeader/`                                                    | Replace with `BackupWorkerApi/` for readiness/acquisition and `BackupDbApi/` for database-bound operations.                       |
| Page connection             | `acquireOpfsBackupWorker/`                                                                  | Replace with `acquireBackupWorker/`, using the stable worker identity and scoped reconnection.                                    |
| Keys and frontend lifecycle | `packages/frontend/src/make*FrontendBackupKey.ts`, `bootstrap*FrontendSession.ts`           | Generate readable keys; own acquisition, restoration, revocation, repair, and per-period network scopes.                          |
| Execution identity          | `packages/core/src/session/makeAggregateSession.ts`, `serviceSession/makeServiceSession.ts` | Read current execution identity from existing session state instead of permanently captured initial IDs.                          |
| React integration           | `makeZerospinApp.tsx`, `makeBrowserSession.ts`, session registry/types                      | Keep mounted session/store identity while ownership and execution identity change.                                                |
| DevTools registration       | React Provider wiring and `packages/devtools/src/zerospinDevtoolsStore.ts`                  | Keep registrations and cleanup consistent with the current execution session ID.                                                  |
| Host assets                 | Shopping Vite, PWA, Cloudflare asset configuration, and browser-test configuration          | Serve the same worker entrypoint in dev, built preview, and deployed assets; retain offline availability.                         |
| Acceptance                  | Shopping main-thread browser suites                                | Replace OPFS/election expectations with real IndexedDB ownership and recovery behavior.                                           |

The new package and target names above are the concrete implementation surface
for this plan. Apply the existing RpcTarget method-folder and Effect-first
conventions. Do not add a generic storage service, custom transport, or unrelated
helper/type hierarchy around these responsibilities.

## Execution order

### 1. Establish the package and storage boundary

1. Rename the existing backup package and its project identity, exports,
   acquisition interface, source entrypoint, declarations, and tests. Update
   frontend, React, and Shopping dependencies, TypeScript references, root
   workspace references, and the lockfile in the same cutover.
2. Retain the pinned wa-sqlite dependency. Bundle `wa-sqlite-async.mjs`, its
   matching WASM, and `IDBBatchAtomicVFS`; stop copying the synchronous backup
   WASM. The separate main-thread SQLite build remains synchronous.
3. Initialize a fresh, package-owned IndexedDB namespace for this storage
   format. Keep its VFS name and database name stable across app builds. Do not
   connect it to an older store for an IndexedDB version upgrade.
4. Set full SQLite synchronization and strict IndexedDB persistence explicitly.
   Use the VFS's native transaction machinery and fixed page-storage schema.
   Do not implement another journal or custom VFS.
5. Establish one semaphore around the asynchronous SQLite runtime. Await all
   suspended SQLite work before releasing it. Allow the SharedWorker to process
   ownership/revocation messages while storage operations await I/O.
6. Complete a real browser snapshot round trip and atomic statement batch early,
   using the acceptance fixture. In particular, replace the current raw
   `_sqlite3_backup_step` assumptions with async-aware bindings and verify
   initialization, completion, error, rollback, and finish cleanup. Do not
   integrate a snapshot path that has only passed a synchronous mock.

### 2. Define and implement the capability protocol

1. `BackupWorkerApi` is the connection's acquisition root. `ready()` confirms
   storage initialization and the worker lifetime lock; `acquireDb` binds a key
   and a retained revocation callback to a database capability. It does not
   proxy individual SQLite mutations.
2. Make the acquisition result distinguish an already-current owner from a new
   grant. A current-owner result returns/reuses its capability without a restore.
   A new grant returns its capability plus committed snapshot bytes or explicit
   absence. Do not overload a missing snapshot to mean both cases.
3. `BackupDbApi` owns `overwriteDb`, `applyStatements`, bound `exportSnapshot`,
   and scoped disposal. Define each public/lifecycle method through the existing
   same-named method-folder convention. Use inline wire shapes unless a shared
   exported contract is needed by multiple consumers.
4. Keep the current target instance in the worker's map for each `backupKey`.
   Retain connection-local target references to recognize repeat acquisition;
   no numeric client identifier crosses the RPC boundary.
5. On takeover arrival, revoke the previous target before its queued operations
   can begin. Enter the serialized SQLite turn after any in-flight operation
   settles; then select the successor and export the committed baseline.
   Recheck target validity after waiting for the turn, not just at RPC entry.
6. Notify the old frontend without awaiting it. Retain RPC callbacks using
   Cap'n Web's explicit lifetime rules and dispose them when no longer owned.
   A duplicate stub always observes revocation of its underlying target.
7. Every mutation, snapshot read, repair, and disposal checks ownership.
   A stale target cannot reclaim ownership, close the successor's connection,
   or delete its backup. Failed or canceled acquisition releases only resources
   belonging to that attempt.
8. Keep domain failures distinct from transport uncertainty. Revocation is
   terminal for that target and never triggers full-snapshot repair. Lost
   replies from dispatched mutations remain uncertain rather than successful.

### 3. Deliver one stable worker identity in every host mode

1. Use `/__zerospin/backup-worker.js` as the origin-relative SharedWorker URL
   and `zerospin-backups` as its name. Do not append an app/build hash, graph
   name, random connection ID, or mutable WASM URL to this identity.
2. Package the worker bundle and matching WASM as distributable assets. Resolve
   the WASM from the emitted worker implementation; the WASM asset may be
   content-addressed independently of the stable SharedWorker URL.
3. Add a narrow `backupWorkerPlugin` under the backup package's separate Node/Vite
   export. Use it in Shopping's Vite config and browser-test config. It serves
   the packaged assets before SPA fallback in dev and emits them into the
   client/static asset output during build. Keep Node/Vite imports out of the
   browser entrypoint.
4. Verify the integration with the Cloudflare Vite environment and ordinary
   preview/static serving. Both worker JavaScript and WASM must return the
   expected content and MIME type rather than application HTML.
5. Update Shopping's existing PWA asset configuration to cache the worker and
   its matching WASM for offline restoration. Do not assume `.wasm` is included
   by default. A previously loaded app must be able to restart its backup worker
   offline; this does not promise a first-ever offline visit can bootstrap.
6. Remove backup-specific virtual synchronous-WASM replacements and hashed
   leader URL transformations from the Vitest config. Retain the independent
   main-thread WASM integration where still needed.
7. Build two distinct frontend bundles served under the same origin and prove
   both connect to one worker identity and one matching-key backup. Test emitted
   assets as well as dev serving; changing only a query string is insufficient
   evidence of cross-build support.

### 4. Implement the scoped page connection

1. `acquireBackupWorker` opens the stable SharedWorker and exposes the acquisition
   root through the existing MessagePort RPC session. Replace the register-client
   and install-leader control protocol with the new root's readiness/acquisition
   contract. Create no dedicated Worker.
2. Keep one page-level connection resource for the Provider and share it across
   its selected frontend bootstraps. A page connection is not ownership of all
   selected databases; each key is acquired independently.
3. Start the shared lifetime-lock observation only after the worker reports
   readiness under its exclusive lifetime lock. On worker death, invalidate the
   connection generation and every capability issued by it, close old resources,
   and reconnect without preserving an old mediator request queue.
4. Abort pending lock observations and dispose ports/stubs on scope close. Ignore
   readiness, replies, and failure callbacks from replaced connection generations.
   Never turn a lost mutation reply into an automatic SQL retry.
5. Keep worker-loss notification separate from an individual target's revocation.
   The former reconnects the page resource; the latter pauses only the affected
   frontend and leaves other keys and page connections intact.

### 5. Replace backup-key generation

1. Update the existing aggregate/service key functions in the frontend package.
   Add its direct dependency on the installed Remix RoutePattern package instead
   of relying on React's transitive dependency.
2. Preserve the exact aggregate tuple
   `{ systemId, userId, aggregateId, aggregateName, frontendName,
aggregateFrontendLockKey }` and service tuple
   `{ systemId, userId, serviceName, frontendName, serviceFrontendLockKey }`.
   Authentication/admission or the offline authentication locator supplies
   system/user; the caller selects aggregate ID; authored frontend definitions
   supply names and the complete frontend lock.
3. Use the two route patterns from Spec 072 without hashing the entire tuple.
   Preserve the existing canonical SHA-256 lock-key calculation. Do not add
   session IDs or deployment/build IDs to these routes.
4. Verify parameter encoding against the VFS's URL/path normalization, including
   separators, percent signs, Unicode, and dot segments. Invalid identity
   segments must fail before a normalized path can collide with another key.
5. Remove assumptions that the entire backup key is a 64-character hexadecimal
   string. Keep exact identity checks when reading persisted SQLite contents.

### 6. Make execution identity renewable without remounting

1. In the existing Core aggregate and service session factories, make session
   state the source of the current execution `sessionId`. Expose it through live
   properties/getters instead of copying the initial ID permanently.
2. Aggregate command construction and journal/metadata writes use the execution
   ID captured from current state for that synchronous execution. Do not
   rewrite an already-created command when ownership changes.
3. Retain the existing session and store objects for mounted consumers. Restore
   SQLite contents into their managed live database and publish the new execution
   metadata only after acquisition/restoration succeeds. Existing callbacks
   from the old ownership period cannot write to that newly current state.
4. A first startup can use its initial session ID. A real reacquisition allocates
   a fresh ID and initializes its next command position, preserving complete
   backed-up journal occurrences from earlier sessions. A repeated focus signal
   from the current owner does neither operation.
5. Update `makeBrowserSession` and the service browser-session object in Provider
   to expose the current Core identity. Audit synchronous command access and
   live-query database access so callers cannot keep using a disposed database
   or the initial ID by accident.

### 7. Implement the complete frontend ownership lifecycle

1. Apply the same ownership contract in both existing frontend bootstrap
   procedures. Keep their domain-specific restoration, service/aggregate
   reconciliation, and authentication behavior in their current packages.
2. Register visibility, focus, and page-restoration triggers with scoped cleanup.
   Coalesce local requests; a hidden startup waits for eligibility. Hiding or
   blurring alone does not release ownership. No timer repeatedly reacquires
   merely because a page remains visible.
3. Enclose each ownership period's socket, recovery, push, and backup work in a
   restartable scope. On revocation, stop new execution/submission, close the
   socket, interrupt obsolete work, and dispose its capability. Keep the mounted
   frontend and store available in their non-current state.
4. On a new grant, restore its committed snapshot or initialize the absent
   database through normal bootstrap. Establish the new execution identity,
   ordered commit capture, and current-period controls before publishing current.
   If revocation/cancellation arrives during restore, do not publish or overwrite.
5. Keep each frontend's one-at-a-time SQL queue. For a new empty database, capture
   the initial authoritative local baseline and call `overwriteDb`; for a valid
   existing database, persist only required new metadata/commits after restore.
   Never replace it with the incoming tab's pre-acquisition memory.
6. On uncertainty while the target remains current, divert later commits, discard
   pending SQL batches, capture the live snapshot, call `overwriteDb`, and resume
   incremental delivery. Permit the existing single snapshot retry only for
   typed uncertainty and still-current ownership. Stop repair on revocation.
7. On worker death, obtain a new capability and restore committed persistence.
   Do not automatically overwrite the new worker's database from an obsolete
   page's RAM. Failure/pending backup status remains separate from synchronous
   execution in an otherwise-current live frontend.
8. Make returned push controls consult the current ownership period. They must
   not permanently capture a replaced push queue or interrupted fiber. Keep
   already-admitted command reconciliation and original occurrence provenance.
9. Preserve offline authentication lookup. Remove the current-session localStorage
   locator, storage-event supersession, predecessor command draining, and all
   handoff-related `location.reload()` calls. Missing valid backup plus unavailable
   network remains an explicit restoration failure.
10. Complete success, failure, revocation-during-repair, canceled acquisition,
    teardown, and resume behavior in this pass. No deferred wiring or no-op
    lifecycle hooks count as implementing a frontend.

### 8. Finish Provider and DevTools lifecycle integration

1. Preserve one page-level acquisition before selected frontend setup, the
   existing mounted-frontend selection contract, and independent per-key state.
   Do not remount Provider or application children to refresh ownership.
2. Keep DevTools registrations synchronized with execution ID changes: remove
   the old registration and register the current identity using existing store
   operations. Scope cleanup removes the actual registered ID, not whichever
   ID happens to be readable from a renewed session later.
3. Keep DevTools push controls bound to the current bootstrap controls. A paused
   or superseded frontend must not submit through an earlier ownership period.
4. Update existing Provider/DevTools mocks and typechecks to the new acquisition
   contract. Extend the browser acceptance case to verify stable mounting,
   renewed execution identity, preserved journal bytes, and working controls.

### 9. Remove the superseded implementation and update documentation

1. Delete `OpfsBackupRouter`, `OpfsBackupLeader`, the dedicated leader entry,
   numeric-client control messages, graph-name parsing, dedicated-worker test
   frames, per-session listing/close/delete APIs, OPFS-specific declarations,
   and tests whose sole purpose is asserting that removed topology.
2. Remove runtime imports and package/config references to the old package and
   method names. Historical archived development documents can retain their
   historical names. Do not add compatibility exports or readers of old OPFS
   state to make the cutover appear seamless.
3. Test cleanup must close its worker connections before deleting the known
   IndexedDB backup namespace and preserve unrelated origin storage and
   authentication locators. Do not add a production reset RPC for test cleanup.
4. Rename the current OPFS architecture page to describe IndexedDB backup
   coordination and update its callers. Synchronize browser bootstrap,
   authentication, command submission, WebSocket, glossary/index, package
   descriptions, diagnostics, and relevant pattern references in the same pass.
5. Preserve the docs' exact trigger/sequence/annotation structure, source links,
   explicit Mermaid numbering, and main-thread versus backup ownership boundary.
   Describe only behavior that the completed implementation and tests establish.
6. Use isolated disposable browser profiles for verification. This plan does not
   require deleting existing user OPFS data, deploying, resetting server state,
   modifying vendored sources, creating a branch, or creating a PR.

## Acceptance matrix

The primary seam is the existing Shopping browser setup. Rename
`mainThreadOpfsAdverse.playwright.spec.ts` to
`mainThreadBackupAdverse.playwright.spec.ts` and keep its real browser/runtime
coverage. Use test-only barriers or browser instrumentation; do not ship new
production fault-injection RPCs.

| Scenario                                        | Required observable result                                                                                                       | Existing seam to evolve                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Storage baseline and FIFO writes                | Snapshot round trip, strict commit acknowledgement, batch rollback, complete overwrite recovery                                  | Main-thread backup adverse suite                                     |
| Two emitted builds                              | One stable SharedWorker target, matching-key state shared, no dedicated leader targets                                           | Backup adverse suite plus built/preview assets                       |
| Frozen previous owner                           | New page restores/writes without old-page response; unbacked changes absent; old stubs rejected on resume                        | Backup adverse suite with Chromium lifecycle controls                |
| Transaction-boundary takeover                   | In-flight operation settles before successor snapshot; queued stale calls and stale disposal cannot mutate/close successor state | Backup adverse suite                                                 |
| Visibility/focus races                          | Current owner reused; latest valid acquisition publishes; hidden/canceled attempt never publishes; no reload/remount             | `mainThreadFrontendFlow.playwright.spec.ts` and backup adverse suite |
| Worker loss at dispatch/commit/reply boundaries | Typed uncertainty, no incremental replay, expired capabilities, restored committed state                                         | Backup adverse suite                                                 |
| Execution identity and journals                 | Fresh ID on reacquisition; pending original occurrences survive when backed up; admitted commands still reconcile                | Main-thread frontend flow and existing adverse fixture               |
| Offline and storage failure                     | Cached assets permit worker restart; valid backup restores; absent/incompatible backup fails honestly offline                    | Built/preview flow and backup adverse suite                          |
| Independent selected frontends                  | Revoking or repairing one key does not release unrelated keys; aggregate and service each resume correctly                       | Main-thread frontend flow                                            |

1. Add focused key-encoding tests alongside the existing frontend key functions.
   Cover all tuple fields, frontend-lock hashes, normalization, and build/session
   independence. Do not create a duplicate general identity registry.
2. Retain/add focused capability duplication/disposal tests only for semantics
   not isolated adequately by the browser matrix. Use real Cap'n Web stubs.
3. Update the existing frontend Node and React tests for changed contracts; do
   not grow separate mocked replicas of the browser ownership state machine.
4. Chromium is the currently configured Shopping acceptance browser. Report that
   coverage accurately; do not infer Firefox/WebKit verification from it.

## Verification and completion

1. The current projects' `lib`, `ts`, `test`, and `lint` targets and Shopping's
   browser/build targets were verified through `nx show project --json` while
   writing this plan. After the rename, verify the new backup project resolves
   and the old project is absent before running the following gates.
2. Build affected packages with their dependency pipeline:

   ```sh
   nx run-many -t lib -p @zerospin/backup-worker,@zerospin/core,@zerospin/frontend,@zerospin/react,@zerospin/devtools
   ```

3. Run affected typechecks and lint:

   ```sh
   nx run-many -t ts -p @zerospin/backup-worker,@zerospin/core,@zerospin/frontend,@zerospin/react,@zerospin/devtools,shopping
   nx run-many -t lint -p @zerospin/backup-worker,@zerospin/core,@zerospin/frontend,@zerospin/react,@zerospin/devtools,shopping
   ```

4. Run the affected package tests and the approved browser seam:

   ```sh
   nx run @zerospin/backup-worker:test
   nx run @zerospin/frontend:test
   nx run @zerospin/core:test -- src/session/makeAggregateSession.node.spec.ts
   nx run @zerospin/react:test
   nx run @zerospin/devtools:test
   nx run shopping:test:vitest:browser
   ```

5. Run `shopping:test:vitest:browser` with its configured dependency targets. Verify
   the new emitted-asset cases through `nx run shopping:build` and
   `nx run shopping:test:playwright:preview` after wiring those cases into the
   existing preview suite.
6. For any manually started long-lived fixture or preview server, wait for its
   actual ready output before using it. Stop only processes started by this
   implementation. No fixed sleep is a readiness assertion.
7. Run scoped formatting/documentation checks and `git diff --check`; verify
   renamed-file links and search current source/config/docs for obsolete APIs.
   Report pre-existing unrelated failures separately without modifying unrelated
   WIP or describing incomplete verification as successful.
8. Completion requires every frontend's happy path, failure path, teardown, and
   resume path; the stable worker asset serving; all relevant cleanup; and the
   acceptance matrix. Leave this plan active until implementation and required
   verification are complete, then archive it with recorded results.

## Planning evidence

1. The source spec records the complete agreed behavior and the failed
   SharedWorker-nested-Worker probe. No implementation or persistence test has
   been performed by writing this plan.
2. [Vite plugin API](https://vite.dev/guide/api-plugin.html) provides distinct dev
   serving and output-generation hooks. The asset integration must implement
   both; build hooks alone do not serve the stable endpoint in dev.
3. [Vite PWA static assets](https://vite-pwa-org.netlify.app/guide/static-assets.html)
   documents precache inclusion. Worker/WASM offline availability must be
   verified against the emitted assets and the existing PWA configuration.

## Implementation and validation record — 2026-09-07

1. Replaced the OPFS router/elected dedicated worker with
   [`@zerospin/backup-worker`](../../../packages/backup-worker/src/index.ts).
   The SharedWorker directly owns async wa-sqlite, native IDBBatchAtomicVFS,
   serialized SQLite operations, retained revocation callbacks, and revocable
   database capabilities. The stable worker and WASM assets are distributed
   through the separate Vite export. Package references and the lockfile now
   use the replacement name; no compatibility exports or storage readers remain.
2. Both frontend bootstraps retain their live SQLite handle and store while
   restarting ownership scopes. They restore before publication, renew execution
   IDs only on new ownership periods, preserve offline authentication locators,
   cancel unpublished grants when hidden, fence replaced sockets, and keep
   backup repair distinct from worker-loss restoration. Replaced local session
   locators, reload handoffs, and predecessor draining were deleted.
3. Core session IDs now read from state. Existing journal occurrences remain
   unchanged. Pending commands use SQLite insertion order across execution
   periods, including optimistic rewind/replay and the push lane. React browser
   sessions expose the current ID, and Provider tracks the actual registered
   DevTools ID for replacement and cleanup.
4. Backup and frontend package build/typecheck/lint gates passed. Backup has
   5 passing tests and frontend has 22 passing tests. The four focused Core test
   files have 19 passing tests, including renewed identity, preserved journal
   bytes, cross-period optimistic ordering, and live-query notification after
   restoration. DevTools ran 35 passing tests with two other suites blocked by
   its existing parse error; that package test command is not a passing gate.
5. All seven checked-in
   [`backupWorker.preview.spec.ts`](../../../examples/shopping/e2e/backupWorker.preview.spec.ts)
   cases passed in Chromium against the isolated emitted-asset host. Native
   storage and emitted-asset checks verified snapshot round
   trips, malformed-snapshot rejection, batch rollback, strict content-transaction
   completion before acknowledgement, one stable worker across two separately
   emitted builds, frozen-owner takeover, stale-capability rejection, PWA-backed
   offline worker restart, and takeover while a native transaction is blocked.
   The asset host was built through Shopping's actual Cloudflare/PWA Vite config
   with a disposable simple entry because the normal app cannot currently build.
   This verifies emitted assets and storage, not the blocked full Shopping app.
6. Two of those checked-in cases verify exact native crash boundaries: a committed
   mutation whose successful reply is withheld becomes `backup-request-uncertain`
   after worker termination and is restored exactly once; interruption during
   snapshot replacement restores a complete database, verified with SQLite
   integrity, row-count, generation, and payload checks. Test instrumentation
   runs only in disposable browser workers; no production fault-injection RPC
   was added. The final run completed all seven cases in 18.4 seconds. A separate
   Shopping test typecheck reports no diagnostics for this preview suite or
   `backupBuildFixture.ts`; the broader command remains blocked as recorded below.
7. The checked-in
   [`frontendLifecycleFixture.ts`](../../../examples/shopping/tests/browser/frontendLifecycleFixture.ts)
   and its registered Node browser command passed all three scenarios against
   the real DevWorker: hidden/canceled startup and current-owner reuse;
   independent aggregate/service takeover and renewal with stable databases;
   and offline takeover from a frozen page whose undelivered authored command
   is absent from the successor's journal and resources. The old capability
   rejects a snapshot of that stale RAM. Each scenario uses a fresh browser
   context; the existing adverse cases clear only their exact authentication
   locator between top-level cases.
8. The standalone browser-storage reset test and its separate config/target were
   subsequently removed because they exercised browser APIs without calling
   Zerospin code. The earlier required browser-target attempt was blocked before
   browser execution by the existing package build failures.
9. The required combined package builds, typechecks, lint, React tests, Shopping
   build, Shopping browser suite, and Shopping preview suite were attempted.
   The initial full React/Shopping verification was blocked by these bindings:
   [`SessionPane.tsx`](../../../packages/devtools/src/sessions/sessions/sessionId/SessionPane.tsx)
   redeclares `serviceIndex`;
   [`makeMountedFrontend.ts`](../../../packages/react/src/makeMountedFrontend.ts)
   redeclares `models` and `contracts` while referring to missing `modelVersions`;
   [`seedFn.ts`](../../../packages/cli/src/seed/seedFn.ts) redeclares `cwd`;
   and [`seed.tsx`](../../../packages/cli/src/commands/seed.tsx) shadows its
   exported `options` declaration. The user approved the four minimal repairs
   on 2026-09-08; they are now applied, with the resulting validation recorded below.
10. Core's full typecheck remains red in existing contract/frontend generic
    constraints; the added journal tests encounter those same constraints.
    The new browser fixture also exposes the inherited public declaration
    expansion of the frontend bootstrap's `Effect.fn` bound, which loses
    `IContract.adaptPayload` method bivariance. These are not clean typecheck
    results, and no casts or suppression markers were added to hide them.
11. Eight architecture/index/glossary pages were synchronized, including the
    renamed IndexedDB coordination page. All 232 local documentation links and
    source ranges were checked. The five affected sequence diagrams have
    matching explicit message/annotation counts of 14, 11, 12, 8, and 6.
    Scoped formatting and `git diff --check` pass; current source/config/docs
    have no references to the removed backup package or local-session protocol.
12. Work remains directly on `main`. Unrelated concurrent edits were preserved.
    No deployment, production/shared-state reset, vendor edit, branch, PR, or
    commit was performed. The plan remains active until the blocked integration
    validation can be completed. All disposable verification servers and browser
    processes started for this work were stopped after their final runs.

## Approved prerequisite repairs — 2026-09-08

1. Removed the duplicate DevTools `serviceIndex` subscription; bound mounted
   frontend input maps as `contractVersions` and `modelVersions`; defaulted CLI
   `cwd` directly in the existing destructuring; and changed the seed command
   to read `props.options.env` without shadowing the exported options schema.
   No additional runtime behavior, helpers, named types, or casts were added.
2. CLI build, typecheck, lint, and all 22 tests pass. DevTools now builds, and
   its test suite runs 36 passing tests with one existing fixture failure:
   `SessionPane.react.spec.tsx` assigns `serviceIndex` twice and still expects
   two different displayed indexes.
3. React runs 11 passing tests and five failing existing mock initialization
   tests. The failures report `aggregate-frontend-state-encode-failed` because
   the mock snapshot still includes obsolete `pushIndex`. Both Plan 072
   Provider/DevTools lifecycle suites pass, including stable mounted objects,
   renewed execution identity, and updated registration cleanup.
4. React's library build now reaches four inherited type errors: the two
   `makeMountedFrontend` returns lose the private nominal marker through
   the then-present freeze wrapper's mapped return type (removed on 2026-09-09), with the aggregate return also exposing
   the existing optional-guard constraint; the mock passes exact contract
   versions to `getInitializedStateOrThrow`, whose existing signature drops
   that generic; and the mock constructs the superseded frontend snapshot
   shape. The offending constructs match HEAD and were left outside the four
   approved binding repairs.
5. `nx run shopping:build` was rerun and remains blocked at `@zerospin/react:lib`.
   The required integration gates therefore remain incomplete. Scoped formatting
   and `git diff --check` pass. This plan remains active.
