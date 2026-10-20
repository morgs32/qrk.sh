# Plan 031 — Component and JsonRender previews

**Status:** Complete. Source implementation, browser verification, successful generation, scoped local cutover, and documentation are complete. Archived 2026-10-20.
**Approved:** 2026-10-20.

## Problem and agreed behavior

1. Replace Library's grid-item/intrinsic comparisons with the two actual render paths: **Component** for authored markup and **JsonRender** for the module's Spec/registry rendering. Apply the same preview model across Library and App/Studio.
2. Module details in both hosts compare those paths for `sm`, `md`, `lg`, and `xl`, at 360, 720, 1080, and 1440px respectively. Each preview takes its height from content; wide rows scroll horizontally. Shared catalogs show only the authored Component at the active canonical width. Saved-brick fallback previews also use canonical width and content height.
3. Keep Library's Generate spec controls and generated JSON display. A generated Spec changes only JsonRender; it never changes the authored Component. Use the current/default state in each host and retain existing placeholder behavior.
4. Remove grid preview sizing, intrinsic probes, pixel/grid-unit diagnostics, module view geometry fields, all shared/save-time/Figma measurement machinery, persisted `Placement.measured`, and measurement command payloads. Retain Placement identity, breakpoint, `gridItem`, Spec, visibility, generation/revisions, and publication snapshot geometry/history.
5. Link's copy column uses CSS half width and normal URL/title wrapping, with no font/column fitting. Map Place owns a 200px CSS minimum height and retains Mapbox's resize observer. GitHub Activity retains calendar scrolling and edge fades. Ordinary form validation, drafts, provider resolution, image uploads, session ownership, and error reporting remain.
6. Discard only affected local Library/App browser data and local QRK backend state, with no backup, compatibility layer, or authored namespace change. Preserve unrelated WIP, older origins, unrelated databases, cookies/login, localStorage preferences, API R2 uploads, registry state, and deployed data.

## Decisions and annotated examples

1. Canonical preview width belongs to `BREAKPOINTS`; content and module-owned CSS supply height. Stored Placement geometry serves editing/publication and does not determine these preview boxes. Keeping the old grid-span or intrinsic-size mechanism would retain a second sizing model without serving the requested comparison.
2. Existing `viewFor(breakpoint).component` supplies the authored path; the existing module component supplies JsonRender. No new wrapper, named type, renderer API, or trust boundary is needed. The latter retains its existing fallback when a module has no registry.

   ```tsx
   // 1. Resolve the existing authored implementation for this breakpoint.
   const Component = brickModule.viewFor(entry.id).component;
   // 2. Keep Spec interpretation on the existing JsonRender path.
   const JsonRender = brickModule.component;

   // Each sibling receives entry.previewWidth; neither receives a grid span or height.
   <Component state={moduleState} />;
   <JsonRender breakpoint={entry.id} state={moduleState} spec={specs[entry.id]} />;
   ```

3. Saves stage decoded state through the existing command result. Removing probes removes the need for measurement waiting, cancellation, reread guards, and hidden render boundaries; normal mounted-editor/session/brick checks remain.

   ```ts
   // 1. Stage exactly the ordinary state-update payload.
   payload: { brickId, moduleId, state }
   // 2. The transaction updates shared state/revision and supersedes active generation.
   // 3. gridItem, Spec, visibility, and snapshot history stay independent of previews.
   ```

4. Example: generate a new GitHub Activity Spec in Library at `sm`. The left Component remains the authored calendar at 360px. The right JsonRender uses the new Spec at 360px. Both keep their actual content height; no `w=`, `h=`, or pixel-size result appears. The same comparison exists at the other three widths.
5. This is a current-development-line schema cutover. Do not add adapters, aliases, migrations, or compatibility decoders. Do not change package versions or release older declarations merely to preserve the removed mechanism.

## Affected file hierarchy

Legend: `+` create; `~` modify; `-` delete. Paths are rooted at the project directory. The unrelated Pragmatic Tree Storybook work is excluded; its existing README edits must remain intact.

