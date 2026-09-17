# Brick presentation templates

Name presentation components `<Module><Template>` and use matching
PascalCase filenames.

- **Module** — PascalCase of the `defineModule` `id` (for example `GitHubProfile`, `FigmaThumbnail`)
- **Template** — a layout-role id that describes what differs in markup (not a
  breakpoint suffix, not a grid size like `4x4`)

Helpers such as `*Card`, `*Activity`, `*Graphic`, forms, lookups, and `*Backend`
are not presentations and keep their own names.

Select complete presentations once in the module definition. `defineModule`
still keys responsive slots by breakpoint (`sm` required; `md`, `lg`, and `xl`
optional). Each slot is `{ w?, h?, defaultSpec, options? }`. Provide both `w`
and `h` or neither. Omitted dimensions inherit from the nearest smaller
breakpoint. Omitting dimensions in a larger breakpoint does not clear an
inherited declared size.

After inheritance, resolved `w`/`h` presence is the size contract:

- Both absent: every surface (filmstrip, module-page gridItem, drag placeholder,
  wall drop) sizes from unconstrained intrinsic px as
  `ceil(px / that breakpoint’s gridItemWidth)` (min 1).
- Both present: use that declared grid size; do not measure for gridItem or
  drag sizing.

Keep optional `w`/`h` on the API. Intrinsic pixel and derived grid sizes stay
available even when they exceed the wall width; React Grid Layout owns wall
bounds correction.

GitHub profile omits declared dimensions and is sized from measurement:

```ts
defineModule({
  id: "github-profile",
  // …
  breakpoints: {
    sm: { defaultSpec },
  },
});
```

Text and map-place retain declared `sm: { w: 4, h: 4, defaultSpec }` because
their presentations need a containing cell. Link-style modules also omit size:

```ts
breakpoints: {
  sm: { defaultSpec },
},
```

In the GitHub profile example, `md`, `lg`, and `xl` inherit `sm` (no declared
dimensions). Text and map-place inherit `4×4` at every larger breakpoint. Grid
container thresholds are 720px (`md`), 1080px
(`lg`), and 1440px (`xl`); `sm` covers smaller widths. Preview widths are
360 / 720 / 1080 / 1440 so one column is 45 / 90 / 135 / 180 on the 8-col
grid. Shared defs live in `apps/library/lib/breakpoints.ts`.

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
below) at every breakpoint. Its appearance form edits per-breakpoint
`imagePosition`, which the presentation applies directly to its image's
`object-position`. These options do not change grid dimensions.
