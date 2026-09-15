# Component and file naming

Use these rules for **repo-authored React components** that are **not** shadcn and **not** Next.js special files.

### Rule: PascalCase file name matches the component

- **Do** name the file in **PascalCase** when it exports a single React component.
- **Do** match the file name to the component name.

### Good vs bad: component file naming (PascalCase)

- **Bad**: file name doesn’t match component name
  - `apps/studio/components/home/portfolio-grid.tsx`
  - `export function Grid() { ... }`

- **Good**: file name matches component name
  - `apps/studio/components/home/Grid.tsx`
  - `export function Grid() { ... }`

### Good vs bad: one file per component

Prefer **one primary React component per file** (matching the PascalCase file name). Nesting sizable presentational or interactive subcomponents in the parent file makes diffs noisier and obscures imports.

- **Bad**: `BrickGroup.tsx` defines both `BrickGroup` and a multi-markup helper like `BrickCarouselNav` in the same module.

- **Good**: Under [BrickCarousel/](../../apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/), [BrickCarouselNav.tsx](../../apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarouselNav.tsx) exports `BrickCarouselNav` and [BrickPreview.tsx](../../apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickPreview.tsx) exports `BrickPreview`; [BrickCarousel.tsx](../../apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarousel.tsx) imports them. Keep **`data-brick-carousel-nav`** (and similar hooks into parent behavior like `watchDrag`) documented by colocation: the nav file owns the markup; the parent may still reference those attributes in drag guards.

### Exceptions (this rule does not apply)

- **shadcn/ui components**: anything under either app’s `components/ui/**` directory keeps shadcn’s conventions.
- **React Router entry files**: `apps/studio/app/main.tsx`, `apps/studio/app/routes.ts`, `apps/bricks/app/main.tsx`, and `apps/bricks/app/routes.ts` use entry/configuration names. Root components are `App.tsx` and `RootLayout.tsx`. Route components use PascalCase filenames; single-use route logic stays in its route module. Data Mode does not generate `.react-router/types/**`.
- **Next.js special files**: framework-reserved files under either app’s `app/**` directory keep their required names (for example `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`).

### Good vs bad: BrickGroup carousel slides (one panel per brick)

The brick group drawer uses shadcn `Carousel` (Embla) **per group**. Each brick is **one slide**: a bordered panel (`basis-full` on `CarouselItem`) with the draggable preview slot sized in CSS as **`calc(def[breakpoint].w * 50vw / 8)`** by **`calc(def[breakpoint].h * 50vw / 8)`**, i.e. half the viewport (site workspace `w-1/2`) divided into eight columns—the same column count [Grid.tsx](../../apps/studio/app/[username]/site/[siteId]/page/[pageId]/Grid.tsx) uses (`GRID_COLS`). The grid itself still sizes cells from **measured** container width divided by column count (`rowHeight`), so previews can differ slightly (scrollbar, sub-pixel).

### Good vs bad: `BrickPreview` props (inline types, no cross-file props export)

Keep [BrickPreview.tsx](../../apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickPreview.tsx) decoupled from [BrickGroup.tsx](../../apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickGroup/BrickGroup.tsx): **do not** export a `BrickPreviewProps` type from the parent only so the child can import it—that creates an awkward dependency and extra churn for a small props API.

- **Bad**: `export type BrickPreviewProps` in `BrickGroup.tsx` and `import { BrickPreviewProps } from './BrickGroup'` in `BrickPreview.tsx` (parent owns types for a child it does not implement).

- **Good**: annotate the preview’s props inline on `BrickPreview` with **`{ brick: IGroupBrick }`**. Group rows are built with **`makeCatalog`** (data, configuration, dimensions, appearance form, and responsive presentations) and **`makeGroup`** (**`catalogs[catalog]`**). Drawer drag uses native **`DataTransfer`** ([`BRICK_DRAG_MIME` / `useBrickDrawerStore`](../../apps/studio/components/home/useBrickDrawerStore.ts)); [siteStore.ts](../../apps/studio/app/[username]/site/[siteId]/siteStore.ts) persists only serializable site and page draft data, including each page’s `layout`, without React components.

**Same idea for small factories**: if only one function consumes the shape, **inline the object type on the function**—do **not** export `MakeBrickGroupProps`-style types unless a second module genuinely needs to reference that exact type.

### Good vs bad: brick group types (`IBrick`, `IGroupBrick`, `IGroupBrickDef`)

