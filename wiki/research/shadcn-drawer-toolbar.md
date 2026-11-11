# shadcn patterns for the drawer navbar

Researched 2026-11-10 for the Publish button beside the workspace drawer tabs.

## Component fit

- shadcn's component catalog offers Button, Button Group, and Tabs. Its Radix Tabs example applies `variant="line"` to the tab list. The WAI-ARIA Tabs pattern associates each tab with a panel, so the drawer's Publish and Close actions belong beside the tab list as ordinary buttons. [shadcn component catalog](https://ui.shadcn.com/docs/components), [shadcn line tabs](https://ui.shadcn.com/docs/components/radix/tabs#line), [WAI-ARIA Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
- shadcn Button Group styles related controls as a group and keeps each button in the normal Tab sequence. Base UI and Radix Toolbar provide keyboard navigation among toolbar controls. The WAI-ARIA Toolbar pattern recommends a single Tab stop with arrow-key navigation and recommends the pattern for groups of at least three controls. For QRK's panel tabs and two separate actions, keep the current tab-list keyboard behavior and individual Tab stops for the actions. [shadcn Button Group](https://ui.shadcn.com/docs/components/radix/button-group#accessibility), [Base UI Toolbar](https://base-ui.com/react/components/toolbar#using-with-other-components), [Radix Toolbar](https://www.radix-ui.com/primitives/docs/components/toolbar#accessibility), [WAI-ARIA Toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/).

## QRK sizing

Give the drawer navbar a 52px row and let the line tabs fill its height so the active underline meets the bottom divider. Use the existing large primary button for page Publish, which supplies a 40px height and 24px horizontal padding at the default spacing scale. Keep 12px between Publish and Close. These dimensions come from QRK's drawer and button styles. shadcn supplies the size and variant API. [QRK drawer layout](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/(drawer)/layout.tsx), [QRK Button](../../apps/app/components/ui/button.tsx), [Tailwind spacing scale](https://tailwindcss.com/docs/height#using-the-spacing-scale), [shadcn Button sizes](https://ui.shadcn.com/docs/components/radix/button#size).
