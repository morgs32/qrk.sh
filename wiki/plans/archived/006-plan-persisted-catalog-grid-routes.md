# Persisted catalog grid routes implementation plan

**Date:** 2026-07-17
**Source spec:** `006-spec-persisted-catalog-grid-routes`

## Steps

1. Add Zustand React to the bricks package and create the singleton `useGridStore` with one JSON-serializable grid entry per `catalogName`.
2. Persist only the per-catalog grid data to localStorage, expose hydration state, and lazily initialize each catalog with the four gray fixture layout items.
3. Move catalog layout updates, added grid-brick identities, and grid-instance lookup out of route-local component state and into `useGridStore`.
4. Restructure the catalog route as the shared two-pane workspace so its right grid remains mounted for both catalog and detail routes.
5. Add `/catalogs/$catalogName/gridBrick/$gridBrickId`, render the selected catalog brick in the left pane after hydration, and render an inline missing-ID state when lookup fails.
6. Navigate selectable added bricks to their grid-brick detail URLs while keeping fixtures non-selectable and preserving the back route to the catalog catalog.
7. Update Playwright coverage to clear the sandbox storage key, prove drop and movement persistence across reload, prove routed detail rendering, and prove the missing-ID state.
8. Run `git diff --check` plus the bricks package typecheck, format check, lint, build-workbench, and Playwright targets through Nx.