- **Bad**: ad hoc **`typeId`** strings on every group row, or passing full brick objects (including **`component`**) into Zustand for external drag.

- **Good**: `IGroupBrickDef` contains serializable group and catalog identity, initial dimensions, label, order, and data. `makeCatalog` produces `def` and a responsive `component`; `makeGroup` adds group scope and verifies each catalog key matches `def.catalog`.

### Catalog and brick identity

A **catalog** connects data and configuration to one responsive presentation within a group, such as GitHub `profile` or `repo`. A **brick** is a placed instance with its own `brickId`. Group entries are identified by `(groupName, catalog)`, independently of dimensions. There is no view collection or view identity.

Use kebab-case catalog identifiers. Site drawer selectors expose `data-brick-drawer-group-name` and `data-brick-drawer-catalog`; placed wrappers expose `data-brick-group-name`, `data-brick-catalog`, and `data-brick-id`.

### Catalog folders under each group

Presentations, catalog forms, catalog-only helpers, and catalog assets live under
`apps/bricks/groups/<Group>/catalogs/<catalog>/`, where `<catalog>` matches the
kebab-case catalog id (for example `profile`, `repo`, `thumbnail`, `default`).
The group assembler (`*Group.ts`) and any colocated group tests stay at the group
root and import from those catalog folders. Do not add `index.ts` barrels under
`catalogs/` or a catalog folder.

- **Bad**: flat `groups/GitHubCards/GitHubProfileSquareXs.tsx` next to
  `GitHubProfileGroup.ts` and `GitHubRepoXs.tsx`.
- **Good**: `groups/GitHubCards/catalogs/profile/GitHubProfileSquareXs.tsx` and
  `groups/GitHubCards/catalogs/repo/GitHubRepoXs.tsx`, with
  `GitHubProfileGroup.ts` at the group root importing each path.

### Factory arguments

Factories take one `props` object with an inline shape. `makeCatalog` owns `catalog`, `catalogName`, `catalogDescription`, `dataShape`, `defaultData`, optional `configuration`, `order`, optional `form`, required `xs`, and optional `sm`, `lg`, `xl`. Each breakpoint is `{ component, w, h }`; omitted breakpoints inherit the nearest smaller complete entry. Catalog `def` stores the resolved dimensions at `def[breakpoint]`, without React components. Previews, drag placeholders, and new placements use those dimensions; saved placement sizes remain authoritative. See [makeCatalog.tsx](../../apps/bricks/makeCatalog.tsx) and [makeGroup.ts](../../apps/bricks/makeGroup.ts).

Data-backed catalogs configure requests with `makeFetcherConfiguration({ catalogOptionsShape, catalogOptionsForm, fetcher })`
from [makeFetcherConfiguration.ts](../../apps/bricks/makeFetcherConfiguration.ts), passed as the catalog's `configuration`.
The factory supplies `configurationType: "fetcher"` and validates catalog options before invoking its
required `fetcher` callback. `catalogOptionsForm` is one optional component receiving the complete decoded
catalog options as `{ value, onChange }`; `onChange` replaces the whole catalog options. `IFetcherConfiguration` is defined in that factory module. The callback receives
`{ api, catalogOptions, setData }`, publishes data through `setData`, and returns `IRpcEither<void>`
for success or typed failure. The catalog retains `dataShape` and validates `defaultData`.
Configuration forms read `configuration.catalogOptionsShape` and `configuration.catalogOptionsForm`;
catalogs do not expose top-level catalog options fields or `getData`.

The workbench's [Configuration.tsx](../../apps/bricks/app/Configuration.tsx) switches on
`configurationType`. A custom catalog options form runs the fetcher on `onChange`, using the complete
updated catalog options. Without a custom form, generated text controls use explicit Submit buttons.
Neither form fetches initially. Each request owns a scraper RPC session;
superseded and unmounted requests cannot publish data or errors. Control-internal searches remain
independent of catalog options changes, including Streamline's SWR search.

[useCatalogData.ts](../../apps/bricks/app/useCatalogData.ts) provides
`[catalogData, setCatalogData]` backed by in-memory Zustand state per group/catalog. Its setter validates against the decoded `dataShape`, preserving provider fields, before replacing
stored data. Invalid writes leave state unchanged. The configuration page preview and JSON display use
stored data or `defaultData`; loading and errors retain the last valid data. Navigation retains values,
while reload clears them. Other group previews and persisted Grid bricks continue using their existing
data sources.
TextBrick uses `makeFormConfiguration` to edit its nullable JSON `content` data directly; its responsive presentation remains available. Catalog-options-only fetcher configurations are not supported.
Every catalog requires `dataShape` and `defaultData`: use `null` for both when there is no
data contract. Render boundaries can pass `catalog?.defaultData` directly; components without
a data contract ignore the prop.
Local-only forms use `makeFormConfiguration`.

