# Single sandbox grid implementation plan

**Date:** 2026-07-17
**Status:** Implemented and verified

## Goal

Replace the sandbox's per-collection grids with one persisted React Grid Layout shared by the root catalog, collection catalog, and grid-brick detail routes. Make `/` use the same two-pane workspace: one representative brick variant from every collection on the left and the shared eight-column grid on the right.

## Decisions

1. `useGridStore` owns exactly one `layout` and one `gridBricksById` record. Neither value is nested under `collectionName`.
2. A placed brick still stores its complete serializable `ICollectionBrickDef`, so its collection and variant can be resolved after reload.
3. `/collections/$collectionName/gridBrick/$gridBrickId` remains the detail URL. The route validates that the selected grid brick belongs to the URL's `collectionName`; a mismatched or absent instance renders the existing not-found state.
4. The root list uses the first registered variant from each collection as that collection's representative. It preserves `collectionsHash` insertion order and links the collection heading to its collection route.
5. Representative root variants are draggable into the shared grid. Collection pages continue to expose every variant for dragging.
6. The changed persisted shape starts under a new localStorage key rather than guessing how to combine independent old grids and their duplicate fixtures. Existing `qrk-bricks-sandbox-grid` data is left untouched; the new singleton grid begins with one set of four fixtures.
7. Add one shared `SandboxGrid` component. Its only call sites are the `/` route and the `/collections/$collectionName` parent route. It owns the repeated React Grid Layout rendering, drop, movement, selection, hydration, and sizing behavior; each route continues to own its left-pane content and split-pane markup.

## Steps

1. Reshape `packages/bricks/workbench/src/useGridStore.ts` in place.
   1. Replace `collectionGrids` with top-level `layout` and `gridBricksById` fields.
   2. Initialize the single layout with the four existing gray fixtures directly in the store.
   3. Remove `ensureCollectionGrid` and remove `collectionName` arguments from layout and add operations.
   4. Keep `activeBrickDrag` and hydration state ephemeral, and persist only `layout` plus `gridBricksById` under a new singleton-grid storage key.
   5. Keep the store shape inline; do not introduce a new named type, helper, wrapper, barrel, or export.
2. Add `packages/bricks/workbench/src/SandboxGrid.tsx` as the one approved shared component.
   1. Move the existing eight-column, full-bleed React Grid Layout markup and container-width calculation into it.
   2. Resolve dropped bricks directly from `activeBrickDrag`, allowing root representatives and collection variants to share the same drop path without collection-scoped lookup.
   3. Resolve every placed item from its stored `ICollectionBrickDef` with `findCollectionBrick`, so bricks from different collections render together.
   4. Preserve the four gray fixtures, zero grid margins and padding, disabled resizing, vertical compaction, drag-click suppression, and proportional row height.
   5. Navigate a selected placed brick using the stored definition's `collectionName` and the grid instance ID.
3. Update `packages/bricks/workbench/src/routes/index.tsx` to render the root sandbox as two equal vertical panes at the existing mobile breakpoint.
   1. Replace the current centered card grid with a full-height left pane and a full-bleed `SandboxGrid` on the right.
   2. Keep the sandbox wordmark/header inside the left pane so the center divider reaches the top.
   3. List all collections vertically without cards, using the first registered variant as each collection's representative.
   4. Give only collection headings internal horizontal padding; render each representative brick full bleed and at `(brick width / 8) * pane width` with its catalog aspect ratio.
   5. Make each representative draggable by storing its full definition in `activeBrickDrag`, and link its heading to `/collections/$collectionName`.
4. Simplify `packages/bricks/workbench/src/routes/collections.$collectionName.tsx`.
   1. Keep its loader, not-found behavior, two-pane shell, and left-side `Outlet`.
   2. Replace its collection-scoped grid implementation with the shared `SandboxGrid` call.
   3. Do not filter the right grid by the active collection; it is the same singleton grid visible from `/` and every collection route.
5. Update `packages/bricks/workbench/src/routes/collections.$collectionName.gridBrick.$gridBrickId.tsx` to locate the instance in top-level `gridBricksById` and reject a URL whose collection does not match the stored brick definition.
6. Regenerate `packages/bricks/workbench/src/routeTree.gen.ts` only if the route generator changes it; no route names or URL shapes are intentionally added or removed.
7. Update `packages/bricks/workbench/tests/sandbox.playwright.spec.ts`.
   1. Clear both the old and new sandbox storage keys before stateful cases.
   2. Assert `/` has two panes, all eighteen collection entries, one representative variant per collection, and one shared fixture grid.
   3. Drag representatives from two different collections into the root grid and assert both render together.
   4. Navigate to a collection and assert the same two placed bricks and positions remain visible.
   5. Move a brick, reload, and assert the one global layout and both identities persist.
   6. Select a placed brick and assert its existing collection-scoped detail URL and left detail pane.
   7. Assert a mismatched collection/grid-brick URL renders the grid-brick not-found state while the shared right grid remains visible.
8. Verify with `git diff --check` and the resolved Nx targets: `@qrk.sh/bricks:typecheck`, `format:check`, `lint`, `test:e2e`, and `build:workbench`.

## Completion Gate

1. The persisted Zustand payload contains one layout and one brick-definition record, with no `collectionGrids` field.
2. `/`, collection catalog routes, and grid-brick detail routes display the same placed bricks and positions.
3. The root left pane displays exactly one draggable representative per registered collection and no collection cards.
4. Reload restores the singleton grid, while old per-collection persisted data is not read or deleted.
5. The plan remains active under `.plans/plans/` until implementation and every verification target pass.
