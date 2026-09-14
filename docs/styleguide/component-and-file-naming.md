# Component and file naming

Use these rules for **repo-authored React components** that are **not** shadcn and **not** Next.js special files.

### Rule: PascalCase file name matches the component

- **Do** name the file in **PascalCase** when it exports a single React component.
- **Do** match the file name to the component name.

### Good vs bad: component file naming (PascalCase)

- **Bad**: file name doesn’t match component name
  - `apps/app/components/home/portfolio-grid.tsx`
  - `export function Grid() { ... }`

- **Good**: file name matches component name
  - `apps/app/components/home/Grid.tsx`
  - `export function Grid() { ... }`

### Good vs bad: one file per component

Prefer **one primary React component per file** (matching the PascalCase file name). Nesting sizable presentational or interactive subcomponents in the parent file makes diffs noisier and obscures imports.

- **Bad**: `BrickCatalog.tsx` defines both `BrickCatalog` and a multi-markup helper like `BrickCarouselNav` in the same module.

- **Good**: Under [BrickCarousel/](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/), [BrickCarouselNav.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarouselNav.tsx) exports `BrickCarouselNav` and [BrickPreview.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickPreview.tsx) exports `BrickPreview`; [BrickCarousel.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarousel.tsx) imports them. Keep **`data-brick-carousel-nav`** (and similar hooks into parent behavior like `watchDrag`) documented by colocation: the nav file owns the markup; the parent may still reference those attributes in drag guards.

### Exceptions (this rule does not apply)

- **shadcn/ui components**: anything under either app’s `components/ui/**` directory keeps shadcn’s conventions.
- **React Router entry files**: `apps/app/app/main.tsx`, `apps/app/app/routes.ts`, `packages/bricks/src/app/main.tsx`, and `packages/bricks/src/app/routes.ts` use entry/configuration names. Root components are `App.tsx` and `RootLayout.tsx`. Route components use PascalCase filenames; single-use route logic stays in its route module. Data Mode does not generate `.react-router/types/**`.
- **Next.js special files**: framework-reserved files under either app’s `app/**` directory keep their required names (for example `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`).

### Good vs bad: BrickCatalog carousel slides (one panel per brick)

The brick catalog drawer uses shadcn `Carousel` (Embla) **per collection**. Each brick is **one slide**: a bordered panel (`basis-full` on `CarouselItem`) with the draggable preview slot sized in CSS as **`calc(def.w * 50vw / 4)`** by **`calc(def.h * 50vw / 4)`**, i.e. half the viewport (site workspace `w-1/2`) divided into four columns—the same column count [Grid.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/Grid.tsx) uses (`GRID_COLS`). The grid itself still sizes cells from **measured** container width divided by column count (`rowHeight`), so previews can differ slightly (scrollbar, sub-pixel).

### Good vs bad: `BrickPreview` props (inline types, no cross-file props export)

Keep [BrickPreview.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickPreview.tsx) decoupled from [BrickCatalog.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCatalog/BrickCatalog.tsx): **do not** export a `BrickPreviewProps` type from the parent only so the child can import it—that creates an awkward dependency and extra churn for a small props API.

- **Bad**: `export type BrickPreviewProps` in `BrickCatalog.tsx` and `import { BrickPreviewProps } from './BrickCatalog'` in `BrickPreview.tsx` (parent owns types for a child it does not implement).

- **Good**: annotate the preview’s props inline on `BrickPreview` with **`{ brick: ICollectionBrick }`**. Catalog rows are built with **`makeBrick`** (a content `variant`, a `layout`, and a `component`) and **`makeCollection`** (nested **`variants[variant].layouts[layout]`**). Drawer drag uses native **`DataTransfer`** ([`BRICK_DRAG_MIME` / `useBrickDrawerStore`](../../apps/app/components/home/useBrickDrawerStore.ts)); [siteStore.ts](../../apps/app/app/[username]/site/[siteId]/siteStore.ts) persists only serializable site and page draft data, including each page’s `layout`, without React components.

**Same idea for small factories**: if only one function consumes the shape, **inline the object type on the function**—do **not** export `MakeBrickCollectionProps`-style types unless a second module genuinely needs to reference that exact type.

