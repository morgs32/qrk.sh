# Per-breakpoint default placement size design

**Date:** 2026-09-28  
**Status:** Approved for implementation

## Problem Statement

`addBrick` copies the dropped item's width and height to every breakpoint. A brick added at XL therefore starts with XL dimensions at SM, MD, and LG, even when those breakpoint previews have different default sizes.

## Solution

The drop supplies the starting grid X/Y position. Each new placement uses the module preview's declared or measured default width and height for its own breakpoint. Existing bounds correction and collision resolution may adjust the resulting position.

## User Stories

1. As a wall editor, I can add a brick at any breakpoint and see its own default size at all four breakpoints.
2. As a wall editor, I can use the module filmstrip, module detail preview, or Studio drawer and get the same placement behavior.
3. As a wall editor, I cannot start a drag until all four sizes for that preview's current state and spec are available.
4. As a user with an existing wall, my placed bricks retain their current geometry.

## Implementation Decisions

1. Resolve each size from that breakpoint's declared `viewFor` width and height, or measure the preview with the state and spec being dragged. Limit measured widths to the wall's eight columns. Use the same rule in every drag source.
2. Carry `placementSizes: { sm, md, lg, xl }`, each containing `{ w, h }`, in the drag data and new `addBrick` payload. Keep the active `w` and `h` for the grid drag placeholder.
3. Upgrade `addBrick` from `1.0.0` to `1.1.0` with `upgradeContractVersion`. Its historical adapter supplies the old dropped width and height at every breakpoint, preserving old command behavior.
4. Use one local mutation program from both contract versions. Version `1.0.0` supplies the dropped size at each breakpoint; version `1.1.0` supplies `placementSizes[breakpoint]`.
5. Keep the active breakpoint's UI-resolved layout. For each other breakpoint, insert the new brick at the dropped X/Y with that breakpoint's size, then use the existing bounds and collision-resolution procedure.
6. Keep the existing placement schema and previously stored rows unchanged.

## Testing Decisions

1. Manually add a brick at XL from `/modules`, then compare all four new placement sizes with their preview defaults. Repeat from a module detail preview, including a generated spec, and a Studio drawer.
2. Check that dragging waits for all measurements and that X/Y starts at the dropped grid coordinates, subject to existing bounds and collision handling.
3. Verify a historical `1.0.0` command can replay with its original propagated size.
4. Run Library typechecking and lint. Do not write or run Library tests, as required by `AGENTS.md`.

## Out of Scope

1. Resizing or migrating existing placements.
2. Changing the grid's bounds or collision algorithm.