```text
qrk.sh/
├── ~ pnpm-lock.yaml
├── apps/
│   ├── app/
│   │   ├── ~ README.md
│   │   ├── components/
│   │   │   └── ~ ZerospinUser.tsx
│   │   └── app/[username]/site/[siteId]/page/[pageId]/
│   │       ├── BrickDetail/
│   │       │   └── ~ BrickDetail.tsx
│   │       └── (drawer)/(bricks)/modules/[moduleId]/
│   │           └── ~ page.tsx
│   └── library/
│       ├── ~ README.md
│       ├── ~ package.json
│       ├── ~ bricks.css
│       ├── app/
│       │   ├── ~ LibraryLayout.tsx
│       │   ├── bricks/[brickId]/admin/
│       │   │   └── ~ page.tsx
│       │   └── modules/[moduleId]/
│       │       ├── ~ page.tsx
│       │       └── ~ BreakpointPreviewRow.tsx
│       ├── components/brick/
│       │   └── - MeasuredBrickWrapper.tsx
│       ├── lib/
│       │   ├── - GridItemPreview.tsx
│       │   ├── ~ ModulePreview.tsx
│       │   ├── ~ breakpoints.ts
│       │   ├── ~ types.ts
│       │   └── ~ useUpdateBrick.tsx
│       ├── libraryModule/
│       │   ├── ~ libraryModule.ts
│       │   ├── contracts/
│       │   │   ├── ~ makeBrickSpecGenerationContracts.ts
│       │   │   └── updateBrick/
│       │   │       └── ~ UpdateBrickContractV1.ts
│       │   └── models/placement/
│       │       └── ~ placementModelV1.ts
│       ├── make/
│       │   ├── ~ makeModuleSpecContractVersion.ts
│       │   └── ~ makeModuleView.tsx
│       └── modules/
│           ├── article/
│           │   └── ~ articleView.tsx
│           ├── figmaThumbnail/
│           │   ├── - FigmaReadyMeasurements.tsx
│           │   ├── - makeFigmaMeasurementContract.ts
│           │   ├── ~ figmaThumbnailView.tsx
│           │   ├── ~ makeConfigureFigmaThumbnailContract.ts
│           │   └── ~ makeCompleteFigmaThumbnailContract.ts
│           ├── githubActivity/
│           │   ├── ~ makeConfigureGithubActivityContract.ts
│           │   └── ~ makeCompleteGithubActivityContract.ts
│           ├── githubProfile/
│           │   ├── ~ makeConfigureGithubProfileContract.ts
│           │   └── ~ makeCompleteGithubProfileContract.ts
│           ├── githubRepo/
│           │   ├── ~ makeConfigureGithubRepoContract.ts
│           │   └── ~ makeCompleteGithubRepoContract.ts
│           ├── instagram/
│           │   ├── ~ makeConfigureInstagramContract.ts
│           │   └── ~ makeCompleteInstagramContract.ts
│           ├── link/
│           │   ├── ~ LinkCopy.tsx
│           │   ├── ~ linkView.tsx
│           │   ├── ~ makeConfigureLinkContract.ts
│           │   └── ~ makeCompleteLinkContract.ts
│           └── mapPlace/
│               ├── ~ MapCanvas.tsx
│               ├── ~ mapPlaceView.tsx
│               ├── ~ makeConfigureMapPlaceContract.ts
│               └── ~ makeCompleteMapPlaceContract.ts
└── wiki/
    ├── ~ brick-layout-conventions.md
    ├── archive/plans/
    │   └── + 031-plan-component-jsonrender-previews.md
    └── research/
        └── ~ server-side-grid-content-height.md
```

## Implementation and local cutover