### Good vs bad: brick catalog types (`IBrick`, `ICollectionBrick`, `ICollectionBrickDef`)

- **Bad**: ad hoc **`typeId`** strings on every catalog row, or passing full brick objects (including **`component`**) into Zustand for external drag.

- **Good**: **`ICollectionBrickDef`** for serializable identity (**`collectionName`**, **`collectionLabel`**, **`variant`**, **`layout`**, **`w`**, **`h`**, and **`label`**). **`IBrick`** = layout-only **`def` + `component`**; **`makeCollection`** merges collection scope into each **`ICollectionBrick`**.

### Terminology: collection variants and bricks

A **collection variant** is a content form within a collection, such as GitHub `profile` or `repo`. A **layout** is a named presentation of that variant, such as `4x4` or `4x2`. Its identifier and display label are independent of its `w`/`h` dimensions; multiple layouts may share dimensions. A **brick** is an implementation of one `(collectionName, variant, layout)` catalog entry. When that implementation is placed in a Grid, its resource and identity are still **`brick`** and **`brickId`**; do not call it a “grid brick” or “grid item.”

### Brick catalog identity: `collectionName` + `variant` + `layout`

**Invariant (homepage catalog):**

1. **`collectionName`** is **unique per collection** across the catalog.
2. Within one collection, each **`def.variant`** is kebab-case; its **`def.layout`** is kebab-case and unique within that variant.
3. Therefore **`(collectionName, def.variant, def.layout)`** is unique for every catalog entry—use those fields for tests and DOM hooks instead of a composite string.

### Terminology: brick catalog identity

In code and tests, use **`collectionName`**, **`variant`**, and **`layout`** together. They uniquely identify a homepage catalog entry. They are **not** a grid **instance** id (`item.i`) or a single concatenated key.

- **Bad**: calling a composite like `` `${collectionName}--${w}x${h}` `` or using a bare layout as a brick identity.

- **Good**: pass or thread **`collectionName`**, **`def.variant`**, and **`def.layout`**; locate bricks with **`gridLocateByBrickIdentity(grid, collectionName, variant, layout)`** in [Grid.playwright.spec.ts](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/Grid.playwright.spec.ts).

[BrickPreview.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickPreview.tsx) exposes it on the draggable slot:

- **`data-brick-drawer-collection-name`** = **`brick.def.collectionName`**
- **`data-brick-drawer-variant`** = **`brick.def.variant`**
- **`data-brick-drawer-layout`** = **`brick.def.layout`**

(Together with **`data-brick-drawer-brick-slot`**, used by carousel drag guards.)

[Grid.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/Grid.tsx) sets on each placed brick wrapper:

- **`data-brick-collection-name`** = **`item.def.collectionName`**
- **`data-brick-variant`** = **`item.def.variant`**
- **`data-brick-layout`** = **`item.def.layout`**
- **`data-brick-id`** = the placed brick id (`item.i` at the `react-grid-layout` boundary)

- **Bad**: a single attribute holding `makeBrickKey` / concatenated ids when you need to target “this variant in this collection” in the drawer **or on the grid**.

- **Good**: expose the collection, variant, layout, and brick id separately. In Playwright: drawer — `[data-brick-drawer-brick-slot][data-brick-drawer-collection-name="…"][data-brick-drawer-variant="…"][data-brick-drawer-layout="…"]`; Grid — `[data-brick-collection-name="…"][data-brick-variant="…"][data-brick-layout="…"]` scoped under `.grid-layout`.

### Good vs bad: brick factory argument naming (`props`, not `options`; inline type)

Brick factories take **one object** describing what to build. Name that parameter **`props`** so it reads like React’s declarative inputs, not a vague “options” bag. Put the object type **on the function signature**; don’t export a separate props type unless another file must import it.

- **Bad**: `export function makeBrick(options: { w; h; component })`; `export type MakeCollectionProps = { … }` with `makeCollection(props: MakeCollectionProps)` when nothing else imports that type.

- **Good**: `makeBrick(props: { variant; layout; w; h; label; component })`, `makeVariant(props: { variant; layouts })`, and `makeCollection(props: { collectionName; collectionLabel; collectionDescription; variants })` in [packages/bricks/src/makeBrick.ts](../../packages/bricks/src/makeBrick.ts), [makeVariant.ts](../../packages/bricks/src/makeVariant.ts), and [makeCollection.ts](../../packages/bricks/src/makeCollection.ts).

