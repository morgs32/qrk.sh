# Studio homepage Storybook

Status: Complete. Implemented on 2026-10-03; reconciled and verified on 2026-10-05.

## Agreed behavior

1. Replace the standalone homepage fixture with a Studio-owned Storybook using MSW. Preserve the real `StudioHome`, SWR hook, Cap'n Web client, and response validation.
2. Verification remains interactive, with the existing automated RPC check retained. Browser test runners, CI changes, hosted publishing, and broader API injection are outside this work.
3. Storybook owns scenario navigation and 1280, 390, and 280px viewport selection. Keep scenario-specific response, query, and browser-event controls.
4. Keep the separate agent-session fixture and its serving command. Selecting an agent or Repo in a homepage story displays its pathname without initializing a session or starting an application backend.

## Implementation

1. Add Storybook and `@storybook/react-vite` 10.6.1, MSW 3.0.2, and `msw-storybook-addon` 3.0.3 as Studio development dependencies. Use CSF3 and the addon's documented loader. Reuse Studio's Vite configuration and production styles.
2. Keep configuration, stories, mock helpers, and worker assets outside the published `src` tree. Extend development typechecking and formatting/lint coverage, excluding the generated worker and static output from source checks.
3. Add `storybook` and `build-storybook` package scripts exposed through Nx. Serve on port 6007, build dependency libraries, mark development as continuous, and cache static output in ignored `storybook-static`.
4. Intercept `POST /api/agents/rpc` with MSW and return `newHttpBatchRpcResponse(request, fixtureApi)`. Move homepage-only scenario data and RPC methods into development story helpers. Reject unexpected application API requests. Keep the production fetcher and hook unchanged; do not introduce a `useApi` context.
5. Give each story a fresh SWR cache and isolated request/scenario state. Cleanup settles pending responses and restores theme preferences and storage overrides. Use a restorable override for blocked browser storage.
6. Delete the superseded homepage HTML/TSX fixture after its coverage transfers. Update Studio's README with commands and manual checks.

## Interactive stories and acceptance criteria

1. Registered IDs: independent picker filters, a shared lookup, no matches, keyboard selection, and correctly encoded routes for special and long IDs.
2. Loading: explicit response-release control, loading indicators, and switching query identity before the previous response settles.
3. Failure and Retry: initial failure followed by successful Retry; failed refresh retains usable cached IDs.
4. Empty, No Agents, and Malformed IDs: distinct states, including zero requests when no agents are declared.
5. Shared and Separate Queries: request counts and a query probe demonstrate deduplication, separate aggregate-name/version caches, and disabled queries.
6. Focus and Reconnect: add an ID and simulate browser events to inspect refreshed results with production SWR timing.
7. Appearance and Blocked Storage: Light/Dark/System, picker state preserved across theme changes, themed popups, and functioning theme selection when preference storage throws.
8. Narrow widths: no horizontal overflow at 1280, 390, and 280px; labels and controls wrap, popup contents remain within the viewport, and long/special IDs remain selectable.

## Verification and completion

1. Run Studio's scoped Nx typecheck, lint, static Storybook build, existing `agent-rpc:check`, and `preview:build`, with required dependencies. Check formatting of changed files.
2. Manually verify every story, narrow-layout wrapping, story switching/reset, cleanup after pending responses, and development/static previews.
3. Inspect the published package file list: development stories, MSW worker assets, and static Storybook output must be absent.
4. Reconcile documentation with the implemented result. Update glossary terminology only if the implementation introduces a domain concept; create an ADR only if the result meets all repository criteria. No new domain terminology or ADR is expected.
5. Record the implementation and verification outcome, set Remaining work to None, and archive this plan with repaired links after all required work passes.

## Outcome