### Good vs bad: no barrel `index.ts` under homepage bricks

Do **not** add `apps/studio/components/home/bricks/index.ts` (or similar) that only re-exports symbols from sibling modules. Name each file after its **primary export** and import that path directly.

- **Bad**: `import { homepageBricks, groupsHash } from "./bricks"` or `@/components/home/bricks` when `./bricks` is a re-export barrel.

- **Good**: import `groupsHash` from its defining module and resolve a component directly through `group.catalogs[catalog]`; import specific groups from their modules under `groups/`.

### Good vs bad: `IGroup` + `BrickCarousel` — don’t add `FromGroup` on shared UI

Do **not** add a second exported wrapper on the shared carousel that imports **`groupsHash`** and takes **`groupName`**: that couples every import site to a parallel API and drags group knowledge into **`components/home`**.

- **Bad**: `BrickCarouselFromGroup` (or similar) exported from [BrickCarousel.tsx](../../apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarousel.tsx) — thin pass-through: `groupsHash[groupName]` → **`BrickCarousel`**.

- **Good**: [BrickCarousel.tsx](../../apps/studio/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarousel.tsx) accepts **`group: IGroup`** (and optional **`brickSortFn`**) only. Resolve **`groupsHash[groupName]`** in the route’s client `page.tsx` next to the site workspace and pass **`group`** into **`BrickCarousel`**; keep **`groupsHash`** out of the shared carousel module.

### Good vs bad: brick-group route — keep one-off logic in `page.tsx`

**Prefer consolidating** behavior for route-local group pages under `apps/studio/app/[username]/site/[siteId]/page/[pageId]/` in those route files. Do **not** add a **separate module** whose **only** consumer is that single `page.tsx` (extra imports and folder noise for no reuse).

- **Bad**: `BrickGroupFoo.tsx` (or `FooHelper.ts`) next to the page — a thin wrapper or helper used **only** once by that `page.tsx`.

- **Good**: Render shared UI (e.g. **`BrickCarousel`**) **directly** in the page’s JSX; put small helpers at **module scope** in the same file; if the page is a client component, use **`useMemo`** / local **function declarations** / inline **child components** in the **same file** instead of a sibling file only this route imports.

Reuse still belongs in **`components/`** or **`lib/`** when **multiple** routes or features need it — this rule targets **single-use** splinters next to one page.

### Good vs bad: avoid abbreviated tuple names in SWR fetchers

When destructuring tuple keys in hooks like `useSWR`, use full semantic names (for example `username`, `siteId`) instead of short aliases like `u`, `s`. These values are read in URL/path builders and abbreviated names make route intent harder to scan.

- **Bad**: `useSWR([username, siteId], async ([u, s]) => publishedPattern.href({ username: u, siteId: s }))`

- **Good**: `useSWR([username, siteId], async ([username, siteId]) => publishedPattern.href({ username, siteId }))`

### Good vs bad: home grid store naming (`Grid`, `I*` types)

The homepage grid is the product **Grid**; avoid a redundant **Portfolio** prefix on the Zustand module, hook, seed, and domain types. Prefix grid-store **object/interface types** with **`I`** (for example `IGridState`, `IGridSeed`).

- **Bad**: `portfolio-grid-store.ts`, `usePortfolioGridStore`, `PortfolioGridSeed`, `portfolioGridSeed`, `PortfolioBrickInstance`, test ids like `portfolio-grid-layout`, and a layout class name tied to “portfolio” when the surface is the generic home grid.

- **Good**: `apps/studio/lib/stores/grid-store.ts`, `useGridStore`, `IGridSeed`, `gridSeed`, `IBrickInstance`, `data-testid="grid-layout"`, and a scoped layout class such as `grid` (see [apps/studio/app/globals.css](../../apps/studio/app/globals.css) placeholder styling).

- **Bad**: `basis-auto` with many small bricks in one viewport row when the product goal is “one brick, one panel” at a time; or shrinking bricks with `scale-75` when previews should read at full drawer size.