Data-backed variants configure requests with `makeFetcherConfiguration({ payloadShape, payloadForm, fetcher })`
from [makeFetcherConfiguration.ts](../../packages/bricks/src/makeFetcherConfiguration.ts), passed as the variant's `configuration`.
The factory supplies `configurationType: "fetcher"` and validates payloads before invoking its
callback. `IFetcherConfiguration` is defined in that factory module. The callback receives
`{ api, payload, setData }`, publishes data through `setData`, and returns `IRpcEither<void>`
for success or typed failure. The variant retains `dataShape` and validates `defaultData`.
Configuration forms read `configuration.payloadShape` and `configuration.payloadForm`;
variants do not expose top-level payload fields or `getData`.

The workbench's [Configuration.tsx](../../packages/bricks/src/app/Configuration.tsx) switches on
`configurationType`. Its fetcher form runs on each payload control's `onChange`, using the complete
updated payload, with no initial request or submit button. Each request owns a scraper RPC session;
superseded and unmounted requests cannot publish data or errors. Control-internal searches remain
independent of payload changes, including Streamline's SWR search.

[useVariantData.ts](../../packages/bricks/src/app/useVariantData.ts) provides
`[variantData, setVariantData]` backed by in-memory Zustand state per collection/variant, shared across
layouts. Its setter validates against the decoded `dataShape`, preserving provider fields, before replacing
stored data. Invalid writes leave state unchanged. The configuration page preview and JSON display use
stored data or `defaultData`; loading and errors retain the last valid data. Navigation retains values,
while reload clears them. Other catalog previews and persisted Grid bricks continue using their existing
data sources.
Every variant requires `dataShape` and `defaultData`: use `null` for both when there is no
data contract. Render boundaries can pass `variant?.defaultData` directly; components without
a data contract ignore the prop.
Local-only forms also use `makeFetcherConfiguration`, omitting the fetch callback.

### Good vs bad: no barrel `index.ts` under homepage bricks

Do **not** add `apps/app/components/home/bricks/index.ts` (or similar) that only re-exports symbols from sibling modules. Name each file after its **primary export** and import that path directly.

- **Bad**: `import { homepageBricks, collectionsHash } from "./bricks"` or `@/components/home/bricks` when `./bricks` is a re-export barrel.

- **Good**: import `collectionsHash` from its defining module and resolve a component directly through `collection.variants[variant].layouts[layout]`; import specific collections from their modules under `collections/`.

### Good vs bad: `ICollection` + `BrickCarousel` — don’t add `FromCatalog` on shared UI

Do **not** add a second exported wrapper on the shared carousel that imports **`collectionsHash`** and takes **`collectionName`**: that couples every import site to a parallel API and drags catalog knowledge into **`components/home`**.

- **Bad**: `BrickCarouselFromCatalog` (or similar) exported from [BrickCarousel.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarousel.tsx) — thin pass-through: `collectionsHash[collectionName]` → **`BrickCarousel`**.

- **Good**: [BrickCarousel.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarousel.tsx) accepts **`collection: ICollection`** (and optional **`brickSortFn`**) only. Resolve **`collectionsHash[collectionName]`** in the route’s client `page.tsx` next to the site workspace and pass **`collection`** into **`BrickCarousel`**; keep **`collectionsHash`** out of the shared carousel module.

### Good vs bad: brick-catalog route — keep one-off logic in `page.tsx`

**Prefer consolidating** behavior for route-local catalog pages under `apps/app/app/[username]/site/[siteId]/page/[pageId]/` in those route files. Do **not** add a **separate module** whose **only** consumer is that single `page.tsx` (extra imports and folder noise for no reuse).

- **Bad**: `BrickCatalogFoo.tsx` (or `FooHelper.ts`) next to the page — a thin wrapper or helper used **only** once by that `page.tsx`.

- **Good**: Render shared UI (e.g. **`BrickCarousel`**) **directly** in the page’s JSX; put small helpers at **module scope** in the same file; if the page is a client component, use **`useMemo`** / local **function declarations** / inline **child components** in the **same file** instead of a sibling file only this route imports.

