# 061 — Sidebar-only Studio workspace

**Status:** Implemented. Manual Studio verification pending.

Studio currently switches between a right sidebar and a bottom drawer for the
same routes. Use one workspace sidebar across viewport sizes. Below Tailwind
`lg`, position it over the right edge of the Wall and leave the exposed Wall
interactive. This supersedes the responsive shell decision in
[Plan 056](../archive/plans/056-plan-responsive-workspace-sidebar.md).

## Behavior

1. At `lg` and wider, use a 300 px in-flow sidebar. Below `lg`,
   use a right overlay with width `min(300px, 75vw)`, starting below the App
   header and filling the available workspace height. The overlay has a left
   border and shadow. The Wall can scroll and receive pointer and keyboard
   input in the exposed area. Its preview stays at the selected authored width.
2. Show the current section name at `lg` and wider and the compact **Page controls**
   select below `lg`. Show **Close sidebar** at every viewport size.
   Bricks, Page settings, Site settings, and Edit brick
   retain their existing URLs and route state. The sidebar body is a single
   vertical scroll area. Settings use the actual sidebar container width.
3. [Plan 062](062-plan-brick-owned-interactions.md) supersedes this plan's
   inline-focus navigation. Article focus leaves the sidebar state and route
   alone at every width. Sidebar-form Bricks and accepted catalog drops can
   open Brick Details at any width.
4. Preserve Close, Escape, and the current background-click behavior for Brick
   Details. Menus, dialogs, and text selection get the first chance to consume
   Escape. Keep the floating toolbar visible on desktop with the sidebar open
   and highlight the current section. Below `lg`, hide the toolbar while the
   sidebar is open.
   Resizing across `lg` preserves the sidebar body, its draft, the Wall, and
   the selected breakpoint.

## Implementation

1. In PageLayout, render the routed outlet directly inside the existing
   WorkspaceSidebar when a sidebar route is matched. Pass children through
   the existing controls component and render the same aside in the same
   React position at every width. Use CSS for in-flow versus absolute
   positioning within the workspace under the header. Remove the moved portal
   target, body refs, and bottom Drawer branch. Retain the workspace container
   on the sidebar body for settings reflow.

   ```tsx
   // The route chooses whether the sidebar exists.
   // CSS positions this same subtree on either side of lg.
   {sidebarOpen && (
     <WorkspacePanelControls isSitePublished={site.isPublished} onClose={closePanel}>
       {children}
     </WorkspacePanelControls>
   )}
   ```

2. Rename the pathless `_drawer` group to `_sidebar` and the matching App
   source group to `(sidebar)`. Update route-ID checks in the page layout,
   controls, and toolbar. Regenerate TanStack's route tree with the existing
   build. The pathless group changes internal route IDs while the public
   paths keep the same segments. Replace the controls' desktop/mobile branch
   with the existing select header. Leave page publishing in its current
   owners.
3. Use the full workspace height for the preview scrollport and anchor the
   toolbar to its normal bottom gap. Remove the 25dvh reservation, bottom
   offset transition, drawer attributes, and drawer snapshot animation.
   Use the existing bottom anchor on desktop and when the mobile sidebar is
   closed. Keep the global router transition policy and existing preview scroll
   anchoring.
4. Keep Brick Details navigation in PagePreview. The inline-focus wiring
   described here was replaced by Plan 062. Distinguish an inline field
   focus from an explicit edit with an optional second argument
   `source?: "inline-focus"` on WallEditor's existing `onEditBrick` callback.
   WallEditor supplies it only from the module's existing `onFocus` callback.
   PagePreview checks `matchMedia("(min-width: 64rem)").matches` at that event
   and skips navigation for inline focus below `lg`. Delete the now-unused
   viewport hook and the drawer-specific focus marker. Keep the current
   inline-field blur on Escape. Preserve keyboard focus on sidebar close by
   returning it to the opening control when still connected. If the opener
   disappeared or was an inline field that would reopen Brick Details, focus
   the Wall instead. Use `preventScroll` and leave focus alone when it is
   already outside the sidebar.
   The module contracts and module props stay as they are.

   ```tsx
   // WallEditor forwards the existing module focus event as a Studio intent.
   onFocus={() => onEditBrick(brick.id, "inline-focus")}

   // PagePreview owns the responsive navigation decision.
   if (source === "inline-focus" && !window.matchMedia("(min-width: 64rem)").matches) {
     return;
   }
   ```

