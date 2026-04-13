# Component and file naming

Use these rules for **repo-authored React components** that are **not** shadcn and **not** Next.js special files.

### Rule: PascalCase file name matches the component

- **Do** name the file in **PascalCase** when it exports a single React component.
- **Do** match the file name to the component name.

### Good vs bad: component file naming (PascalCase)

- **Bad**: file name doesn’t match component name
  - `components/home/portfolio-grid.tsx`
  - `export function Grid() { ... }`

- **Good**: file name matches component name
  - `components/home/Grid.tsx`
  - `export function Grid() { ... }`

### Good vs bad: one file per component

Prefer **one primary React component per file** (matching the PascalCase file name). Nesting sizable presentational or interactive subcomponents in the parent file makes diffs noisier and obscures imports.

- **Bad**: `TileDrawer.tsx` defines both `TileDrawer` and a multi-markup helper like `TileDrawerCarouselNav` in the same module.

- **Good**: `TileDrawerCarouselNav.tsx` exports `TileDrawerCarouselNav`; [TileDrawer.tsx](../../components/home/TileDrawer.tsx) imports it. Keep **`data-tile-drawer-carousel-nav`** (and similar hooks into parent behavior like `watchDrag`) documented by colocation: the nav file owns the markup; the parent may still reference those attributes in drag guards.

### Exceptions (this rule does not apply)

- **shadcn/ui components**: anything under `components/ui/**` keeps shadcn’s conventions.
- **Next.js special files**: framework-reserved files under `app/**` keep their required names (for example `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`).

### Good vs bad: TileDrawer carousel slides (one panel per tile)

The tile drawer uses shadcn `Carousel` (Embla) **per collection**. Each tile is **one slide**: a bordered panel (`basis-full` on `CarouselItem`) with the draggable preview slot sized in CSS as **`calc(def.w * 50vw / 4)`** by **`calc(def.h * 50vw / 4)`**, i.e. half the viewport (see [HomeShell.tsx](../../components/home/HomeShell.tsx) workspace `w-1/2`) divided into four columns—the same column count [Grid.tsx](../../components/home/Grid.tsx) uses (`GRID_COLS`). The grid itself still sizes cells from **measured** container width ÷ column count (`rowHeight`), so previews can differ slightly (scrollbar, sub-pixel).

### Good vs bad: `TilePreview` props (inline types, no cross-file props export)

Keep [TilePreview.tsx](../../components/home/TilePreview.tsx) decoupled from [TileDrawer.tsx](../../components/home/TileDrawer.tsx): **do not** export a `TilePreviewProps` type from the parent only so the child can import it—that creates an awkward dependency and extra churn for a small props API.

- **Bad**: `export type TilePreviewProps` in `TileDrawer.tsx` and `import { TilePreviewProps } from './TileDrawer'` in `TilePreview.tsx` (parent owns types for a child it does not implement).

- **Good**: annotate the preview’s props inline on `TilePreview` with **`{ tile: ICollectionTile }`** from [components/home/tiles/types.ts](../../components/home/tiles/types.ts). Catalog rows are built with **`makeTile`** (variant **`def` + `component`**) and **`makeCollection`** (`ITile[]` → **`ICollectionTile[]`**). Drawer drag uses native **`DataTransfer`** ([`TILE_DRAG_MIME` / `useTileDrawerStore`](../../components/home/useTileDrawerStore.ts)); [useGridLayoutStore.ts](../../components/home/useGridLayoutStore.ts) holds **`layout`** with **`def`** per item, not React components.

**Same idea for small factories**: if only one function consumes the shape, **inline the object type on the function**—do **not** export `MakeTileCollectionProps`-style types unless a second module genuinely needs to reference that exact type.

### Good vs bad: tile catalog types (`ITile`, `ICollectionTile`, `ICollectionTileDef`)

- **Bad**: ad hoc **`typeId`** strings on every catalog row, or passing full tile objects (including **`component`**) into Zustand for external drag.

- **Good**: **`ICollectionTileDef`** for serializable identity (**`collectionName`**, **`collectionLabel`**, **`w`**, **`h`**, **`label`**); **`catalogKey(def)`** for stable keys (matches legacy `typeId` rules: 2×2 → bare **`collectionName`**). **`ITile`** = variant-only **`def` + `component`**; **`makeCollection`** merges collection scope into each **`ICollectionTile`**.

