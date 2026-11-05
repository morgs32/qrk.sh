# 049 — Live size feedback while resizing

**Status:** Complete; verified and archived on 2026-11-02.

## Problem and agreed behavior

1. Pointer resizing already previews one Row locally and stages an existing V8 sizing command on a changed release. It currently shows no numeric feedback. Add one compact readout above the active grip during mouse, pen, and touch resizing.
2. During width resizing, show both neighboring Bricks' actual visible surface widths in left-to-right order: `240 px | 180 px`. During height resizing, show the Row's actual shared surface height: `120 px`. Exclude gap padding and surrounding layout insets.
3. Round only the displayed numbers to whole pixels with `Math.round`. Preserve fractional preview geometry, width weights, height measurement, no-op comparisons, and submitted values.
4. Show the readout after the existing 3px drag activation threshold. A stationary press, sub-threshold motion, and double-click/double-tap automatic-height reset do not flash it. Keep it visible during an activated but minimum- or content-constrained gesture, showing the actual unchanged sizes.
5. Hide it on release or cancellation, together with the existing local preview. Reuse all existing cancellation and Row-invalidation behavior. Queued measurements must not restore it after cleanup.
6. The readout is noninteractive, pointer-inert, unfocusable, and contributes no layout space. Preserve the capture grip's DOM identity, hit area, native-drag suppression, Brick selection, focus, menus, movement, and insertion shadows.

## Measurement and rendering

1. Keep gesture identity, measurement, scheduling, and cleanup inside `useWallResize`. Extend its inferred return value with transient readout data containing the active Row/grip identity and measured values. Use inline inferred shapes; introduce no named types, exported geometry utilities, new hook/component abstraction, dependency, or separate Wall store.
2. Measure the active surfaces after the preview has committed, in the hook's existing layout phase. Measure both adjacent surface widths instead of interpreting `widthWeight` as a live DOM width. Measure rendered height instead of displaying the requested `preview.minHeight`: natural content may keep the Row taller.
3. Keep measured feedback separate from the sizing draft. It must never feed rounded values or feedback measurements back into width weights, requested minimum height, or command construction. Preserve the existing final-position application and final rendered-height measurement before staging.
4. Guard readout-only state updates by the same active gesture identity, activation, non-finishing status, and changed display data so the extra layout measurement cannot create a render loop. Reuse the existing gesture-lifetime Row `ResizeObserver` to refresh feedback if natural content changes the active Row's size between pointer events; retain its available-width cancellation rule. Add no second animation loop or observation cache.
5. Clear feedback through the existing `clearGesture` path, including unmount, Escape, pointer cancellation, unexpected capture loss, blur, native dragging, Wall/breakpoint changes, and active-Row membership, variant, saved-sizing, gap, or available-width changes. Apply the same render-time validity guard as the preview, so stale identity cannot attach feedback to a changed Row. Changes to other Rows continue to leave the active gesture intact.
6. Render the readout inline at the matching existing grip in `WallEditor`. For width, center it above the visible divider seam, accounting for the hitbox beginning to the right of that seam. For height, center it above the bottom grip. Keep it in the existing Row overlay/scroll context and use the established typography and colors, with tabular numerals and no wrapping.
7. Ensure the active grip/readout stays visible when capture carries the pointer outside the hovered Row. Desktop hover opacity must not hide active feedback. Keep the existing hitboxes and seam markers unchanged; the readout's visual bounds must not become pointer targets or change surface measurements.

## Annotated examples

1. A divider produces measured widths of `249.25px` and `214.75px`. The readout shows `249 px | 215 px`; the existing command still receives the complete Row's fractional weights in saved Placement order.
2. A height drag requests a 200px minimum, but Article content keeps the visible Row at `347.5px`. The readout shows `348 px`. Existing release behavior still saves the measured `347.5px` when the visible result changed, or sends nothing when the visible height is unchanged.
3. A constrained pair cannot trade width. After activation, its readout remains at the measured minimum widths. Release clears it without creating a sizing command.

