# Atlassian insertion lines for Wall moves

Researched November 1, 2026. Research only; no application or dependency changes.

## Recommendation

Use `DropIndicator` from
`@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box` for saved-Brick move
feedback. Atlassian supplies this optional React package specifically for drop
indicators. Its box component handles horizontal and vertical edges, so it fits
both insertion seams already present in QRK.
[Official installation](https://atlassian.design/components/pragmatic-drag-and-drop/optional-packages/react-drop-indicator/code/),
[box API](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/react-drop-indicator/src/box.tsx).

Keep drawer-to-Wall insertion shadows outside this change. Current saved-Brick
moves draw custom blue lines, while drawer copies render a translucent Brick
that opens insertion space. These are separate paths in
[WallEditor](../../apps/app/modules/lib/wall/WallEditor.tsx#L637).

## Component behavior

- `edge` is required: `top`/`bottom` produce horizontal lines;
  `left`/`right` produce vertical lines.
- `gap` positions the line halfway between targets. It is a CSS-size **string**,
  such as `"0px"` or `"8px"`, rather than a number. Omission defaults to `"0px"`.
- `type` defaults to `"terminal"`, the circle-ended line. Use
  `"terminal-no-bleed"` where the terminal would be clipped, or `"no-terminal"`
  for a plain line. `indent` moves its start; `appearance` supports only
  `"default"` and `"warning"`. There are no public `className`, `style`, arbitrary
  color, or thickness props.
[Box props](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/react-drop-indicator/src/box.tsx),
[size/appearance types](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/react-drop-indicator/src/internal-types.ts).

The implementation positions itself absolutely, ignores pointer events, defaults
to z-index 1, and does not open layout space. Terminal diameter is four times
line thickness. Its containing block must therefore supply positioning and
layering appropriate to the Wall.
[Line source](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/react-drop-indicator/src/internal/line.tsx).

Atlassian's design guidance uses a 2px selected-color line with an 8px terminal,
centered in the gap. It reserves lines for relative placement and recommends
area feedback for empty destinations. Non-Atlassian products can choose their
own visual language.
[Design guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines#drop-indicator).

## Dependencies and styling

The published `4.2.4` package declares six runtime dependencies: Pragmatic core
`^4.0.0`, hitbox `^3.0.0`, React compiler gating `^0.2.0`, tokens `^20.0.0`, Babel
runtime `^7.0.0`, and Compiled React `^1.0.2`; its React peer accepts 18.2 or 19.
QRK already declares core `4.0.0`, hitbox `3.0.0`, and React `19.2.7`, so these
declared ranges align. Exact lockfile additions remain unmeasured until install.
[Published manifest](https://unpkg.com/@atlaskit/pragmatic-drag-and-drop-react-drop-indicator@4.2.4/package.json),
[App dependencies](../../apps/app/package.json).

Current published code imports its own compiled CSS; consumers need no separate
stylesheet import or styling compiler setup for this component. No React
provider or Atlassian theme initialization is needed for its default appearance:
published presets include fallbacks of `#1868DB` and `2px`. This differs slightly
from QRK's current `#1f9bfc`. Theme CSS variables `--ds-border-selected` and
`--ds-border-width-selected` can override those defaults. Prefer the stock visual
initially rather than targeting internal implementation variables.
[Published line and CSS import](https://unpkg.com/@atlaskit/pragmatic-drag-and-drop-react-drop-indicator@4.2.4/dist/esm/internal/line.js),
[published presets](https://unpkg.com/@atlaskit/pragmatic-drag-and-drop-react-drop-indicator@4.2.4/dist/esm/presets.js).

Older core documentation mentions Emotion for this optional package; the current
published package uses Compiled. The pinned published files above are the basis
for this recommendation.
[Core documentation](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/).

## Minimal QRK integration

1. Add the indicator dependency only to App using pnpm.
2. Replace the two custom `data-wall-move-indicator` render branches in
   [WallEditor](../../apps/app/modules/lib/wall/WallEditor.tsx#L681). Horizontal
   feedback can use the existing Row/Stack edge directly. Preserve an outer
   `aria-hidden`, pointer-inert wrapper for existing test markers and layering.
3. Vertical feedback currently stores a Row-relative `left` coordinate in
   [onMoveDrag](../../apps/app/modules/lib/wall/WallEditor.tsx#L233). A zero-width,
   full-height absolute anchor at that coordinate can contain
   `<DropIndicator edge="left" gap="0px" />`. This is a proposed adaptation from
   the source geometry, not a tested recipe; no Placement-anchor state or hitbox
   rewrite is necessary for this rendering change.
4. Preserve existing move resolution, no-op rejection, command payloads, drag
   preview, and drawer shadows. Check before/after Row seams, within/across-Row
   seams, empty destinations, terminals at boundaries, and selected Stack
   outlines using the existing Wall stories and browser.

No runtime, visual, or bundle-size verification was performed for this research.

## Implementation outcome

Implemented November 1, 2026: App pins the indicator package to `4.2.4`, and
WallEditor renders its stock circle-ended indicator in both move-feedback
branches. Positioning wrappers retain the existing Row-relative coordinate,
Row/Stack edges, layering, and test markers. Drawer shadows and move resolution
are unchanged. Installation added 13 packages to the workspace.

Verification: App production build passed. Storybook reported PASS for
Row Reorder, Row Reorder With Gaps, Cross Row Moves, Cross Row Moves With Gaps,
Cross Row Empty Row, and Cross Row Empty Stack. Existing story assertions now
check the rendered Atlassian line's geometry and stock color, accounting for its
4px terminal radius. A paused cross-Row story visually confirmed the horizontal
line and terminal; the live editor reloaded successfully. No bundle-size
comparison was performed.
