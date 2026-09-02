# Transient brick grid drop design

**Date:** 2026-07-17
**Status:** Approved for planning

## Problem Statement

The brick development sandbox can display collection variants beside an eight-column `react-grid-layout` canvas, but an author cannot place a catalog brick onto that canvas. Brick placement is intentionally sandbox-only: introducing GridItem persistence, Zerospin state, or private application behavior would undermine the workbench's isolated development role.

## Solution

Make each collection-page brick preview a native drag source and make the adjacent grid an external-drop target. A successful drop creates an in-memory placed brick using the dragged variant's catalog dimensions. The resulting placement can be moved within the grid for the active browser session. Reloading the page recreates the original four gray fixture items and discards every added brick and moved position.

## User Stories

1. As a brick author, I want to drag a listed brick variant onto the adjacent grid, so that I can inspect it in a composed layout.
2. As a brick author, I want the dropped brick to preserve its catalog width and height, so that the grid reflects the variant's intended geometry.
3. As a brick author, I want to reposition an added brick during the session, so that I can explore an arrangement before refreshing.
4. As a brick author, I want a refresh to reset the grid to its four gray fixtures, so that the sandbox remains disposable and does not imply persistence.

## Implementation Decisions

1. The collection page is the sole owner of its transient grid layout state; it does not read or write Zustand, Zerospin, browser storage, a server route, or a database.
2. The left-side full-size previews are native draggable sources. Their drag payload identifies the current collection's brick variant and carries its catalog grid dimensions.
3. The right-side `react-grid-layout` canvas accepts external drops and creates one placed brick for each successful drop.
4. A placed brick renders the catalog component corresponding to its drag payload and occupies the same `w` by `h` grid dimensions as that variant.
5. The right canvas remains eight columns wide with zero grid margins and zero container padding.
6. The four gray two-by-two fixtures remain initial, session-local grid items. They stay visible alongside added bricks until refresh.
7. Added bricks and fixtures may be moved through `react-grid-layout`; resizing, removal controls, cross-collection selection, and persistence are not introduced.

## Testing Decisions

1. Use the existing sandbox Playwright suite as the single acceptance seam.
2. One Playwright scenario drags a representative left-side preview into the right grid and verifies the resulting catalog component is rendered there.
3. The same scenario verifies that the placed brick's grid dimensions match its catalog dimensions and that the four fixture items remain present.
4. Existing sandbox typecheck, format, and Playwright checks remain required verification.

## Out of Scope

1. Persisting grid geometry or added bricks across refreshes, sessions, routes, or users.
2. Zerospin, Zustand, localStorage, cookies, server actions, API routes, and database writes.
3. Removal controls, resizing, keyboard placement, undo/redo, and generalized editor state.
4. Sharing drag-and-drop code with the private web application or changing the web application's Grid behavior.

## Further Notes

1. The sandbox grid's fixture-only reset is intentional acceptance behavior, not an incomplete persistence implementation.
