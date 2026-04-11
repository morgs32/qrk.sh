# Agent orientation

Use this file to find **repo conventions and docs** quickly. Prefer the linked styleguide before inventing new patterns.

## Docs index

| Topic | Location |
|--------|----------|
| Component/file naming, home tile drawer, catalog types (`ITile`, `ICollectionTile`), tile factories, inline props | [docs/styleguide/component-and-file-naming.md](docs/styleguide/component-and-file-naming.md) |
| TypeScript tooling | [docs/tooling/typescript.md](docs/tooling/typescript.md) |

## `component-and-file-naming.md` — section map

Skim these headings when touching `components/home/**` or homepage tiles:

1. **PascalCase file name matches the component** — default for non-shadcn React files.
2. **TileDrawer carousel slides** — one slide per tile, sizing from `def.w` / `def.h` and `gridCellHeightPx`.
3. **`TilePreview` props (inline types, no cross-file props export)** — don’t export tiny `XxxProps` types for cross-import churn; **same rule extends to single-use factory argument types** (inline on the function).
4. **Tile catalog types** — `ICollectionTileDef`, `catalogKey`, drag def vs component.
5. **Tile factory argument naming** — parameter name `props`, not `options`; **inline** the props object type on `makeTile` / `makeTileCollection` unless another module needs the type.
