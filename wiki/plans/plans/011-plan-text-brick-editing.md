# 011 — Inline Text editing in the standalone wall

**Status:** Implemented; active pending authenticated Studio and upload verification.

## Summary

Replace the separate article with editable Text bricks. Every wall operation executes immediately in the existing standalone session and uses its existing local backup. Library's four breakpoint panes share that session. Page Settings and Site Settings retain server persistence; uploads retain existing endpoints. Server-side wall Save is a future feature.

## Ordered implementation

1. Selectively remove article-layout V2 additions, article rendering, Compose, article settings/draft fields, `updatePageArticle`, and `article`/`pageType` declarations and payloads. Preserve unrelated WIP, metadata Save/Cancel, full-page previews, drawers, and mounted wall/session identity. Use one full-width wall and scroll root. No migration or automatic storage reset.
2. Preserve per-user/site/page Studio session keys and Library's shared session, backups, and restoration. Stage changed documents immediately with `updateBrickState`; no throttle or additional storage. Suppress unchanged documents. Report failures, retain failed edits while mounted, and retry on the next edit or editing exit. Staging success is distinct from backup durability.

   ```ts
   // 1 — Tiptap has applied the edit synchronously.
   // 2 — Commit the complete document to the shared local session.
   const result = stageCommand({
     session,
     contractName: "updateBrickState",
     payload: { brickId, moduleId: "text", state: { content: document } },
   });
   // 3 — Advance the successful baseline only on Success; report Failure.
   ```

3. Move the used Tiptap controls/extensions/styles/dependencies into Library and expand TextEditorControl. Preserve document formatting, nested tasks, images/uploads/resizing, undo/redo, and block dragging. Remove article hero styling. Keep editor identity across content echoes and editability changes. External content applies without persistence; failed local edits are retained. Null is an empty document with a nonpersisted placeholder. Catalog/detail remain read-only.
4. Own one active `{ brickId, breakpoint }` above Library's four panes and in Studio's persistent wall host. Clear activation on breakpoint change. Activate by double-click or Edit text, closing the drawer through the existing base route. Exit on outside interaction or Escape after popover dismissal; toolbar/popovers/file-picker are part of editing. Portal the anchored responsive toolbar outside clipping/measurement. Disable wall drag/drop/resize while editing; Text otherwise resizes horizontally only.
5. Observe natural border-box content height including padding and contained margins at actual width. Batch into an animation frame; fold changed heights through makeCollisionResolvedLayout and persist one full visible layout. Suspend writes during grid gestures; remeasure after the final gesture command. Disable Compact during gestures. Hidden/outgoing panes never write geometry. Retry geometry on a later measurement after failure, without marking it committed.

   ```ts
   // Eight square-cell columns with zero margins.
   const rowHeight = gridWidth / 8;
   // Round up, permit shrinking, retain at least one row.
   const requiredRows = Math.max(1, Math.ceil(contentHeight / rowHeight));
   ```

   ```text
   720px wall → 90px rows.
   205px content → 3 rows; 175px content → 2 rows.
   Growth displaces collisions. Shrinking retains gaps; Compact closes them.
   ```

6. Preserve authenticated site-scoped Studio uploads and Library /upload, progress, cancellation, formats, validation, and 5 MiB limit. Cancel on editing exit/breakpoint change/deletion/unmount and reject late insertion. Update Studio/Library docs and Text descriptor. Mark 010 superseded.

## Interfaces

Extend BrickWall with controlled Text activation, active-pane status, and upload capability, preserving existing activation/error callbacks. Add TextBrickEditingContext with an inline shape for editability, activation, document change, natural-height reporting, and uploads. Extend TextEditorControl for these behaviors. Do not introduce a generic editing framework or server Save contract.

## Verification

1. Extend Studio browser checks for activation, drawer closure, focus/popovers/file-picker/Escape, formatting, block and image gestures, previews, selection/undo, immediate commands, failures, reload after backup readiness, and absence of Compose/server wall writes.
2. Verify growth/shrink, rounding, width changes, images/fonts, collision chains, retained gaps, Compact, no gesture/observer races, and shared content/independent breakpoint geometry.
3. Update backend checks for reduced contracts and article removal while preserving ownership checks.
4. Run affected Nx tsc/lint, Studio/Library builds, Studio test:e2e and backend test:workerd, scoped formatting, and diff checks. Never add/modify/run Library tests. Manually check its four panes.
5. Require real server readiness and authenticated identity for browser verification. Record blockers, never reset storage automatically, and keep this plan active until verification completes.

## Exclusions

No server wall Save, synchronization, hydration, conflict protocol, article migration, discard confirmation, or new route. Content is shared across breakpoints; geometry/visibility/spec are breakpoint-specific. Future Save must include the complete wall, additions/deletions, content, and placements.

## Verification record — 2026-09-29

1. Passed affected Studio, Library, and backend `tsc` and `lint`; Studio production build; Library package and standalone application builds. Cached Nx dependency restoration left missing backup-worker output, so the complete graph was rebuilt with `--skip-nx-cache`. Subsequent scoped checks excluded dependency rebuilds and preserved the verified artifacts.
2. Passed backend `test:workerd`: 3 files, 18 tests. Reduced page declarations and creation fixtures match; metadata ownership checks remain. No Library tests were added, changed, or run.
3. Passed Studio Chromium shell `test:e2e`: 4 checks, including Compose returning not found. Authenticated editor checks remain blocked: the existing Chrome identity reaches `node-offline-identity-missing` at `/morgs32`; no authenticated Playwright editor/storage fixture is configured. Storage was not reset.
4. Manually verified standalone Library on a ready local server at port 4101, using its existing session/backup mechanism: catalog placement, shared documents across all four mounted panes, exclusive editing, breakpoint exit, empty placeholders, growth/shrinkage, rounding (368.75px content → 9/5/3/3 rows at 360/720/1080/1440px), inactive-pane geometry isolation, undo/redo, formatting, link-popover Escape, block reordering, image resizing, read-only image controls, horizontal wall resizing, collision displacement, retained gaps, Compact, and restored local documents after backup readiness/reload. DevTools command rows showed local-only staging with admission/execution skipped.
5. Browser checking found and fixed the grid's synthetic external-drop gesture leaving measurement/Compact locked. Text activation also releases when its brick is deleted. Editor node-view changes now run after the React commit to avoid lifecycle flush warnings.
6. File-picker activation retained editing. Automated file selection was blocked by the Chrome extension's file-access permission; no permission was changed. Actual upload completion/progress/cancellation and late-completion browser checks remain pending, as do authenticated Studio failure injection, navigation, and full editor acceptance. The preserved endpoint callbacks and cancellation guards were typechecked; do not treat these pending browser cases as passed.
7. This is a direct schema/feature removal. Existing storage containing the removed V2/article contract is potentially incompatible; no migration, compatibility version, reset, or deletion was introduced. The observed Studio blocker is identity initialization, so compatibility of that existing server storage could not be assessed.
