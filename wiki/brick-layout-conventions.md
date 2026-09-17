# Brick presentation templates

Name presentation components `<Module><Template>` and use matching
PascalCase filenames.

- **Module** — PascalCase of the `defineModule` `id` (for example `GitHubProfile`, `FigmaThumbnail`)
- **Template** — a layout-role id that describes what differs in markup (not a
  breakpoint suffix, not a grid size like `4x4`)

Helpers such as `*Card`, `*Activity`, `*Graphic`, forms, lookups, and `*Backend`
are not presentations and keep their own names.

## Modules vs placed bricks

Module versions (`makeModuleVersion` + `makeFrontend`) do **not** declare
breakpoints. A module owns identity, catalog, `stateShape`, `defaultState`, one
`defaultSpec`, and a React brick. Grid sizing is never part of the module
definition.

Placed bricks in the wall store own viewport layout explicitly:

```ts
{
  moduleId: string
  state: unknown
  sm: { spec: Spec; gridItem: LayoutItem; isVisible: boolean }
  md: { spec: Spec; gridItem: LayoutItem; isVisible: boolean }
  lg: { spec: Spec; gridItem: LayoutItem; isVisible: boolean }
  xl: { spec: Spec; gridItem: LayoutItem; isVisible: boolean }
}
```

Each of `sm` / `md` / `lg` / `xl` always has a `spec` and a `gridItem`.
`isVisible` is the hide bit; the wall includes a layout item only when
`isVisible` is true. There is no cascade from a smaller breakpoint and no
declared module size to inherit.

On drop, the wall copies the dropped `gridItem` and clones the module
`defaultSpec` onto all four breakpoints with `isVisible: true`. Later
`setSpec` edits one breakpoint only. `setVisible` flips `isVisible` only.

## Measurement

Filmstrip, module-page previews, and drag payloads always size from unconstrained
intrinsic px as `ceil(px / that breakpoint’s gridItemWidth)` (min 1). Drag
payloads carry measured `w` / `h` next to `spec`, not on the module `def`.

Intrinsic pixel and derived grid sizes stay available even when they exceed the
wall width; React Grid Layout owns wall bounds correction.

## Viewport breakpoints

Grid container thresholds are 720px (`md`), 1080px (`lg`), and 1440px (`xl`);
`sm` covers smaller widths. Preview widths are 360 / 720 / 1080 / 1440 so one
column is 45 / 90 / 135 / 180 on the 8-col grid. Shared viewport defs live in
`apps/library/lib/breakpoints.ts`. That file resolves wall width to a viewport
id; it is not module inheritance.

## Frontend render

`makeFrontend` uses the incoming `breakpoint` prop and the stock Renderer path.
It performs no measurement and owns no context. Data props are inferred from the
module data contract. Render each json-render leaf as a React component so hooks remain
valid. Switching specs remounts json-render local state.

Keep each presentation's markup explicit rather than scattering breakpoint
conditions throughout it. Ordinary data-dependent rendering is still
appropriate. Template names describe layout role; catalog dimensions, schemas,
and persisted configuration do not change when you rename a presentation.

The GitHub profile catalog uses `GitHubProfile` (avatar, bio, and
icon/count statistics without a contribution calendar) and
`GitHubProfileCalendar` (same card with contribution activity). Sibling wide
templates `GitHubProfileActivityHero` and `GitHubProfileStatsRow` keep activity
markup distinct from the square templates. Shared chart markup lives in the
helper `GitHubProfileActivity`, not in a presentation filename.

The Figma thumbnail catalog uses `FigmaThumbnail` (preview with brand bar
below). Appearance is driven by the placed brick's per-viewport `spec`, not by
module-declared breakpoint options.