5. Make the Bricks catalog a vertical list at every width. Remove
   `verticalAtLg` and the horizontal drawer styles from ModuleFilmstrip and
   ModulePreview. Measure the actual padded catalog column with the existing
   observer and preserve thumbnail sizing and the native drag preview.
   Rename the browser-local `drawer-brick` payload discriminator and
   `data-drawer-module-id` to `catalog-brick` and `data-catalog-module-id`
   together in the source, Wall consumers, and scripted stories. Keep the
   authored drop sizing and existing command payload.
6. Replace the WallEditor Storybook bottom catalog with the same sidebar
   layout, including the narrow overlay. Remove the VerticalDrawer
   experiment and the App Drawer component and story after their final
   callers are gone. Update App docs and the workspace layout research note.
   Reconcile **Selected Brick** in the glossary and repository guidance
   with the implemented sidebar terminology. The existing Wall-owned layout
   ADR continues to govern persistence. This layout change requires no
   migration.

## Planned files

`~` modifies, `→` moves, and `−` deletes. Braced names list siblings.

```text
qrk.sh/
├── ~ {AGENTS.md, README.md}
├── apps/app/
│   ├── ~ {AGENTS.md, README.md, routeTree.gen.ts}
│   ├── app/
│   │   ├── ~ globals.css
│   │   └── [username]/site/[siteId]/
│   │       ├── Toolbars/~ {Toolbars.tsx, BreakpointsToolbar.tsx}
│   │       └── page/[pageId]/
│   │           ├── ~ {layout.tsx, PagePreview.tsx, WorkspaceSidebar.tsx}
│   │           ├── − useMatchMedia.ts
│   │           ├── → (drawer)/ to (sidebar)/, including ~ layout.tsx
│   │           └── Modules/~ {Modules.tsx, ModuleFilmstrip.tsx, ModulePreview.tsx}
│   ├── components/
│   │   ├── − Drawer/{Drawer.tsx, Drawer.stories.tsx}
│   │   └── WallEditor/
│   │       ├── ~ {WallEditor.tsx, WallEditor.stories.tsx}
│   │       └── Scripted/~ {BrickPresentation, EqualHeightRows, InsertionShadow, StickyActions}.stories.tsx
│   ├── modules/~ {bricks.css, README.md}
│   └── routes/→ five pathless _drawer route files to _sidebar
└── wiki/
    ├── ~ glossary.md
    └── research/~ preview-chrome-drawer-layout.md
```

## Verification

1. Run App and Storybook builds through Nx and `git diff --check`. Verify the
   generated public paths for all four sidebar routes and search the App for
   leftover workspace drawer routes, CSS, selectors, and consumers.
2. The user performs manual verification under the November 11 daily choice.
   Open each sidebar route directly and through Page controls. At 1024 px,
   confirm a 300 px in-flow sidebar. At 1023 px, confirm an overlay. At 375 px,
   confirm a sidebar at most 281.25 px wide and an interactive exposed Wall.
   Resize across the threshold with a form draft open, then verify the draft,
   selected breakpoint, scroll position, and controls.
3. Use a local test page to verify inline Article focus on both sides of
   `lg`, explicit selection and catalog drop, Close and Escape, and
   focus after sidebar dismissal. Confirm vertical catalog scrolling,
   thumbnail fit, and a successful drag onto the exposed Wall with a
   drag-capable pointer. Check that the toolbar stays visible on desktop with
   the sidebar open, hides under the mobile overlay, and returns after closing
   it. Record the user's result before archiving the plan.


## Results

1. The App build and Storybook build passed through Nx, including the Bricks
   import check. The generated public route paths match the previous route
   tree, and the App search found no retired workspace drawer routes,
   reservation CSS, drag markers, or Drawer component consumers.
2. `git diff --check` passed.

**Remaining work:** The user will run manual Studio scenarios 2 and 3 above.
Record the result and archive this plan after those checks pass.
