# Per-breakpoint default placement size design

**Date:** 2026-09-28  
**Status:** Implemented; reconciled with the current `addBrick` contract and archived at user direction. Manual acceptance checks remain in [TODOs](../../../TODOS.md).

## Problem Statement

Previously, `addBrick` copied the dropped item's width and height to every breakpoint. A brick added at XL therefore started with XL dimensions at SM, MD, and LG, even when those breakpoint previews had different default sizes.

## Solution

The drop supplies the starting grid X/Y position. Each new placement uses the module preview's declared or measured default width and height for its own breakpoint. Existing bounds correction and collision resolution may adjust the resulting position.

## User Stories

1. As a wall editor, I can add a brick at any breakpoint and see its own default size at all four breakpoints.
2. As a wall editor, I can use the module filmstrip, module detail preview, or Studio drawer and get the same placement behavior.
3. As a wall editor, I cannot start a drag until all four sizes for that preview's current state and spec are available.
4. As a user with an existing wall, my placed bricks retain their current geometry.

## Implementation Decisions

1. Resolve each size from that breakpoint's declared `viewFor` width and height, or measure the preview with the state and spec being dragged. Apply that breakpoint's `minW` and `minH` to measured sizes and limit measured widths to the wall's eight columns. Use the same rule in every drag source.
2. Carry `placementSizes: { sm, md, lg, xl }`, each containing `{ w, h }`, in the drag data and new `addBrick` payload. Keep the active `w` and `h` for the grid drag placeholder.
3. The implemented `addBrick` contract is a fresh `1.0.0` baseline after the authorized document reset. It has no historical adapter; old payloads and pending commands require that reset. This supersedes the original proposal to upgrade to `1.1.0` and replay old commands through an adapter.
4. The caller sends `dropPosition`, all four `placementSizes`, and all four visible-layout snapshots. The guard checks that each snapshot matches current stored visible geometry, rejecting stale snapshots before mutation. The program inserts the new brick at the dropped X/Y with each breakpoint's own size, resolves collisions and bounds for all four layouts, then writes the brick, placements, and displaced visible neighbors. The grid's proposed neighbor positions are not authoritative.
5. Keep the existing placement schema and previously stored rows unchanged. A new drop does not resize existing bricks.

## Testing Decisions

1. Manually add a brick at XL from `/modules`, then compare all four new placement sizes with their preview defaults. Repeat from a module detail preview, including a generated spec, and a Studio drawer.
2. Check that dragging waits for all measurements and that X/Y starts at the dropped grid coordinates, subject to existing bounds and collision handling.
3. Check that a stale visible-layout snapshot is rejected before any placement changes. Do not test replay of the pre-reset payload; the current baseline does not support it.
4. Run Library typechecking and lint for implementation changes. Do not write or run Library tests, as required by `AGENTS.md`.

## Reconciliation record — 2026-09-30

1. Source inspection confirmed four-size drag payloads in the shared filmstrip, Library module breakpoint preview, and Studio module detail. `BrickWall` stages the drop position, sizes, and visible-layout snapshots.
2. `AddBrickContractV1` declares `1.0.0`, validates positive integer sizes and matching visible-layout snapshots, and resolves all four placements with their own sizes. [Library's README](../../../apps/library/README.md) and [brick-drop architecture](../../architecture/browser/LibraryBrickDrop.md) describe the same fresh baseline and reset boundary.
3. This reconciliation did not run the manual acceptance checks or rerun Library typechecking/lint. Those checks are tracked in [TODOs](../../../TODOS.md); no Library tests were written or run.

## Out of Scope

1. Resizing or migrating existing placements.
2. Changing the grid's bounds or collision algorithm.
