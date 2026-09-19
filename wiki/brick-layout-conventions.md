# Brick layout conventions

**updated:** 2026-09-19

## Grid identity

- Placed bricks expose `data-brick="{moduleId}"` and `data-brick-id="{brickId}"`.
- Drawer / filmstrip drag sources use `data-brick-drawer-brick-slot` and
  `data-brick-drawer-module-id`.
- Scroll containers that freeze during RGL drag use `data-brick-scroll-root`.

## Session-backed walls

Library `Layout` and Studio site editor both render
[`BrickWall`](../apps/library/lib/BrickWall.tsx) against an in-memory
`LibraryFrontend` mock session:

- Hardcoded `WALL_ID = prefixId(LibraryFrontend.models.wall, "library")`
  (`wal_library`) in each app — do not import a shared wall id from
  `@qrk.sh/library`.
- Layout / EditorLayout: `createLibraryMockSession({ wallId })`,
  `useInitializeMockSession`, gate on `isInitialized`.
- Drop / move / resize / remove / compact: aggregate contracts via
  `stageCommand`. No Zustand `bricksById` wall state.
- `noCompactor` on the grid; compact is an explicit command.

Transient HTML5 drag payload only: `brickDragStore` (`brickDef` /
`setBrickDef`). See [LibraryBrickDrop](./architecture/browser/LibraryBrickDrop.md).
Placement `gridItem` decode/strip: [LibraryGridItem](./architecture/browser/LibraryGridItem.md).

## Breakpoints

`sm` / `md` / `lg` / `xl` each have their own placement row (grid item + Spec +
visibility). Shared module state lives on the brick row.

## Studio detail

Brick detail reads brick + placement with `useLiveQuery` on the same mock
session EditorLayout initialized — not a client Zustand map.
