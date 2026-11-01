# Brick hover stroke and halos

Researched 2026-10-28 from current QRK source and primary CSS specifications.
This is a design recommendation. No application code or browser state was changed
by this research.

## Recommendation

**Use one decorative overlay with a real 1px opaque border and two sharp
box-shadows: one outer halo at 30% alpha and one inset halo at 15% alpha.** The halos
already use shadows in the current source. Reconsidering the implementation from
scratch leads to the same small design; replacing the border with another shadow
would not remove a wrapper, state, or layout dependency. [Current shared hover
rule](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:117).

This is a recommendation for these requirements, not a universal CSS rule.
The current source supplies a common decoration to the drawer template and the
Wall content, while keeping the rendered module and drop hitbox separate.
[Drawer template](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModulePreview.tsx:75),
[Wall content and hitbox](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/wall/WallPlacement.tsx:21).

## Exact treatment

Keep the following paint on the existing `::after`, with no extra DOM or module
interface:

```css
/* Fully opaque central stroke. */
border: 1px solid #1f9bfc;

/* Same blue, independently chosen alpha, no offset or blur. */
box-shadow:
  0 0 0 1px rgb(31 155 252 / 30%),
  inset 0 0 0 1px rgb(31 155 252 / 15%);
```

Zero blur makes a sharp edge. The outer spread occupies the 1px band outside the
border edge; the inset spread occupies the 1px band inside the padding edge.
Shadows follow the box's corner geometry. [CSS shadow shape and spread](https://www.w3.org/TR/css-backgrounds-3/#shadow-shape).

