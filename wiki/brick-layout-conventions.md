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

A brick row (`makeBrickModel`) persists `moduleId` and shared `state` on the
wall instance. Complete json-render Specs, grid items, and visibility live on
**Placement** rows (one per brick × breakpoint).

Library sandbox ownership (contracts via `LibrarySandboxProvider` /
`makeMockSession`):

```text
Wall → Brick → Placement [sm, md, lg, xl]
```

- **Wall** — collection of bricks (`wal_sandbox` seeded per mock session).
- **Brick** — wall reference, kebab `moduleId`, and shared `state`. Grid item
  `i` equals the brick id across all four placements.
- **Placement** — brick, breakpoint, complete Spec, `gridItem`, `isVisible`.

Studio still uses the exported Zustand `BrickWall` / `GridStore` path and is
not on this contract model yet.

On sandbox drop, `addBrick` creates the brick and four visible
placements in one command. It preserves the active breakpoint’s collision-resolved
layout and resolves the copied drop against each other breakpoint’s own visible
layout without automatic compaction. Unrelated gaps survive until the toolbar
**Compact layout** command runs. Hide flips visibility only; show resolves
collisions around the saved position. Spec edits update one placement; state
edits update the shared brick row.

## Measurement

Filmstrip, module-page previews, and drag payloads always size from unconstrained
intrinsic px (`MeasuredBrickWrapper` `onChange`) as `minGridUnits` —
`ceil(px / that breakpoint’s gridItemWidth)` (min 1). `GridItemPreview` paints the
snapped cell and wraps `BrickWrapper`. Drag payloads carry measured `w` / `h`
next to `spec`, not on the module `def`.

`MeasuredBrickWrapper` must not use Tailwind `@container`. Size containment on
the measure root makes `width: max-content` ignore children (0×N). It also
avoids `min-w-0` and stretch (`items-start` instead). `[data-brick-measure]` in
`bricks.css` undoes fill leftovers (`w-full`, `flex-1`, `truncate`) so Body/Footer
can size to content.

Intrinsic pixel and derived grid sizes stay available even when they exceed the
wall width; React Grid Layout owns wall bounds correction. The sandbox grid uses
`noCompactor` so collisions displace neighbors without closing gaps.

## Viewport breakpoints

Grid container thresholds are 720px (`md`), 1080px (`lg`), and 1440px (`xl`);
`sm` covers smaller widths. Preview widths are 360 / 720 / 1080 / 1440 so one
column is 45 / 90 / 135 / 180 on the 8-col grid. Shared viewport defs live in
`apps/library/lib/breakpoints.ts`. That file resolves wall width to a viewport
id; it is not module inheritance.

## Frontend render

`makeFrontend` uses the incoming `breakpoint` prop and the stock Renderer path.
It performs no measurement, owns no context, and does not wrap fill chrome.
Callers wrap `BrickWrapper` (wall / `GridItemPreview`) or `MeasuredBrickWrapper`.
Json-render `BrickShell` is a filling flex column (`flex h-full flex-col`)
that groups `BrickBody` then `BrickFooter`. Data props are inferred from the
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
below). Appearance is driven by the placement Spec at the active breakpoint, not
by module-declared breakpoint options.
