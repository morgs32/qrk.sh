# Library wall contracts design

**Date:** 2026-09-17
**Status:** Archived — converted to [implementation plan](../../plans/002-plan-library-wall-contracts.md)

## Problem Statement

The library currently manipulates wall content through Zustand. It should exercise Zerospin contracts and reactive model reads through the existing `makeMockProvider`, using a domain model suitable for later Studio integration.

## Solution

```text
Site → Pages → Wall → Bricks → Placements [sm, md, lg, xl]

Wall:      collection of bricks
Brick:     module identity and shared typed state
Placement: brick reference, breakpoint, gridItem, isVisible, complete spec
```

Implement the Wall → Brick → Placement portion in the library. Seed one sandbox wall in the mock session. Defer Site/Page integration.

## User Stories

1. As a library user, I can drop a brick onto the wall and receive four visible placements without overlaps.
2. I can move or resize a placement without closing unrelated gaps.
3. I can edit shared brick state and see the content change across breakpoints.
4. I can edit a placement's spec independently after creation.
5. I can hide or show a placement at one breakpoint.
6. I can drag a brick out to delete it and all four placements.
7. I can explicitly compact the active breakpoint using a “Compact layout” button.

## Implementation Decisions

1. **Model ownership:** Retain module-specific models as typed brick instances. Move their four spec columns into four separate Placement rows per brick. Each placement is uniquely identified by brick and breakpoint and belongs to the same aggregate as its wall and brick.

2. **Placement validation:** Store complete specs and validate them against the owning module's existing spec schema. Preserve module-specific state commands and add corresponding module-specific spec-at-breakpoint commands. “Update brick state” and “update brick spec” describe these operations, rather than introducing generic untyped contracts.

3. **Atomic creation:** `addBrick` creates the module row, wall membership, and four placements in one command. Clone the supplied state and spec; copy the dropped grid item to initialize every breakpoint. Preserve the active breakpoint's resolved drop layout. At other breakpoints, displace neighbors around the copied position without compacting unrelated gaps. Commit all affected placements together.

4. **Layout updates:** `updateLayoutAtBreakpoint` updates grid items for existing placements at the specified breakpoint. It does not change state, specs, visibility, or membership. Move and resize interactions submit their resulting collision-resolved layouts.

5. **Collision handling:** Reuse React Grid Layout's exported core algorithms. Disable automatic compaction. Resolve overlaps during insertion, showing, moving, and resizing while preserving unrelated gaps. Retain the existing eight-column grid and breakpoint measurements.

6. **Visibility:** `setBrickVisibilityAtBreakpoint` hides a placement without moving neighbors. Showing it resolves collisions around its saved position. Visibility and resulting placement changes commit in one command; hidden placements retain their specs and saved grid items.

7. **Removal:** `removeBrick` deletes wall membership, the module row, and all four placement rows in one command. Leave gaps at every breakpoint.

8. **Explicit compaction:** `compactLayoutAtBreakpoint` applies vertical compaction to visible placements at the selected breakpoint. A “Compact layout” button invokes it. Hidden placements and other breakpoints remain unchanged.

9. **React integration:** Assemble the library frontend from its existing aggregate and the new models/contracts, then wrap the sandbox with `makeMockProvider`. Render the wall and editors from reactive model reads. Keep transient drag, selection, measurement, and editor interaction state local; remove committed brick/layout ownership from Zustand.

10. **Command failures:** Surface failures and retain the previously committed model state. Do not apply parallel Zustand mutations or silently fall back to local setters.

11. **Documentation:** Update affected wall/drop documentation and conventions to reflect placement ownership and explicit compaction when implementing this design. Do not change vendored Zerospin source.

## Testing Decisions

1. Run library typecheck and lint. Do not add or run library automated tests.
2. Manually verify drops against different existing layouts at all four breakpoints: neighbors displace, no overlaps remain, and unrelated gaps survive.
3. Verify move/resize, hide/show, and removal follow the agreed gap and collision behavior.
4. Verify state edits appear across breakpoints, while spec edits affect only the targeted placement.
5. Verify explicit compaction affects visible placements only at the active breakpoint.
6. Verify removal deletes the brick and all placements, and rejected commands leave no partial model changes.
7. Use existing Zerospin mock-provider examples and transactional command execution as implementation references.

## Out of Scope

1. Studio integration, Site/Page migration, production deployment, and remote persistence.
2. Propagating edits across placements; a future button may provide that explicitly.
3. Breakpoint inheritance, spec overrides, or automatic compaction.
4. New transaction infrastructure, a replacement mock runtime, or unrelated cleanup.

## Further Notes

1. Each mock-provider mount starts from seeded sandbox resources; refresh persistence is not introduced.
2. The future Studio relationship is one wall per page. This spec does not add that integration prematurely.
3. This document records the agreed design. Creating it does not implement the behavior or create an implementation plan.