1. Added the pinned Storybook/MSW development dependencies, Studio Vite/styles integration, generated worker, CSF3 loader, Nx dependency builds, continuous development command on port 6007, and cached static build. Development checks cover configuration and stories; generated assets are excluded. Vite ignores generated static output so a static build does not reload the running development preview.
2. Added 13 homepage stories covering the agreed scenarios. They use the actual homepage, production SWR hook and fetcher, response validation, Cap'n Web encoding, and a memory router. Unexpected application API requests are rejected. No API context or agent-session initialization was introduced.
3. Each run owns a fresh cache and scenario state. MSW handlers are restored by the loader on each preview rerender. Idempotent cleanup settles pending responses and restores theme preferences and storage overrides, including repeated viewport changes and story remounts.
4. Deleted the old homepage HTML/TSX fixture. Retained the separate agent-session fixture and its serving command. Updated Studio's README. No new domain terminology or qualifying ADR was introduced.
5. Reconciliation found that the production combobox cleared an unselected filter when its popup closed, including when the theme menu took focus. Homepage pickers now cancel that automatic `input-clear` event, retaining each picker's existing independent query. Typed edits and selection navigation remain available. This correction makes the recorded filter-preservation behavior true in the development and static previews.

## Original verification record (2026-10-03)

1. Studio's Nx `ts`, `lint`, `build-storybook`, `agent-rpc:check`, and `preview:build` passed with required dependency builds. The final configuration/story corrections passed typechecking, lint, and static build again. Nx Cloud reported an access error after successful local execution; it did not block those checks.
2. Checked all 13 development stories interactively: independent filters, no matches, keyboard selection, encoded special and long ID routes, Repo pathnames, held responses and query identity changes, Retry, cached IDs after failed refresh, distinct empty/no-agent/invalid states, shared/separate caches, disabled queries, and focus/reconnect revalidation.
3. Recorded checks of Light/Dark/System and blocked preference storage, including live System color-scheme changes, themed picker popups, and storage cleanup after story changes and viewport rerenders. The original filter-preservation claim was contradicted by the 2026-10-05 reconciliation and corrected in the production picker. At 1280, 390, and 280px, the recorded document width equaled its scroll width; labels and controls wrapped and long IDs stayed within the production popup.
4. Checked the static HTTP preview, including encoded navigation, initial and refresh Retry, 280px viewport rerenders, and switching away from multiple held responses into a fresh Registered story. Story reset and development/static preview switching remained isolated. Rebuilding static output caused no development page reload after the Vite watcher correction.
5. Checked formatting of changed files and the final npm package dry run. Its 30 published files exclude stories, Storybook configuration, MSW worker assets, static output, and the deleted homepage fixture.

## Checkout reconciliation (2026-10-05)

1. Reviewed the complete uncommitted migration against this plan, including Storybook/MSW configuration, all 13 stories, loader/run cleanup, the deleted homepage fixture, retained agent-session fixture, package scripts, resolved Nx configuration, formatting/lint coverage, documentation links, and lockfile. The generated worker bytes match installed MSW 3.0.2. No other migration discrepancy was found.
2. After the picker correction, `pnpm nx run-many -p @zerospin/studio -t ts lint build-storybook agent-rpc:check preview:build --parallel=1` passed all five checks and their required dependency builds. Unchanged dependency libraries used the local cache; Studio's library, typecheck, lint, Storybook build, RPC check, and preview build executed. Nx Cloud's access error (`401`) was non-blocking after successful local execution.
3. Rechecked all 13 development stories interactively. Confirmed independent filters, keyboard selection, encoded special/long ID and Repo routes, out-of-order held responses across query identities, cleanup on story changes, initial Retry and cached IDs after refresh failure, distinct empty/no-agent/malformed states, shared/separate query counts, disabled queries, and focus/reconnect updates.
4. Confirmed independent filters survive theme changes and popup dismissal after the correction, including keyboard navigation in the rebuilt static preview. Light/Dark/System and blocked storage work; live System media changes update appearance. Repeated viewport/story changes restore storage availability. At 1280, 390, and 280px the development document width equals its scroll width, and long IDs remain selectable at 280px. The static preview also has no horizontal overflow at 390 and 280px.
5. Served the rebuilt static Storybook over HTTP and checked theme/filter retention, navigation, initial and refresh failure recovery, multiple held-response cleanup into a fresh Registered run, and blocked-storage viewport rerenders. Scoped formatting and `git diff --check` pass. The package dry run still has 30 files, with no stories, Storybook configuration, worker assets, static output, or deleted homepage fixture. Unrelated working-tree changes were preserved.

## Remaining work

None.
