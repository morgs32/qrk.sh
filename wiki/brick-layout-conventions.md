# Brick breakpoint presentations

Name presentation components `<Collection><Content><Shape><Breakpoint>` and use
matching PascalCase filenames. Use semantic shapes and explicit breakpoint
suffixes rather than `Compact` or `Expanded`: `GitHubProfileSquareXs.tsx` and
`GitHubProfileSquareMd.tsx` are the GitHub profile square presentations.

Select complete presentations once in the brick definition:

```tsx
component: makeView({
  xs: GitHubProfileSquareXs,
  md: GitHubProfileSquareMd,
});
```

Import `makeView` directly from `packages/bricks/src/makeView.tsx` using the
appropriate relative path. `xs` is required; `sm`, `md`, and `lg` are optional.
An omitted breakpoint inherits the nearest smaller defined presentation. In this
example, `sm` uses `Xs` and `lg` uses `Md`. There is no `xl` breakpoint.

The helper uses the existing incoming `breakpoint` prop and forwards the same
props to the selected React component. It performs no measurement and owns no
context. Data props are inferred from `xs`; other presentations must accept
those props. Render each presentation as a React component so hooks remain valid.
Switching component types remounts their local state.

Keep each presentation's markup explicit rather than scattering breakpoint
conditions throughout it. Ordinary data-dependent rendering is still appropriate.
Shape names describe presentation; existing brick view IDs such as `4x4`,
dimensions, schemas, and persisted configuration do not change.

The square GitHub profile uses a 32px avatar, username, bio, location, website,
and icon/count statistics. `Xs` truncates overflowing values and omits activity;
`Md` retains contribution activity. The wide `4x2` brick uses `GitHubProfileWideXs` and
`GitHubProfileWideSm`, selected with `makeView({ xs: GitHubProfileWideXs, sm: GitHubProfileWideSm })`.
`Xs` puts activity in the top half and the 20px avatar/username below. `Sm`
retains statistics and labeled activity; `md` and `lg` inherit it. Compact
activity markup belongs directly to `WideXs`; the shared `GitHubProfileActivity`
only renders the larger chart used by `WideSm` and `SquareMd`.

The Figma thumbnail square uses `FigmaThumbnailSquareXs` and
`FigmaThumbnailSquareSm`; `md` and `lg` inherit `Sm`. Its view form edits
per-breakpoint `viewOptions.imagePosition`, which each presentation applies
directly to its image's `object-position`. These options do not change grid dimensions.