1. **Implemented in source:** simplify catalog, module-detail, and saved-brick previews using existing render paths, canonical widths, normal content height, card appearance, and horizontal overflow. Keep Library generation isolated to JsonRender.
2. **Implemented in source:** remove `GridItemPreview`, `MeasuredBrickWrapper`, grid conversion, `w/h/minW/minH`, size assertions, `measureOnSave`, hidden Figma/Admin hosts, measurement controls, and measurement CSS. Apply Link wrapping and Map's module-owned minimum height; preserve calendar/Mapbox observers.
3. **Implemented in source:** remove `Placement.measured`, `updateBrick.measurements`, the `measureFigmaThumbnail` contract/registration, and measurement invalidation writes from configure/complete/spec-generation contracts. Keep state/spec revisions, generation supersession, Placement checks, provider revision guards, `gridItem`, and publication serialization. Remove unused Pretext through the package manager and update the lockfile.
4. **Completed identity capture and process shutdown:** identify exact existing databases before reopening changed-schema sessions; stop affected Library/App tabs/workers and local dev processes so deletion is not blocked. Keep the same browser profile and authentication.
5. **Completed Library discard:** on `https://library.qrk.localhost`, target only the legacy standalone database derived from the unchanged `/qrk-library-command-query-v1` path and `library@1.0.0` aggregate/actor scope, session `library`: `/zerospin/standalone/c2ea158c922a0b01663c1471b099356a4d9f1606912315e90f5304e4222003fc`. Its 15.0.1 storage key excluded the model/schema lock. Chrome deletion succeeded. After an initial in-app SharedWorker block and desktop app restart, the exact legacy target was already absent; explicit deletion completed successfully before the initialized route was reopened. The later 18.0.0 adoption independently introduced lock-derived partitions, retained by 19.0.0; its current partition was preserved. Do not rely on implicit runtime reset or delete other standalone databases. The exported standalone factory has no current preview-session caller; no preview database or path was invented.
6. **Completed App discard:** on `https://app.qrk.localhost`, inspect existing aggregate discovery records and match local `https://zerospin.qrk.localhost`, `qrk-sh` / `user` / `userSession`, and the affected web-actor identities. Delete only their exact `/zerospin/aggregate/<runtime-hash>/<key>` databases and matching discovery entries. Preserve unrelated records, discovery revision values, other origins, cookies, and preferences. Connected identity includes the session lock hash; its generated name may change naturally, but do not alter authored identity or namespaces.
7. **Completed backend discard and readiness:** with the local worker stopped, delete only `apps/zerospin/.wrangler/zerospin/dev-worker/sys_qrk_sh_1`, without moving or backing it up. Preserve sibling backups, API storage/R2, registry, and all deployed storage. Restart the same local system and require its actual ready output with system-spec acceptance before opening App.
8. **Documentation complete:** reconciled all active preview/measurement claims in both READMEs and [brick conventions](../../brick-layout-conventions.md); marked the Pretext integration in [server-height research](../../research/server-side-grid-content-height.md) historical. Existing [glossary](../../glossary.md) terminology remains accurate, so no glossary edit is needed. This routine, reversible preview cleanup warrants no ADR. Actual outcomes are recorded below, and this plan is archived with inbound and relative links repaired.

## Verification at existing seams

1. Review the scoped source and dependency diffs against this plan, preserving unrelated changes. Repository policy defers tests and standalone automated check suites; do not add or run a new suite/check gate.
2. After explicit local deletion/restart, verify fresh Library and authenticated App initialization in the existing browser profile, including backend system-spec acceptance. Do not infer authenticated readiness from HTTP 200 or signed-out HTML.
3. Inspect Library GitHub Activity module details: all four breakpoint sections show Component and JsonRender with their canonical widths, content heights, and horizontal overflow. The old intrinsic/grid-item labels, size diagnostics, and hidden probes are absent. Generate a Spec and confirm only JsonRender changes; retain prompt/error/JSON display behavior.
4. Inspect App module details for the same four comparisons. Inspect both catalogs at changed active breakpoints: only authored previews render, and cards/placeholders/navigation retain their existing behavior. Inspect the saved-brick fallback path when reachable without adding new insertion functionality.
5. Inspect Link with long URL/title content and Map Place in both render paths: CSS wrapping works without measured fitting; Map has at least 200px height and its controls/tiles respond to resizing. Confirm GitHub calendar scrolling and fades still work.
6. Review ordinary state Save/Cancel and Admin JSON Save at their existing source seams; exercise them only when a saved brick already exists. Fresh walls have no bricks and no insertion command. Do not add brick fixtures or insertion functionality to manufacture runtime coverage. Record source-only save/fallback verification explicitly. Keep image upload behavior intact.
7. Confirm Placement geometry/spec/visibility and publication snapshot shape/history remain unchanged by source review. Do not add backend integration tests, deploy, publish, or create fixture data solely to reach removed insertion paths.

## Observed outcomes — 2026-10-20

