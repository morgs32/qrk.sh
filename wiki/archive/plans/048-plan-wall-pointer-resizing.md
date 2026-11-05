# 048 — Pointer resizing with local Wall previews

**Status:** Complete. The final browser-generated touch verification passed in Chrome on 2026-11-05; historical mouse and synthetic-play evidence remains scoped below.

## Summary

Implement `useWallResize` together with production resize grips. Keep one Row's temporary sizing in local React state, then stage one existing V8 command when a changed gesture finishes.

Scope includes mouse, pen, and touch. Keyboard resizing, numeric controls, auto-scroll, and Zustand remain subsequent work.

## Resize behavior

1. **Width:** grips at internal Brick dividers trade width between adjacent Bricks. Other Bricks retain their visible widths. Clamp both neighbors to their module minimums; a pair with no available movement produces no change.
2. **Height:** a grip at the Row's bottom changes its visible height while respecting content and module minimums. Save the resulting visible height as `minHeight`. An unchanged visible height preserves the original setting and sends no command.
3. **Automatic height:** double-clicking or double-tapping the height grip stages `minHeight: null`. An already-automatic Row sends no command.
4. Use grip-only hit areas without adding layout space. Reveal grips on desktop hover; keep them visible on devices without hover. Preserve existing menu, move, content, selection, and focus behavior.
5. Capture the primary pointer. Releasing outside the grip completes the gesture. Escape, pointer cancellation, unexpected capture loss, window blur, unmount, or Wall/breakpoint changes discard it.
6. Cancel when the Row's ordered membership, variants, saved sizing, gap, or available width changes during dragging. Other Rows' data changes do not cancel it.

## Hook and rendering

1. Add `useWallResize`, called once inside `WallEditor`, receiving `wallId`, resolved `sections`, `brickGap`, `wallRef`, and a native-drag disable flag. It owns pointer capture, measurements, animation-frame scheduling, cleanup, and command staging. Return `preview`, `startWidthResize`, `startHeightResize`, and `resetHeight`.

   ```ts
   const resize = useWallResize({
     wallId, sections, brickGap, wallRef, disabled,
   }); // 1. One local gesture owner.

   resize.startWidthResize({
     event, rowId, leftPlacementId, rightPlacementId,
   }); // 2. Capture current visible geometry.

   resize.resetHeight({ rowId }); // 3. Restore automatic height through the existing command.
   ```

2. Snapshot visible surface widths at gesture start, excluding gap padding. For pointer delta `d`, clamp it to `[leftMinimum − leftWidth, rightWidth − rightMinimum]`. Add it to the left width and subtract it from the right.
3. Derive the complete Row's preview and submitted weights from those measured surface widths. This preserves other visible widths despite existing minimum-width clamping; their numeric weights may change. Preserve saved Placement order.
4. Coalesce pointer movement to one preview update per animation frame. Use a 3px drag activation threshold and a 0.5px geometry no-op tolerance. Keep fractional values without grid snapping.
5. On release, cancel queued animation frames and apply the final pointer position. For height, measure the final rendered surface height in the layout phase before staging. Then stage once and clear the preview together. Zerospin refreshes the mounted live-query store synchronously, so no confirmation waiter or second optimistic cache is needed.
6. On staging refusal, clear the draft and use existing session error reporting. Zerospin retains ownership of later canonical refusals and reconciliation. Suppress resize grips during native drag/drop and prevent grips from initiating Brick movement.
7. Keep geometry and gesture implementation private to the hook, using inferred or inline shapes. Add no exported math utilities, named types, or Row-rendering abstraction.

## Verification

1. Extend existing command-backed Storybook fixtures across all four breakpoints, including zero-gap and gapped cards. Cover adjacent-only width changes, minimum clamps/overflow, content-limited height, automatic reset, unchanged gestures, and preview-to-query handoff.
2. Read the actual mock-session journal through story-only diagnostics: assert zero sizing commands during movement and cancellation, and exactly one with the expected payload after a changed release or reset.
3. Exercise Escape, capture loss, blur, Row changes, breakpoint changes, and unmount. Verify that cancelled animation frames cannot restore stale previews.
4. Use story-scoped pointer-capture stubs only for synthetic play tests, restoring them afterward. Separately verify genuine pointer capture and release outside the grip with native browser input on an unstubbed fixture, including touch behavior.
5. Recheck Brick editing, menus, movement, insertion shadows, and short-Row control hit targets. Run App typecheck/build and affected Storybook checks; capture the resulting UI.

## Files and delivery

Legend: `+` create; `~` modify.

