# Standalone sessions and test organization design

**Date:** 2026-09-20

**Status:** Approved for planning

## Problem statement

Two handoffs contain unfinished standalone-session behavior, QRK integration,
testing conventions, and a repository-wide test-review backlog. They also
contain completed work and decisions superseded by subsequent development.

This spec consolidates both handoffs into one current scope. Later implemented
designs take precedence over conflicting historical decisions. Completion
requires resolving every retained commitment and review recommendation without
resurrecting obsolete architecture.

## Solution and user stories

1. As a standalone-session consumer, I can execute aggregate commands without
   contacting a backend and recover acknowledged data after reopening.
2. As a user, I can distinguish a successful local command from confirmed backup
   durability.
3. As a React consumer, I receive predictable initialization, error-boundary
   behavior, and disposal.
4. As a QRK user, Library and individual Studio pages retain their own documents
   across refreshes.
5. As a maintainer, I can understand tests by observable behavior and trust that
   restructuring preserves their assertions and runtime boundaries.
6. As a future contributor, I can use this spec without reconstructing decisions
   from either handoff.

## Implementation decisions

### Standalone sessions

1. Remain aggregate-only and backend-independent. Retain caller-supplied `key`,
   runtime-owned `BrowserBackup`, and explicit `initialize()`, `dispose()`, and
   argument-free `reset()`.
2. Successful commands become settled local history. Preserve the complete
   encoded occurrence and inverse mutations without leaving pending optimistic
   entries or fabricating backend admission or selected-command outcomes.
3. Preserve the existing distinction between a committed failed occurrence and
   a failure before an occurrence was committed. Standalone execution never
   schedules backend delivery.
4. Local command completion remains synchronous. Cross-refresh durability is
   represented separately by `backupState: ready`.
5. Restore persisted resources in preference to constructor seeds. Before
   publishing a restored session, compare persisted and supplied encoded
   authentication; mismatch fails initialization without modifying the saved
   backup. Replacement requires explicit `reset()`.
6. `reset()` replaces the document using the constructor's original resources
   and authentication. Exclude staging during replacement and preserve lifecycle
   ownership during concurrent reset, initialization, and disposal.
7. Revocation makes the session superseded. Reacquire through the established
   visibility, focus, and `pageshow` lifecycle, including interrupted acquisition
   and worker disconnection. Restore the durable backup on reacquisition;
   obsolete ownership must not publish readiness or overwrite its successor.
8. Terminal backup failure fails the session closed: reject subsequent staging
   while retaining readable in-memory data. Recovery is explicit disposal
   followed by initialization, restoring the last durable backup. `reset()` is
   the separate destructive replacement operation. Unacknowledged changes are
   not guaranteed to survive reopening.
9. Add `useInitializeStandaloneSession({ session })`. Initialize after React
   commit, return `{ isInitialized }`, throw startup errors to the React error
   boundary, and dispose only when that hook acquired ownership. No signature
   callback.
10. Register standalone sessions in DevTools without push controls. Follow
    current lifecycle registration and cleanup.
11. Keep `systemId` absent from browser session state and standalone backup
    identity. The handoff's synthetic-ID question is superseded.

### QRK integration

1. After upstream standalone behavior is complete and verified, synchronize
   Zerospin through QRK's vendor workflow. Never author changes directly in its
   vendored subtree.
2. Rename the factory to `createLibraryStandaloneSession` and its existing
   session type to `ILibraryStandaloneSession`. Update exports, build entries,
   imports, and Library and Studio callers without compatibility aliases.
3. Give Library one stable application document key. Give Studio separate
   document keys derived from `{ user.id, siteId, pageId }`: Clerk supplies
   `user.id`; route parameters supply `siteId` and `pageId`. Keep the Library and
   Studio key namespaces distinct and encode their components without
   collisions.
4. Use the standalone initializer in both consumers. Supply the selected
   document key to the factory rather than deriving persistence identity solely
   from the shared wall ID.
5. Change Library's existing reset action to reset persisted session data;
   merely reconstructing a session would restore that data. Preserve the
   existing viewport-reset behavior.
6. Serve the required backup-worker and WASM assets through each consuming
   application's development and production hosting configuration.
7. Add QRK-local `wiki` guidance that all named types begin with `I`. Apply
   it to the touched session type; this does not require an unrelated
   repository-wide rename.

### Testing conventions and full review backlog

1. Keep universal conventions in canonical shared testing guidance and workflow
   instructions in the current cleanup workflow. Keep Zerospin's configured
   runtime lanes in its local testing profile. Do not recreate the superseded
   standalone `make-obvious` workflow or introduce a dedicated test skill.
   Update the shared pattern index and validate any changed shared skill.
