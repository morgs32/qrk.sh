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

### Exceptions (this rule does not apply)

- **shadcn/ui components**: anything under `components/ui/**` keeps shadcn’s conventions.
- **Next.js special files**: framework-reserved files under `app/**` keep their required names (for example `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`).

### Good vs bad: TileDrawer carousel slides (one panel per tile)

The tile drawer uses shadcn `Carousel` (Embla) **per collection**. Each tile is **one slide**: a bordered panel (`basis-full` on `CarouselItem`) with the tile sized to **`dims × gridCellHeightPx`** from [lib/stores/grid-store.ts](lib/stores/grid-store.ts) (same value [Grid.tsx](components/home/Grid.tsx) uses as `rowHeight`, i.e. container width ÷ column count). Fall back to `DRAWER_PREVIEW_UNIT_PX` only when the grid has not measured yet.

### Good vs bad: `DrawerTilePreview` props (inline types, no cross-file props export)

Keep [DrawerTilePreview.tsx](../../components/home/DrawerTilePreview.tsx) decoupled from [TileDrawer.tsx](../../components/home/TileDrawer.tsx): **do not** export a `DrawerTilePreviewProps` type from the parent only so the child can import it—that creates an awkward dependency and extra churn for a three-field API.

- **Bad**: `export type DrawerTilePreviewProps` in `TileDrawer.tsx` and `import { DrawerTilePreviewProps } from './TileDrawer'` in `DrawerTilePreview.tsx` (parent owns types for a child it does not implement).

- **Good**: annotate the preview’s props inline on `DrawerTilePreview` (using `(typeof homepageTiles)[number] & { dims: … }` next to `tile`, plus `fullWidth` / `fullHeight`), and keep `DrawerHomepageTile` as a private helper type inside `TileDrawer` only.

### Good vs bad: home grid store naming (`Grid`, `I*` types)

The homepage grid is the product **Grid**; avoid a redundant **Portfolio** prefix on the Zustand module, hook, seed, and domain types. Prefix grid-store **object/interface types** with **`I`** (for example `IGridState`, `IGridSeed`).

- **Bad**: `portfolio-grid-store.ts`, `usePortfolioGridStore`, `PortfolioGridSeed`, `portfolioGridSeed`, `PortfolioGridTileInstance`, test ids like `portfolio-grid-layout`, and a layout class name tied to “portfolio” when the surface is the generic home grid.

- **Good**: `lib/stores/grid-store.ts`, `useGridStore`, `IGridSeed`, `gridSeed`, `IGridTileInstance`, `data-testid="grid-layout"`, and a scoped layout class such as `home-grid` (see [app/globals.css](../../app/globals.css) placeholder styling).

- **Bad**: `basis-auto` with many small tiles in one viewport row when the product goal is “one tile, one panel” at a time; or shrinking tiles with `scale-75` when previews should read at full drawer size.

- **Good**: `CarouselItem` with `basis-full shrink-0 grow-0` (plus `pl-*` / `-ml-*` spacing on content), inner panel wrapper for border/padding, and the tile slot matching full width/height in px—no transform scaling.
