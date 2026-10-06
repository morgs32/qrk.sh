# Handoff: Mentor Mailbox live command synchronization

**Date:** 2026-10-05
**Focus:** Adopt the verified upstream browser Node cutover, reconcile existing planner work, and verify the live consumer.
**Status:** Follow-up complete and verified on 2026-10-05.

## Goal

1. Sync the approved upstream implementation into Mentor Mailbox through its declared vendor workflow.
2. Finish planner wiring against concrete aggregate sessions and verify live Commands updates, reconnect, and cross-tab behavior.
3. Preserve the consumer's existing work. Mentor Mailbox was left unchanged by this upstream implementation.

## Done

1. Verified upstream source revision: `65165fe96d6f4af0603606d1e055e6d7bc0ba4da` on `codex/live-command-synchronization`. The implementation is in `/Users/morgs32/.codex/worktrees/live-command-synchronization/zerospin`, based on `556c94ac3`. The original Zerospin checkout was left unchanged.
2. See [archived plan 040](../plans/040-plan-live-command-synchronization.md) for the implemented contracts and verification record. One application worker file selects AggregateNode or ServiceNode from the validated worker name. Tabs retain occurrence journals and receive incremental changes; Commands views observe committed SQLite updates.
3. All fixed-schema changes are a pre-release cutover requiring empty storage. There are no compatibility decoders or automatic storage deletion. Worker bundle versions select separate storage namespaces; existing storage remains retained.

## State when this handoff was written

1. The Mentor Mailbox checkout is `/Users/morgs32/GitHub/mentormailbox`, at `90f3ba46f60adb050858ada698b58ddfaeeaf54e` on `main` when inspected. Its README manifest declares prefix `vendor/zerospin`, origin `../zerospin`, branch `main`, and requires `git subtree pull --prefix=vendor/zerospin ../zerospin main --squash`.
2. The upstream source commit is attached to an isolated worktree. Inspect current branches and preserve primary-checkout WIP before making the revision available on the manifest's `main`. Do not update a checked-out branch behind its working tree or substitute an undeclared origin/branch.
3. Existing primary Zerospin WIP remains at `556c94ac3064b8185f868c5847d4fb8ff56bc035`: Shopping's `AuthenticatedRoute.tsx`, `ShoppingProviders.ts`, and `shopperSession.ts`; Explorer's `Navbar.tsx` and `style.css`; and `AggregateActorVersionChain.ts`. Keep this work separate when integrating the source revision.
4. Existing consumer WIP, inspected read-only:
   1. README and planner layout/personal page.
   2. `apps/app/src/containers/ListView/Project.tsx` and `apps/app/src/zerospin/studentSession.ts`.
   3. `apps/zerospin/src/browser/index.ts`.
   4. Vendored generic Node and its command-outcomes fixture, including date decoding edits. The upstream concrete Nodes now decode modeled date attributes; reconcile the intent instead of restoring removed generic files.
   5. Untracked personal-page and Project component tests, and createProject/starProject Workerd tests.
5. The committed planner session was read-only; current WIP adds create/star actions and DevTools setup. Backend createProject, completeProject, and markIncomplete contracts already exist. Read current source before deciding which WIP to retain or complete.

## Verified upstream checks

