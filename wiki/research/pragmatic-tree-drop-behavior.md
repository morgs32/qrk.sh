# Pragmatic tree drop defaults

Research date: 2026-10-20. Source pinned to Atlassian commit
`2d0d0627afa984738ebc2416c5f90d936453f337`. The supplied tree example is
`tree.vr.ap.tsx` (its exported component is named `TreeLegacy`).

## What the example actually uses

1. [`hitbox/list-item`](https://github.com/atlassian/pragmatic-drag-and-drop/blob/2d0d0627afa984738ebc2416c5f90d936453f337/packages/hitbox/src/attach-instruction-2.ts#L7-L29)
   supplies before/combine/after instructions. With all three available, the outer
   quarters reorder and the middle half combines. With only before/after, the
   halves reorder. Axis defaults to vertical; horizontal is supported. Operations
   omitted from the configuration are unavailable.
2. [`react-drop-indicator/list-item`](https://github.com/atlassian/pragmatic-drag-and-drop/blob/2d0d0627afa984738ebc2416c5f90d936453f337/packages/react-drop-indicator/src/list-item.tsx#L26-L49)
   renders the instruction as a stock line with circular terminal or a combine
   border. Blocked instructions use the warning appearance. The default line has
   zero gap and indent; its absolute, pointer-transparent positioning adds no
   layout spacing. This is the example's indicator, rather than `/tree-item`.
3. The [example monitor](https://github.com/atlassian/pragmatic-drag-and-drop/blob/2d0d0627afa984738ebc2416c5f90d936453f337/packages/documentation/examples/tree.vr.ap.tsx#L207-L260)
   uses `location.current.dropTargets[0]`, the innermost eligible target, and
   extracts its instruction for the action. An ancestor never overrides it.
4. The [tree item policy](https://github.com/atlassian/pragmatic-drag-and-drop/blob/2d0d0627afa984738ebc2416c5f90d936453f337/packages/documentation/examples/pieces/tree/tree-item.tsx#L212-L303)
   owns expansion and operation availability: hover expansion, blocked draft
   combines, and disabling after on expanded nonempty items are example policy.
   They are not mandatory hitbox behavior.
5. A [group indicator](https://github.com/atlassian/pragmatic-drag-and-drop/blob/2d0d0627afa984738ebc2416c5f90d936453f337/packages/react-drop-indicator/src/group.tsx#L16-L45)
   only highlights the container. The example's group-only target has no list-item
   instruction, so its monitor does not perform a drop there. QRK must explicitly
   supply its own container creation destination.

## QRK mapping

1. A Row uses vertical before/combine/after. Before/after creates a Row in the
   same Stack; its middle resolves horizontal before/after on a Placement.
2. Empty Rows combine into that Row. Stack background combines by appending a
   Row. Section background combines by creating a Stack and Row, subject to the
   breakpoint capacity. Blank Wall below the final Section creates a Section,
   Stack, and Row. Empty Walls use the same Wall destination.
3. Whole Stacks use horizontal before/after on sibling Stacks. Full destination
   Sections and self targets remain blocked instead of falling through.
4. Indicator and command consume the same target data and stock instruction.
   Existing insertion schemas, model ownership, grips, and keyboard Move remain.
5. No custom corner bands, fixed pixel distance below a Stack, or invisible edge
   overlays remain. Short Stacks stretch to their Section's height, so their
   exposed background appends Rows; only background below the Section creates a
   new Section. The library has no QRK-specific 32px rule.

Library directly consumes hitbox 3.0.0 and react-drop-indicator 4.2.4 alongside
core 4.0.0. The production shared components retain their existing package home;
this does not restore the retired standalone Library application.
