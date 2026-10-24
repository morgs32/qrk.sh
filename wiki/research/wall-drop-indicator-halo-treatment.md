# White-and-blue halo treatment for Wall drop indicators

Researched 2026-10-23. **Superseded 2026-10-24:** the user chose a translucent copy of the dragged Brick that opens insertion space. WallEditor now uses that shadow feedback directly; the Large, Halo, and Shadow comparison stories and their stylesheets are removed. This note retains the halo research as history, not current implementation guidance. The initial research and subsequent prototype received no agent visual verification.

## Historical starting point

The large-indicator Storybook variant used 20px rectangles centered on the existing seams, `rgb(24 104 219 / 35%)` fill, square corners, and no terminal circles or shadows. The Wall had a `#E6AA80` background, retained by the chosen shadow approach. Brick indicators sat outside the Row scroller in a sibling overlay with `overflow-clip`. That indicator overlay and its story-local styling have been removed.

Atlassian's standard is a 2px selected-color line with an 8px terminal, centered in the gap for stacked items. Its guidance explicitly allows other products to create their own drag-and-drop visual language. A 20px glass-like rectangle is therefore our design proposal, not an Atlassian-recommended preset. [Pragmatic drag and drop design guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines).

## Original recommended treatment

Try a **light blue pane with a crisp blue perimeter, a thin inner white separator, and a soft blue halo**. Keep its 20px geometry and seam anchors. Proposed values:

- Blue fill at 18% opacity, reduced from 35%, to leave Brick content readable through it.
- A 1px blue edge followed by a 1px white inner ring at 90% opacity.
- A restrained blue halo: 10px blur, 2px spread, 30% opacity.
- A 3px radius to soften the rectangular ends; no circles or motion.

Historical illustration of the story-local decoration rule:

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

The proposal retained the terminal-hiding and edge-position rules and used color alpha rather than fading the whole element, keeping the fill translucent and its edges crisp. The shadow recipe relies on CSS's front-to-back shadow order: the first inset ring covers the outermost pixel of the second. Shadows do not change layout or increase scrollable overflow; inset shadows paint inside the box and the blurred outer shadow paints outside it. [CSS Backgrounds and Borders: shadow geometry and layering](https://www.w3.org/TR/css-backgrounds-3/#box-shadow).

## Halo versus backdrop blur

The proposal used layered shadows to supply the glow directly. `backdrop-filter: blur(2px)` would instead blur the Brick pixels behind the translucent rectangle; its reach also depends on ancestor backdrop roots, including ancestors with opacity, filters, or masks. That is a separate frosted-glass effect, unnecessary for the halo. The prototype added no backdrop blur. [MDN backdrop-filter reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter).

## Integration limitation and visual review

The former Row overlay clipped paint at its boundary. An external halo, and any portion of a seam-centered 20px rectangle outside that boundary, was cut off there. This followed from the wrapper plus `overflow: clip`; changing only the rectangle's CSS could not remove the clipping. Increasing its z-index could not restore clipped paint. [CSS Overflow clipping](https://www.w3.org/TR/css-overflow-3/#overflow-properties).

The first visual prototype retained that clipping and intentionally truncated exterior halos. Showing the full halo at outer edges would have required a separate overlay-boundary decision preventing paint from leaking into adjacent Stacks. The recommendation was an aesthetic candidate, not a claim that its contrast or boundary behavior had been verified.

The proposed visual comparison covered light content, colored swatches, the gray placeholder, and the peach Wall background; internal seams and outer edges at narrow and wide widths; and the white ring's legibility against the halo. No browser inspection, tests, builds, formatters, or automated checks were run.

## Superseded prototype

The removed Halo prototype used 20px rectangles, 3px corners, inset 1px blue and 2px white (90%) shadows, and a blue halo with 10px blur, 2px spread, and 30% opacity. The user refined the proposed 18% `#1868DB` fill to 50% white. It shared the large-indicator geometry and terminal hiding, retained clipping, and added no backdrop blur or motion.

The chosen implementation is the 40%-opacity Brick shadow in [WallEditor](../../apps/app/modules/lib/wall/WallEditor.tsx), available in the [Default Wall Editor story](http://127.0.0.1:10044/iframe.html?id=app-studio-wall-editor--default&viewMode=story). It opens temporary insertion space and uses the visible slot as its drop destination. The user handles visual verification.