```text
apps/app/
├── modules/lib/wall/
│   ├── + useWallResize.ts
│   └── ~ WallEditor.tsx
├── modules/~ bricks.css
└── components/~ WallEditor.stories.tsx
wiki/
├── plans/+ 048-plan-wall-pointer-resizing.md
└── ~ brick-layout-conventions.md
```

At implementation start, record this plan in the planning tree. After verification, reconcile the existing glossary and affected documentation, archive the completed plan, and open a ready-for-review PR.

Existing V8 commands, models, and session declarations remain unchanged. Preserve concurrent work and storage; no framework release, reset, backfill, or deployment is included.

## Implementation and verification

1. Added the private `useWallResize` gesture owner and production divider/bottom grips. Width previews derive the complete Row's weights from measured surfaces; height release measures the final rendered surfaces before staging. Existing V8 declarations, dependencies, and storage remain unchanged.
2. Added journal-backed `PointerResize`, `PointerResizeWithGaps`, and `PointerResizeCancellation` plays, plus an unstubbed `PointerResizeNative` fixture. The first two cover all four breakpoints, fractional release geometry, touch double-tap reset, and short-Row hit targets. Capture stubs restore in `finally`.
3. Verified frozen installation, focused App TypeScript checks, App build, and the three resize plays. Existing Placement Brick, Shadow Brick, Row Reorder With Gaps, and Cross Row Moves With Gaps plays pass. These mock-session checks do not establish actor authentication or production delivery behavior.
4. Verified native mouse capture/release outside the grip: widths `[232, 232, 232]` became `[274, 190, 232]`, with one complete Row command and the third Brick unchanged. Native height changed from 90px to 133px and staged 133; double-click staged `null` and restored 90px.
5. Native short-Row input exposed a divider hit area overlapping a Move-button corner. The corrected 24px hit area sits to the right of the seam; the visible stroke stays on the seam. Native drags from the formerly covered button edge now move the Brick without staging sizing commands, with both 0px and 12px gaps. A subsequent outside-grip resize still stages the correct complete Row payload in its current order.
6. Reconciled layout conventions and the existing sizing glossary. This reversible local UI behavior does not require an ADR.

## Final browser-generated touch verification — 2026-11-05

1. Continued from merged main `ac9f3d7543f4909c33de7c10e7d8da6ce87d0345` in an isolated worktree. The remaining input check was current; no implementation change was needed. Used the existing configured URL `https://storybook.qrk.localhost/iframe.html?id=app-studio-wall-editor--pointer-resize-native&viewMode=story` and restarted its existing Storybook service. App/backend storage and production were untouched.
2. The in-app browser still rejects `Input.dispatchTouchEvent`. Opening the existing Chrome profile made its browser connector available. Chrome accepts `Input.dispatchTouchEvent` through its direct CDP connection. Device emulation was inspected using DevTools; DevTools was then closed before the successful direct-input checks. These were browser-engine touch gestures on the unstubbed fixture, not synthetic DOM `dispatchEvent` / Storybook `fireEvent` calls, capture stubs or injected application state.
3. Selected md (720px). The three initial Brick surfaces measured `[232, 232, 232]`, height 90px. A touch began at `(627, 325)` on the width grip, moved through `(650, 360)` to `(669, 400)`, and released outside the grip. During movement the actual grip reported `hasPointerCapture(5)` and the draft widths were `[274, 190, 232]`. After touch release, the existing Read resize journal control reported exactly one `setRowWidthWeights` command with those ordered weights; the third Brick stayed 232px and the active draft cleared.
4. A touch began at `(737, 368)` on the height grip and moved to `(820, 411)`, outside the grip. During movement the real grip reported `hasPointerCapture(6)` and all three surfaces measured 133px. Release added exactly one `setRowMinHeight` command with `minHeight: 133`.
5. Two browser-generated touch taps at `(737, 411)` added one `setRowMinHeight` command with `minHeight: null`, restoring all three surfaces to 90px. A further touch height drag followed by browser `touchCancel` cleared the preview, restored 90px and added no command: the journal remained at three commands total.
6. Evidence: [observed journal/query/geometry JSON](/private/tmp/qrk-plan048-native-touch-evidence.json) and [resulting fixture screenshot](/private/tmp/qrk-plan048-native-touch-proof.png). The recorded journal and the real pointer-capture observation establish the browser touch path. They do not claim physical-device validation, hardware/browser coverage, actor authentication or distributed delivery.
7. Restored the temporary DevTools dimensions, device-toolbar visibility and bottom docking, disabled device emulation and closed DevTools. No source, schema, registry, dependency, storage, glossary or ADR change was needed. No tests, fixtures or runners were created; the existing fixtures and earlier check results are preserved. Instagram account verification remains deferred.

## Remaining work

None.