Reuse still belongs in **`components/`** or **`lib/`** when **multiple** routes or features need it — this rule targets **single-use** splinters next to one page.

### Good vs bad: avoid abbreviated tuple names in SWR fetchers

When destructuring tuple keys in hooks like `useSWR`, use full semantic names (for example `username`, `siteId`) instead of short aliases like `u`, `s`. These values are read in URL/path builders and abbreviated names make route intent harder to scan.

- **Bad**: `useSWR([username, siteId], async ([u, s]) => publishedPattern.href({ username: u, siteId: s }))`

- **Good**: `useSWR([username, siteId], async ([username, siteId]) => publishedPattern.href({ username, siteId }))`

### Good vs bad: home grid store naming (`Grid`, `I*` types)

The homepage grid is the product **Grid**; avoid a redundant **Portfolio** prefix on the Zustand module, hook, seed, and domain types. Prefix grid-store **object/interface types** with **`I`** (for example `IGridState`, `IGridSeed`).

- **Bad**: `portfolio-grid-store.ts`, `usePortfolioGridStore`, `PortfolioGridSeed`, `portfolioGridSeed`, `PortfolioBrickInstance`, test ids like `portfolio-grid-layout`, and a layout class name tied to “portfolio” when the surface is the generic home grid.

- **Good**: `apps/app/lib/stores/grid-store.ts`, `useGridStore`, `IGridSeed`, `gridSeed`, `IBrickInstance`, `data-testid="grid-layout"`, and a scoped layout class such as `grid` (see [apps/app/app/globals.css](../../apps/app/app/globals.css) placeholder styling).

- **Bad**: `basis-auto` with many small bricks in one viewport row when the product goal is “one brick, one panel” at a time; or shrinking bricks with `scale-75` when previews should read at full drawer size.

- **Good**: `CarouselItem` with `basis-full shrink-0 grow-0` (plus `pl-*` / `-ml-*` spacing on content), inner panel wrapper for border/padding, and the brick slot matching full width/height in px—no transform scaling.

### Table of contents layout

`OrderedTableOfContents.Section` owns vertical padding (`py-3`).
`OrderedTableOfContents.List` owns vertical padding (`py-2`), hierarchy depth,
and numbering without horizontal padding or margins. Items stay full width
and tightly spaced, with no added gaps or vertical padding. Put every item
heading or choice control inside `OrderedTableOfContents.Label`; the label
owns its marker and depth-based indentation, including when sticky, but adds
no vertical padding. Lists default to vertical padding. Use `padded={false}` inside a section whose
edge padding must stand alone, and `spaced` for 0.5rem gaps between list items.

Previews and other item content remain full width at every depth. Do not cancel
list indentation in route CSS or add compensating margins to content. Scroll
containers determine sticky boundaries independently of hierarchy depth.

Wrap a navigation group in `OrderedTableOfContents.Rows` before its content.
`Rows` owns the gray background and 0.5rem bottom padding, independent of depth.
Nested lists remain compact; previews and other content sit outside the group.
Use `Rows sticky` when the whole group should stick within its scroll container.
Spacing is explicit in the composition rather than inferred from descendant DOM.

The Bricks overview uses `Container` for the outer layout and `Section` for each
complete navigation block: collection heading, variant choices, and layout choices.
`Section` owns the gray surface and equal 0.75rem edge padding. The overview
uses unpadded lists, explicit 0.5rem spacing before nested choices, and spaced
variant/layout groups. The preview is a sibling after the section, so no gray
padding trails the preview. Each section starts its own list; use `List start`
to continue collection numbering. The collection page keeps the complete collection/variant/layout `Section`, followed
by one active preview and its configuration contents. The `variant` and `layout`
query parameters select the active item. Overview Configure links carry both values.

### Layout identity hard cutover

Catalog definitions use `variants[variant].layouts[layout]`; serialized brick definitions and backend brick attributes use `layout`. Existing IDs and labels remain unchanged. Layout choices display `def.label`, while selection, lookup, drag payloads, and brick keys use `def.layout`.

Sandbox collection URLs select `?layout=...`; old `size` query parameters are ignored, so the default layout is selected when `layout` is absent. Standalone `/bricks/:collectionName/:variant/:layout` URLs retain their existing positional values.

