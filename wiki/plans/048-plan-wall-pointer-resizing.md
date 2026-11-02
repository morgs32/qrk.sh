# 048 — Pointer resizing with local Wall previews

**Status:** Approved; implementation in progress.

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

## Remaining work

1. **Native touch verification is blocked by browser capability.** The available in-app browser explicitly rejects `Input.dispatchTouchEvent`. Synthetic touch dragging, fractional final release, double-tap reset, and automatic no-op checks pass, but genuine touch capture/release outside the grip remains unverified. Use a touch-capable browser connection or manually check `PointerResizeNative` with touch input.
2. After that required native check passes, record its evidence, set remaining work to None, and archive this plan. Keep it active until verification is complete.