```ts
// Illustrative formatting in WallEditor; the hook owns measurement.
const label =
  readout.kind === "width"
    ? `${Math.round(readout.leftWidth)} px | ${Math.round(readout.rightWidth)} px` // 1. Left/right visible surfaces.
    : `${Math.round(readout.height)} px`; // 2. Actual rendered height.
// 3. Render label in a pointer-inert span; formatting never changes sizing inputs.
```

## Test seams and verification

1. Extend the existing command-backed `PointerResize`, `PointerResizeWithGaps`, and `PointerResizeCancellation` Storybook plays. Reuse their actual mock-session journal diagnostics and scoped capture stubs, restoring stubs in `finally`. Add no fake commit callback or separate test harness.
2. Across sm/md/lg/xl and both zero and 12px gaps, assert exactly one readout at the active grip, matching rounded surface rectangles. Cover fractional width/height movement, neighbor ordering, minimum-width overflow/clamps, and unchanged gestures. Assert no readout before activation or after a stationary tap/reset.
3. Pause the content-limited upward height drag before release. Assert that the readout matches the actual taller surface, even though the requested minimum is smaller. Temporarily grow the existing Article fixture's intrinsic content height within the play and restore it in `finally`; verify feedback refreshes without another pointer move or a sizing command.
4. Keep the journal assertions: no commands from the resize gesture during movement or cancellation; exactly one existing command with the expected fractional payload after a changed release; none after a geometry no-op. Account separately for fixture controls that intentionally stage their own commands to trigger Row changes. Retain the case where release coordinates differ from the last preview, verifying final geometry and immediate readout removal.
5. Add absence assertions to the existing cancellation paths, including Escape before a queued frame, capture loss, blur, saved Row changes, membership changes, breakpoint changes, and unmount. Later frames or observer callbacks must not resurrect feedback. Preserve the existing sibling-Row noncancellation case.
6. Use the unstubbed `PointerResizeNative` fixture to verify genuine mouse capture survives readout updates and release outside the grip/Row. Check feedback remains visible outside Row hover and cannot intercept movement/menu targets on short Rows. Synthetic plays cover mouse, pen, and touch. Plan 048 retains its separately pending manual native-touch check; include readout legibility in that manual pass when available and record which native inputs were actually exercised.
7. Recheck affected existing Placement Brick, Shadow Brick, Row Reorder With Gaps, and Cross Row Moves With Gaps scenarios. Capture the resulting readout UI. These mock-session tests establish UI/authored behavior, not actor authentication, Durable Object delivery, or production reconciliation.
8. Run the focused App TypeScript check (`pnpm exec tsc --noEmit --incremental false -p apps/app/tsconfig.json`), App production build (`pnpm nx run @qrk.sh/app:build`), and formatting checks for changed source. Use the repository's installed tooling; do not add dependencies or run provider requests.

## Planned files

Legend: `+` create; `~` modify. Reconcile the glossary after implementation; edit it only if the implemented terminology changes its existing definitions.

```text
/Users/morgs32/GitHub/qrk.sh/
├── apps/app/
│   ├── modules/lib/wall/
│   │   ├── ~ useWallResize.ts
│   │   └── ~ WallEditor.tsx
│   ├── modules/~ bricks.css
│   └── components/~ WallEditor.stories.tsx
└── wiki/
    ├── plans/+ 049-plan-wall-resize-readout.md
    ├── ~ brick-layout-conventions.md
    └── ~ glossary.md (if needed after reconciliation)
```

## Scope and rationale

