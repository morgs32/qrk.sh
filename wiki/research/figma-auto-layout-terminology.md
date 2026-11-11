# Figma Auto Layout terminology

Researched 2026-11-10 for the QRK Row sizing discussion.

## Flow and sizing

- **Auto Layout** describes how a frame arranges its children. Figma offers horizontal, vertical, and grid flows. The Plugin API calls this `layoutMode` and also exposes `NONE` for a frame without Auto Layout. [Figma Auto Layout guide](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout-in-Figma) · [Plugin API `layoutMode`](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutmode/)
- **Fixed**, **Fill container**, and **Hug contents** describe sizing on each axis. Fixed keeps an explicit dimension and applies to both Auto Layout frames and their children. Fill container lets a child expand into available space in its parent. Hug contents sizes an Auto Layout frame around its children and spacing. A nested Auto Layout frame can therefore participate in its parent’s flow and use a fixed width. [Figma Auto Layout guide](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout-in-Figma) · [Plugin API `layoutSizingHorizontal`](https://developers.figma.com/docs/plugins/api/properties/nodes-layoutsizinghorizontal/)
- **Ignore auto layout** takes a child out of the flow while keeping it in the frame. It is Figma’s name for absolute positioning within an Auto Layout frame. [Figma Auto Layout guide](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout-in-Figma)

## Alignment and distribution

- With a numeric gap, a horizontal Auto Layout frame can align its children as a group to the left, center, or right. The alignment control belongs to the parent. [Figma horizontal and vertical flows](https://help.figma.com/hc/en-us/articles/31289464393751-Use-the-horizontal-and-vertical-flows-in-auto-layout)
- **Auto** gap distributes surplus space. **Between** puts that space between children, with the outer children at the edges. **Around** gives the edges half an interior gap. **Evenly** gives the edges and interior equal gaps. With just one child, Between defaults to the left in horizontal flow, while Around and Evenly center it. [Figma Auto Layout and CSS Flexbox](https://help.figma.com/hc/en-us/articles/42031586813719-Use-auto-layout-with-CSS-Flexbox-in-mind) · [Plugin API `primaryAxisAlignItems`](https://developers.figma.com/docs/plugins/api/properties/nodes-primaryaxisalignitems/)

In QRK terms, this suggests treating a Placement’s width and a Row’s distribution as separate choices. A 480px Placement can stay in the Row’s normal flow and be centered, or two explicit-width Placements can use Between to push apart. Today’s QRK width weights divide the available width among Placements. **Fill container** is the closest Figma label for a growing child, while QRK’s weighting remains its own allocation rule. [QRK layout conventions](../brick-layout-conventions.md) · [Figma Auto Layout and CSS Flexbox](https://help.figma.com/hc/en-us/articles/42031586813719-Use-auto-layout-with-CSS-Flexbox-in-mind)
