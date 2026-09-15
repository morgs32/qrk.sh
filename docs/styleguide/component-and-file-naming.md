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

- **Good**: annotate the preview’s props inline on `BrickPreview` with **`{ brick: ICollectionBrick }`**. Catalog rows are built with **`makeView`** (`id`, label, dimensions, order, form, and responsive presentations), **`makeContent`** (which adds content identity) and **`makeCollection`** (nested **`contents[content].views[view]`**). Drawer drag uses native **`DataTransfer`** ([`BRICK_DRAG_MIME` / `useBrickDrawerStore`](../../apps/app/components/home/useBrickDrawerStore.ts)); [siteStore.ts](../../apps/app/app/[username]/site/[siteId]/siteStore.ts) persists only serializable site and page draft data, including each page’s `layout`, without React components.

**Same idea for small factories**: if only one function consumes the shape, **inline the object type on the function**—do **not** export `MakeBrickCollectionProps`-style types unless a second module genuinely needs to reference that exact type.

### Good vs bad: brick catalog types (`IBrick`, `ICollectionBrick`, `ICollectionBrickDef`)

- **Bad**: ad hoc **`typeId`** strings on every catalog row, or passing full brick objects (including **`component`**) into Zustand for external drag.

- **Good**: **`ICollectionBrickDef`** for serializable identity (**`collectionName`**, **`collectionLabel`**, **`content`**, **`view`**, **`w`**, **`h`**, and **`label`**). **`makeView`** returns view metadata and a responsive **`component`**. **`makeContent`** validates each view key against its **`id`** and adds the enclosing content identity to produce **`IBrick`** (**`def` + `component`**); **`makeCollection`** merges collection scope into each **`ICollectionBrick`**.

### Terminology: collection contents and bricks

A **collection content** is a content form within a collection, such as GitHub `profile` or `repo`. A **view** is a named presentation of that content, such as `4x4` or `4x2`. Its identifier and display label are independent of its `w`/`h` dimensions; multiple views may share dimensions. A **brick** is an implementation of one `(collectionName, content, view)` catalog entry. When that implementation is placed in a Grid, its resource and identity are still **`brick`** and **`brickId`**; do not call it a “grid brick” or “grid item.”

### Brick catalog identity: `collectionName` + `content` + `view`

**Incontent (homepage catalog):**

1. **`collectionName`** is **unique per collection** across the catalog.
2. Within one collection, each **`def.content`** is kebab-case; its **`def.view`** is kebab-case and unique within that content.
3. Therefore **`(collectionName, def.content, def.view)`** is unique for every catalog entry—use those fields for tests and DOM hooks instead of a composite string.

### Terminology: brick catalog identity

In code and tests, use **`collectionName`**, **`content`**, and **`view`** together. They uniquely identify a homepage catalog entry. They are **not** a grid **instance** id (`item.i`) or a single concatenated key.

- **Bad**: calling a composite like `` `${collectionName}--${w}x${h}` `` or using a bare view as a brick identity.

- **Good**: pass or thread **`collectionName`**, **`def.content`**, and **`def.view`**; locate bricks with **`gridLocateByBrickIdentity(grid, collectionName, content, view)`** in [Grid.playwright.spec.ts](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/Grid.playwright.spec.ts).

[BrickPreview.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickPreview.tsx) exposes it on the draggable slot:

- **`data-brick-drawer-collection-name`** = **`brick.def.collectionName`**
- **`data-brick-drawer-content`** = **`brick.def.content`**
- **`data-brick-drawer-view`** = **`brick.def.view`**

(Together with **`data-brick-drawer-brick-slot`**, used by carousel drag guards.)

[Grid.tsx](../../apps/app/app/[username]/site/[siteId]/page/[pageId]/Grid.tsx) sets on each placed brick wrapper:

- **`data-brick-collection-name`** = **`item.def.collectionName`**
- **`data-brick-content`** = **`item.def.content`**
- **`data-brick-view`** = **`item.def.view`**
- **`data-brick-id`** = the placed brick id (`item.i` at the `react-grid-layout` boundary)

- **Bad**: a single attribute holding `makeBrickKey` / concatenated ids when you need to target “this content in this collection” in the drawer **or on the grid**.

- **Good**: expose the collection, content, view, and brick id separately. In Playwright: drawer — `[data-brick-drawer-brick-slot][data-brick-drawer-collection-name="…"][data-brick-drawer-content="…"][data-brick-drawer-view="…"]`; Grid — `[data-brick-collection-name="…"][data-brick-content="…"][data-brick-view="…"]` scoped under `.grid-layout`.

### Good vs bad: brick factory argument naming (`props`, not `options`; inline type)

Brick factories take **one object** describing what to build. Name that parameter **`props`** so it reads like React’s declarative inputs, not a vague “options” bag. Put the object type **on the function signature**; don’t export a separate props type unless another file must import it.

- **Bad**: `export function makeView(options: { id; w; h; xs })`; `export type MakeCollectionProps = { … }` with `makeCollection(props: MakeCollectionProps)` when nothing else imports that type.

