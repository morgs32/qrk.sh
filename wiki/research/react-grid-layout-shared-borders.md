# Consistent shared borders in react-grid-layout

Researched 2026-10-14 against RGL 2.2.3, its official repository, CSS specifications, and the current QRK checkout. This is a research note; application code is unchanged. The CSS recipes below are proposed geometry, not an RGL feature or an approved implementation plan.

## Finding

The desired appearance is a single 1px or 2px rule at each boundary, including the exterior of each item. Ordinary borders on touching boxes occupy different strips of space, so a shared boundary is twice the individual border width. The useful CSS approach is to make the two strokes **occupy the same strip**, with the same opaque color. This follows from border geometry and source-over compositing; it does not require calculating neighboring items. [CSS border widths](https://www.w3.org/TR/css-backgrounds-3/#border-width), [source-over compositing](https://www.w3.org/TR/compositing-1/#porterduffcompositingoperators).

RGL exposes item spacing through `gridConfig.margin` and outer spacing through `gridConfig.containerPadding`; its documented configuration has no border-collapse setting. It positions the child using its position strategy and merges the calculated style into that child. CSS `border-collapse` applies to table formatting, so adding it to these positioned items does not merge their borders. [RGL 2.2.3 configuration](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/README.md#gridconfig), [GridItem source](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/src/react/components/GridItem.tsx#L819-L840), [CSS table border models](https://www.w3.org/TR/CSS22/tables.html#borders).

Focused searches of the official RGL repository and indexed issue/discussion results for shared borders, double borders, and border-collapse did not identify a maintainer-endorsed shared-border recipe. The related historical issue [#324](https://github.com/react-grid-layout/react-grid-layout/issues/324) concerns outside grid spacing, not double borders. This search result is not evidence that nobody has solved it elsewhere.

## Recommended CSS candidate: align the strokes to one side

Keep the RGL boxes touching, then draw a decorative rectangle that is one border width larger on the right and bottom. Its left/top stroke is inside the item; its right/bottom stroke is outside. Therefore the right stroke of item A and left stroke of adjacent item B cover the same interval `[sharedX, sharedX + edge]`. Repainting that interval with the same opaque color does not increase its weight. Negative absolute insets are valid CSS. [CSS positioned box insets](https://www.w3.org/TR/css-position-3/#box-insets), [opaque compositing](https://www.w3.org/TR/compositing-1/#simplealphacompositing).

```css
/* Standalone example; RGL retains control of item position/size/transform. */
.shared-edge-demo {
  --edge: 1px; /* Change to 2px for a two-pixel rule. */
  --edge-color: #cbd5e1; /* An opaque color, including in dark mode. */
  overflow: visible;
}

.shared-edge-demo::before {
  content: "";
  position: absolute;
  /* (1) Expand only the right and bottom by the full stroke width. */
  inset: 0 calc(0px - var(--edge)) calc(0px - var(--edge)) 0;
  box-sizing: border-box;
  border: var(--edge) solid var(--edge-color);
  border-radius: 0;
  /* (2) Paint above this item's content; reserve higher layers for controls. */
  z-index: 1;
  pointer-events: none;
}
```

This geometry is a candidate for rectangular items of different widths/heights, T junctions, and sparse layouts: each item still has four edges, and coincident portions overlap. It avoids introducing a half-pixel offset for a 1px rule. Its exterior right/bottom stroke extends by `edge`, so the containing surface needs that much visible space; simply clipping at the RGL bounds loses those two exterior edges. The snippet assumes the positioned item has no real border or padding that changes the decoration's containing box. [Absolute positioning containing block](https://www.w3.org/TR/css-position-3/#def-cb), [overflow clipping](https://www.w3.org/TR/css-overflow-3/#overflow-properties).

## Other approaches

| Approach | Fits | Limitation |
| --- | --- | --- |
| Centered decorative border: `border: 2px solid …; inset: -1px` | Simple opaque 2px grid; each adjacent stroke is centered on the same boundary | Extends outside every edge; requires visible overflow. A 1px version uses `inset: -0.5px`, adding device-pixel rasterization concerns. |
| Border-colored parent background, `margin: [edge, edge]`, opaque item fills | Dense rectangular dashboard where a real 1px/2px gutter is acceptable | Changes layout spacing; unoccupied regions become large patches of border color rather than outlines around isolated items. Provide matching perimeter spacing as well. |
| Top/left border per item, plus outer right/bottom frame | Completely filled regular rectangle | Holes, standalone items, and partial neighbors need exposed-edge detection. `:last-child` describes DOM order, not geometric neighbors. |
| One parent SVG/Canvas overlay that merges edge segments | Exact single ownership of rules, especially with translucent strokes or complex edges | Needs custom geometry and synchronization with drag, resize, responsive changes, and animation. |
| Plain `outline` or outer `box-shadow` on every item | Independent separated cards | Moving paint outside the box does not itself give shared edges one owner. Outlines additionally leave overlapping/obscured outline painting unspecified. |

These trade-offs are geometric deductions, not established RGL APIs. The spacing recipe uses RGL's documented `margin`; centered borders imitate the geometry of collapsed table borders without obtaining table conflict resolution. CSS defines outer shadows outside the border box and permits outlines to overlap surrounding elements. [RGL spacing](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/README.md#gridconfig), [collapsed table border geometry](https://www.w3.org/TR/CSS22/tables.html#collapsing-borders), [CSS shadow shape](https://www.w3.org/TR/css-backgrounds-3/#shadow-shape), [CSS outlines](https://www.w3.org/TR/css-ui-4/#outline-props).

## Conditions and limitations

1. **Use the same opaque stroke color.** Transparent overlapping strokes compound; two 50% strokes over transparency produce 75% opacity. Different colors also make stacking order visible. A subdued line should use a solid resolved gray rather than opacity on the stroke or its entire item. [Compositing examples](https://www.w3.org/TR/compositing-1/#simplealphacompositing).
2. **Keep decoration outside content clipping.** Negative-inset decoration placed inside a clipping wrapper loses its outside part. A content wrapper may keep `overflow: hidden` while decoration sits on the outer positioned item. Ancestors can still clip its exterior. [CSS overflow](https://www.w3.org/TR/css-overflow-3/#overflow-properties).
3. **Coordinate stacking and interaction states.** RGL's transform creates an item stacking context. A huge decoration z-index cannot escape that context, but opaque coincident strokes can tolerate either neighboring item painting last. The library elevates dragging/resizing items and draws a separate placeholder; those states are not a settled shared seam. [Transform stacking](https://www.w3.org/TR/css-transforms-1/#transform-rendering), [RGL state styles](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/css/styles.css#L16-L48).
4. **Account for rasterization without assuming a permanent RGL rounding defect.** In 2.2.3, settled item widths/heights are adjusted against the rounded start of the next item to preserve the configured margin. This supports coincident settled edges at zero margin, even when the unrounded column width is fractional. Active dragging/resizing bypass that correction; transitions can also occupy intermediate coordinates. [RGL calculation](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/src/core/calculate.ts#L117-L163), [RGL transitions](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/css/styles.css#L6-L14).
5. **Check zoom, display scale, and rounded corners separately.** CSS pixels can map to multiple device pixels, and border widths are snapped to device pixels. Fractional zoom/ancestor scale can change apparent sharpness or make a specified offset differ from the rendered border thickness. Centered 1px borders place edges at half CSS pixels; the one-sided expansion avoids that particular source of fractional geometry. Rounded individual corners do not form a continuous rectangular rule at junctions. [CSS length and pixel units](https://www.w3.org/TR/css-values-4/#lengths), [border corner geometry](https://www.w3.org/TR/css-backgrounds-3/#border-radius).

## Bounded rendering check

An isolated HTML sample was rendered and visually inspected in installed Chromium at device pixel ratios 1 and 2. Positions came from installed RGL 2.2.3 `calcGridItemPosition`, using width 397px, eight columns, row height `397 / 8`, and zero margins/padding. The sample included differently sized items, T junctions, and holes, with transformed positioned outer items, clipped inner content, opaque backgrounds, and `#222` strokes.

The right/bottom expansion recipe showed consistent exposed/shared rules at both 1px and 2px. Ordinary inset borders showed the expected doubled shared rules. A centered 1px comparison also looked acceptable in these samples; no universal blur claim follows from half-pixel positioning. This experiment verifies this static Chromium sample only. Integrated QRK drag/resize/selection, other browsers, fractional display scales, and arbitrary zoom remain unverified. The sample is `/tmp/qrk-grid-border-research.html`; screenshots are session artifacts, not committed application assets.

## QRK implications

The wall already uses eight columns, zero margin, and zero container padding, making the overlapping-stroke candidate compatible with its settled geometry. `react-grid-layout` resolves to 2.2.3 in the lockfile. [BrickWall.tsx, lines 258–263](../../apps/library/lib/BrickWall.tsx#L258-L263), [Library dependency](../../apps/library/package.json#L120), [locked package](../../pnpm-lock.yaml#L7949).

The universal `BrickWrapper` clips overflow. The outer direct RGL child wraps that content, so a future shared-edge decoration would need to sit on the outer surface, above clipped content. That surface already reserves `::after` for the active drag/resize outline at z-index 21, with resize handles at 22. Reusing that pseudo-element would overwrite existing feedback; a future implementation must preserve it and choose a separate decoration layer. [BrickWrapper.tsx, line 18](../../apps/library/components/brick/BrickWrapper.tsx#L18), [outer item and content](../../apps/library/lib/BrickWall.tsx#L480-L527), [existing outline and controls](../../apps/library/bricks.css#L102-L123).

The existing dark `--border` token is translucent, and a brick being moved outside the wall is rendered at opacity 0.4. Those values would violate the opaque-overlap assumption if applied to the permanent seam. A future implementation should define the normal shared rule and moving-item appearance separately. [Dark border token](../../apps/library/bricks.css#L83-L99), [outside-item opacity](../../apps/library/lib/BrickWall.tsx#L481-L485).

No app styling, RGL configuration, persistence, or module behavior was changed by this research.