2. Colocate focused tests with their source owner and match its basename. Place
   genuine cross-module and lifecycle scenarios in feature-oriented test areas
   with kebab-case scenario names; do not mirror the source tree or attach a
   complete integration to one arbitrary participant. Preserve separation
   between Node (`*.node.spec.ts`), workerd (`*.workerd.spec.ts`), React/browser
   (`*.react.spec.tsx`), Playwright (`*.playwright.spec.ts[x]`), and typecheck
   (`*.typecheck.ts`) discovery.
3. Group behavioral suites by observable promise. Add a suite contract comment
   only when the filename and title are insufficient. Annotate complex
   scheduling or multi-phase scenarios with an ordered overview and matching
   `// N — concrete checkpoint` comments; keep them synchronized and avoid
   ceremonial annotations for simple cases.
4. Use deterministic barriers such as `Deferred` for ordering assertions.
   Browser readiness waits are not automatically defects. Keep assertions
   visible, fixtures local, and Effect-native tests on `it.effect` or `it.layer`
   with `it` from `@effect/vitest`, rather than whole-test `Effect.runPromise`
   wrappers. Type RPC doubles through their declared interfaces or `Pick`, not
   terminal casts. Missing required live-test secrets must fail clearly.
5. Before restructuring, map existing tests to invariants and replacement
   tests. Preserve success, failure, retry/resume, cancellation, identity,
   ordering, and exact-Cause assertions. Do not introduce universal fixtures,
   fake runtimes, helper layers, or named types merely to reorganize tests.
   Separately approved scenario drivers must own reusable domain scenarios,
   not repeated setup alone.
6. Refresh the first-party audit across Core, system-worker,
   backup-worker/frontend, React, DevTools, Shopping, schema, logger, CLI, sync,
   Studio, error, the smaller packages, and workspace-level tests. Record
   vendor examples as read-only evidence. Historical file counts and line
   counts are not current acceptance criteria. Group findings by package and
   feature, covering mixed promises, runtime/naming inconsistencies, stale
   annotations, duplicated fixtures, and nondeterministic scheduling.
7. Include every surviving recommended review slice:
   1. Current backup ownership and browser lifecycle coverage replacing the
      obsolete SharedWorker suite.
   2. SystemApi, GatewayApi, and AggregateFrontendApi behavior.
   3. Schema primitive families.
   4. Core mutation replay and current model construction.
   5. React initialization, mocks, DevTools, and Shopping browser scenarios.
   6. Logger, CLI, error, and other ambiguous runtime suffixes.
   7. Core session/RPC and system-worker delivery scheduling assertions.
   8. Studio RepoExplorer and remaining audit hotspots.
8. Review each slice and apply warranted test-only restructuring one invariant
   at a time. Review findings are numbered and actionable. Verify each slice
   before continuing through this bounded backlog. Record why no change is
   needed where appropriate; do not split files solely because they are long
   or restore tests for superseded behavior.
9. Record the Core System pilot from `9a253ef66` as completed historical work.
   Subsequent System/authentication changes supersede its original five-file
   layout.
10. Follow current shared-repository publication rules rather than the
    handoff's obsolete mandatory-PR assumption. Do not modify installed skill
    copies directly. Refresh downstream guidance only from published upstream
    work, not an unmerged PR. This spec does not authorize a PR merge.

## Testing decisions

1. Use two existing standalone seams:
   1. Core journal tests for complete retained occurrences, settled success,
      inverse mutations, committed failures, and absence of pending optimism.
   2. Real Chromium integration with IndexedDB and SharedWorker for
      persistence, restore-over-seed, authentication mismatch without
      overwrite, reset, takeover, interrupted acquisition, worker loss,
      terminal failure, explicit reopening, React ownership/error boundaries,
      and DevTools cleanup without push controls.
2. Prove that successful staging can precede backup acknowledgement and that
   reopening restores the acknowledged durable state. Verify standalone
   operation makes no backend requests.
3. For test restructuring, compare invariant coverage and test collection
   before and after each slice. Run appropriate Nx tests, typechecks, and
   non-rewriting lint/format checks; verify runtime discovery and update stale
   references. Resolve current Nx targets rather than copying historical
   target names. Validate changed shared skills and documentation links, and
   run `git diff --check`.
4. Verify QRK Library with typecheck, lint, and manual checks, following its
   explicit no-tests policy. Manually verify Library persistence/reset and
   Studio isolation across users and pages.
5. Verify required browser assets in development and built output. Preserve
   unrelated failures as reported limitations rather than silently expanding
   production scope.
