---
title: Library brick drop
updated: 2026-09-28
---

# Library brick drop

Catalog tiles place a brick onto `BrickWall` through a persisted standalone library session and `addBrick`. HTML5 `dragover` cannot read
custom MIME, so the live payload is the module-level Zustand singleton
`brickDragStore` (`brickDef` / `setBrickDef` only). Placement column shape is
[LibraryGridItem](LibraryGridItem.md).

The shared `IDraggedBrick` payload retains a registered module ID from all four
drag sources. The view registry preserves the relationship between its keys,
module IDs, and definition IDs, so drop needs no separate module ID guard.
State decoding remains part of the drop workflow.

## Trigger

1. Each app layout gates children on an initialized session seeded with `wal_library`.
   1. Library workbench: module-level `librarySession` + `useInitializeStandaloneSession`,
      then `LibrarySessionContext`; reset replaces the `qrk-library` backup with
      the empty seeded wall and clears its command history. Studio document keys
      and backend storage are outside this reset.
   2. Studio: `createLibraryStandaloneSession({ key, wallId })` +
      `useInitializeStandaloneSession` in `LibraryEditorSession`. Its document key is
      `JSON.stringify(["studio", user.id, siteId, pageId])`. Studio's live
      `userSession` owns the remote user/site/page data separately.
2. A catalog tile starts an HTML5 drag and writes `brickDragStore` before
   RGL sees `dragover`. Each source first resolves the declared or measured
   default `{ w, h }` for all four breakpoints using its current state and spec.
   Measured widths are limited to the wall's eight columns.
   Dragging remains disabled until every size is available.
   1. Library filmstrip: `DraggableBrick`.
   2. Library module breakpoint preview: `-BreakpointPreviewRow`.
   3. Studio drawer: `BrickGroup` / `BrickGroupRoute`.

`addBrick` is a fresh `1.0.0` baseline with no historical payload adapter.
The payload contains `wallId`, `brickId`, `moduleId`, `state`, `spec`,
`dropPosition: { x, y }`, four `placementSizes`, and four `visibleLayouts`.
The grid preview may differ from the committed result: every breakpoint is
resolved by the contract using the stored placement snapshots.

```mermaid
sequenceDiagram
  participant DraggableBrick
  participant brickDragStore
  participant GridLayout
  participant BrickWall
  participant stageCommand
  participant guard as addBrick.guard
  participant program as addBrick.program
  participant makeCollisionResolvedLayout
  participant models
  autonumber
  DraggableBrick->>brickDragStore: setBrickDef(... placementSizes)
  GridLayout->>BrickWall: onDragOver()
  GridLayout->>BrickWall: onDrop(nextLayout, item)
  BrickWall->>stageCommand: addBrick(dropPosition, placementSizes, visibleLayouts)
  stageCommand->>guard: guard(payload, queryDb)
  guard->>guard: match current visible geometry at every breakpoint
  stageCommand->>program: program(payload)
  program->>makeCollisionResolvedLayout: resolve all four layouts
  makeCollisionResolvedLayout-->>program: fresh i x y w h items
  program->>program: validate every resolved layout
  program->>models: create brick and four placements; update displaced neighbors
  BrickWall->>brickDragStore: setBrickDef(null)
```

## Annotated workflow steps

1. Drag start supplies all four measured or declared sizes.
   - [`DraggableBrick.tsx:18-34`](../../../apps/library/app/DraggableBrick.tsx#L18-L34) — writes the drag definition once all sizes are available. (`apps/library/app/DraggableBrick.tsx:18-34`)
2. Hover reads the live drag definition and returns the active placeholder size.
   - [`BrickWall.tsx:148-158`](../../../apps/library/lib/BrickWall.tsx#L148-L158) — missing drag data returns false. (`apps/library/lib/BrickWall.tsx:148-158`)
3. Drop uses only the item position from the grid and reads the drag definition again.
   - [`BrickWall.tsx:160-167`](../../../apps/library/lib/BrickWall.tsx#L160-L167) — reads the typed drag payload and looks up its registered module. (`apps/library/lib/BrickWall.tsx:160-167`)
4. The caller decodes module state, snapshots all four visible layouts from session placements, and stages the payload.
   - [`BrickWall.tsx:168-201`](../../../apps/library/lib/BrickWall.tsx#L168-L201) — preserves module state decoding and four placement sizes. (`apps/library/lib/BrickWall.tsx:168-201`)
5. The guard validates wall and identity, state/spec, nonnegative integer coordinates, and positive integer dimensions.
   - [`AddBrickContractV1.ts:100-184`](../../../apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts#L100-L184) — rejects invalid inputs before the program. (`apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts:100-184`)
6. Each snapshot must match stored visible i/x/y/w/h exactly, regardless of order. Duplicates, omissions, stale geometry, and extra items fail with conflict 409.
   - [`AddBrickContractV1.ts:186-237`](../../../apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts#L186-L237) — compares snapshots against current wall placements. (`apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts:186-237`)
7. The named program constructs the incoming item separately for every breakpoint.
   - [`AddBrickContractV1.ts:239-258`](../../../apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts#L239-L258) — combines brickId, dropPosition, and breakpoint size. (`apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts:239-258`)
8. The constructor clones inputs, corrects eight-column bounds, and pushes overlapping neighbors downward through cascades while preserving gaps.
   - [`resolveVisibleCollisions.ts:20-41`](../../../apps/library/libraryModule/resolveVisibleCollisions.ts#L20-L41) — settles neighbors in row and column order. (`apps/library/libraryModule/resolveVisibleCollisions.ts:20-41`)
9. Resolved layouts contain only the five persisted geometry fields.
   - [`resolveVisibleCollisions.ts:43`](../../../apps/library/libraryModule/resolveVisibleCollisions.ts#L43) — projects fresh objects. (`apps/library/libraryModule/resolveVisibleCollisions.ts:43`)
10. All four outputs are validated before any mutation is constructed.

- [`AddBrickContractV1.ts:259-271`](../../../apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts#L259-L271) — fails before brick creation if a resolved layout is invalid. (`apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts:259-271`)

11. The program clones state/spec, creates the brick and placements, and updates changed visible neighbors. Hidden placements and unchanged neighbors are untouched.

- [`AddBrickContractV1.ts:273-332`](../../../apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts#L273-L332) — creates incoming placements and skips unchanged geometry. (`apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts:273-332`)

12. Existing command errors are presented and the drag definition is cleared.

- [`BrickWall.tsx:202-212`](../../../apps/library/lib/BrickWall.tsx#L202-L212) — preserves failure handling. (`apps/library/lib/BrickWall.tsx:202-212`)
