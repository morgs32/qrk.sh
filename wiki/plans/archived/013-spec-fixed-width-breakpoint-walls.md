# Shared fixed-width breakpoint walls design

**Date:** 2026-09-29

**Status:** Approved for planning

## Problem Statement

Studio uses fixed-width previews on some editor routes and a fluid wall elsewhere. Closing a drawer can therefore change the wall's width and effective breakpoint. Library already displays centered breakpoint walls with directional slide transitions.

Switching a breakpoint during a drag or resize can also change the layout underneath the gesture. Breakpoint selection and viewport measurements must continue updating while the displayed wall remains stable until the gesture ends.

## Solution

Studio displays centered walls at **sm 360px, md 720px, lg 1080px, and xl 1440px** throughout the editor. Studio and Library share the existing animation pane and defer displayed breakpoint changes during catalog drags, existing-brick drags, and resizing.

The selected breakpoint represents the latest request. The active breakpoint represents the wall currently displayed. Deferral preserves the active breakpoint while retaining the latest selection and available width.

## User Stories

1. As a Studio editor, I can select md and keep a 720px wall when I close a drawer.
2. As an editor, I see the largest fitting breakpoint when my selection does not fit, and my selection returns when space permits.
3. As an editor, I see the same directional breakpoint animation in Studio and Library.
4. As an editor, I can drag or resize without the displayed breakpoint changing underneath the gesture.
5. As an editor, I can make multiple breakpoint requests during a gesture and see only the latest applicable result afterward.
6. As an editor, I retain the same session and mounted breakpoint walls across breakpoint and drawer changes.
7. As an editor, I receive an insufficient-width message below 360px and recover immediately when enough space returns.
8. As an editor using reduced motion, I see breakpoint changes immediately without sliding.

## Implementation Decisions

1. **Retain the selection policy.** Use the selected breakpoint when it fits; otherwise use the largest fitting breakpoint. With no explicit selection, use the largest fitting breakpoint. Below 360px, resolve to no active breakpoint. Keep selection lifetime, persistence, and toolbar placement unchanged.

2. **Keep viewport ownership in the existing provider.** Observe the available editor region through the existing `ResizeObserver`. Continue recording width changes during gestures. Studio's wall, module previews, brick details, and text editing consume the active breakpoint instead of deriving a breakpoint from a fluid wall measurement.

3. **Extend the existing viewport store for deferral.** Retain `selectedBreakpoint` as the latest request and expose the effective active breakpoint. Use existing wall gesture callbacks and catalog drag state to determine whether a gesture is active. Deferral remains in effect while either source is active. Do not rename the catalog drag store or introduce another store.

4. **Apply requests after gesture completion.** While dragging or resizing, retain the displayed breakpoint even when it no longer fits. Temporary clipping is accepted. On successful completion, finish the existing drop or layout command and gesture cleanup before releasing deferral. On cancellation, release deferral after cleanup. Then resolve the latest selection against the latest width. Do not replay intermediate requests or leave a stale gesture flag after drag-source or editor teardown.

5. **Treat URL integration as future input.** A future route listener can feed the same selection setter while navigation proceeds immediately. This change adds no URL breakpoint, route listener, navigation blocker, or browser-history manipulation. Navigating away from the editor follows normal teardown.

6. **Share the existing animation component.** Extract `LibraryWallPane` into `WallBreakpointPane`, preserving its inline props shape. Add its defining-module package export and build entry. Library's `LayoutBody` and Studio's `Grid` consume it directly. Preserve the 300ms duration, `[0, 0, 0.2, 1]` easing, and direction: larger breakpoints enter from the right; smaller ones enter from the left.

7. **Keep four stable walls mounted in Studio.** Each pane permanently owns one breakpoint and its declared width; all panes share the existing editor session. Only the active pane accepts interaction and writes measured heights. The outgoing pane remains visible during exit; other panes are hidden and inactive. Keep the animation stage full-width and center each wall inside it.

   ```tsx
   // Stable keys retain a separate wall for each breakpoint.
   <WallBreakpointPane key={row.id} /* existing animation props */>
     <BrickWall
       session={session}                    // One editor session.
       wallId={WALL_ID}
       breakpoint={row.id}                   // Permanent pane ownership.
       gridWidth={row.previewWidth}          // Fixed width on every route.
       isActive={activeBreakpoint === row.id} // Interaction and measurement gate.
     />
   </WallBreakpointPane>
   ```

8. **Define transition boundaries.** Initial measurement and reduced-motion changes display immediately. Rapid changes settle on the latest active breakpoint; obsolete completion callbacks cannot hide it. When the effective active breakpoint becomes null, hide all panes and clear outgoing-transition and previous-animation state without unmounting the walls. Recovery displays immediately. During a gesture, this null transition waits until deferral ends.

9. **Preserve editing behavior.** Remove the text-edit wait for fluid wall resizing. Retain drawer closing, upload cancellation, and ending text editing when the active breakpoint actually changes. Update Studio and Library documentation while preserving unrelated WIP.

### Annotated behavior examples

1. **Retained selection:** select md → close drawer → wall remains 720px.
2. **Fallback and restoration:** selected md → available width becomes 600px → display sm → width becomes 800px → restore md.
3. **Latest request wins:** begin dragging at md → request lg, then sm → remain at md until completion → transition once to sm.
4. **Width changes during a gesture:** begin resizing at md → available width drops below 360px → retain md temporarily → finish resizing → show the insufficient-width message → recover to a fitting breakpoint immediately when space returns.

## Testing Decisions

1. Use existing Studio Playwright coverage for drawers, grids, and text editing as the primary automated behavior seam. Do not create, run, restore, or maintain Library tests.
2. Verify all four fixed widths, centering, drawer navigation, selection retention, fallback/restoration, and stable pane/session identity.
3. Verify both slide directions, rapid reversals, initial measurement, reduced motion, and insufficient-width recovery—including entering insufficient width during an animation.
4. Exercise catalog drag, existing-brick drag, and resize separately. Change selection and available width during each; verify the wall remains stable and resolves only the latest request afterward.
5. Verify successful drops commit against the retained wall before switching. Verify cancelled catalog drags, drops outside the wall, and editor teardown do not leave deferral stuck.
6. Check scrolling restoration, drag/resize behavior, text-editor continuity, editing exit on active-breakpoint changes, and upload cancellation.
7. Run scoped Studio and Library typechecking and lint through Nx, and verify the shared package entry builds.
8. Manually verify Library's normal animation remains unchanged and its new gesture deferral follows the same contract as Studio.

## Out of Scope

1. URL breakpoint persistence or navigation blocking.
2. New drag/resize cancellation APIs, dependency patches, or remounting walls to abort gestures.
3. New dependencies, named types, stores, or abstractions beyond the approved shared pane.
4. Changes to session persistence, placement contracts, toolbar locations, or unrelated WIP.

## Further Notes

1. Selection may temporarily differ from the displayed breakpoint during a gesture; this is intentional.
2. Both apps receive gesture deferral and insufficient-width transition reset.
3. No implementation plan or issue-tracker publication is requested.