This is a breaking change with no aliases or automatic data migration. Existing sandbox storage (`qrk-bricks-sandbox-single-grid`), persisted site drafts, and backend data containing brick `size` fields require an explicit reset before reuse. Resetting or deleting that state is a separate authorized operation; this change does not clear it automatically. Grid positioning still uses its existing `layout` array, independently of each brick definition’s layout identifier.

### Bricks sandbox grid width and toolbar

The sandbox uses the actual browser width for its surrounding layout. At 1024px
and above, the Bricks panel stays fixed in the left half and the grid region uses
the right half. Below 1024px, the grid region uses the full width and Bricks opens
in a half-height, nonmodal shadcn bottom drawer. The drawer leaves the grid
interactive for drag/drop and supports its close button and Escape.

The app-style toolbar sits at the bottom of the desktop grid region and at the
top on mobile/tablet. The 375, 768, 1024, and 1440px choices resize only the grid
preview, centered within that region. Measure the available region independently
of the preview; disable choices that exceed it. Start with the largest fitting
preset and fall back to the largest fitting preset if a resize makes the selection
too large. Below 375px, hide the preview and show its minimum-width requirement. Width selection lasts across sandbox route
navigation, resets on reload, and is independent of Reset's grid state changes.

### Responsive brick breakpoints

Every brick render supplies `breakpoint: "xs" | "sm" | "md" | "lg"` alongside
its existing data. Components may ignore the prop. Breakpoints describe the full
eight-column grid width: `xs` below 640px, `sm` from 640px, `md` from 768px,
and `lg` from 1024px (including larger screens).

`BrickBreakpointProvider` owns one container measurement and shares the breakpoint
through context. In the editor, `EditorLayout` provides context to the grid, drawers,
and toolbars; its ref measures `Grid` itself. Catalog,
carousel, and detail previews use that shared page-grid breakpoint regardless of
their own widths. In the sandbox, the ref measures `SandboxGrid` itself, so width presets and scrollbar changes update the grid and previews together.
The standalone preview has its own provider measuring the simulated full grid
width (grid-unit slider multiplied by eight).

Consumers use `useBrickBreakpoint` and pass the value through the existing brick
`breakpoint` prop. A provider is required; its initial value is `xs` until measured.
Browser width and a brick's own width do not directly determine its breakpoint.
Grid geometry and available-width measurements remain independent. Breakpoints
are render inputs only, never persisted data, brick identity, or drag payload fields.

The GitHub profile 4×2 layout keeps its avatar and username in the bottom half at `xs`.
The activity fills the top half, scaling square cells and gaps proportionally, without
rounded corners, strokes, labels, legend, or fade mask. Larger modes retain the
existing presentation. At `xs`, the 4×4 layout hides contribution activity and
truncates overflowing profile values with ellipses.
### Preview dimensions

`BrickPreviewFrame` takes inline `w`, `h`, and `children` props and reads the
provider's measured `gridWidth`. It sets non-shrinking pixel dimensions of
`Math.round(gridWidth / 8 * w)` by `Math.round(gridWidth / 8 * h)`, initially zero
until measured. Whole-pixel rounding matches react-grid-layout: a 4×2 brick
at 375px is 188 × 94px at the grid origin. Placed items can differ by one pixel
because the grid rounds their start and end edges independently to prevent seams.
All catalog, configuration, detail, carousel, and standalone previews use this
frame. Drag surfaces stay inside with `size-full`; surrounding spacing stays
outside. Panels scroll horizontally when needed rather than shrinking previews.
Placed bricks remain positioned and sized by the grid, using the same measurement.
Import the frame directly or through `@qrk.sh/bricks/BrickPreviewFrame`.

### Breakpoint presentation names

Follow [brick layout conventions](../../wiki/brick-layout-conventions.md):
`<Collection><Variant><Shape><Breakpoint>`, for example `GitHubProfileSquareXs`
and `GitHubProfileSquareMd`, with matching filenames. Select presentations with
`makeLayout` at the brick definition.

For the wide profile, use `GitHubProfileWideXs` and `GitHubProfileWideSm` in
matching files; `md` and `lg` inherit `Sm` through `makeLayout`.
