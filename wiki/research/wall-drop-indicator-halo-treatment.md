# White-and-blue halo treatment for Wall drop indicators

Researched 2026-10-23. The initial research phase made no application changes or visual verification. Its proposed treatment was subsequently added as the unverified Storybook prototype described below.

## Current starting point

The large-indicator Storybook variant uses 20px rectangles centered on the existing seams, `rgb(24 104 219 / 35%)` fill, square corners, and no terminal circles or shadows. The Wall currently has a `#E6AA80` background; preserve that local choice. Brick indicators sit outside the Row scroller in a sibling overlay that has `overflow-clip`. [Story CSS](../../apps/app/components/WallEditorLargeIndicators.stories.css), [WallEditor](../../apps/app/modules/lib/wall/WallEditor.tsx).

Atlassian's standard is a 2px selected-color line with an 8px terminal, centered in the gap for stacked items. Its guidance explicitly allows other products to create their own drag-and-drop visual language. A 20px glass-like rectangle is therefore our design proposal, not an Atlassian-recommended preset. [Pragmatic drag and drop design guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines).

## Recommended treatment

Try a **light blue pane with a crisp blue perimeter, a thin inner white separator, and a soft blue halo**. Keep its 20px geometry and seam anchors. Proposed values:

- Blue fill at 18% opacity, reduced from 35%, to leave Brick content readable through it.
- A 1px blue edge followed by a 1px white inner ring at 90% opacity.
- A restrained blue halo: 10px blur, 2px spread, 30% opacity.
- A 3px radius to soften the rectangular ends; no circles or motion.

Illustrative replacement of the existing story-local decoration rule:

```css
.wall-large-drop-indicators [data-wall-drop-indicator] > div {
  /* 1. Keep the existing rectangle geometry and translucent fill. */
  --ds-border-width-selected: 20px;
  background-color: rgb(24 104 219 / 18%);
  border-radius: 3px;

  /* 2. Frontmost blue ring, then white separation, then soft halo. */
  box-shadow:
    inset 0 0 0 1px #1868db,
    inset 0 0 0 2px rgb(255 255 255 / 90%),
    0 0 10px 2px rgb(24 104 219 / 30%);
}
```

Keep the existing terminal-hiding and edge-position rules. Use color alpha rather than fading the whole element, so the fill can remain translucent while its edges stay crisp. The shadow recipe relies on CSS's front-to-back shadow order: the first inset ring covers the outermost pixel of the second. Shadows do not change layout or increase scrollable overflow; inset shadows paint inside the box and the blurred outer shadow paints outside it. [CSS Backgrounds and Borders: shadow geometry and layering](https://www.w3.org/TR/css-backgrounds-3/#box-shadow).

## Halo versus backdrop blur

Start with the layered shadows above. They supply the requested glow directly. `backdrop-filter: blur(2px)` would instead blur the Brick pixels behind the translucent rectangle; its reach also depends on ancestor backdrop roots, including ancestors with opacity, filters, or masks. That is a separate frosted-glass effect, not necessary for the halo. If a later visual comparison calls for frosting, add the 2px blur as a separate experiment while retaining the crisp rings. [MDN backdrop-filter reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter).

## Integration limitation and visual review

The current Row overlay clips paint at its boundary. An external halo, and any portion of a seam-centered 20px rectangle outside that boundary, will be cut off there. This follows from the current wrapper plus `overflow: clip`; changing only the rectangle's CSS cannot remove the clipping. Increasing its z-index cannot restore clipped paint. [WallEditor overlay](../../apps/app/modules/lib/wall/WallEditor.tsx), [CSS Overflow clipping](https://www.w3.org/TR/css-overflow-3/#overflow-properties).

For the first visual prototype, retain current clipping and treat exterior halos as intentionally truncated. Showing the full halo at outer edges would require a separate overlay-boundary decision that also prevents paint leaking into adjacent Stacks. Do not change scroll geometry merely to add decoration. The recommendation is an aesthetic candidate, not a claim that its contrast or boundary behavior has been verified.

The user should compare it over light content, colored swatches, the gray placeholder, and the current peach Wall background; inspect internal seams and outer edges at narrow and wide widths. Check whether the white ring stays legible and the halo remains subordinate to the insertion location. No browser inspection, tests, builds, formatters, or automated checks were run.

## Prototype status

[Halo drop indicators](http://127.0.0.1:10044/iframe.html?id=app-studio-wall-editor--halo-drop-indicators&viewMode=story) uses 20px rectangles, 3px corners, inset 1px blue and 2px white (90%) shadows, and a blue halo with 10px blur, 2px spread, and 30% opacity. The user refined the proposed 18% `#1868DB` fill to 50% white; the original recommendation and recipe above remain as research history. Its [story stylesheet](../../apps/app/components/WallEditorHaloIndicators.stories.css) shares the large-indicator baseline geometry and terminal hiding. It retains current clipping and adds no backdrop blur or motion. The prototype is unverified; the user handles visual verification.
