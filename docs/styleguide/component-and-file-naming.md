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

- **Good**: `TileDrawerCarouselNav.tsx` exports `TileDrawerCarouselNav`; [TileDrawer.tsx](../../components/home/TileDrawer.tsx) imports it. Keep **`data-drawer-carousel-nav`** (and similar hooks into parent behavior like `watchDrag`) documented by colocation: the nav file owns the markup; the parent may still reference those attributes in drag guards.

### Exceptions (this rule does not apply)

- **shadcn/ui components**: anything under `components/ui/**` keeps shadcn’s conventions.
- **Next.js special files**: framework-reserved files under `app/**` keep their required names (for example `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`).

### Good vs bad: TileDrawer carousel slides (one panel per tile)

The tile drawer uses shadcn `Carousel` (Embla) **per collection**. Each tile is **one slide**: a bordered panel (`basis-full` on `CarouselItem`) with the tile sized to **`def.w` / `def.h` × `gridCellHeightPx`** from [lib/stores/grid-store.ts](lib/stores/grid-store.ts) (same value [Grid.tsx](components/home/Grid.tsx) uses as `rowHeight`, i.e. container width ÷ column count). Fall back to `DRAWER_PREVIEW_UNIT_PX` only when the grid has not measured yet.

### Good vs bad: `TilePreview` props (inline types, no cross-file props export)

Keep [TilePreview.tsx](../../components/home/TilePreview.tsx) decoupled from [TileDrawer.tsx](../../components/home/TileDrawer.tsx): **do not** export a `TilePreviewProps` type from the parent only so the child can import it—that creates an awkward dependency and extra churn for a three-field API.

- **Bad**: `export type TilePreviewProps` in `TileDrawer.tsx` and `import { TilePreviewProps } from './TileDrawer'` in `TilePreview.tsx` (parent owns types for a child it does not implement).

- **Good**: annotate the preview’s props inline on `TilePreview` with **`ICollectionTile`** from [components/home/tiles/types.ts](../../components/home/tiles/types.ts) (plus `fullWidth` / `fullHeight`). Catalog rows are built with **`makeTile`** (variant **`def` + `component`**) and **`makeTileCollection`** (`ITile[]` → **`ICollectionTile[]`**). Drag uses **`setExternalDraggingTileDef(tile.def)`**; the grid store holds **`ICollectionTileDef`**, not React components.

**Same idea for small factories**: if only one function consumes the shape, **inline the object type on the function**—do **not** export `MakeTileCollectionProps`-style types unless a second module genuinely needs to reference that exact type.

### Good vs bad: tile catalog types (`ITile`, `ICollectionTile`, `ICollectionTileDef`)

- **Bad**: ad hoc **`typeId`** strings on every catalog row, or passing full tile objects (including **`component`**) into Zustand for external drag.

- **Good**: **`ICollectionTileDef`** for serializable identity (**`collectionId`**, **`collectionLabel`**, **`w`**, **`h`**, **`label`**); **`catalogKey(def)`** for stable keys (matches legacy `typeId` rules: 2×2 → bare **`collectionId`**). **`ITile`** = variant-only **`def` + `component`**; **`makeTileCollection`** merges collection scope into each **`ICollectionTile`**.

### Good vs bad: tile factory argument naming (`props`, not `options`; inline type)

Tile factories take **one object** describing what to build. Name that parameter **`props`** so it reads like React’s declarative inputs, not a vague “options” bag. Put the object type **on the function signature**; don’t export a separate props type unless another file must import it.

- **Bad**: `export function makeTile(options: { w; h; component })`; `export type MakeTileCollectionProps = { … }` with `makeTileCollection(props: MakeTileCollectionProps)` when nothing else imports that type.

- **Good**: `makeTile(props: { w; h; label?; component })` and `makeTileCollection(props: { collectionId; collectionLabel; tiles })` in [components/home/tiles/makeTile.ts](../../components/home/tiles/makeTile.ts) and [makeTileCollection.ts](../../components/home/tiles/makeTileCollection.ts).

### Good vs bad: home grid store naming (`Grid`, `I*` types)

The homepage grid is the product **Grid**; avoid a redundant **Portfolio** prefix on the Zustand module, hook, seed, and domain types. Prefix grid-store **object/interface types** with **`I`** (for example `IGridState`, `IGridSeed`).

- **Bad**: `portfolio-grid-store.ts`, `usePortfolioGridStore`, `PortfolioGridSeed`, `portfolioGridSeed`, `PortfolioGridTileInstance`, test ids like `portfolio-grid-layout`, and a layout class name tied to “portfolio” when the surface is the generic home grid.

- **Good**: `lib/stores/grid-store.ts`, `useGridStore`, `IGridSeed`, `gridSeed`, `IGridTileInstance`, `data-testid="grid-layout"`, and a scoped layout class such as `home-grid` (see [app/globals.css](../../app/globals.css) placeholder styling).

- **Bad**: `basis-auto` with many small tiles in one viewport row when the product goal is “one tile, one panel” at a time; or shrinking tiles with `scale-75` when previews should read at full drawer size.

- **Good**: `CarouselItem` with `basis-full shrink-0 grow-0` (plus `pl-*` / `-ml-*` spacing on content), inner panel wrapper for border/padding, and the tile slot matching full width/height in px—no transform scaling.