Keep the overlay absolutely positioned at `inset: 0`, with inherited radius,
`pointer-events: none`, and its current paint order below the action controls.
Absolute positioning removes it from normal flow, so its border does not consume
Brick layout width. [Current overlay](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:119),
[CSS absolute positioning](https://www.w3.org/TR/css-position-3/#valdef-position-absolute).

The overlay's visibility should be 0 or 1. Put 30% outer / 15% inset alpha on the shadow colors,
not reduced `opacity` on the whole overlay: group opacity would also fade the central
stroke. The gray and white backgrounds will naturally produce different halo
pixels from the same alpha. [CSS group opacity](https://www.w3.org/TR/css-color-4/#transparency).

## Why the overlay earns its place

Painting inset shadows directly on the Brick host risks opaque module children
covering them. CSS paints inset shadows above their own box's background but
below its normal content. The separate transparent overlay sits above module
content and lets that content remain visible through the halo. Moving the same
paint onto an existing overlay therefore serves an actual paint-order need,
not a hypothetical abstraction. [CSS shadow layering](https://www.w3.org/TR/css-backgrounds-3/#shadow-layers),
[Wall content layering](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/wall/WallPlacement.tsx:31).

Shadows do not change layout or expand scrollable overflow. Their outer pixels
can still be clipped by a clipping ancestor; using shadows does not remove that
constraint. Preserve visible editor overflow and keep content clipping local to
the module surface. [CSS shadow layout](https://www.w3.org/TR/css-backgrounds-3/#shadow-layers),
[Local surface clipping](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:108).

## Shadow-only and outline alternatives

A shadow-only overlay is possible: opaque inset 1px first, translucent inset 2px
behind it, and translucent outer 1px. The opaque inner layer masks the overlap.
That needs three ordered shadow layers to reproduce the same three bands; it
removes one border declaration but no structural complexity. Its pixel parity
has not been tested. [CSS front-to-back shadow order](https://www.w3.org/TR/css-backgrounds-3/#shadow-layers).

A useful reason to keep the real border is forced-colors behavior: box-shadows
compute to `none` there, while border colors participate in the user's forced
palette. A shadow-only treatment loses its entire visible stroke unless an
additional border/outline fallback is added. Do not use `forced-color-adjust:
none` merely to preserve this decorative blue. [CSS forced-color properties](https://www.w3.org/TR/css-color-adjust-1/#forced-colors-properties).

An outline is suitable for a single ring and does not consume layout space, but
it does not supply both halos on its own. It also shares the property commonly
used for browser keyboard-focus indication. The outer Brick content decoration
can be shared by hover and `:focus-within`, while inner control focus outlines
remain intact. Do not remove those control outlines to free that property.
[CSS outlines](https://www.w3.org/TR/css-ui-4/#outline),
[Existing focus/open-menu treatment](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/wall/WallPlacement.tsx:25).

## Bounded target

The recommended target is already expressed by the current 30% outer / 15% inset shared hover
rule. The approved focus change reveals that same content overlay for
`:focus-within` in drawer and Wall Bricks, outside the hover media query. Remove
only the old outer Placement's focus-border utilities; retain its menu-open
border, since the menu portal takes actual focus outside the Brick DOM. Preserve
inner control focus rings, tab order, and the
separate drag-preview rule. Add no wrapper,
configuration API, extra state, or compatibility path. [Hover and drag rules](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:117).

The user first reduced both halos from 50% to 30%, then softened only the
inside halo to **15%**, keeping the outside at **30%**. The central border stays
fully opaque. The earlier 30%/30% live verification is historical; the parent verified the latest hovered pseudo-element computes an opaque
`1px solid rgb(31,155,252)` border, an outer `rgba(31,155,252,.3)` shadow, and
an inset `rgba(31,155,252,.15)` shadow. Both halos retain zero offset/blur and
1px spread. Formatting and diff checks pass in both checkouts.
[Latest hover](/tmp/qrk-inner-halo-15.png).

For further implementation changes, verify contrasting backgrounds, sharp and
rounded variants, keyboard focus, visible overflow, and unchanged hitboxes.
This research did not independently run forced-colors acceptance.

## Focus-change verification

The parent verified the following focus treatment in the root Storybook and
live App without changing model data. Action visibility observations below
precede the later strict visibility change and are historical where marked:

- Keyboard focus without hover reveals the same opaque 1px core and 30% outer /
  15% inset halos in Wall and drawer Bricks; the old padded outer stroke stays
  transparent. Tabbing to the next Brick clears the previous content decoration.
- Moving focus between two links inside one drawer Brick keeps its decoration
  visible. Combined hover and focus remain one decoration; moving the pointer
  away from a focused Brick does not hide it.
- Opening the portal menu moves real focus outside the Brick: its content
  decoration clears while the existing outer menu border remains. At that time,
  menu-open state also kept actions visible; that behavior is now superseded.
  Escape restores trigger focus, content decoration, and the control's own
  focus-visible indicator; the outer menu stroke becomes transparent again.
- Storybook gaps 0/4/12 keep the focus stroke on content despite Placement
  padding 0/2/6. A temporary rounded-card test retained the same focus decoration
  with an 8px surface radius. Selected-class-only on an unfocused, unhovered
  Brick revealed actions without either stroke in that earlier test; selected-only
  action visibility is now superseded. Temporary classes were restored.
- App TypeScript passes in both checkouts; targeted formatting and diff checks
  pass. [Live keyboard-focus evidence](/tmp/qrk-focus-matches-hover.png).

These are parent-reported implementation checks, not an independent
forced-colors acceptance run by this research agent.

## Current BrickAction visibility

The user subsequently restricted BrickAction tabs to actual Brick hover or
`:focus-within`. Selection and `is-menu-open` no longer force the tab visible,
and the always-visible coarse/no-hover fallback is removed from BrickAction.
The separate menu-open border, selected props, inner control focus behavior,
and tab order remain. StackAction's fallback visibility is unchanged.
The parent verified the current behavior on a genuinely selected Brick:
no hover and no focus gives action opacity 0; keyboard focus on the trigger with
the pointer away gives opacity 1; tabbing outside returns opacity to 0. A
temporary DevTools hover state without DOM focus gives opacity 1 and was cleared
afterwards. The old selected/menu opacity override and coarse-pointer fallback
classes are absent. Targeted formatting and diff checks pass in both checkouts.
[Strict action visibility](/tmp/qrk-action-hover-focus-only.png).

## Remaining research work

None.