6. Existing prior art is the
   [Core aggregate-session suite](../../../packages/core/src/session/makeAggregateSession.node.spec.ts),
   [Chromium backup lifecycle suite](../../../examples/shopping/tests/browser/mainThreadBackupAdverse.playwright.spec.ts),
   and [built-output backup acceptance suite](../../../examples/shopping/e2e/backupWorker.preview.spec.ts).
   Reuse those seams without inventing a fake runtime or a separate isolated
   React suite for this work.

## Reconciliation and completion

1. Carry every item from both handoffs into this spec as completed, superseded,
   or required work, with source or commit evidence.
2. Replace stale snapshot claims, obsolete paths, and historical workflow
   instructions with their current equivalents. Do not claim fresh runtime
   verification from old test results.
3. Once this spec is saved and checked for complete coverage, archive both
   handoffs under their existing filenames. Archival means their receiving
   context has been consolidated, not that implementation is complete.
4. Update documentation made stale by implementation in the same pass.
   Preserve unrelated WIP and keep vendor source changes within the
   established upstream workflow. Recheck status before restructuring and
   inspect staged changes before any separately authorized commit.
5. Completion requires standalone behavior and recovery, QRK integration,
   shared/local guidance, and disposition of the entire test-review backlog.

## Out of scope

1. Backend synchronization for standalone sessions, service standalone
   sessions, or automatic recovery from terminal backup failure.
2. Compatibility aliases, fallback persisted formats, or restoring superseded
   APIs and tests.
3. Production refactoring solely to facilitate test organization.
4. Unrelated QRK type renames, new product features, or automatic deletion of
   shared or production-like state.
5. An implementation-plan file, issue-tracker publication, or implementation
   during this spec phase.

## Further notes: inputs and disposition

1. **Inputs.** This spec merges the
   [standalone-session handoff](../archived/084-handoff-standalone-session.md),
   the [test-organization handoff](../archived/2026-08-30-handoff-test-organization-and-review.md),
   and the decisions explicitly confirmed in this conversation. The user
   directed that later work intentionally supersedes conflicting handoff
   decisions and included the entire suggested review backlog.
2. **Standalone handoff: settled requirements retained.** Its nine confirmed
   decisions are carried in Standalone sessions above. Its remaining recovery,
   failure, authentication, initializer, verification, and QRK requirements
   remain implementation obligations, not completed claims.
3. **Standalone handoff: open decisions resolved.** Successful commands use
   settled complete history with inverse mutations; testing uses Core and real
   Chromium; reset uses original constructor inputs; QRK uses
   `createLibraryStandaloneSession` and `ILibraryStandaloneSession`. Explicit
   reopen recovery and the React hook contract were confirmed here. Permanent
   unresolved optimism and resource-only persistence were not selected.
