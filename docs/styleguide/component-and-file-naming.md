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

The tile drawer uses shadcn `Carousel` (Embla) **per collection**. Each tile is **one slide**: a bordered panel (`basis-full` on `CarouselItem`) with the tile at full drawer pixels (`dims × DRAWER_PREVIEW_UNIT_PX`) centered inside.

- **Bad**: `basis-auto` with many small tiles in one viewport row when the product goal is “one tile, one panel” at a time; or shrinking tiles with `scale-75` when previews should read at full drawer size.

- **Good**: `CarouselItem` with `basis-full shrink-0 grow-0` (plus `pl-*` / `-ml-*` spacing on content), inner panel wrapper for border/padding, and the tile slot matching full width/height in px—no transform scaling.