1. Removed measurement machinery throughout source, package exports, and the unused Pretext dependency. Both updateBrick call sites now send exactly `{ brickId, moduleId, state }`. Placement geometry, state/spec revision guards, generation supersession, and publication serialization were preserved by source review. Unrelated Storybook/README WIP was preserved.
2. Identified and deleted only the matching connected App SQLite database and discovery identity in the existing Chrome profile. Deleted the exact local `sys_qrk_sh_1` backend directory without a backup. Restarted the same backend and observed `Ready on http://127.0.0.1:8788/ (system spec accepted)`.
3. Deleted the exact Library standalone database in Chrome while retaining `localforage`, `__next_debug_channel`, cookies, and preferences. Fresh Library initialized successfully. App initialized with the existing Clerk login. An ordinary local unpublished **Preview verification** site/page was created through the existing UI to inspect Studio; no brick fixtures or insertion functionality were added.
4. Inspected all ten Library modules and both renderers at all four widths: each yielded 360/720/1080/1440px widths and nonzero, content-dependent heights. Inspected both catalogs and Studio's four GitHub Activity comparison rows. Catalog widths switched between 360px and 720px; Cards and placeholders worked, then their original values were restored.
5. Fixed the authored factory validator exposed by these new paths: authored state is already decoded, so its existing validation now uses `Schema.toType(makeEffectSchema(...))`, consistent with defaults/forms/component props. Fixed Mapbox's unlayered positioning rule overriding the map's absolute positioning with `absolute!`; all eight map containers/canvases now render at 200px height across the four widths, with map tiles, markers, and controls visibly rendered. Link wraps at content-dependent heights. Native calendar scrolling moved from 271px to 0 and back, and its corresponding edge masks changed correctly.
6. The first real Generate request displayed loading and a provider `generate-failed` error for an expired API key. The user refreshed the credential, and only API was restarted. A subsequent generated Spec was rejected for missing leaf `children` arrays; retrying with an explicit schema prompt succeeded. Generated JSON appeared, and each JsonRender preview rendered two calendars at 282px height across widths 360/720/1080/1440px. Authored preview markup remained byte-for-byte unchanged. Credential values were not read or printed by the agent.
7. The in-app browser's exact legacy Library database deletion was initially blocked by an old SharedWorker despite navigation away and closing its tab. Browser-tool reconnection did not release it. At that 15.0.1 snapshot, installed SDK source exposed no shutdown/storage-close RPC and its VFS connection had no versionchange handler. Automatic browser approval review rejected opening `chrome://inspect` because only HTTP(S) URLs are allowed; no inspector workaround was used. An attempt stopped only Library, preserving API/App/backend/Web, and reloaded the same origin to the Web fallback without a Library owner. Awaiting exact `indexedDB.deleteDatabase` timed out after 20 seconds; a subsequent inventory still contained the target and unrelated `__next_debug_channel`, which was preserved. Seeing the updated UI did not establish the approved discard. Library was left paused pending a desktop app restart; final resolution is recorded in outcome 9.
8. Saved-brick fallback and Save/Cancel/Admin behavior were source-reviewed, not runtime-tested: fresh walls have no existing bricks. No test suite, check gate, backend integration test, deployment, or publication was added/run. Documentation and the existing glossary were reconciled; no glossary change or ADR is needed. Screenshots: `/Users/morgs32/.codex/visualizations/2026/10/20/01a15a1b-6cb1-7851-844d-909de43b84b4/plan031-previews.jpg` and `/Users/morgs32/.codex/visualizations/2026/10/20/01a15a1b-6cb1-7851-844d-909de43b84b4/plan031-generated-previews.jpg`.
9. After the user restarted the desktop app, the in-app origin inventory contained only the current `/zerospin/standalone/a81469a4c03922f52c2838d1813e889bede10d5591dbf8c11646fba36fc5fd2d` partition (version 6) and `__next_debug_channel` (version 1). The exact legacy `c2ea…` target was already absent. Explicit `indexedDB.deleteDatabase` for that exact full legacy name returned success; the following inventory retained the same current partition and debug database. The already-running Library server from intervening work was reused. Reloading its existing route then displayed all four Component/JsonRender comparisons at 360/720/1080/1440px, each 133px high, with Prompt/Generate/JSON controls and no session error. This establishes successful exact legacy discard and current-partition readiness; the preserved 19.0.0 partition was reopened, not deleted or freshly seeded. Earlier fresh Chrome Library/App/backend initialization and generation observations remain separate verification evidence. Final screenshot: `/Users/morgs32/.codex/visualizations/2026/10/20/01a15a1b-6cb1-7851-844d-909de43b84b4/plan031-complete.jpg`.

## Remaining work

None.