4. **Standalone handoff: historical snapshot superseded.** The uncommitted-WIP
   framing predates committed work. Commit `9984f12b1` establishes runtime-owned
   backup scope. Spec 084's selected-command cutover and the current
   [systemId glossary entry](../../glossary.md#systemid) supersede the synthetic
   browser `systemId` question. The
   [current backup architecture](../../architecture/browser/IndexedDbBackupCoordination.md)
   records shared runtime ownership. None of those changes proves completion of
   the remaining standalone behaviors. Old typecheck/lint results remain
   historical evidence only.
5. **Test handoff: completed pilot, superseded layout.** Commit `9a253ef66`
   contains the System test split and its audit. Its recorded nine-test
   preservation is historical, not a fresh test result. Subsequent authoring
   and authentication work, including `a351a58df`, replaces the old mandatory
   file layout. Do not restore root System-version or old frontend-authorization
   tests solely to reproduce the handoff.
6. **Test handoff: convention decisions retained.** Shared/local ownership,
   focused/behavioral placement, runtime lanes, selective annotations, test
   behavior rules, local fixtures, coverage maps, verification, and WIP safety
   are carried above. The old audit-plus-pilot stopping point is superseded by
   the user's explicit inclusion of every recommended follow-up.
7. **Test handoff: workflow and publication superseded.** The canonical shared
   repository now carries make-obvious guidance inside the cleanup workflow;
   its current `AGENTS.md` makes a PR optional rather than mandatory. Preserve
   the review and restructuring responsibilities without restoring the old
   skill or assuming an outstanding PR must exist. Existing merge restrictions
   remain applicable if a PR is chosen. Shared guidance completeness and the
   Zerospin testing profile still require review and any necessary updates.
8. **Test handoff: full audit carried forward.** All package groups, scheduling
   and annotation findings, and recommended slices remain in the review
   backlog above. The 220/210 file totals, line counts, and 26 timing-token
   matches are obsolete snapshots. Current source owners replace deleted
   SharedWorker and model-factory filenames; absence of an obsolete file does
   not justify recreating it.
9. **QRK decisions refined here.** The initial username-based Studio key
   proposal is superseded by the explicitly selected
   `{ user.id, siteId, pageId }` tuple. The initial unprefixed session-type name
   is superseded by the user's `I`-prefix convention. Library and Studio both
   migrate; neither remains on an alternate mock-session compatibility path.
10. **Phase status.** Design alignment and test-seam confirmation are complete.
    Saving this spec and archiving its inputs completes consolidation only.
    Runtime behavior, integration, guidance changes, and the full review
    backlog are not claimed implemented or verified by this document.

## Implementation record

**Updated:** 2026-09-20. Standalone implementation and Zerospin test organization
are implemented; QRK synchronization/integration and final verification remain
in progress. This record does not mark the entire spec complete.

### Review dispositions

1. **Inventory:** 247 first-party spec/typecheck files across 20 package/example
   groups after the schema split. Vendor tests remain read-only evidence.
2. **Backup and browser lifecycle:** moved the five real RPC/SQLite/connection
   cases intact into `packages/backup-worker/src/tests/revocable-backup-ownership.node.spec.ts`.
   The removed SharedWorker suite is superseded. Current Chromium tests cover
   the surviving lifecycle guarantees. Updated the older live-session fixture
   to the current `claimBackup` contract instead of recreating removed props.
3. **System Worker APIs:** SystemApi's four cases and AggregateFrontendApi's
   three cases now have focused source owners; their historical oversized
   suites no longer exist. Moved Gateway's five cross-capability access cases
   intact into `packages/system-worker/src/tests/frontend-access.node.spec.ts`.
   Kept its three direct SystemApi-grant cases colocated.
4. **Primitive families:** kept 23 direct descriptor tests in `primitives.node.spec.ts`
   and moved 22 mapping/provisioning/type-inference cases unchanged into the
   existing source owner's `primitiveMaps.node.spec.ts`. All 45 named test
   bodies are retained; no assertion or generic fixture was removed.
5. **Core mutation/model contracts:** replay's three cases already cover exact
   model/replica versions and malformed/unavailable operations with Effect-native
   assertions. No move is warranted. Corrected the model-version suite's stale
   `defineModel` title; retained its focused construction/ownership assertions.
6. **Core session/RPC scheduling:** moved the cross-module command-journal suite
   to `session/tests/local-command-journal.node.spec.ts`, replacing three
   25-millisecond waits with Deferred completion barriers. Preserved its five
   original promises and expanded the failed-occurrence case across live and
   local settlement. Added a separate complete-history/no-optimism assertion
   at the existing aggregate-session seam. Updated two selected-command/guard
   fixtures to current types without production changes.
7. **React, DevTools, and Studio UI:** the mock-session suite owns one fixture
   lifecycle; log selection/clearing belongs to SessionsLogsRoute; the four
   RepoExplorer cases exercise its UI/router contract. Length alone does not
   justify splitting these fixtures. Their existing focused suites pass.
   Standalone lifecycle assertions use the agreed real Chromium seam.
8. **CLI, logger, error, and other lanes:** their generic Node suffixes match
   configured Node-only discovery; logger excludes its distinct workerd lane.
   Sync integration retains explicit workerd/Playwright discovery. SDK,
   live-query, dispatch/dev/production-worker, error-boundary, and zod remain
   grouped by their configured source or runtime boundary. No blanket rename,
   fake runtime, or vendor edit is warranted.
9. **Shared/local guidance:** expanded the canonical focused/behavioral test
   pattern and cleanup test-review instructions; validated both affected
   skills. Added Zerospin's local runtime-lane profile. Preserved unrelated
   naming-pattern edits in the canonical shared checkout. QRK's requested
   local `I`-prefix guidance is prepared separately from its vendor tree.

### Verification recorded so far

1. Core: 382 tests passed; schema: 57 tests passed.
2. React, frontend, backup-worker, DevTools, Studio, and system-worker: 314
   tests passed across their six Node/DOM targets. The relocated backup/access
   suites also pass in their new locations.
3. Core, React, and schema test/typecheck targets passed after correcting stale
   fixtures from prior cutovers. React production typecheck passed; React lint
   passed with existing warnings.
4. Standalone Chromium acceptance: seven tests passed, covering persistence,
   reset, authentication rejection without overwrite, revocation, interrupted
   acquisition, actual worker termination, terminal failure/reopen, React
   StrictMode/competing ownership, and DevTools registration without push.
5. Full Chromium acceptance passed all 16 tests after the stale fixture
   correction. Existing React act warnings remain visible in the runner output.
6. Logger, CLI, error, live-query, SDK, zod, and error-boundary targets passed
   167 tests. CLI intentionally launches a failing child test to verify runner
   error propagation; its parent suite passes.
