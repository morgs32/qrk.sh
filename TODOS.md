# TODOs

## Brick form and Admin route verification

- [x] Verified form-only rendering, successful Article/JSON Save, Cancel, validation/errors and failed-Save draft retention, empty no-form body, exact null restoration, Admin sections and visibility, breadcrumb/pencil navigation, direct Admin reload, Back/Forward, and route draft discard. Generated updates stage `updateArticleSpecAtBreakpoint`; API now applies edit patches to the supplied current spec. Standalone ownership releases on pagehide and reacquires on visible pageshow; final reload and subsequent writes passed after rebuilding dependencies and restarting Next. Library/API typecheck and lint, browser build/typecheck, and upstream browser lint passed. No Library tests were added or run. Original Article content and all four placements were restored; verification bricks remain hidden.

## Library drawer Article editing

Historical checks from [archived plan 014](wiki/archive/plans/014-plan-library-drawer-text-editing.md).
Tiptap-specific controls and inline editing are superseded by
[the Meowdown replacement](wiki/archive/plans/022-plan-article-meowdown.md), which records
completed native editor verification. Library tests must not be written or run.

- [x] Verified native Redo, block dragging, image resizing, and that Article Cancel clears canceled undo history after reopening in plan 022.
- [ ] Verify clicking the wall while a draft is dirty leaves it intact, activating the current brick route explicitly reopens the drawer, and deleting the brick discards drafts.
- [ ] Verify a dirty Article or JSON draft survives committed-state echoes, including an older echo after the other section saves.
- [ ] Force failed Article and JSON `updateBrickState` staging and verify each section retains its draft, stays open, and shows its own error.
- [ ] Verify Generate spec and visibility actions remain independent of unsaved Article and JSON drafts.

## App and Library drawer

Deferred checks from [archived plan 007](wiki/archive/plans/007-plan-shared-bottom-drawer.md) and [archived spec 012](wiki/archive/specs/012-spec-persistent-overlay-drawer.md).

- [ ] Recheck the Library `queryDb`/`db` contract-guard blocker recorded in plan 007. If it remains, resolve it in separate work; rerun Library build and manually verify a module-preview drop creates a brick and placed-brick navigation works.
- [ ] On a ready Library app, manually check its drawer, including placement and navigation.
- [ ] With valid Playwright storage state and an existing editor URL, run the complete affected App drawer, modules, and brick-detail suites across configured browsers. Check persistent shell identity, route-to-route navigation, Back/Forward and interrupted history, focus, reduced motion, and behavior without View Transitions.
- [ ] In the authenticated App editor, check the remaining drawers and Back/Forward navigation; visit and refresh the old `/compose` URL to confirm the not-found screen. This carries the live navigation check from [archived plan 004](wiki/archive/plans/004-plan-remove-compose.md).

## App modules naming

Deferred checks from [archived plan 008](wiki/archive/plans/008-plan-modules-naming.md).

- [ ] With authenticated App Playwright fixtures, run the catalog, detail, drawer, grid, and history checks. Verify placed-brick navigation back to module detail and shell identity/history behavior.

## Article uploads temporarily disabled

[Plan 016](wiki/archive/plans/016-plan-disable-text-uploads.md) records the implementation and passing typecheck, lint, and manual browser checks. Uploads remain disabled inside Article; existing images and editing controls remain supported.

- [ ] Implement future Article uploads inside the module without application upload callbacks, request tracking, or upload-specific Save gating. Warn before proposing new module-specific application coupling.

## App Article editing and uploads

Historical checks from [archived plan 011](wiki/archive/plans/011-plan-text-brick-editing.md).
Current Article editing uses the shared module form in the detail drawer;
the old inline editor and immediate staging no longer apply. Native Markdown
checks passed in [archived plan 022](wiki/archive/plans/022-plan-article-meowdown.md).

- [ ] When module-owned Article uploads are implemented, verify real completion, progress, cancellation, and late-completion rejection in the supported editors, including exit/deletion cases. Article uploads are currently disabled; do not restore application-owned upload wiring. Historical upload verification remains in the archived plans.

The approved local Markdown cutover preserves old stores and starts fresh;
legacy Article JSON compatibility is intentionally outside scope.

## Fixed-width breakpoint walls

Deferred checks from [archived plan 013](wiki/archive/plans/013-plan-fixed-width-breakpoint-walls.md).

- [ ] With an authenticated App editor, manually review fixed widths and centering, mounted wall identity, transition direction/reversal and reduced motion, selection fallback/recovery, below-360px behavior, and native drag/resize/drop cancellation and cleanup. Automated suites are deferred under root `AGENTS.md`.
- [ ] Verify drawer anchoring and scroll after drag, Article activation and exit across breakpoint changes.
- [ ] Manually verify Library gesture deferral, cancellation, drop, resize, scroll, and transition behavior across breakpoint changes. Do not write or run Library tests.

## Per-breakpoint placement sizes

Deferred acceptance from [archived spec 003](wiki/archive/specs/003-spec-breakpoint-default-placement-size.md). Do not write or run Library tests.

- [ ] In a ready Library app, drop a module at XL from the filmstrip and module detail, including a generated spec. Compare all four new placement sizes with their declared or measured preview defaults and check that a drag waits for all four sizes.
- [ ] Repeat from the App module drawer in an authenticated editor. Check that the drop X/Y starts at the chosen grid cell, subject to bounds and collision resolution, and that existing bricks keep their geometry.
- [ ] Confirm a stale visible-layout snapshot rejects the drop before mutation.

## Placement layout constructors

Deferred verification from [archived spec 001](wiki/archive/specs/001-spec-placement-layout-output.md). Do not write or run Library tests.

- [ ] Inspect `makeCompactLayout` and `makeCollisionResolvedLayout` outputs and their add/show/compact callers for exactly `{ i, x, y, w, h }`, fresh objects, unchanged inputs, and preserved geometry and neighbor handling.
- [ ] Check empty compaction plus incoming-item insertion and replacement paths.

## Article hard rename verification

- [x] Verified a new Article drop, drawer edit/Save, generated spec updates through `updateArticleSpecAtBreakpoint`, and manual grid resizing without automatic height adjustment. The complete example retains its heading, paragraphs, and four ordered items. Library build and Library/App typecheck and lint passed; final Library/API typecheck and lint also passed. Original configured Article content and geometry were preserved.