- **Good**: `makeView(props: { id; label; w; h; order; form?; xs; sm?; lg?; xl? })`, `makeContent(props: { content; views })`, and `makeCollection(props: { collectionName; collectionLabel; collectionDescription; contents })` in [packages/bricks/src/makeView.tsx](../../packages/bricks/src/makeView.tsx), [makeContent.ts](../../packages/bricks/src/makeContent.ts), and [makeCollection.ts](../../packages/bricks/src/makeCollection.ts).

Data-backed contents configure requests with `makeFetcherConfiguration({ contentOptionsShape, contentOptionsForm, fetcher })`
from [makeFetcherConfiguration.ts](../../packages/bricks/src/makeFetcherConfiguration.ts), passed as the content's `configuration`.
The factory supplies `configurationType: "fetcher"` and validates content options before invoking its
required `fetcher` callback. `contentOptionsForm` is one optional component receiving the complete decoded
content options as `{ value, onChange }`; `onChange` replaces the whole content options. `IFetcherConfiguration` is defined in that factory module. The callback receives
`{ api, contentOptions, setData }`, publishes data through `setData`, and returns `IRpcEither<void>`
for success or typed failure. The content retains `dataShape` and validates `defaultData`.
Configuration forms read `configuration.contentOptionsShape` and `configuration.contentOptionsForm`;
contents do not expose top-level content options fields or `getData`.

The workbench's [Configuration.tsx](../../packages/bricks/src/app/Configuration.tsx) switches on
`configurationType`. A custom content options form runs the fetcher on `onChange`, using the complete
updated content options. Without a custom form, generated text controls use explicit Submit buttons.
Neither form fetches initially. Each request owns a scraper RPC session;
superseded and unmounted requests cannot publish data or errors. Control-internal searches remain
independent of content options changes, including Streamline's SWR search.

[useContentData.ts](../../packages/bricks/src/app/useContentData.ts) provides
`[contentData, setContentData]` backed by in-memory Zustand state per collection/content, shared across
views. Its setter validates against the decoded `dataShape`, preserving provider fields, before replacing
stored data. Invalid writes leave state unchanged. The configuration page preview and JSON display use
stored data or `defaultData`; loading and errors retain the last valid data. Navigation retains values,
while reload clears them. Other catalog previews and persisted Grid bricks continue using their existing
data sources.
TextBrick uses `makeFormConfiguration` to edit its nullable JSON `content` data directly; its sample
views remain static. Content-options-only fetcher configurations are not supported.
Every content requires `dataShape` and `defaultData`: use `null` for both when there is no
data contract. Render boundaries can pass `content?.defaultData` directly; components without
a data contract ignore the prop.
Local-only forms also use `makeFetcherConfiguration`, omitting the fetch callback.

### Good vs bad: no barrel `index.ts` under homepage bricks

Do **not** add `apps/app/components/home/bricks/index.ts` (or similar) that only re-exports symbols from sibling modules. Name each file after its **primary export** and import that path directly.

- **Bad**: `import { homepageBricks, collectionsHash } from "./bricks"` or `@/components/home/bricks` when `./bricks` is a re-export barrel.

- **Good**: import `collectionsHash` from its defining module and resolve a component directly through `collection.contents[content].views[view]`; import specific collections from their modules under `collections/`.

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

### Outline layout

`Outline` owns the navigation block and equal top and bottom padding (`py-3`).
In the catalog, collection labels use `Outline.Title sticky`, pinning
each heading to the scroll pane's top through its collection options and preview; contents
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

The catalog, Collection, and BrickDetail pages share
[`CollectionOutline`](../../packages/bricks/src/app/CollectionOutline.tsx) for content and
view choices. It owns the white `Outline` surface, equal 0.75rem
vertical padding, unpadded lists, spaced content groups, and the 0.5rem gap before views.
Collection headings and previews stay outside this component.
Each page supplies `renderContent` and `renderView` controls: catalog buttons update
the local preview, Collection links select the `content` and `view` query parameters,
and BrickDetail retains content links and disabled alternative view labels.

### View identity hard cutover

Catalog definitions use `contents[content].views[view]`; catalog brick definitions use `view`, while backend brick attributes and command inputs use `collectionId`, `contentId`, and `viewId`. Existing IDs and labels remain unchanged. View choices display `def.label`, while selection, lookup, drag payloads, and brick keys use `def.view`.

Sandbox collection URLs select `?view=...`; old `size` query parameters are ignored, so the default view is selected when `view` is absent. Standalone `/bricks/:collectionName/:content/:view` URLs retain their existing positional values.

This is a hard terminology cutover without aliases or automatic migration. The sandbox uses
`qrk-bricks-sandbox-responsive-bricks-v2`; editor drafts use `qrk-site-editor-drafts-v2`.
Old browser keys remain untouched and are ignored. Backend brick attributes and create/update
contracts use `collectionId`, `contentId`, and `viewId`; existing model and contract version identifiers are unchanged.
Existing backend state requires an explicitly authorized reset before reuse. This rename does not
reset state or deploy. Production grid positioning keeps its existing `layout` arrays.
Old `variant` and `layout` catalog query keys are ignored; use `content` and `view`.

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
and toolbars; its ref measures `Grid` itself. Catalog,
carousel, and detail previews use that shared page-grid breakpoint regardless of
their own widths. In the sandbox, the ref measures `SandboxGrid` itself, so width presets and scrollbar changes update the grid and previews together.
The standalone preview has its own provider measuring the simulated full grid
width (grid-unit slider multiplied by eight).

