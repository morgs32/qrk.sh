# Studio stack drop outline layering

Researched 2026-10-20 against current source and the installed Pragmatic Drag and Drop indicator package, version 4.2.4. The chosen wrapper promotion is implemented and manually verified in the existing Storybook; observations and limits are recorded in [Plan 033](../archive/plans/033-plan-studio-stack-drop-layer.md).

## Finding

The implementation promotes the active stack's **outer cell**. Increasing `z-index` only on `[data-layout-stack]` misses the element that paints the outline: Pragmatic's `GroupDropIndicator` adds a parent `div`. The existing relative cell contains both. [Story structure](../../apps/app/components/PragmaticTree.stories.tsx), [library component](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/react-drop-indicator/src/group.tsx#L14-L44).

```text
section grid (relative; z-index auto)
└─ stack cell (relative; active z-50, otherwise auto)
   └─ GroupDropIndicator div                ← outline belongs here
      └─ data-layout-stack (relative)
         ├─ floating header
         ├─ insertion boundaries
         └─ item rows / Move buttons
```

The library's active wrapper uses an informational background and a solid selected-color CSS `outline`. Installed fallback values are **2px width with 6px offset**, extending its visible ink outside the stack cell. It supplies no positioning or stacking level. This is an outline rather than a layout border. [Installed component, lines 10–18](../../apps/app/node_modules/@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/dist/esm/group.js#L10), [installed CSS, lines 1–5](../../apps/app/node_modules/@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/dist/esm/group.compiled.css#L1), [CSS outline properties](https://www.w3.org/TR/css-ui-4/#outline-props).

## Current activation and competing layers

1. `activeGroup` comes from **the innermost current drop target**, `location.current.dropTargets[0]`. A stack append target provides its group ID; item-row reorder and item-insertion targets do not. Consequently, the whole-stack outline appears for a direct stack append target, while a row or insertion-boundary target uses its insertion indicator. The implementation reuses this existing outline activation. [Target registration, state selection, and matching wrapper/outline conditions](../../apps/app/components/PragmaticTree.stories.tsx).
2. The inner stack already becomes `z-30` on hover or focus-within, but its parent outline does not join that stacking context. The floating header is `z-30`; first/empty insertion boundaries are `z-40`, other boundaries `z-10`, and Move buttons `z-20`. Source-stack/item opacity becomes `0.4` during its drag. Headers are hidden and pointer-disabled during every drag. [Stack, header, boundaries, and Item rendering](../../apps/app/components/PragmaticTree.stories.tsx).
3. A positioned element with non-auto `z-index` creates a stacking context; raising it promotes its descendants together. Descendants cannot escape an ancestor stacking context. Grid items also establish a context with non-auto `z-index`, even without positioning. For this tree, the existing cell is already positioned and is the direct grid item. [CSS layered presentation](https://www.w3.org/TR/CSS22/visuren.html#z-index), [grid z-order](https://www.w3.org/TR/css-grid-1/#z-order). Opacity below one independently creates a context for a dragged source. [CSS opacity](https://www.w3.org/TR/css-color-4/#transparency).
4. No stack/section ancestor in this story's JSX introduces clipping overflow, paint containment, isolation, or transforms. The source therefore supports a local wrapper fix; it does not establish computed styling outside the story. A high stacking level cannot defeat ancestor overflow clipping if clipping is later introduced. [Story ancestors](../../apps/app/components/PragmaticTree.stories.tsx), [CSS overflow](https://www.w3.org/TR/css-overflow-3/#overflow-properties).

## Chosen option and alternative

1. **Raise the existing active cell — chosen and implemented.** The relative cell that encloses `GroupDropIndicator` receives `z-50` only when `` activeGroup === `stack-${stack.id}` ``, matching its outline. Otherwise no z-index class is supplied, retaining `auto` rather than creating an inactive `z-0` context. `z-50` exceeds the existing neighboring `z-40` boundary layer. This promotes the outline, content, and existing insertion indicator together, preserves the library decoration, and needs no new state or overlay. [Implemented condition](../../apps/app/components/PragmaticTree.stories.tsx).
2. **Raise a separate decoration only.** An independently positioned `pointer-events: none` overlay could leave content order untouched. That requires replacing or suppressing the library's outline and reproducing its geometry/tokens in an owned layer. It is justified only if promoting the existing content causes an actual overlap problem or the user requires independent decoration ordering. CSS excludes `pointer-events: none` boxes from pointer targeting. [Pointer-event control](https://www.w3.org/TR/css-ui-4/#pointer-events-control).

Raising the cell is a painting change, not an explicit drop-target-priority API. Pragmatic searches from the deepest hovered DOM target upward; `elementFromPoint` resolves eligible boxes in painted order. The story calls it directly in stack and section `canDrop`. Existing 16px insertion hit bands extend 8px beyond their boundaries, so promoting their ancestor can change which band wins where adjacent sections overlap. The implementation preserves the existing hit-area geometry; manual seam review was completed for the cases recorded in Plan 033. [Pragmatic drop targets](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/drop-targets#nested-drop-targets), [CSSOM hit testing](https://www.w3.org/TR/cssom-view-1/#dom-document-elementfrompoint), [story hit checks and boundary geometry](../../apps/app/components/PragmaticTree.stories.tsx).

CSS leaves the exact stacking of outlines to browser implementations, so source reasoning alone cannot certify the final pixels. Browser review should include both horizontal neighbors, the adjoining section above/below, first/last/empty boundaries, and a focused neighboring Move control. [Outline stacking](https://www.w3.org/TR/css-ui-4/#outline-props).

## Agreed decision

On 2026-10-20, the user selected promotion of the whole existing wrapper, including its outline, items, and insertion indicator. Source now implements that decision with conditional `z-50` on the existing outer cell. [Plan 033](../archive/plans/033-plan-studio-stack-drop-layer.md) records completed source review, manual drag observations, restoration of the original mock layout, and scope limits.

No nested-stack solution is needed: current source and app documentation define sections containing peer stacks, with peer items inside each stack. This styling change introduces no domain term or ownership change. Concurrent glossary maintenance was preserved. [Current app behavior](../../apps/app/README.md#L48), [existing glossary](../glossary.md).
