# Preview chrome above the drawer

Researched 2026-11-05 from the owning repository source. The comparison below records the behavior before implementation; the verified outcome is recorded at the end.

## Existing stories

The story group is **App/Studio/Wall Editor**. **Default** (and the stories using its shared render) already reserves layout space for the drawer: its outer column gives the preview `main` the remaining height (`min-h-0 flex-1 overflow-auto`), then places a 280px drawer sibling below it using `layoutMode="flow"`. The preview frame uses `minHeight: "100%"`. The catalog is always present in that shared story shell; it is not an open/closed example. [Story group and Default](../../apps/app/components/WallEditor/WallEditor.stories.tsx#L668-L748), [preview sizing](../../apps/app/components/WallEditor/WallEditor.stories.tsx#L481-L485), [preview and flow drawer layout](../../apps/app/components/WallEditor/WallEditor.stories.tsx#L552-L612).

**StackNameEditor** is the closest conditional example: a flex column holds the scrolling preview above a flow drawer, and the 280px drawer is rendered only when `stackId` is defined. When no stack editor is selected it renders a short instruction instead. It proves an existing route-driven conditional layout pattern, not an exact replica of the live 25dvh drawer or a full chrome-sizing test. [StackNameEditor](../../apps/app/components/WallEditor/WallEditor.stories.tsx#L1623-L1673).

**VerticalDrawer** uses the shared shell and changes the catalog to a 420px right column at viewport widths of 1024px and above; below that it retains the bottom drawer. This is explicitly a Storybook-only experiment, not an open-state rule. [VerticalDrawer](../../apps/app/components/WallEditor/WallEditor.stories.tsx#L1750-L1761).

## Why the live editor differed

The live page already derives `drawerOpen` from the matched drawer route. It retains a full-height scrolling preview, adds 25dvh of bottom spacer only while open, and offsets the breakpoint toolbar above the open drawer. The drawer remains a fixed overlay. That spacer makes the page bottom reachable by scrolling; it does not shorten the preview viewport to end above the drawer. [Route state](https://github.com/morgs32/qrk.sh/blob/cf6a632879f38ed5fa770b070703bdd68d357be9/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx#L28-L38), [spacer reservation](https://github.com/morgs32/qrk.sh/blob/cf6a632879f38ed5fa770b070703bdd68d357be9/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx#L66-L79), [live layout and toolbar](https://github.com/morgs32/qrk.sh/blob/cf6a632879f38ed5fa770b070703bdd68d357be9/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx#L159-L193), [fixed drawer dimensions](../../apps/app/components/Drawer/Drawer.tsx#L30-L35).

The live frame's minimum height comes from `--wall-frame-height`, calculated from `100dvh` less preview gutters; the drawer height is absent from that calculation. The bottom chrome is the normal-flow 64px `powered by qrk.sh` footer, so a full-viewport minimum frame can put that footer behind the overlay until scrolled. The top `BrowserChrome` is a separate sticky 48px address bar. [Live frame minimum](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PagePreview.tsx#L43-L59), [viewport variables](https://github.com/morgs32/qrk.sh/blob/cf6a632879f38ed5fa770b070703bdd68d357be9/apps/app/modules/bricks.css#L7-L14), [footer](../../apps/app/components/WallEditor/WallEditor.tsx#L1216-L1221), [top chrome](../../apps/app/components/PagePreview/BrowserChrome.tsx#L5-L15).

## Recommended scope

Apply the story's **remaining-height preview** idea to the live shell, gated by its existing `drawerOpen`: reserve the existing 25dvh from the preview's visible area while open, and derive the frame minimum from that available height. Restore the full preview area when closed. Keep tall page content scrollable; “bottom out above” should constrain the preview viewport/minimum frame, not crop or shrink authored content. Remove or reconcile the current spacer when changing the viewport reservation so the drawer space is not counted twice. This is a recommendation inferred from the cited live layout and story structure, not existing live behavior.

No new drawer component, state store, or module-level dependency is needed: the live page already owns both `drawerOpen` and the preview/drawer siblings. The existing `Drawer` flow mode is available, but simply switching that prop is insufficient because its explicit `open` branch also applies inline 25dvh height and transform/visibility lifecycle behavior. Preserve that lifecycle deliberately if choosing flow layout. [Live owner](https://github.com/morgs32/qrk.sh/blob/cf6a632879f38ed5fa770b070703bdd68d357be9/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/layout.tsx#L159-L193), [Drawer defaults](../../apps/app/components/Drawer/Drawer.tsx#L38-L55), [inline open-state styling and flow classes](../../apps/app/components/Drawer/Drawer.tsx#L135-L162).

## Implemented outcome

The live shell now marks its existing `drawerOpen` state on the preview viewport. CSS reserves 25dvh only while open and subtracts it from both the scrolling viewport and the frame minimum. Closing restores full height. The trailing spacer is removed, and the existing resize observer preserves/clamps scroll position using the actual viewport and content heights. The drawer retains its overlay animation and focus lifecycle. [PageLayout](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx), [preview sizing](../../apps/app/modules/bricks.css).

Browser verification on the supplied md page at 965×1034 measured the preview viewport ending at the drawer top (775.5px), with the frame/footer at 732.5px after the normal 43px bottom gutter. Closed, the viewport returned to 1034px and the frame/footer to 991px. At 965×600, overflowing content scrolled to its end above the drawer; closing clamped the now-unnecessary scroll offset to zero. At 965×430, bottom anchoring survived closing (131px of 131px) and reopening (238px of 238px). The original viewport and Link editor were restored. Scoped formatting and `git diff --check` passed.

## Responsive workspace sidebar

The dashboard and editor share the App navbar. It stays sticky on the
dashboard and occupies the top row of the editor's viewport-height flex
layout. The preview frame fills the available scroll area below the navbar,
with the existing gutters and bottom drawer reservation.

The App uses a 256px in-flow sidebar at Tailwind `lg` and wider when a
workspace panel route is open. The Page route reads `MediaQueryList.matches`
through `useSyncExternalStore` and subscribes to `change`. The media query
controls the shell. The existing preview measurement and URL continue to
control the authored Wall breakpoint. [React browser API subscriptions](https://react.dev/reference/react/useSyncExternalStore#subscribing-to-a-browser-api) · [Tailwind viewport breakpoints](https://tailwindcss.com/docs/responsive-design)

The same route-owned portal target moves between the sidebar and drawer.
Keeping the target and outlet mounted retains panel drafts across a shell-only
resize. Studio preserves the selected Wall and renders its bordered frame at
the authored width, with 32px inline gutters while the sidebar is open. The
preview scrolls horizontally when the frame and gutters exceed the pane width.
Article drafts stay mounted during pane resizing and flush on explicit
breakpoint changes. The drawer reserves 25dvh
when open. [React portal identity](https://react.dev/reference/react-dom/createPortal#parameters) · [Page layout](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx)