Consumers use `useBrickBreakpoint` and pass the value through the existing brick
`breakpoint` prop. A provider is required; its initial value is `xs` until measured.
Browser width and a brick's own width do not directly determine its breakpoint.
Grid geometry and available-width measurements remain independent. Breakpoints
are render inputs only, never persisted data, brick identity, or drag payloads fields.

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
All catalog, configuration, detail, carousel, and standalone previews use this
frame. Placed-detail previews use resolved breakpoint dimensions; the standalone
slider sets the simulated full grid width measured by its provider.
Import the frame directly or through `@qrk.sh/bricks/BrickPreviewFrame`.

### Breakpoint presentation names

Follow [brick presentation conventions](../../wiki/brick-layout-conventions.md):
`<Collection><Content><Shape><Breakpoint>`, for example `GitHubProfileSquareXs`
and `GitHubProfileSquareLg`, with matching filenames. Select presentations with
`makeView` at the brick definition.

For the wide profile, use `GitHubProfileWideXs` and `GitHubProfileWideSm` in
matching files; `lg` and `xl` inherit `Sm` through `makeView`.

### Responsive sandbox placed bricks

The sandbox persists `bricksById` under `qrk-bricks-sandbox-responsive-bricks-v2`.
It starts empty and neither reads nor migrates older grid keys. Hydration removes
obsolete `md` and `2xl` entries, preserving the four retained entries and shared
content. Saved 768px and 1536px presets become 640px and 1440px respectively. Each placed brick
stores `collectionId`, `contentId`, `viewId`, shared `data`, required `xs`, and
optional `sm`, `lg`, and `xl` entries. Each entry contains `gridItem` (the grid
library's `LayoutItem`, or `null` to hide) and `viewOptions`. Omitted entries
inherit the entire nearest smaller entry, including hidden status. Editing an
inherited entry first copies its placement and options. The placed-brick editor's
“Inherit from” button removes the active breakpoint override and names the nearest
smaller explicit entry, including hidden entries. It is disabled when already
inheriting and absent at `xs`. Labels and default
sizes stay in catalog metadata. The active grid is derived; no second placement
array is persisted. Drag and rearrangements update the active entry. Grid resize
handles are disabled; layout sizing belongs to the form.
The catalog panel does not include a placed-brick list. In brick configuration,
Show restores a smaller visible placement or uses catalog dimensions at the next available position.

`makeView` accepts optional `form: makeViewForm({ shape, form })` alongside
its presentations. The shape infers form values and supplies validated defaults.
The form receives `value` and `onChange`; updates validate before publication and
never invoke a content fetcher. View controls appear below content controls.
The custom `form` may be omitted for shapes containing only non-nullable booleans
with boolean defaults. Those shapes generate labeled switches in a `px-4 py-5`
container; camelCase and separator-delimited names become readable labels.
Other shapes require an explicit form. Existing option objects merge over shape
defaults before validation, preserving explicit false values and rejecting unknown
fields.

Every placed sandbox breakpoint entry also stores `frame: "default" | "card"`,
separate from collection-specific `viewOptions`. The Card frame switch sits beside
Hide/Show brick and edits the active breakpoint, copying the complete inherited
entry first. Inherit removes that complete override, including frame selection.
`BrickViewFrame` in the sandbox grid and placed-brick detail preview owns the
shared Card surface and 8px content inset, retaining the existing grid footprint.
The grid sets `--card-gap: 16px`; card frames inset each side by half that gap,
so adjacent card borders are 16px apart while unframed bricks fill their cells.
Outside the grid, the detail preview retains its 16px outer spacing through a
32px gap fallback.
The grid passes its edit and drag controls inside the frame; the preview omits
controls. Default frames and catalog previews retain their existing appearance.
Hydration initializes missing frame values to `"default"` and removes the old
GitHub profile square `cardView` option without carrying its selection forward or
resetting stored bricks. Individual presentations do not implement frame styles.
Presentations receive shared `data`, the active `breakpoint`, and resolved
`viewOptions`; their presentation fallback remains independent of entry
inheritance. Catalog drops copy the preview options into `xs`, and also into
an explicit active entry when dropped above `xs`. Figma's thumbnail presentations
support Center, Left, Right, Top, and Bottom image positions (default Center).
Production backend brick records and command inputs use `collectionId`, `contentId`, and `viewId`. Catalog descriptors use `collectionName`, `content`, and `view`; their grid placement structure is unchanged.
Content configuration inputs are named `contentOptions` and remain form-local. They are not persisted, copied on drop, or restored from a brick. `data` remains the resulting shared content.
