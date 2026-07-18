# Component and file naming

Use these rules for **repo-authored React components** that are **not** shadcn and **not** Next.js special files.

### Rule: PascalCase file name matches the component

- **Do** name the file in **PascalCase** when it exports a single React component.
- **Do** match the file name to the component name.

### Good vs bad: component file naming (PascalCase)

- **Bad**: file name doesn’t match component name
  - `apps/web/components/home/portfolio-grid.tsx`
  - `export function Grid() { ... }`

- **Good**: file name matches component name
  - `apps/web/components/home/Grid.tsx`
  - `export function Grid() { ... }`

### Good vs bad: one file per component

Prefer **one primary React component per file** (matching the PascalCase file name). Nesting sizable presentational or interactive subcomponents in the parent file makes diffs noisier and obscures imports.

- **Bad**: `BrickCatalog.tsx` defines both `BrickCatalog` and a multi-markup helper like `BrickCarouselNav` in the same module.

- **Good**: Under [BrickCatalogPreview/](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/BrickCatalogPreview/>), [BrickCarouselNav.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/BrickCatalogPreview/BrickCarouselNav.tsx>) exports `BrickCarouselNav` and [BrickPreview.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/BrickCatalogPreview/BrickPreview.tsx>) exports `BrickPreview`; [BrickCarousel.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarousel.tsx>) imports them. Keep **`data-brick-carousel-nav`** (and similar hooks into parent behavior like `watchDrag`) documented by colocation: the nav file owns the markup; the parent may still reference those attributes in drag guards.

### Exceptions (this rule does not apply)

- **shadcn/ui components**: anything under `apps/web/components/ui/**` keeps shadcn’s conventions.
- **Next.js special files**: framework-reserved files under `apps/web/app/**` keep their required names (for example `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`).

### Good vs bad: BrickCatalog carousel slides (one panel per brick)

The brick catalog drawer uses shadcn `Carousel` (Embla) **per collection**. Each brick is **one slide**: a bordered panel (`basis-full` on `CarouselItem`) with the draggable preview slot sized in CSS as **`calc(def.w * 50vw / 4)`** by **`calc(def.h * 50vw / 4)`**, i.e. half the viewport (site workspace `w-1/2`) divided into four columns—the same column count [Grid.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/Grid.tsx>) uses (`GRID_COLS`). The grid itself still sizes cells from **measured** container width divided by column count (`rowHeight`), so previews can differ slightly (scrollbar, sub-pixel).

### Good vs bad: `BrickPreview` props (inline types, no cross-file props export)

Keep [BrickPreview.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/BrickCatalogPreview/BrickPreview.tsx>) decoupled from [BrickCatalog.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/BrickCatalog.tsx>): **do not** export a `BrickPreviewProps` type from the parent only so the child can import it—that creates an awkward dependency and extra churn for a small props API.

- **Bad**: `export type BrickPreviewProps` in `BrickCatalog.tsx` and `import { BrickPreviewProps } from './BrickCatalog'` in `BrickPreview.tsx` (parent owns types for a child it does not implement).

- **Good**: annotate the preview’s props inline on `BrickPreview` with **`{ brick: ICollectionBrick }`**. Catalog rows are built with **`makeBrick`** (a content `variant`, a `size`, and a `component`) and **`makeCollection`** (nested **`variants[variant].sizes[size]`**). Drawer drag uses native **`DataTransfer`** ([`BRICK_DRAG_MIME` / `useBrickDrawerStore`](../../apps/web/components/home/useBrickDrawerStore.ts)); [useGridLayoutStore.ts](../../apps/web/components/home/useGridLayoutStore.ts) holds **`layout`** with **`def`** per item, not React components.

**Same idea for small factories**: if only one function consumes the shape, **inline the object type on the function**—do **not** export `MakeBrickCollectionProps`-style types unless a second module genuinely needs to reference that exact type.

### Good vs bad: brick catalog types (`IBrick`, `ICollectionBrick`, `ICollectionBrickDef`)

- **Bad**: ad hoc **`typeId`** strings on every catalog row, or passing full brick objects (including **`component`**) into Zustand for external drag.

- **Good**: **`ICollectionBrickDef`** for serializable identity (**`collectionName`**, **`collectionLabel`**, **`variant`**, **`size`**, **`w`**, **`h`**, and **`label`**). **`IBrick`** = size-only **`def` + `component`**; **`makeCollection`** merges collection scope into each **`ICollectionBrick`**.

### Terminology: collection variants and bricks

A **collection variant** is a content form within a collection, such as GitHub `profile` or `repo`. A **size** is a form of that variant, such as `4x4` or `4x2`. A **brick** is an implementation of one `(collectionName, variant, size)` catalog entry. When that implementation is placed in a Grid, its resource and identity are still **`brick`** and **`brickId`**; do not call it a “grid brick” or “grid item.”

### Brick catalog identity: `collectionName` + `variant` + `size`

**Invariant (homepage catalog):**

1. **`collectionName`** is **unique per collection** across the catalog.
2. Within one collection, each **`def.variant`** is kebab-case; its **`def.size`** is kebab-case and unique within that variant.
3. Therefore **`(collectionName, def.variant, def.size)`** is unique for every catalog entry—use those fields for tests and DOM hooks instead of a composite string.

### Terminology: brick catalog identity

In code and tests, use **`collectionName`**, **`variant`**, and **`size`** together. They uniquely identify a homepage catalog entry. They are **not** a grid **instance** id (`item.i`) or a single concatenated key.