- **Good**: `CarouselItem` with `basis-full shrink-0 grow-0` (plus `pl-*` / `-ml-*` spacing on content), inner panel wrapper for border/padding, and the brick slot matching full width/height in px—no transform scaling.

### Outline layout

`Outline` owns the navigation block and equal top and bottom padding (`py-3`).
In the group, group labels use `Outline.Title sticky`, pinning
each heading to the scroll pane's top through its group options and preview; contents
and views occupy the first and second list levels.
`Outline.List` owns vertical padding (`py-2`), hierarchy depth,
and numbering without horizontal padding or margins. Items stay full width
and tightly spaced, with no added gaps or vertical padding. Put every item
heading or choice control inside `Outline.Label`; the label
owns its marker and depth-based indentation, including when sticky, but adds
no vertical padding. Lists default to vertical padding. Use `padded={false}` inside a section whose
edge padding must stand alone, and `spaced` for 0.5rem gaps between list items.

Previews and other item content remain full width at every depth. Do not cancel
list indentation in route CSS or add compensating margins to content. Scroll
containers determine sticky boundaries independently of hierarchy depth.

Wrap a navigation group in `Outline.Rows` before its content.
`Rows` owns the gray background and 0.5rem bottom padding, independent of depth.
Nested lists remain compact; previews and other content sit outside the group.
Use `Rows sticky` when the whole group should stick within its scroll container.
Spacing is explicit in the composition rather than inferred from descendant DOM.

The group, CatalogConfiguration, and BrickDetail pages share
[`GroupOutline`](../../apps/bricks/components/outline/GroupOutline.tsx) for catalog choices.
It owns the white `Outline` surface, equal 0.75rem vertical padding, and spaced catalog entries.
Each page supplies `renderCatalog`: root buttons select the local preview; links select
`?catalog=...`. Standalone previews use `/bricks/:groupName/:catalog`.

### Group and catalog cutover and saved state

Workbench definitions and drag payloads use `groupName` and `catalog`. Persisted workbench
bricks use `groupId` and `catalogId`, without a view identifier. Storage version 2 resets
old brick drafts under `qrk-bricks-sandbox-responsive-bricks-v2` while retaining the selected
width. Site editor persistence version 2 also resets older drafts under
`qrk-site-editor-drafts-v2`. Backend brick records and grid payloads use `groupId`
and `catalogId`; their existing versions and `viewId` field remain unchanged.
Reset the affected backend database before using these renamed fields.

### Bricks sandbox grid width and toolbar

The sandbox uses the actual browser width for its surrounding layout. At 1024px
and above, the Bricks panel stays fixed in the left half and the grid region uses
the right half. Below 1024px, the grid region uses the full width and Bricks opens
in a half-height, nonmodal shadcn bottom drawer. The drawer leaves the grid
interactive for drag/drop and supports its close button and Escape.

The app-style toolbar sits at the bottom of the desktop grid region and at the
top on mobile/tablet. The 375, 640, 1024, and 1440px choices resize only the grid
preview, centered within that region. Measure the available region independently
of the preview; disable choices that exceed it. Start with the largest fitting
preset and fall back to the largest fitting preset if a resize makes the selection
too large. Below 375px, hide the preview and show its minimum-width requirement. Width selection lasts across sandbox route
navigation and reload, and is independent of Reset's grid state changes.

### Responsive brick breakpoints

Every brick render supplies `breakpoint: "xs" | "sm" | "lg" | "xl"` alongside
its existing data. Components may ignore the prop. Breakpoints describe the full
eight-column grid width: `xs` below 640px, `sm` from 640px,
`lg` from 1024px, and `xl` from 1280px.

`BrickBreakpointProvider` owns one container measurement and shares the breakpoint
through context. In the editor, `EditorLayout` provides context to the grid, drawers,
and toolbars; its ref measures `Grid` itself. Group,
carousel, and detail previews use that shared page-grid breakpoint regardless of
their own widths. In the sandbox, the ref measures `SandboxGrid` itself, so width presets and scrollbar changes update the grid and previews together.
The standalone preview has its own provider measuring the simulated full grid
width (grid-unit slider multiplied by eight).

Consumers use `useBrickBreakpoint` and pass the value through the existing brick
`breakpoint` prop. A provider is required; its initial value is `xs` until measured.
Browser width and a brick's own width do not directly determine its breakpoint.
Grid geometry and available-width measurements remain independent. Breakpoints
select presentations and initial dimensions, never brick identity. Catalog drag payloads
include resolved dimensions for all breakpoints; placed layouts retain their saved geometry.

