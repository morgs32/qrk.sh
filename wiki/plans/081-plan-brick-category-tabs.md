# Brick category tabs

## Goal

Use the shared line tabs with a bottom border for Brick drawer categories.

## Implementation

1. Export the existing Bricks tabs component for the App.
2. Replace category filter buttons with line tabs, rendering each trigger
   through the shared Bricks Button. Provide a matching panel per visible tab
   and activate tabs when keyboard navigation moves focus.
3. Keep the tabs wrapped and visible above scrolling previews. All is initially
   selected, empty categories are hidden, and Brick order follows the registry.
4. Reconcile the App documentation. Update glossary or ADRs only if the actual
   implementation warrants a change.
5. Run the App build and scoped formatting checks. The user verifies the line
   style, border, wrapping, keyboard interaction, scrolling, and Brick drag.

For example, the trigger composes the existing controls:

```tsx
// The tab supplies navigation and the shared button renders the control.
<TabsTrigger value="social" render={<Button variant="ghost" />}>
  Social
</TabsTrigger>
```

## Planned files

`+` creates a file; `~` modifies one.

```text
qrk.sh/
├── apps/bricks/package.json                              ~
├── apps/app/app/[username]/site/[siteId]/page/[pageId]/
│   └── Modules/ModuleFilmstrip.tsx                       ~
├── apps/app/README.md                                    ~
└── wiki/plans/081-plan-brick-category-tabs.md            +
```

## Remaining work

1. Rerun `pnpm nx build @qrk.sh/app`. The Bricks import check currently fails
   because the concurrent Image Carousel work imports an undeclared
   `@qrk.sh/bricks/modules/imageCarousel/view` export whose source is not yet
   present. Scoped formatting and `git diff --check` passed.
2. Rerun the App TypeScript check after Image Carousel's view and definition
   exist. The current check reports those two missing modules.
3. Archive this plan after the automated checks pass. The user performs manual
   visual and interaction verification separately, per the daily choice.
