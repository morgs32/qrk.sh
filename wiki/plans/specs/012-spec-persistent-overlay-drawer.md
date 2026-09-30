# Persistent overlay drawer design

**Date:** 2026-09-29
**Status:** Implemented; authenticated automated browser verification outstanding

## Problem Statement

Studio and Library animate editor grid rows to make room for their drawers. Studio separately animates a route snapshot. Opening changes editor layout throughout the animation.

## Solution

1. Apply persistent bottom overlays to Studio and standalone Library. Keep the editor full-height and the shell mounted, occupying the bottom `50dvh` when open.
2. Animate only the shell transform for 300ms with the existing easing. Reserve matching real bottom padding after the wall, without changing its percentage-height sizing. Padding and scroll corrections happen immediately.
3. Studio preserves outgoing route pixels with an exit-only ViewTransition. Library retains live content through its CSS exit, then releases it.

## User Stories

1. Opening and closing do not continuously resize the editor.
2. Opening midway through a page preserves the reader's scroll offset.
3. Opening at the bottom keeps the last content visible above the drawer.
4. All editor content remains scrollable clear of the drawer.
5. Navigation between drawer routes preserves the shell without replaying entrance animation.
6. Close controls, history, and direct links preserve editor identity and existing routing behavior.
7. Reduced motion applies visibility and scroll adjustments immediately.

## Implementation Decisions

1. Add the approved optional `open` boolean to the existing shared Drawer. Supplying it controls persistent-shell visibility, translation, and interactivity. Callers omitting it retain their existing behavior.
2. Studio's persistent EditorLayout owns the shell. Next supplies open state from the existing `(drawer)` route group; preserve public URLs and route-owned content. Do not add pathname matching, duplicated open state, parallel slots, private router APIs, or cached route children.

   ```tsx
   // Route hierarchy declares drawer membership; Next owns matching.
   const segments = useSelectedLayoutSegments();
   const drawerOpen = segments.includes("(drawer)");

   // The shell survives navigation to the editor's base route.
   <Drawer side="bottom" open={drawerOpen}>
     {children}
   </Drawer>;
   ```

3. Library passes its existing local open state. Closing without changing the URL remains supported. Each app owns its editor's scroll handling.
4. Preserve existing scroll containers, sessions, wall identity, and toolbar placement. Add trailing padding outside the wall so reserving space does not shrink its minimum height.
5. Before changing padding, capture the scroll offset and maximum. A scrollable editor within 1 CSS pixel of the bottom follows the new maximum; other offsets remain unchanged, clamped to the new range.

   ```ts
   // Read before changing the reserved space.
   const previousTop = el.scrollTop;
   const previousMax = Math.max(0, el.scrollHeight - el.clientHeight);
   const wasAtBottom = previousMax > 0 && Math.abs(previousMax - previousTop) <= 1;

   // Write after layout; never animate or repeatedly follow this correction.
   const nextMax = Math.max(0, el.scrollHeight - el.clientHeight);
   el.scrollTop = wasAtBottom ? nextMax : Math.min(Math.max(previousTop, 0), nextMax);
   ```

6. Apply preservation on open, close, and viewport/reserved-height changes. Initial direct links do not force a bottom scroll. Do not follow ordinary content growth or restore a stale offset after the user scrolls.
7. Studio disables snapshot entrance and retains outgoing snapshots only. Match the CSS shell's translation distance and easing. Without native View Transitions, Studio closes immediately. Do not delay navigation.
8. The latest open state wins over exit cleanup. Closing immediately makes the shell inert and inaccessible; after exit its content is released. Restore focus to the opener where appropriate, without overriding deliberately moved editor focus. Reduced motion skips movement and performs cleanup immediately.
9. Update both app READMEs. This supersedes plan 007's grid-row reservation and snapshot entrance without discarding unrelated verification history.

## Annotated Examples

1. Opening a 400px drawer at the bottom of a long page adds 400px padding and 400px scroll offset, assuming unchanged content geometry. The last content remains above the drawer.
2. Opening the same drawer midway through the page adds padding without moving the current offset.
3. Scrolling while open establishes the current reading position. Closing preserves it where valid instead of restoring a pre-opening offset.
4. Closing and immediately reopening must not let a stale exit callback hide the reopened shell.

## Testing Decisions

1. Extend Studio's existing drawer browser checks: persistent shell identity, full editor height, matching padding, top/middle/bottom anchors, short content, closing after scrolling, viewport changes, direct links, route navigation, history, interrupted exits, focus, reduced motion, and unavailable View Transitions.
2. Manually verify both apps, including outgoing content and a performance recording. Confirm no per-frame grid-height/padding animation or competing translations.
3. Run scoped Nx typechecking, lint, and required builds. Do not create, run, restore, or maintain Library tests.
4. Report unrelated failures without fixing them.

## Out of Scope

1. Springs, dragging, drawer resizing, new dependencies, and generalized routing or scroll infrastructure.
2. Breakpoint selection, brick behavior, settings persistence, and established draft semantics.
3. Continuously synchronizing editor scrolling with the drawer's animated edge.

## Verification

1. Scoped Nx builds, typechecking, and lint passed for Studio and Library. Typechecking and lint were repeated after the final content-growth correction. No Library tests were created or run.
2. Studio's browser checks now cover the persistent shell and scroll behavior. The Chromium run stopped at Clerk sign-in because no authenticated `PLAYWRIGHT_STORAGE_STATE` was available; its behavioral assertions remain unverified by that run.
3. Manual checks in the existing authenticated Chrome session confirmed Studio's persistent shell, full editor height, middle/bottom scroll preservation, viewport-height changes, 390px mobile geometry, initial deep-link position, focus return, reduced motion, and immediate close without View Transitions. Outgoing native snapshots remained present during closing.
4. Manual Library checks confirmed matching padding, bottom anchoring, unchanged URL on close, focus return, live content through CSS exit followed by release, and reopening during an interrupted close.
5. Verified that later content growth does not move the editor or leave a stale bottom anchor that incorrectly follows the next viewport resize. Temporary DOM fixtures and device/media overrides were removed afterward.
6. Performance recordings showed the drawer's transform animation and no editor grid-row or padding animation. Existing brick/preview animations still cause layout work; this change does not eliminate unrelated layout costs. Local evidence: `/tmp/qrk-studio-drawer-open-trace.json` and `/tmp/qrk-library-drawer-close-trace.json`.
7. Remaining verification: rerun the complete Studio drawer suite with authenticated storage state, including its history and route-to-route assertions. Plan 007's unrelated outstanding checks remain intact.
