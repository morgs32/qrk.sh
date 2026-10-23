# 001: Wall-owned layout tree

**Status:** Accepted; implemented in the current development baseline.  
**Date:** 2026-10-21  
**Plan:** [039 — Wall-owned layout tree](../archive/plans/039-plan-wall-owned-layout-tree.md)

## Context

A Wall's arrangement was reconstructed from Section, Stack, Row, and Placement
tables, with parent references and numeric sibling positions. Ordinary edits
needed structural reads and position updates across those tables. The former
whole-Page deletion query exceeded Workerd's SQL expression-depth limit. Focused
queries reduced its scope but left storage bookkeeping in the command.

The editor already consumes ordered trees. Stable node identity is needed for
insertion anchors and movement; separate SQL rows are not needed to provide it.
Brick content is shared across all four breakpoint Walls, while each Placement's
spec and generation lifecycle change independently of arrangement.

## Decision

Each Wall owns a required, schema-validated `layout` containing ordered Section,
named Stack, and Row nodes. Rows contain ordered Placement IDs. Array order
defines arrangement. Stable prefixed IDs remain, while structural tables,
parent columns, and numeric position fields are removed.

Brick remains the Page-owned shared content record. Placement remains a separate
record with `brickId`, direct `wallId`, variant, spec, spec revision, and generation
state. A unique Wall/Brick index permits one appearance per Wall. Content and spec
updates do not rewrite layout JSON.

```text
Wall.layout: Section → Stack → Row [Placement A, Placement B]
Placement A: Wall ID, Brick ID, variant, spec, revisions, generation
Brick: Page ID, module, shared content, state revision
# Moving A edits array membership; its independent records retain identity/state.
```

The browser-safe layout module owns pure structural transformations and expected
target refusals. Commands authorize the action, read current state, calculate the
next tree, and record one update per changed Wall with any Brick/Placement
operations in the same atomic batch. Callers submit intent and stable IDs rather
than a replacement document. Canonical commands execute serially against current
state; existing optimistic reconciliation remains responsible for local work.

Movement prunes all empty containers in its edited Wall after insertion and
checks resulting capacity. Genuine self-before moves do no cleanup. Brick
deletion prunes only ancestors emptied by its removed appearances, preserving
unrelated empty scaffolding. These policies remain distinct.

## Consequences and alternatives

The design replaces deep structural joins and sibling renumbering with ordinary
tree operations. A structural edit writes the changed Wall's complete layout
value. Sections, Stacks, and Rows cannot be queried as independent SQL models.
Placement-to-Wall and Placement-to-Brick relationships retain their model
constraints, but references inside JSON have no SQL foreign keys. The schema
checks ID shape and uniqueness; commands enforce Wall/Page membership and
record/reference consistency. A missing referenced record is an invariant
failure, not a skipped item or a reconstructed fallback hierarchy.

Keeping normalized structural tables would retain per-node queries but also
retain the reconstruction and update machinery. Embedding content and specs in
the layout would couple their independent updates and generation lifecycle to
structural writes. Both alternatives were rejected.

## Cutover

The current V1 development graph is replaced in place, preserving System
identity. Old definitions, command history, materializations, projections, and
checkpoints cannot be replayed against the new representation. The authorized
local cutover moves the complete affected backend state aside and initializes
fresh state together with a matching definition-keyed browser namespace. There
is no migration, compatibility release, automatic reset, or old-state import.
Old browser namespaces and their unsent work remain preserved. Production and
unrelated local storage are outside this local cutover's scope.

## Source

1. [Wall model](../../apps/zerospin/src/aggregates/user/models/wall/WallV1.ts)
   and [layout schema](../../apps/zerospin/src/aggregates/user/layout/wallLayoutSchema.ts).
2. [Placement attributes](../../apps/zerospin/src/aggregates/user/models/placement/PlacementV1.ts)
   and [pure layout operations](../../apps/zerospin/src/aggregates/user/layout/wallLayout.ts).
3. [Brick deletion](../../apps/zerospin/src/aggregates/user/contracts/wall/DeleteBrickContractV1.ts)
   and [App reference resolution](../../apps/app/modules/lib/wall/makeWallLayoutView.ts).
