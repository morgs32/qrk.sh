# Workspace drawer structure

Researched 2026-11-10 for sharing the drawer's Close action with a click on
empty preview space. The route determines which panel is open and which
Brick is selected. The Page layout owns the preview scroll area, floating
toolbar, drawer shell, and autosave navigation blocker. The shell and
preview are DOM siblings. Before the composition change, the pathless
`_drawer` route rendered the tabs and actions around its child outlet,
placing Close and Escape in a descendant of the component handling preview
clicks. [Page layout](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx),
[Page route](../../apps/app/routes/$username.site.$siteId.page.$pageId.tsx),
[pathless route](../../apps/app/routes/$username.site.$siteId.page.$pageId._drawer.tsx).

## Chosen composition

Render the drawer tabs and actions directly inside the Page layout's
existing Drawer and pass an `onClose` prop. The Page layout can then use
one navigation action for the Close button, Escape, and empty preview
clicks. Keep the current Page URL, breakpoint search value, scroll
preservation, and browser history behavior. A direct link to Brick Details
may have no prior Page entry, so the action should still navigate to an
explicit destination. [React shared ownership and event props](https://react.dev/learn/sharing-state-between-components#lifting-state-up-by-example),
[TanStack navigation options](https://tanstack.com/router/latest/docs/api/router/NavigateOptionsType),
[Page layout](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx).

Keep `_drawer` as a pathless route and let its default Outlet render the
matched catalog, settings, or Brick route. TanStack renders an Outlet when
the route omits its component. Keeping the route ID preserves the Page
layout's open-state check and the child routes' existing URL paths. This
route has no custom pending or error component, and QRK sets no router-wide
default for either. [TanStack pathless routes](https://tanstack.com/router/latest/docs/routing/routing-concepts#pathless-layout-routes),
[TanStack Outlets](https://tanstack.com/router/latest/docs/guide/outlets),
[QRK router setup](../../apps/app/router.tsx),
[pathless route](../../apps/app/routes/$username.site.$siteId.page.$pageId._drawer.tsx).

```text
Page layout
├─ Preview scroll area  → empty-space click can call Close
├─ Floating toolbar
└─ Drawer shell         → stays mounted for focus and exit
   └─ Drawer chrome     → Close and Escape call the same action
      └─ Outlet         → _drawer groups the matched panel routes
```

## Behavior tied to the current structure

- **Exit and Escape.** Keep the shell mounted across route changes. Render
  the tabs and actions only while a drawer route is open and a breakpoint
  is resolved. The chrome has the `app-drawer` view-transition name, and
  the exit CSS animates its old snapshot when the new page has no named
  counterpart. Leaving the named chrome mounted for the shell's exit could
  create a second snapshot and bypass that animation. Unmounting it also
  unregisters Escape on the base Page. Retain the existing handling of
  Escape events consumed by child overlays. [Drawer shell](../../apps/app/components/Drawer/Drawer.tsx),
  [QRK exit styles](../../apps/app/app/globals.css#L243),
  [CSS view-transition exit snapshots](https://drafts.csswg.org/css-view-transitions-1/#view-transition-old-pseudo),
  [TanStack Hotkeys](https://tanstack.com/hotkeys/latest/docs/framework/react/guides/hotkeys).
- **Focus and portals.** The drawer can restore focus after the route closes
  when focus was inside it and has fallen back to the body or stayed in the
  drawer. PagePreview checks the restoration marker
  before opening Brick Details. The Brick form portal uses a target in the
  drawer with an ID derived from the selected Brick. Keep that target
  contract and preserve physical DOM containment checks in the preview
  handler, since portal clicks still bubble through the React tree.
  [Drawer focus handling](../../apps/app/components/Drawer/Drawer.tsx),
  [PagePreview](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/PagePreview.tsx),
  [React portal behavior](https://react.dev/reference/react-dom/createPortal#caveats).
- **Editor state.** Keep Page and Wall identity keyed by their existing
  IDs. The navigation blocker treats a drawer close as a same-Page,
  same-breakpoint change, which lets inline Article editors stay mounted.
  Drawer forms retain their existing navigation and save behavior. A
  context for editor flush registration serves the preview, forms, and
  publication actions. The Close action needs only the direct prop.
  [Page layout](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx),
  [PagePreview](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/PagePreview.tsx),
  [Brick details form](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/BrickDetail/BrickDetail.tsx),
  [React state identity](https://react.dev/learn/preserving-and-resetting-state#state-is-tied-to-a-position-in-the-render-tree).

## Drawer and toolbar cleanup

- **Tab navigation and toolbar controls.** The Bricks trigger navigates
  through the tab list's controlled `onValueChange`. The drawer uses manual
  tab activation and a horizontally scrollable tab strip. The floating
  toolbar uses its existing links, buttons, and separators.
  [Drawer tabs](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/layout.tsx),
  [toolbar button](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/Toolbars/ToolbarButton.tsx),
  [toolbar separator](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/Toolbars/ToolbarSeparator.tsx),
  [ARIA Tabs keyboard interaction](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/#keyboard-interaction).
- **Site publication state.** The Page layout passes the loaded Site's
  publication state to the drawer and floating toolbar. The drawer's
  expanded Page query supplies Bricks, Walls, and Placements for the
  snapshot comparison.
  [Page layout queries](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx),
  [drawer publication queries](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/layout.tsx).
- **Toolbar position.** The floating toolbar adds its gap to the preview's
  existing drawer-height variable.
  [Preview size CSS](../../apps/app/modules/bricks.css#L15),
  [Page layout](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx).

## Other clean-slate options

- **Remove the route group.** The panel URLs could remain under the same
  Page, but internal route IDs and match checks would need to change. The
  pathless group gives the Page a single match for opening the shell and
  now contributes no extra DOM. [TanStack file naming](https://tanstack.com/router/latest/docs/routing/file-naming-conventions),
  [Page layout](../../apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx).
- **Use a nonmodal dialog primitive for the shell.** Base UI's positioned
  Dialog is its suggested primitive for a panel that slides in without
  drawer gestures. Its Dialog and Drawer expose controlled open state,
  outside-interaction reasons, and focus controls. QRK would still supply
  its preview-only click rule and integrate the primitive with its named
  route-exit snapshot and focus restoration guard. Evaluate this when
  replacing the shell itself is the goal. [Base UI Drawer usage guidelines](https://base-ui.com/react/components/drawer#usage-guidelines),
  [Base UI Dialog API](https://base-ui.com/react/components/dialog#root),
  [QRK Drawer](../../apps/app/components/Drawer/Drawer.tsx).
- **Simplify the shell's layout sizing.** A later sizing change could give
  the shell, preview height token, and exit keyframes one shared value. The
  named exit snapshot lives outside the viewport element's CSS scope, so
  its height source must also be visible to the view-transition pseudo
  elements. [Preview size CSS](../../apps/app/modules/bricks.css#L15),
  [Drawer shell](../../apps/app/components/Drawer/Drawer.tsx),
  [QRK exit styles](../../apps/app/app/globals.css#L243),
  [CSS view-transition tree](https://drafts.csswg.org/css-view-transitions-1/#view-transition-pseudos).