### Tile variant identity: `collectionName` + tile def `name`

**Invariant (homepage catalog):**

1. **`collectionName`** is **unique per collection** across the catalog.
2. Within one collection, each tile variant’s **`def.name`** (kebab-case, e.g. `2x2`, `8x2`) is **unique among that collection’s tiles**.
3. Therefore **`(collectionName, def.name)`** is **unique for every catalog tile variant**—use this pair for tests and DOM hooks instead of a composite string.

[TilePreview.tsx](../../components/home/TilePreview.tsx) exposes it on the draggable slot:

- **`data-tile-drawer-collection-name`** = **`tile.def.collectionName`**
- **`data-tile-drawer-tile-name`** = **`tile.def.name`**

(Together with **`data-tile-drawer-tile-slot`**, used by carousel drag guards.)

- **Bad**: a single attribute holding `makeTileKey` / `catalogKey` / concatenated ids when you need to target “this variant in this collection” in the drawer.

- **Good**: two attributes, values exactly `def.collectionName` and `def.name`; in Playwright, `[data-tile-drawer-tile-slot][data-tile-drawer-collection-name="…"][data-tile-drawer-tile-name="…"]` (see [`e2e/grid-drag.spec.ts`](../../e2e/grid-drag.spec.ts) `drawerTilePreviewSlot`).

### Good vs bad: tile factory argument naming (`props`, not `options`; inline type)

Tile factories take **one object** describing what to build. Name that parameter **`props`** so it reads like React’s declarative inputs, not a vague “options” bag. Put the object type **on the function signature**; don’t export a separate props type unless another file must import it.

- **Bad**: `export function makeTile(options: { w; h; component })`; `export type MakeCollectionProps = { … }` with `makeCollection(props: MakeCollectionProps)` when nothing else imports that type.

- **Good**: `makeTile(props: { w; h; label?; component })` and `makeCollection(props: { collectionName; collectionLabel; tiles })` in [components/home/tiles/makeTile.ts](../../components/home/tiles/makeTile.ts) and [makeCollection.ts](../../components/home/tiles/makeCollection.ts).

### Good vs bad: no barrel `index.ts` under homepage tiles

Do **not** add `components/home/tiles/index.ts` (or similar) that only re-exports symbols from sibling modules. Name each file after its **primary export** and import that path directly.

- **Bad**: `import { homepageTiles, collectionsHash, findCollectionTile } from "./tiles"` or `@/components/home/tiles` when `./tiles` is a re-export barrel.

- **Good**: `import { catalogKey } from "@/components/home/tiles/catalogKey"`; `import { homepageTiles } from "@/components/home/tiles/homepageTiles"`; `import { collectionsHash } from "@/components/home/tiles/collectionsHash"`; `import { findCollectionTile } from "@/components/home/tiles/findCollectionTile"`; catalog list from [homepageTileCollections.ts](../../components/home/tiles/homepageTileCollections.ts).

### Good vs bad: home grid store naming (`Grid`, `I*` types)

The homepage grid is the product **Grid**; avoid a redundant **Portfolio** prefix on the Zustand module, hook, seed, and domain types. Prefix grid-store **object/interface types** with **`I`** (for example `IGridState`, `IGridSeed`).

- **Bad**: `portfolio-grid-store.ts`, `usePortfolioGridStore`, `PortfolioGridSeed`, `portfolioGridSeed`, `PortfolioGridTileInstance`, test ids like `portfolio-grid-layout`, and a layout class name tied to “portfolio” when the surface is the generic home grid.

- **Good**: `lib/stores/grid-store.ts`, `useGridStore`, `IGridSeed`, `gridSeed`, `IGridTileInstance`, `data-testid="grid-layout"`, and a scoped layout class such as `grid` (see [app/globals.css](../../app/globals.css) placeholder styling).

- **Bad**: `basis-auto` with many small tiles in one viewport row when the product goal is “one tile, one panel” at a time; or shrinking tiles with `scale-75` when previews should read at full drawer size.

- **Good**: `CarouselItem` with `basis-full shrink-0 grow-0` (plus `pl-*` / `-ml-*` spacing on content), inner panel wrapper for border/padding, and the tile slot matching full width/height in px—no transform scaling.
