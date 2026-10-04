# Brick layout conventions

**updated:** 2026-10-03

## Grid identity

- Placed bricks expose `data-brick="{moduleId}"` and `data-brick-id="{brickId}"`.
- Drawer / filmstrip drag sources use `data-brick-drawer-brick-slot` and
  `data-brick-drawer-module-id`.
- Scroll containers that freeze during RGL drag use `data-brick-scroll-root`.

## Session-backed walls

Library `LibraryLayout` and Studio's page editor render
[`BrickWall`](../apps/library/lib/BrickWall.tsx) against sessions exposing
`libraryModule` models and contracts:

- Library initializes module-level `librarySession` with
  `useInitializeStandaloneSession` and gates on `isInitialized`. Its
  `qrk-library` backup stores `wal_library`, seeded through
  `prefixId(libraryModule.models.wall, "library")`.
- Studio uses authenticated live `userSession` and the current page's `wallId`.
  `JSON.stringify(["studio", user.id, siteId, pageId])` keys its viewport provider,
  not a standalone session or per-page backup.
- Library reset calls `session.reset()` to replace its saved document with
  the original seeds; Studio data remains separate.
- Drop / move / resize / remove / compact: aggregate contracts via
  `stageCommand`. No Zustand `bricksById` wall state.
- `verticalCompactor` on the grid packs drag/resize feedback. Module contracts
  compact saved geometry: add/show after collision resolution, layout updates
  before saving, hide at its breakpoint, and remove at all four breakpoints.
- Mounted walls normalize existing gaps through `compactLayoutAtBreakpoint`,
  including inactive panes. Compare geometry by brick ID and stage only changes;
  defer during grid gestures or catalog drags and report failures without retrying
  unchanged input. There is no manual **Compact layout** toolbar action.
- Add snapshots retain stored geometry, not compacted grid-preview positions.
  Hide/remove derive visible survivors from stored rows, explicitly excluding
  the target because emitted operations accumulate before application.
  Skip unchanged placement writes and preserve hidden geometry and Specs.

Transient HTML5 drag payload only: `brickDragStore` (`brickDef` /
`setBrickDef`). See [LibraryBrickDrop](./architecture/browser/LibraryBrickDrop.md).
Placement `gridItem` decode/strip: [LibraryGridItem](./architecture/browser/LibraryGridItem.md).

## Breakpoints

`sm` / `md` / `lg` / `xl` each have their own placement row (grid item + Spec +
visibility). Shared module state lives on the brick row.

## Studio detail

Brick detail reads brick + placement with `useLiveQuery` on the same live
`userSession` as the page wall.
