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

## Prior QRK mapping: 2026-10-20 design

This broader mapping is retained as prior design context. It does not describe
the approved implementation scope; the dated phase-one note below governs that
scope. Whole-Stack movement and Section/Wall-tail creation are not phase one.

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

Historical package/location note from 2026-10-20: Library directly consumes
hitbox 3.0.0 and react-drop-indicator 4.2.4 alongside
core 4.0.0. The production shared components retain their existing package home;
this does not restore the retired standalone Library application.

## 2026-10-23: phase one, Drawer to Wall only

This note records the settled phase-one contract. It does not authorize the
broader mapping above. Current primary-source references below are pinned to
Atlassian commit `80f1a86d08060f9946125d1dd7c1eaf5c89b605b`.

1. **Source data identifies a drawer template.** `getInitialData` runs once just
   before dragging starts and returns a record; the tutorial's `location` is
   application data, not a required field. QRK supplies the discriminator and
   module identity, then creates a new Brick through the existing `addBrick`
   command. It does not move an existing Wall Brick or persist on hover.
   [Source contract](https://github.com/atlassian/pragmatic-drag-and-drop/blob/80f1a86d08060f9946125d1dd7c1eaf5c89b605b/packages/core/src/adapter/element-adapter.ts#L50-L62).

   ```ts
   getInitialData: () => ({
     type: "drawer-brick", // Identify this drag as a drawer template.
     moduleId: brickModule.id, // The command resolves the module's defaults.
   }),
   ```

2. **Eligibility and destination are separate.** `canDrop` and `getData` receive
   current input, source data, and the target element. Both are reevaluated while
   hovering; `canDrop: false` skips only that target and continues searching
   ancestors. QRK checks the drawer payload and module Page limit on every
   eligible level. `getData` returns the existing insertion-target schema with
   stable Wall/Row/Stack anchors.
   [Feedback and target contracts](https://github.com/atlassian/pragmatic-drag-and-drop/blob/80f1a86d08060f9946125d1dd7c1eaf5c89b605b/packages/core/src/internal-types.ts#L282-L359),
   [nested-target behavior](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/drop-targets#nested-drop-targets).

3. **One monitor owns insertion.** Active targets are ordered innermost first,
   and all eligible ancestors receive drop events. The Wall monitor uses
   `location.current.dropTargets[0]`, validates its destination and Wall identity,
   and stages one command. Its feedback uses that same destination; ancestor
   callbacks do not create additional Bricks. Dropping outside accepted targets
   performs no insertion.
   [Event ordering and drop completion](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/events),
   [official nested-drop handling](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/drop-targets#handling-ondrop-for-nested-drop-targets).

4. **Geometry follows the owning Row, then the hovered Placement.** A Row uses
   vertical `list-item` before/combine/after: the outer quarters create a Row
   above/below the entire existing Row; its middle half permits Placement
   insertion. A permitted Placement uses closest left/right edges for insertion
   within that Row. If `canShareRow` rejects combining, Placement targets decline
   and the Row's before/after halves choose the new Row destination. This is
   stock proportional geometry, not four-edge Placement selection or custom
   pixel strips. The line marks the resolved destination: vertical for a Brick
   boundary and horizontal across the entire Row for a Row boundary.
   [List-item geometry](https://github.com/atlassian/pragmatic-drag-and-drop/blob/80f1a86d08060f9946125d1dd7c1eaf5c89b605b/packages/hitbox/src/attach-instruction-2.ts),
   [closest-edge geometry](https://github.com/atlassian/pragmatic-drag-and-drop/blob/80f1a86d08060f9946125d1dd7c1eaf5c89b605b/packages/hitbox/src/attach-closest-edge.ts).

5. **No sticky destination or shadow in phase one.** Stickiness defaults to
   false; QRK leaves it disabled so leaving the destination clears its feedback.
   Empty Rows fill in place, exposed Stack background appends a Row, and an
   empty Wall (`sections: []`) accepts the first Brick through the existing Wall
   destination. Indicators add no layout space. The later Section-shadow and
   Stack-shadow prototypes are separate phases; nonempty Wall-tail creation,
   new Section/Stack placement affordances, and dragging existing Wall items
   remain outside phase one.
   [Sticky default](https://github.com/atlassian/pragmatic-drag-and-drop/blob/80f1a86d08060f9946125d1dd7c1eaf5c89b605b/packages/core/src/internal-types.ts#L365-L373),
   [indicator positioning](https://github.com/atlassian/pragmatic-drag-and-drop/blob/80f1a86d08060f9946125d1dd7c1eaf5c89b605b/packages/react-drop-indicator/src/internal/line.tsx).

QRK's source, eligibility, creation destinations, and phase boundaries above are
application decisions. Atlassian supplies data attachment, hitbox calculations,
target ordering, and indicator rendering; its Tree example is not a Wall
creation or shadow-placement policy.
