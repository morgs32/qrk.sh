# Placement layout constructors design

**Date:** 2026-09-19  
**Status:** Approved for planning

## Problem Statement

RGL introduces working properties beyond placement's `{ i, x, y, w, h }`.
Layout operations expose those properties, leaving contract writers responsible
for cleanup. The layout module should own conversion to placement geometry.

## Solution

The existing layout module exposes two synchronous, pure constructors:

1. `makeCompactLayout(layout)` returns compacted placement geometry.
2. `makeCollisionResolvedLayout({ visibleLayout, incoming })` inserts or replaces
   the incoming item and performs the existing collision-resolution procedure.

Both return fresh arrays of fresh five-field objects without mutating inputs.
`make*` communicates construction; documentation explicitly states these
guarantees. Idempotence is not an additional guarantee of this change.

## User Stories

1. As a contract author, I can persist constructed layouts without removing RGL
   properties myself.
2. As a wall user, drop, compact, and show retain their existing geometry and
   visibility behavior.
3. As a maintainer, I can understand output construction and ownership from one
   module.

## Implementation Decisions

1. Rename `compactVisibleLayout` to `makeCompactLayout` and
   `resolveVisibleCollisions` to `makeCollisionResolvedLayout`, updating imports
   and callers. Keep both in the existing module.
2. Preserve parameters and algorithms, including input cloning, bounds
   correction, collision iteration limit, ordering, and error behavior.
3. Finish each operation with an explicit five-field projection. Preserve
   computed values and return fresh objects without mutating inputs.
4. Remove explicit RGL `Layout` return annotations and infer the five-field
   output. Add no named types, exported converters, schema decoders, or casts.
5. Remove add's local `toStoredGridItem`. Add, compact, and show write
   `gridItem: item`, removing redundant write-time item clones. Preserve
   unrelated cloning.
6. Leave the active-breakpoint payload path, BrickWall's callback conversion,
   placement-column decoding, model schemas, and Zerospin unchanged.
7. Update affected architecture prose, diagrams, symbol references, and
   citations. Correct nearby inaccurate claims about excess-property rejection.

## Testing Decisions

1. Verify at the two constructor outputs and their contract callers: exact
   fields, fresh objects, input preservation, unchanged computed geometry, and
   consistent neighbor handling.
2. Inspect empty compaction and incoming-item insertion and replacement paths.
3. Run `pnpm nx run @qrk.sh/library:tsc` and
   `pnpm nx run @qrk.sh/library:lint`; report unrelated failures without
   expanding scope.
4. Add and run no library tests. No manual wall walkthrough is required.
5. The verification seams are the existing layout operations and contract
   writers; no new testing interface is introduced.

## Out of Scope

1. Framework normalization, schema consolidation, persistence migrations, or
   UI changes.
2. New collision-resolution guarantees or algorithmic changes to establish
   idempotence.
3. Unrelated refactoring or cast cleanup.

## Further Notes

1. Prefix `001` was available when this spec was saved.
2. The user separately authorized source implementation on 2026-09-20. No
   implementation-plan document is requested.
