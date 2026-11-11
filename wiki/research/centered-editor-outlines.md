# Centered editor outlines

Researched 2026-11-10 for the shared Brick and Stack interaction outline. The
editor already paints it on an absolutely positioned `::after`, with a 1px
blue stroke and inner and outer halos. The Brick's authored border is painted
separately inside `BrickWrapper`, so the interaction overlay's host has no
layout border. [Shared outline CSS](../../apps/app/modules/bricks.css),
[BrickWrapper](../../apps/bricks/src/react/BrickWrapper.tsx).

## Center the existing border

For a positioned block, the absolute containing block normally starts at the
host's padding edge. On these unbordered hosts, that edge coincides with the
border edge. `inset: 0` places the pseudo-element's outside edge there, so its
1px border occupies the first pixel inside the host. A negative half-width
inset moves the outside edge 0.5px out, leaving 0.5px of the stroke inside and
0.5px outside in CSS coordinates. The overlay stays out of normal flow, and the
existing z-index and halo rules can stay on their current selectors.
[CSS Positioned Layout](https://drafts.csswg.org/css-position-3/#def-cb),
[inset lengths](https://drafts.csswg.org/css-position-3/#insets),
[border width](https://drafts.csswg.org/css-backgrounds-3/#border-width).

```css
.brick-hover-surface::after,
[data-wall-stack-id]::after {
  --interaction-outline-width: 1px;
  --interaction-outline-outset: calc(var(--interaction-outline-width) / 2);
  /* Put half the stroke on each side of the host's edge. */
  inset: calc(-1 * var(--interaction-outline-outset));
  border: var(--interaction-outline-width) solid rgb(var(--brick-accent-rgb));
}
```

For the 8px card corner, a centered 1px stroke has an 8.5px outer radius and
a 7.5px inner radius. The outer edge moves out by 0.5px, and adding 0.5px to
its radius keeps the center of the curve in the same place. The CSS border
subtracts its thickness to derive the inner radius. Square Brick and Stack
corners can retain zero radius. The native drag image has a separate 2px edge
and can retain its zero inset and inherited radius.
[CSS corner shaping](https://drafts.csswg.org/css-backgrounds-3/#corner-shaping),
[card and drag styles](../../apps/app/modules/bricks.css).

## Other CSS approaches

- `outline: 1px solid` with `outline-offset: -0.5px` gives the same nominal
  offset where the outline follows the box edge. The CSS UI spec leaves exact
  outline shape and overlapping outline painting to the browser. A border on
  the existing pseudo-element gives the editor direct control over the outline
  geometry and its paint layer. [Outline geometry](https://drafts.csswg.org/css-ui-4/#outline-props),
  [outline-offset](https://drafts.csswg.org/css-ui-4/#outline-offset).
- A zero-blur outer shadow and inset shadow, each with 0.5px spread, can form
  the outside and inside halves on a borderless overlay. An outer shadow
  starts at the border edge and an inset shadow starts at the padding edge.
  The pair adds two shadow entries to the existing halo list and uses shadow
  spread rules at rounded corners. [Box-shadow shape and spread](https://drafts.csswg.org/css-backgrounds-3/#shadow-shape).

Any paint outside the host can be clipped by a clipping ancestor. The
negative inset also grows the positioned overlay's box by half a pixel per
side, which can contribute to scrollable overflow at an ancestor's scroll
edge. Shadows and CSS outlines are ink overflow. The half-width inset specifies
CSS geometry, while the rasterized stroke can vary with device-pixel alignment
and line-width snapping. [CSS overflow](https://drafts.csswg.org/css-overflow-3/#overflow-properties),
[scrollable overflow area](https://drafts.csswg.org/css-overflow-3/#scrollable),
[line-width snapping](https://drafts.csswg.org/css-values-4/#snap-a-length-as-a-line-width).