The GitHub profile 4×2 view keeps its avatar and username in the bottom half at `xs`.
The activity fills the top half, scaling square cells and gaps proportionally, without
rounded corners, strokes, labels, legend, or fade mask. Larger modes retain the
existing presentation. At `xs`, the 4×4 view hides contribution activity and
truncates overflowing profile values with ellipses.

### Preview dimensions

`BrickPreviewFrame` takes inline `w`, `h`, and `children` props. It reads the
measured grid width from `useBrickBreakpoint` and computes width and height as
`Math.round(gridWidth / 8 * w)` and `Math.round(gridWidth / 8 * h)`.
Previews therefore follow the selected grid width rather than their containing
pane. Wide previews scroll within narrower panes instead of shrinking.
Presentation components receive the same active breakpoint. Placed bricks retain
the grid's own dimensions, including its one-pixel edge rounding.
All group, configuration, detail, carousel, and standalone previews use this
frame. Placed-detail previews use resolved breakpoint dimensions; the standalone
slider sets the simulated full grid width measured by its provider.
Import the frame directly or through `@qrk.sh/bricks/BrickPreviewFrame`.

### Breakpoint presentation names

Follow [brick presentation conventions](../../wiki/brick-layout-conventions.md):
`<Group><Content><Shape><Breakpoint>`, for example `GitHubProfileSquareXs`
and `GitHubProfileSquareLg`, with matching filenames. Select presentations with
`makeCatalog` at the brick definition.

For the wide profile, use `GitHubProfileWideXs` and `GitHubProfileWideSm` in
matching files; `lg` and `xl` inherit `Sm` through `makeCatalog`.

### Responsive sandbox placed bricks

The sandbox persists `bricksById` under `qrk-bricks-sandbox-responsive-bricks-v2`.
It starts empty and neither reads nor migrates older grid keys. Hydration removes
obsolete `md` and `2xl` entries, preserving the four retained entries and shared
content. Saved 768px and 1536px presets become 640px and 1440px respectively. Each placed brick
stores `groupId`, `catalogId`, shared `data`, required `xs`, and
optional `sm`, `lg`, and `xl` entries. Each entry contains `gridItem` (the grid
library's `LayoutItem`, or `null` to hide) and `appearanceOptions`. Omitted entries
inherit the entire nearest smaller entry, including hidden status. Editing an
inherited entry first copies its placement and options. The placed-brick editor's
“Inherit from” button removes the active breakpoint override and names the nearest
smaller explicit entry, including hidden entries. It is disabled when already
inheriting and absent at `xs`. Labels and default
sizes stay in group metadata. The active grid is derived; no second placement
array is persisted. Drag, resize, and rearrangements update the active entry. Resizing uses the grid library’s default bottom-right handle and stylesheet without custom positioning.
The group panel does not include a placed-brick list. In brick configuration,
Show restores a smaller visible placement or uses group dimensions at the next available position.

`makeCatalog` accepts optional `form: makeAppearanceForm({ shape, form })` alongside
its presentations. The shape infers form values and supplies validated defaults.
The form receives `value` and `onChange`; updates validate before publication and
never invoke a content fetcher. Appearance controls appear below catalog configuration.
The custom `form` may be omitted for shapes containing only non-nullable booleans
with boolean defaults. Those shapes generate labeled switches in a `px-4 py-5`
container; camelCase and separator-delimited names become readable labels.
Other shapes require an explicit form. Existing option objects merge over shape
defaults before validation, preserving explicit false values and rejecting unknown
fields.

Bricks render without an optional card wrapper and fill their grid footprint.
The grid retains its edit icon, excluded from drag initiation. Entire brick surfaces are draggable; rendered content disables pointer events and text selection. Group and configuration previews also drag from their whole surface. There are no grip buttons or interaction toggles. Detail previews omit grid controls.
Presentations receive shared `data`, the active `breakpoint`, and resolved
`appearanceOptions`; their presentation fallback remains independent of entry
inheritance. Group drops copy the preview options into `xs`, and also into
an explicit active entry when dropped above `xs`. Figma's thumbnail presentations
support Center, Left, Right, Top, and Bottom image positions (default Center).
Group descriptors use `groupName` and `catalog`; site grid placement arrays are unchanged.
Catalog configuration inputs are named `catalogOptions` and remain form-local. They are not persisted, copied on drop, or restored from a brick. `data` remains the resulting shared content.
