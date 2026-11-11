# Plan 076 — Adopt shadcn Button in App and align the Wall toolbars

Switch App's own Button to the shadcn Base UI registry. Preserve the compact
Wall controls and route link semantics. Plan 069 owns the separate Bricks
Button and InputGroupButton implementation.
[Adoption audit](../research/shadcn-component-adoption-audit.md#app)

## Implementation and call sites

1. Replace the implementation at [App Button](../../apps/app/components/ui/button.tsx#L6-L54)
   with the shadcn Base UI Button and Nova variant utilities. Keep the
   existing exports and theme colors, and remove App Button's unused
   `asChild` prop. Preserve existing explicit submit types. Update
   [App Button Storybook size controls](../../apps/app/components/ui/button.stories.tsx)
   to list the complete registry sizes. The old App InputGroupButton already
   has registry-style sizes and inherits the new Button.
   [Button registry](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/button.tsx) · [Nova styles](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/styles/style-nova.css#L134-L187)
2. Update [ToolbarButton](<../../apps/app/app/[username]/site/[siteId]/Toolbars/ToolbarButton.tsx#L44-L96>).
   Use the shared ghost Button for actions with current local dimension
   and color overrides. Use `buttonVariants` for the TanStack Link branch.
   Keep the Link destination, breakpoint search params, `resetScroll`,
   and accessible name. Keep tooltips and the icons. Replace
   [ToolbarSeparator](<../../apps/app/app/[username]/site/[siteId]/Toolbars/ToolbarSeparator.tsx#L3>)
   with the existing decorative vertical App Separator, keeping its size.
3. Make [WallPreviewToolbar](<../../apps/app/app/[username]/site/[siteId]/Toolbars/WallPreviewToolbar.tsx#L6-L24>)
   use Base UI Toolbar.Root for its action layout. Add an internal
   `navigation` boolean to render the same visual shell as a labeled
   `nav` for the five [SiteToolbar links](<../../apps/app/app/[username]/site/[siteId]/Toolbars/SiteToolbar.tsx#L48-L112>).
   In the action toolbar, register the
   [breakpoint actions](<../../apps/app/app/[username]/site/[siteId]/Toolbars/BreakpointsToolbar.tsx#L50-L78>)
   and the [standalone Close action](<../../apps/app/app/[username]/site/[siteId]/Toolbars/BreakpointsToolbar.tsx#L80-L106>)
   using Base UI Toolbar.Button rendered through the shared Button.
   Keep the selected breakpoint disabled with its existing pressed
   indication. In [Wall Preview Toolbar Storybook](<../../apps/app/app/[username]/site/[siteId]/Toolbars/WallPreviewToolbar.stories.tsx#L33-L45>),
   retain the visual example and exercise the same keyboard toolbar.
   [Base UI Toolbar](https://base-ui.com/react/components/toolbar) · [Button and link semantics](https://base-ui.com/react/components/button#rendering-links-as-buttons)
4. Verify existing shared Button consumers at the
   [Create Site trigger](<../../apps/app/app/[username]/(dashboard)/page.tsx#L106>)
   and [dialog actions](<../../apps/app/app/[username]/(dashboard)/page.tsx#L254-L269>),
   [Page Settings actions](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PageSettings/PageSettings.tsx#L111-L125>),
   [Site Settings upload buttons](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L266-L365>),
   [preview action](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L402>),
   [save/reset/unpublish](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx#L471-L498>),
   [CopyButton](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/CopyButton.tsx#L17>),
   [Publish Site trigger](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PublishSiteDialog.tsx#L109>)
   and [dialog actions](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PublishSiteDialog.tsx#L173-L180>),
   [sidebar Close actions](<../../apps/app/app/[username]/site/[siteId]/page/[pageId]/(sidebar)/layout.tsx#L143-L171>),
   [Wall delete actions](../../apps/app/components/WallEditor/WallEditor.tsx#L1428-L1447),
   and the [CSS grid Storybook action](../../apps/app/components/CSSGridBackgroundGenerator.stories.tsx#L178).
   Keep the App error boundary's standalone recovery markup and CSS,
   since it renders independently of the normal App shell.

```tsx
// Keep real navigation links and use shared button styling on the anchor.
<Link {...link} resetScroll={false} className={buttonVariants({ variant: "ghost" })}>
  {body}
</Link>
```

## Verification

1. Typecheck App, build App Storybook through Nx, and check the diff.
   Verify the native button type for ordinary actions, submit buttons,
   and the Copy button. Check the Wall delete dialog if Plan 074 landed.
2. The user checks focus and tooltip behavior for action buttons, Tab and
   arrow keys in Breakpoints, normal Tab navigation in Site links, and
   Close from the standalone view. Confirm compact dimensions and that
   links preserve route and scroll behavior. Record results and archive
   after verification.

`~` means modify.

```text
qrk.sh/
├── apps/app/
│   ├── app/[username]/site/[siteId]/Toolbars/
│   │   ├── ~ BreakpointsToolbar.tsx
│   │   ├── ~ SiteToolbar.tsx
│   │   ├── ~ ToolbarButton.tsx
│   │   ├── ~ ToolbarSeparator.tsx
│   │   ├── ~ WallPreviewToolbar.stories.tsx
│   │   └── ~ WallPreviewToolbar.tsx
│   └── components/ui/
│       ├── ~ button.stories.tsx
│       └── ~ button.tsx
└── wiki/plans/
    └── ~ 076-plan-app-shadcn-buttons-and-toolbars.md
```

## Implementation status

App typecheck and Storybook build passed. A render probe verified the default button and explicit submit types. The floating toolbar Storybook check verified a single Tab stop and Right Arrow focus movement.

## Remaining work

1. User verification. Check tooltips and focus, Site toolbar link navigation and scroll position, the standalone Close button, and the retained compact dimensions.
2. Archive after verification.
