# Shared tabs for the editor

## Goal

Give the shared Bricks tabs a compact size and use them for category filters,
breakpoint selection, and Page controls while preserving route navigation and
editor state.

## Implementation

1. Add a 28px `sm` size with 12px labels to both rounded and line tabs. Keep
   the 36px default. The default variant uses Nova's `rounded-lg`, 3px padding
   (2px at `sm`), and a zinc border. Line tabs own their bottom border and scroll
   horizontally in a single row when they overflow.
2. Add a Bricks Storybook story for both styles and sizes. Use the shared Button
   for tab triggers and include panels and keyboard interaction.
3. Use small line tabs in the Brick drawer, retaining activation on focus and
   filtering behavior. For example:

   ```tsx
   // Shared line styling and sizing keep the drawer's tabs consistent.
   <TabsList variant="line" size="sm" aria-label="Brick categories">
     <TabsTrigger value="all" render={<Button variant="ghost" />}>
       All
     </TabsTrigger>
   </TabsList>
   ```

4. Connect breakpoint tabs and panels to the URL-selected breakpoint, keeping
   the existing flush guard, search state, and preview remount behavior.
5. Make Page controls route-backed tabs with panels and preserve link behavior,
   mobile selection, focus and close behavior. Leave them unselected when the
   sidebar is closed or Edit brick is open. Breakpoint and Page tabs use manual
   keyboard activation.
6. Remove superseded App-local toolbar components and their story, update App
   documentation, and reconcile the glossary and ADR criteria after completion.
7. Run the App build, Bricks Storybook build, scoped formatting, and App
   typecheck. The user verifies both sizes, visual layout, keyboard navigation,
   direct links, Back/Forward, sidebar and breakpoint behavior, and drag.

## Planned files

`+` creates, `~` modifies, and `−` removes a file.

```text
qrk.sh/
├── apps/bricks/src/components/{tabs.tsx,tabs.stories.tsx}         ~,+
├── apps/app/app/[username]/site/[siteId]/Toolbars/
│   ├── {BreakpointsToolbar,SiteToolbar}.tsx                       ~
│   └── {WallPreviewToolbar,ToolbarButton,WallPreviewToolbar.stories}.tsx −
├── apps/app/app/[username]/site/[siteId]/page/[pageId]/
│   ├── {layout,PageEditorNavbar,WorkspaceSidebar}.tsx            ~
│   └── Modules/ModuleFilmstrip.tsx                               ~
├── apps/app/modules/bricks.css                                   ~
├── apps/app/README.md                                            ~
└── wiki/archive/plans/081-plan-brick-category-tabs.md            ~
```

## Outcome

The shared 28px tabs, four style and size stories, keyboard story, category
tabs, breakpoint tabs, and route-backed Page tabs are implemented. The App Nx
build, App typecheck, Bricks Storybook build, scoped formatting, and
`git diff --check` passed. The keyboard story was built but not run. The user
performs visual, keyboard, navigation, focus, and drag verification separately,
per the daily choice. Glossary terminology remains accurate and no ADR was
warranted for this reversible UI change.

## Remaining work

None.
