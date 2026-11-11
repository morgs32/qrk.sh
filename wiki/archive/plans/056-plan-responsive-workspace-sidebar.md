# Plan 056 · Responsive workspace sidebar

1. Use the Style Inspector's compact section selector and bordered 256px right sidebar at Tailwind lg and wider. Keep the current bottom drawer below lg. Keep the Bricks, Edit Brick, Page Settings, and Site Settings routes, Close, Escape, and publish actions.
2. Add route-local `useMatchMedia(query: string): boolean` with `useSyncExternalStore`, a stable MediaQueryList for the query, and change-listener cleanup. For example, `useMatchMedia("(min-width: 64rem)")` chooses the shell independently of the URL-selected Wall.
3. Keep shell controls in their own components. Derive both navigation controls from the matched route. Keep the outlet in a single route-owned portal and move its DOM target between shell slots. For example, `createPortal(children, panelBody)` keeps the same target through resize. The current inline Brick editor remains mounted in the Wall. Preserve ordinary drawer-close focus using DOM events and skip custom focus transfer on shell changes.
4. Keep one preview scrollport and anchor the toolbar inside its column. With the sidebar open, the preview canvas grows to at least the authored frame width plus 32px on either side. Keep the selected Wall at full scale. The guard applies new fit policy only after measuring the new pane, and flushes an active Wall before replacing it when entering the drawer. Toolbar availability uses measured capacity.
5. Measure the vertical catalog once. Apply capped CSS zoom directly to each draggable card so its native clone retains the scale. Keep the normal Wall size and drag payload on drop. Reflow the settings forms using the panel's container width.
6. Verify the App build and diff. Record the decision in the existing preview research note and reconcile Selected Brick in the glossary. The browser scenarios below are retained for reference and are skipped at the user's request.

## Files

```text
qrk.sh/
├── apps/app/
│   ├── app/[username]/site/[siteId]/page/[pageId]/
│   │   ├── + useMatchMedia.ts, WorkspaceSidebar.tsx
│   │   ├── ~ layout.tsx, (drawer)/layout.tsx
│   │   ├── ~ useBreakpointGuard.ts, ValidBreakpoint.tsx
│   │   └── ~ Modules/Modules.tsx, PageSettings/PageSettings.tsx, SiteSettings/SiteSettings.tsx
│   └── modules/
│       ├── ~ bricks.css, README.md
│       └── lib/
│           └── ~ Drawer.tsx, ModuleFilmstrip.tsx, ModulePreview.tsx
└── wiki/
    ├── + plans/056-plan-responsive-workspace-sidebar.md
    ├── ~ research/preview-chrome-drawer-layout.md
    └── ~ glossary.md
```

`+` creates a file. `~` modifies an existing file.

## Browser scenarios

1. At 1024px with a 720px Wall and an unsaved draft, resize to 1023px. The sidebar becomes a drawer while the Wall, URL, and draft stay put. Repeat in the other direction.
2. At 1280px with a 1080px Wall, open the sidebar and scroll to both gutters. Resize to 1000px and verify that the drawer selects the 720px Wall through the existing guard.
3. Drag a scaled sidebar card into the Wall and verify normal placement sizing. Exercise all panel routes and their close behavior.

## Outcome

1. Implemented the sidebar, responsive drawer handoff, Wall fit policy, and catalog scaling.
2. The App build and `git diff --check` passed. Browser scenarios were skipped at the user's request.
3. Recorded the breakpoint subscription and layout behavior in the [preview research note](../../research/preview-chrome-drawer-layout.md) and updated [Selected Brick](../../glossary.md).

**Remaining work:** None.
