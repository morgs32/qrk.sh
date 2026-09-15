# Brick presentation templates

Name presentation components `<Module><Template>` and use matching
PascalCase filenames.

- **Module** — PascalCase of the `makeModule` `id` (for example `GitHubProfile`, `FigmaThumbnail`)
- **Template** — a layout-role id that describes what differs in markup (not a
  breakpoint suffix, not a grid size like `4x4`)

Helpers such as `*Card`, `*Activity`, `*Graphic`, forms, lookups, and `*Repo`
are not presentations and keep their own names.

Select complete presentations once in the module definition. `makeModule`
still keys responsive slots by breakpoint (`xs` required; `sm`, `lg`, and `xl`
optional). Each slot is `{ component, w, h }`. An omitted breakpoint inherits
the nearest smaller complete entry:

```tsx
makeModule({
  id: "github-profile",
  // …
  xs: { component: GitHubProfileStats, w: 4, h: 4 },
  lg: { component: GitHubProfileCalendar, w: 4, h: 4 },
});
```

In this example, `sm` inherits `GitHubProfileStats` and `xl` inherits
`GitHubProfileCalendar`. Grid container thresholds are 640px (`sm`), 1024px
(`lg`), and 1280px (`xl`); `xs` covers smaller widths.

`makeModule` uses the incoming `breakpoint` prop and forwards the same props
to the selected React component. It performs no measurement and owns no
context. Data props are inferred from `xs`; other presentations must accept
those props. Render each presentation as a React component so hooks remain
valid. Switching component types remounts their local state.

Keep each presentation's markup explicit rather than scattering breakpoint
conditions throughout it. Ordinary data-dependent rendering is still
appropriate. Template names describe layout role; catalog dimensions, schemas,
and persisted configuration do not change when you rename a presentation.

The GitHub profile catalog uses `GitHubProfileStats` (avatar, bio, and
icon/count statistics without a contribution calendar) and
`GitHubProfileCalendar` (same card with contribution activity). Sibling wide
templates `GitHubProfileActivityHero` and `GitHubProfileStatsRow` keep activity
markup distinct from the square templates. Shared chart markup lives in the
helper `GitHubProfileActivity`, not in a presentation filename.

The Figma thumbnail catalog uses `FigmaThumbnailHeader` (title bar above the
preview) and `FigmaThumbnailFooter` (brand bar below the preview); `lg` and
`xl` inherit `Footer`. Its appearance form edits per-breakpoint
`imagePosition`, which each presentation applies directly to its image's
`object-position`. These options do not change grid dimensions.