1. Actual visible pixels were chosen over width percentages or saved weights so feedback stays meaningful when module minimums and natural content constrain sizing. Whole-pixel labels stay readable while fractional sizing remains intact.
2. One readout above the active grip was chosen over separate labels inside each Brick. It follows the current interaction and disappears with that gesture, without adding persistent controls or obscuring every Brick.
3. Extend the existing hook and inline grips. Existing V8 commands, models, session declarations, publication snapshots, and package pins remain unchanged. The [Wall-owned layout ADR](../../adrs/001-wall-owned-layout-tree.md) and [pointer resizing conventions](../../brick-layout-conventions.md#pointer-resizing) continue to govern ownership and geometry.
4. Keyboard resizing, numeric inputs, minimum-limit indicators, reset/equalize-width actions, new Auto controls, auto-scroll, Zustand, floating portals, framework changes/releases, storage resets/backfills, and deployment are outside this change.

## Delivery and documentation

1. Preserve concurrent work and storage during implementation. Keep [Plan 048](./048-plan-wall-pointer-resizing.md)'s manual native-touch verification status accurate; this plan does not complete it by inference.
2. After implementation and verification, reconcile the existing sizing glossary and update Brick layout conventions with the actual readout behavior. Do not change the glossary or create an ADR during planning. Create an ADR only for an implemented decision that is hard to reverse, surprising without context, and the result of a real trade-off; ordinary readout presentation is not expected to meet those criteria.
3. Record verification evidence and any remaining gaps, open a ready-for-review PR, and archive this plan only when its implementation and required verification are complete. Preserve the filename and repair links on archival.

## Implementation and verification evidence

1. Added fractional DOM surface measurements to the existing hook's gesture-owned readout state. The layout phase measures after preview commit; the existing Row observer refreshes intrinsic height changes. Activation, gesture identity, finishing, equality, and render-validity checks prevent stale labels and feedback loops. Sizing drafts and command construction remain separate and unchanged.
2. Added inline readouts above the existing grips, with whole-pixel display, tabular text, pointer-inert positioning, and active visibility outside desktop hover. Capture spans, hitboxes, seam markers, and native drag behavior retain their identity and geometry.
3. Frozen dependency installation, focused App TypeScript, App production build, changed-source formatting, and diff whitespace checks passed. Existing exact package pins were preserved. Build output is recorded in `/private/tmp/plan049-build.log`.
4. `PointerResize`, `PointerResizeWithGaps`, and `PointerResizeCancellation` passed in Storybook. The first two cover all four breakpoints, actual rounded rectangles, fractional payloads, minimum clamps/overflow, content-limited height, intrinsic Article growth/removal without another pointer move, no-op/reset absence, and release at a different final position. Cancellation checks verify cleanup and stale-frame fencing while preserving sibling-Row noncancellation. Actual mock-session journal assertions remain in place.
5. Existing Placement Brick, Shadow Brick, Row Reorder With Gaps, and Cross Row Moves With Gaps stories passed. The focused read-only correctness review found no actionable defects in measurement, cleanup, rendering, capture identity, or story assertions.
6. Unstubbed native mouse input verified capture and visible feedback outside the Row: widths `[232, 232, 232]` became `[272, 192, 232]`, displaying `272 px | 192 px`. A keyboard-triggered journal read during the held pointer showed zero sizing commands; outside release recorded exactly one complete Row command and removed the readout.
7. Native height movement rendered all three surfaces at `110.25px` while the readout showed `110 px`. No height command was present during movement. Releasing at a different final position saved `125.5px` once and removed the readout. A constrained native drag showed `64 px`; menus and dragging from the short Row's Move-button edge still worked, with no additional sizing command from movement. Width and height UI captures were saved with this chat's artifacts.
8. Updated Brick layout conventions and reconciled the existing glossary. Its Row, Placement, width-weight, and Row-minimum definitions remain accurate; no glossary edit or ADR was warranted. Implementation is isolated in `/private/tmp/qrk-plan049` on `codex/wall-resize-readout`, preserving the original checkout, concurrent work, live App/browser state, and storage. Native touch remains the user's separate Plan 048 manual check; synthetic mouse, pen, and touch coverage passed here.

## Remaining work

None for Plan 049.
