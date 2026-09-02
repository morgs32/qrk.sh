# Transient brick grid drop implementation plan

**Date:** 2026-07-17
**Source spec:** `005-spec-transient-brick-grid-drop`

## Steps

1. Update the collection sandbox route so it owns the four fixture layout items and all added brick placements in local component state only.
2. Make each left-side preview a native drag source that transfers its catalog identity and grid dimensions.
3. Configure the right-side `react-grid-layout` canvas for external drops, create one transient placement per successful drop, and render dropped catalog components alongside the four fixtures.
4. Preserve movable grid items for the current page session and ensure a refresh reconstructs only the fixture layout.
5. Extend the sandbox Playwright test to drag a representative brick into the grid, assert its catalog rendering and dimensions, and verify that all four fixtures remain.
6. Run the sandbox typecheck, formatting check, Playwright suite, and `git diff --check`.
