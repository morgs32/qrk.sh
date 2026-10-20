# Content-driven heights in react-grid-layout

Researched 2026-10-19 against the official RGL 2.3.0 sources and QRK's installed 2.2.3. This is research; application code and dependencies are unchanged.

## Finding

**Different items can have different heights through their individual `h` row spans. RGL does not provide a built-in content-height strategy that measures children and rounds their height upward.** The layout model supplies numeric `h`, `minH`, and `maxH`; the grid supplies one `rowHeight`. `autoSize` grows the **grid container** from the bottom of the layout, rather than measuring each child's content. [Layout model](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/src/core/types.ts#L28-L59), [grid configuration](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/README.md#gridconfig), [container calculation](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/src/react/components/GridLayout.tsx#L454-L464).

The supported application-level approach is to measure natural content, convert that pixel requirement to a row span, and provide a changed `h` through the controlled `layout`. The component synchronizes changed layout props and runs the configured compactor. This is an approach derived from those APIs, not an official automatic-content-sizing recipe. [Layout synchronization](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/src/react/components/GridLayout.tsx#L406-L441), [compaction during synchronization](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/src/react/components/GridLayout.tsx#L267-L269).

## Rounding up to the next row

For `h >= 1`, RGL's unrounded item-height geometry is:

```text
itemHeight = h * rowHeight + (h - 1) * marginY
```

Solving that geometry for a sufficient row span gives this **derived** formula:

```js
// requiredHeight includes all content, padding, borders, and other item chrome.
const h = Math.max(
  1,
  Math.ceil((requiredHeight + marginY) / (rowHeight + marginY)),
);
// Supply this h on the corresponding item in the next layout.
```

For example, `rowHeight = 30`, `marginY = 10`, and `requiredHeight = 95` produce `h = 3`, giving 110px of nominal height. With zero margin, the formula reduces to `Math.ceil(requiredHeight / rowHeight)`. RGL itself converts resize pixels with `Math.round`, so its ordinary resize snapping means nearest row, not always upward. [Pixel geometry and resize conversion](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/src/core/calculate.ts#L38-L59), [rounded row conversion](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/src/core/calculate.ts#L247-L275).

RGL rounds rendered coordinates and corrects settled item dimensions to preserve margins. With fractional `rowHeight`, strict content-fit sizing should check the resulting `calcGridItemPosition(...).height` and increase `h` if it is still too small. That is a deduction from the rendering calculation; the nominal formula alone is not an exact rendered-pixel guarantee. [Settled geometry correction](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/src/core/calculate.ts#L117-L152).

## What the strategy APIs do

| API | Relevance to variable height |
| --- | --- |
| `positionStrategy` | Produces CSS from an already calculated pixel rectangle and converts drag coordinates. It does not measure content or choose `h`. [API](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/README.md#creating-a-custom-position-strategy) |
| `compactor` | Arranges the supplied layout, for example packing items upward after their row spans change. [API](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/README.md#compactor) |
| `constraints` / `constrainSize` | Can enforce a minimum measured row span during user resizing, but do not automatically observe content changes. Resize dimensions arrive after `calcWHRaw` has already rounded to rows; `Math.ceil(h)` at that point cannot recover the original fractional height. [Resize pipeline](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/src/react/components/GridItem.tsx#L630-L649), [conversion](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/src/core/calculate.ts#L257-L275) |
| `snapToGrid(stepX, stepY)` | Snaps **position** (`x`, `y`) to a coarser grid. It does not snap item heights. [Implementation](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/src/core/constraints.ts#L253-L296) |

The official custom-constraints example demonstrates minimum height based on **width**, even-column placement, maximum area, and position snapping. It does not implement content measurement. [Example source](https://github.com/react-grid-layout/react-grid-layout/blob/2.2.3/test/examples/21-custom-constraints.jsx#L37-L74), [live demo](https://react-grid-layout.github.io/react-grid-layout/examples/21-custom-constraints.html).

For earlier v1 integrations, the same height geometry and nearest-row resize conversion existed; v2 adds the explicit configuration/strategy APIs and retains a `react-grid-layout/legacy` entry point. [v1 calculation](https://github.com/react-grid-layout/react-grid-layout/blob/1.5.2/lib/calculateUtils.js#L18-L31), [v1 resize conversion](https://github.com/react-grid-layout/react-grid-layout/blob/1.5.2/lib/calculateUtils.js#L123-L147), [v2 migration](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/README.md#migrating-from-v1).

## Measurement and QRK implications

A proposed implementation could use `ResizeObserver` on an inner element whose height follows its content at the actual item width. Observing the RGL-sized outer item would merely report the height RGL assigned. Include the required outer chrome in the height calculation, allow content to shrink naturally, and update layout only when the required row span changes. This is application design inferred from RGL's explicit sizing and ResizeObserver's box-size API; no implementation was performed. [RGL sizing](https://github.com/react-grid-layout/react-grid-layout/blob/2.3.0/src/core/calculate.ts#L99-L107), [ResizeObserver](https://www.w3.org/TR/resize-observer/#resize-observer-interface).

QRK currently resolves RGL **2.2.3**. Its wall already supplies per-item layout, `verticalCompactor`, `autoSize`, and a responsive row height with a vertical gap of either 0 or 16px. Therefore the rounding calculation must use the current `rowHeight` and gap, and content measurements must be refreshed when width changes. The height measurement/update path would be new work; this research changes no wall behavior or persisted layout. [Locked version](../../pnpm-lock.yaml#L7617), [row geometry](../../apps/library/lib/BrickWall.tsx#L207-L211), [grid configuration](../../apps/library/lib/BrickWall.tsx#L247-L270).