- **Bad**: calling a composite like `` `${collectionName}--${w}x${h}` `` or using a bare size as a brick identity.

- **Good**: pass or thread **`collectionName`**, **`def.variant`**, and **`def.size`**; locate bricks with **`gridLocateByBrickIdentity(grid, collectionName, variant, size)`** in [Grid.playwright.spec.ts](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/Grid.playwright.spec.ts>).

[BrickPreview.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/BrickCatalogPreview/BrickPreview.tsx>) exposes it on the draggable slot:

- **`data-brick-drawer-collection-name`** = **`brick.def.collectionName`**
- **`data-brick-drawer-variant`** = **`brick.def.variant`**
- **`data-brick-drawer-size`** = **`brick.def.size`**

(Together with **`data-brick-drawer-brick-slot`**, used by carousel drag guards.)

[Grid.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/Grid.tsx>) sets on each placed brick wrapper:

- **`data-brick-collection-name`** = **`item.def.collectionName`**
- **`data-brick-variant`** = **`item.def.variant`**
- **`data-brick-size`** = **`item.def.size`**
- **`data-brick-id`** = the placed brick id (`item.i` at the `react-grid-layout` boundary)

- **Bad**: a single attribute holding `makeBrickKey` / concatenated ids when you need to target “this variant in this collection” in the drawer **or on the grid**.

- **Good**: expose the collection, variant, size, and brick id separately. In Playwright: drawer — `[data-brick-drawer-brick-slot][data-brick-drawer-collection-name="…"][data-brick-drawer-variant="…"][data-brick-drawer-size="…"]`; Grid — `[data-brick-collection-name="…"][data-brick-variant="…"][data-brick-size="…"]` scoped under `.grid-layout`.

### Good vs bad: brick factory argument naming (`props`, not `options`; inline type)

Brick factories take **one object** describing what to build. Name that parameter **`props`** so it reads like React’s declarative inputs, not a vague “options” bag. Put the object type **on the function signature**; don’t export a separate props type unless another file must import it.

- **Bad**: `export function makeBrick(options: { w; h; component })`; `export type MakeCollectionProps = { … }` with `makeCollection(props: MakeCollectionProps)` when nothing else imports that type.

- **Good**: `makeBrick(props: { variant; size; w; h; label; component })`, `makeVariant(props: { variant; sizes })`, and `makeCollection(props: { collectionName; collectionLabel; collectionDescription; variants })` in [packages/bricks/src/makeBrick.ts](../../packages/bricks/src/makeBrick.ts), [makeVariant.ts](../../packages/bricks/src/makeVariant.ts), and [makeCollection.ts](../../packages/bricks/src/makeCollection.ts).

### Good vs bad: no barrel `index.ts` under homepage bricks

Do **not** add `apps/web/components/home/bricks/index.ts` (or similar) that only re-exports symbols from sibling modules. Name each file after its **primary export** and import that path directly.

- **Bad**: `import { homepageBricks, collectionsHash } from "./bricks"` or `@/components/home/bricks` when `./bricks` is a re-export barrel.

- **Good**: import `collectionsHash` from its defining module and resolve a component directly through `collection.variants[variant].sizes[size]`; import specific collections from their modules under `collections/`.

### Good vs bad: `ICollection` + `BrickCarousel` — don’t add `FromCatalog` on shared UI

Do **not** add a second exported wrapper on the shared carousel that imports **`collectionsHash`** and takes **`collectionName`**: that couples every import site to a parallel API and drags catalog knowledge into **`components/home`**.

- **Bad**: `BrickCarouselFromCatalog` (or similar) exported from [BrickCarousel.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarousel.tsx>) — thin pass-through: `collectionsHash[collectionName]` → **`BrickCarousel`**.

- **Good**: [BrickCarousel.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/BrickCarousel/BrickCarousel.tsx>) accepts **`collection: ICollection`** (and optional **`brickSortFn`**) only. Resolve **`collectionsHash[collectionName]`** in the route’s client `page.tsx` next to the site workspace and pass **`collection`** into **`BrickCarousel`**; keep **`collectionsHash`** out of the shared carousel module.

### Good vs bad: brick-catalog route — keep one-off logic in `page.tsx`

**Prefer consolidating** behavior for `@leftDrawer` routes (e.g. [brick-catalog/page.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/@leftDrawer/brick-catalog/page.tsx>), [brick/[brickId]/page.tsx](<../../apps/web/app/(site)/site/[siteId]/page/[pageId]/@leftDrawer/brick/[brickId]/page.tsx>)) in those files. Do **not** add a **separate module** whose **only** consumer is that single `page.tsx` (extra imports and folder noise for no reuse).

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

- **Good**: `apps/web/lib/stores/grid-store.ts`, `useGridStore`, `IGridSeed`, `gridSeed`, `IBrickInstance`, `data-testid="grid-layout"`, and a scoped layout class such as `grid` (see [apps/web/app/globals.css](../../apps/web/app/globals.css) placeholder styling).

- **Bad**: `basis-auto` with many small bricks in one viewport row when the product goal is “one brick, one panel” at a time; or shrinking bricks with `scale-75` when previews should read at full drawer size.

- **Good**: `CarouselItem` with `basis-full shrink-0 grow-0` (plus `pl-*` / `-ml-*` spacing on content), inner panel wrapper for border/padding, and the brick slot matching full width/height in px—no transform scaling.
