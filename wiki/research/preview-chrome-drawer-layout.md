# Preview chrome above the drawer

Researched 2026-11-05 from the owning repository source. This is a source comparison, not a new browser verification or an implementation change.

## Existing stories

The story group is **App/Studio/Wall Editor**. **Default** (and the stories using its shared render) already reserves layout space for the drawer: its outer column gives the preview `main` the remaining height (`min-h-0 flex-1 overflow-auto`), then places a 280px drawer sibling below it using `layoutMode="flow"`. The preview frame uses `minHeight: "100%"`. The catalog is always present in that shared story shell; it is not an open/closed example. [Story group and Default](../../apps/app/components/WallEditor.stories.tsx#L668-L748), [preview sizing](../../apps/app/components/WallEditor.stories.tsx#L481-L485), [preview and flow drawer layout](../../apps/app/components/WallEditor.stories.tsx#L552-L612).

**StackNameEditor** is the closest conditional example: a flex column holds the scrolling preview above a flow drawer, and the 280px drawer is rendered only when `stackId` is defined. When no stack editor is selected it renders a short instruction instead. It proves an existing route-driven conditional layout pattern, not an exact replica of the live 25dvh drawer or a full chrome-sizing test. [StackNameEditor](../../apps/app/components/WallEditor.stories.tsx#L1623-L1673).

**VerticalDrawer** uses the shared shell and changes the catalog to a 420px right column at viewport widths of 1024px and above; below that it retains the bottom drawer. This is explicitly a Storybook-only experiment, not an open-state rule. [VerticalDrawer](../../apps/app/components/WallEditor.stories.tsx#L1750-L1761).

## Why the live editor differs

The live page already derives `drawerOpen` from the matched drawer route. It retains a full-height scrolling preview, adds 25dvh of bottom spacer only while open, and offsets the breakpoint toolbar above the open drawer. The drawer remains a fixed overlay. That spacer makes the page bottom reachable by scrolling; it does not shorten the preview viewport to end above the drawer. [Route state](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx#L28-L38), [spacer reservation](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx#L66-L79), [live layout and toolbar](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx#L159-L193), [fixed drawer dimensions](../../apps/app/modules/lib/Drawer.tsx#L30-L35).

The live frame's minimum height comes from `--wall-frame-height`, calculated from `100dvh` less preview gutters; the drawer height is absent from that calculation. The bottom chrome is the normal-flow 64px `powered by qrk.sh` footer, so a full-viewport minimum frame can put that footer behind the overlay until scrolled. The top `BrowserChrome` is a separate sticky 48px address bar. [Live frame minimum](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/PagePreview.tsx#L43-L59), [viewport variables](../../apps/app/modules/bricks.css#L7-L14), [footer](../../apps/app/modules/lib/wall/WallEditor.tsx#L1216-L1221), [top chrome](../../apps/app/modules/lib/BrowserChrome.tsx#L5-L15).

## Recommended scope

Apply the story's **remaining-height preview** idea to the live shell, gated by its existing `drawerOpen`: reserve the existing 25dvh from the preview's visible area while open, and derive the frame minimum from that available height. Restore the full preview area when closed. Keep tall page content scrollable; “bottom out above” should constrain the preview viewport/minimum frame, not crop or shrink authored content. Remove or reconcile the current spacer when changing the viewport reservation so the drawer space is not counted twice. This is a recommendation inferred from the cited live layout and story structure, not existing live behavior.

No new drawer component, state store, or module-level dependency is needed: the live page already owns both `drawerOpen` and the preview/drawer siblings. The existing `Drawer` flow mode is available, but simply switching that prop is insufficient because its explicit `open` branch also applies inline 25dvh height and transform/visibility lifecycle behavior. Preserve that lifecycle deliberately if choosing flow layout. [Live owner](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx#L159-L193), [Drawer defaults](../../apps/app/modules/lib/Drawer.tsx#L38-L55), [inline open-state styling and flow classes](../../apps/app/modules/lib/Drawer.tsx#L135-L162).