1. `pnpm nx run @zerospin/core:node-outcomes:check` covers both concrete journals, including rollback, reopen, covered history, repeated IDs, retained subscription replay, and conflicts.
2. `pnpm nx run @zerospin/browser:shared-worker:check` runs four Chromium scenarios against the built worker and WASM, including more than 50 retained commands and uncertain acceptance.
3. `pnpm nx run @zerospin/react:test` passes all 43 tests, including both mounted SQLite Commands views, rich modeled resources, and child-before-parent baseline/invalid-reference rollback checks.
4. Scoped Nx library builds, package typechecks/lint, Explorer build/typecheck/lint/tests, Shopping marketplace/checkout and 14 Workerd tests, the static cutover check, and server `contract-programs:check`, `actor-staging:check`, `command-history:restart:check`, and `async-contracts:runtime-check` pass.
5. Transient-agent coverage includes core `agent-preview:check`, browser `agent-preview:check`, Studio `agent-rpc:check`, Studio `preview:build`, and the mounted independent Studio fixture. All 32 mounted assertions pass, including repeated-ID rendering and first-terminal preservation. The fixture reports no Worker/SharedWorker acquisition and no browser page errors.
6. Nx Cloud returned its existing access error (`401`); local task results are the verification evidence. Existing React build-script lint warnings and Studio bundle-size warnings remain outside this change.

## Follow-up results

1. The user authorized consolidation on upstream `main` and a WIP commit. The live synchronization implementation, modeled nullable date regressions, and subsequent command-phase/toast work are consolidated there; the feature revision is `4fb108d6d17214d70d7d8a90e99b08780994725e`. The literal manifest subtree pull produced consumer merge `5af5349b24cb845638032547ec760ae6cb2c4ec4`. Unrelated consumer WIP and existing storage remain preserved.
2. The planner uses its existing singleton aggregate session and single worker entry, passing the supplied worker name through unchanged. Create/star/unstar use ordinary optimistic contracts. DevTools loads and disposes with the planner lifecycle. Central Sonner callbacks distinguish staging, admission, execution, worker connection/storage, authentication, and server protocol failures. Add Project retains drafts on failure and closes on success.
3. Consumer library build, type generation, backend typecheck/lint, planner typecheck, all 22 focused component tests, the nine existing Workerd tests, and both adapted create/star Workerd tests pass. Scoped TSX oxlint, formatting, and whitespace checks pass. The separate legacy App ESLint configuration is unusable because its installed shim and `@mentormailbox/utils` dependency are missing; it was not expanded into this planner change.
4. Ran the documented services in a clean sibling checkout with fresh backend storage. Website and App return 200; Zerospin accepts the system spec and listens on 8789. Owner sign-in has an unrelated unresolved `@/shadcn/sonner` import and returns 500.
5. Existing Chrome profile verification covers sign-in, inline blank validation, optimistic create/star while delivery is paused, live command rows, both terminal phase results, cross-tab changes, DevTools toggling/remount, navigation, reload, and backend disconnect/reconnect. Offline retry remains quiet and a queued star completes after reconnect without losing the project. Uncertain acceptance and notification races pass in the real built SharedWorker fixture; the current suite has 11 scenarios. Upstream React has 54 passing tests, with core/server regressions and affected builds/typechecks also passing.
6. The [consumer completion plan](/Users/morgs32/GitHub/mentormailbox/wiki/archive/plans/001-plan-student-session-error-toasts.md) records the implementation, preserved WIP, verification, and known unrelated application limitations. This handoff is archived after verified follow-up completion.

## Remaining work

None.

## Suggested skills

1. `$implement` for consumer execution and required verification.
2. `$update-vendor` for the README-driven subtree workflow and WIP preservation.
3. `$use-morgs32-wiki-patterns` and the consumer's local guidance for session ownership, contracts, and live queries.
4. `$spec` only for unsettled consumer decisions; do not re-approve upstream decisions.
5. `$handoff` for lifecycle and final completion records.

## Pointers

1. [Archived upstream plan 040](../plans/040-plan-live-command-synchronization.md).
2. Mentor Mailbox `README.md`, `apps/zerospin/README.md`, and `apps/app/src/zerospin/studentSession.ts`.
3. Upstream `packages/browser/src/makeSharedWorker.ts`, `packages/browser/src/sharedWorkerNames.ts`, and concrete AggregateNode/ServiceNode folders in browser and core.
4. Upstream browser SharedWorker fixture, core command-outcomes fixture, and React CommandsLiveQuery tests.
