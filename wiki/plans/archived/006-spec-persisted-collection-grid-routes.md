# Persisted collection grid routes design

**Date:** 2026-07-17
**Status:** Approved for planning

## Problem Statement

The brick sandbox currently owns each collection grid in route-local React state. Added grid bricks and moved positions disappear on reload, and a selected grid brick cannot have a stable route because its `gridBrickId` cannot be resolved after the collection page remounts.

The sandbox needs browser-local continuity without introducing Zerospin, server storage, user accounts, or application-level persistence.

## Solution

Add one module-level Zustand React store named `useGridStore`. It owns one grid entry per `collectionName`, persists those entries to localStorage through Zustand's `persist` middleware, and stores only JSON-serializable data. Each collection entry contains its React Grid Layout geometry and the catalog identity associated with each added `gridBrickId`.

Turn the collection workspace into a routed surface. The collection route shows the catalog in the left pane, while `/collections/$collectionName/gridBrick/$gridBrickId` shows that placed brick's detail view in the left pane. Both routes keep the same persisted grid visible and interactive in the right pane.

## User Stories

1. As a brick author, I want each collection to retain its own grid, so that switching collections does not mix their arrangements.
2. As a brick author, I want added bricks and moved positions to survive reloads, so that the sandbox remains useful across browser sessions.
3. As a brick author, I want to select a placed brick and receive a URL containing its `gridBrickId`, so that the selected grid instance has explicit route identity.
4. As a brick author, I want the selected brick's detail view in the left pane while the grid remains visible, so that detail inspection stays grounded in the arrangement.
5. As a brick author, I want a missing grid-brick URL to produce an explicit inline not-found state, so that stale or invalid local URLs do not silently select another brick.

## Implementation Decisions

1. Name the singleton Zustand React hook `useGridStore`.
2. Store collection grids under `collectionName`; every collection entry owns its own layout and grid-brick identity records.
3. Represent persisted state with JSON-serializable arrays and plain records. Do not persist `Map`, React components, functions, or hydrated catalog objects.
4. Store each added `gridBrickId` with the catalog identity needed to resolve its component from `@qrk.sh/bricks`. The route resolves rendered components from the catalog rather than serializing them.
5. Lazily initialize a collection with the four existing gray two-by-two fixtures. Fixtures remain part of the layout but have no catalog identity and are not selectable.
6. Persist added bricks and subsequent React Grid Layout positions through Zustand's `persist` middleware using localStorage and one sandbox-specific storage key.
7. Do not add a reset or clear-storage control in this pass.
8. Replace collection-route component state for layout and grid-brick identity with `useGridStore`; active native drag state may remain ephemeral because it exists only during one drag gesture.
9. Use `/collections/$collectionName/gridBrick/$gridBrickId` as the placed-brick detail route. `gridBrickId` identifies one placed grid instance, not a catalog variant.
10. Keep the right grid mounted, visible, and interactive on both the collection index and grid-brick detail routes. Only the left pane route content changes.
11. Navigate to the detail route only when an added catalog brick is selected. The four gray fixtures do not navigate.
12. Resolve the detail only after the persisted store has hydrated in the browser. Do not briefly classify a valid persisted ID as missing during hydration.
13. If the collection exists but the hydrated store does not contain `gridBrickId` for that collection, render an inline `Grid brick not found` state in the left pane and leave the right grid visible.
14. The detail pane shows the selected brick's catalog identity and full-size preview, with a back action to `/collections/$collectionName`.

## Testing Decisions

1. Use the existing sandbox Playwright suite as the primary acceptance seam.
2. Start the persisted-grid scenario with the sandbox storage key cleared so prior local runs cannot influence the fixture state.
3. Drag a representative catalog brick into the collection grid, verify its catalog dimensions, move it, select it, and assert navigation to `/collections/$collectionName/gridBrick/$gridBrickId`.
4. Verify the detail route renders the selected catalog component in the left pane while the four fixtures and right grid remain visible.
5. Reload the detail URL and verify the same `gridBrickId`, brick rendering, and moved grid position are restored from localStorage.
6. Navigate to a missing `gridBrickId` and verify the inline `Grid brick not found` state while the grid remains visible.
7. Keep sandbox typecheck, format check, and the complete Playwright suite as required verification.

## Out of Scope

1. Zerospin, server storage, database persistence, authentication, user synchronization, and cross-device synchronization.
2. A reset-grid control, clear-storage control, storage-management UI, or automatic expiry.
3. Selecting or routing the four gray fixtures.
4. Resizing, deleting, duplicating, or editing placed bricks.
5. Sharing the sandbox store with the private web application's grid store.

## Further Notes

1. Zustand's `persist` middleware defaults to localStorage and supports a unique storage key; browser hydration must still be accounted for on a server-rendered route.
2. Persisting catalog identity instead of React components keeps the storage representation inspectable and compatible with JSON serialization.
