# Move a Stack into a new Section above a Section

Status: implemented. Source completion was confirmed by the implementing agent; documentation is updated. No verification was performed, as explicitly requested.

## Problem and scope

1. Before this change, the Storybook Studio prototype moved Stacks left/right or into an existing Section. Dragging a Stack to another Stack's top edge now creates a Section before the target's entire Section and moves the existing Stack into it.
2. All behavior remains in [PragmaticTree.stories.tsx](../../../apps/app/components/PragmaticTree.stories.tsx), using local mock state, React, shadcn, and the already installed Pragmatic Drag and Drop packages. No public APIs, named types, dependencies, persistence, or production Studio integration were added.
3. Preserve the current Sections → Stacks → peer Items model and existing presentation: shared borders, square corners, compact floating Stack headers, Item separators, palette insertion, and the bottom Add Section bar.
4. No tests, builds, automated checks, formatting commands, diff reviews, browser verification, or other verification were run during implementation. These were explicitly excluded completion gates, not deferred required work.

## Agreed behavior

1. For a dragged Stack, the top 16px of another Stack is a new-Section destination. A drop creates one Section immediately before the target's entire Section. Its other Stacks stay together in their existing Section.
2. The dragged Stack retains its ID, name, Item ownership, and Item order. Only its Section placement changes. The new Section contains that existing Stack; do not create a placeholder Stack, allocate an Item number, or advance the Stack name counter.
3. Keep the source Section, including when its last Stack moves out. Its existing Empty section presentation remains available.
4. Show one blue horizontal indicator across the entire target Section's width at its top edge. Use the installed drop indicator's default color, thickness, and offset, with the story's existing square-corner styling.
5. Below the top band, keep horizontal before/after Stack reordering and existing Section-capacity rules. Dropping onto the dragged Stack itself remains ignored. A Stack can leave its current multi-Stack Section by dropping above a different peer Stack.
6. A full target Section still permits a top-band drop: the destination is a new Section containing one Stack. The existing `maxStacksPerSection` limit continues to govern moves into existing Sections.
7. Stack Move also offers **New Section**, followed by a **Before Section** selector. This performs the same ownership change without dragging. Existing-Section movement retains its Section and Position controls. Item Move is outside this change.
8. Cancelled drags, invalid sources, and obsolete destinations change nothing and allocate no IDs. Successful moves announce the result through the existing live region.

## Terminology and evidence

1. A Section is an ordered layout row. A Stack is an independently movable named container of peer Items within one Section. Creating a Section through this move changes layout ownership, not Stack or Item identity.
2. The current source has one registration owner, horizontal `attachInstruction` handling for Stack targets, an atomic local layout state, Section-ID allocation, and the existing Stack Move dialog. Extend those owners rather than introducing another drag controller.
3. The installed closest-edge helper chooses the minimum absolute edge distance. It does not implement a fixed 16px top band. Use a direct input-versus-target-top comparison, then retain the current horizontal instruction below that band.
4. [Plan 030](030-plan-studio-stacks-and-items.md) records the model separation; [plan 032](032-plan-studio-insertion-controls.md) records insertion ownership. Their historical styling is not a requirement to restore.
5. The [glossary](../../glossary.md) now defines Sections as ordered layout rows, named movable Stacks, and peer Items, without presentation details. No ADR was created for this reversible Storybook interaction.

## Implementation

1. Extend the existing Stack drop target's Stack-source branch. Validate story context, source kind and ID, current source/target Stack existence, and distinct source/target identities. Compute the top-band intent before applying existing-Section capacity rejection. Item and palette source branches keep their current behavior.
2. Return explicit inline target data for the top band: `{ kind: "section-insertion", beforeSectionId, targetStackId }`. Use the target Stack's owning Section ID as the stable insertion anchor. Below the band, keep the existing horizontal `attachInstruction` data. Do not register an overlapping Section-insertion element or add a draggable control.
3. Extend local drop feedback with that inline discriminated shape. Resolve its Stack and Section against the current layout before displaying feedback. Mount the existing `BoxDropIndicator` with `edge="top"` once inside the matching relatively positioned Section container. Suppress Stack-local reorder feedback for this intent, and clear it on invalidation, target change, cancellation, or drop.
4. Extend the existing `moveStack` owner with an inline new-Section input, alongside its existing `{ stackId, sectionId, index }` input: `{ stackId, beforeSectionId }`. Both drag and dialog call this branch. No new exported helper or named type is needed.
5. In that branch, resolve the source Stack and following Section against current layout before allocating identity. Allocate one Section ID through `nextSectionId`, once and outside a state updater. In one layout update, insert the Section ID before the live anchor and replace only the moved Stack's `sectionId`. Preserve the Items array and the source Section. Announce the moved Stack name and the new Section placement only when the action is accepted.
6. Route the new drop intent before the existing horizontal Stack-drop path. Revalidate that `targetStackId` still exists in `beforeSectionId` and differs from the source. A missing or relocated target is obsolete and must not consume a Section ID. Existing left/right and Section-background routes remain intact.
7. Add a Stack-only Destination choice to Move: **Existing Section** or **New Section**. Reset it to Existing Section when opening the dialog. In New Section mode, show the existing ordered Section choices under **Before Section**, hide Position, and do not disable anchors merely because their Sections are full. The selector stores the Section ID, not a saved array index. No append option is introduced for this move; the agreed gesture and dialog both insert before an existing Section.
8. In New Section mode, disable confirmation when the source or selected Section is missing. Confirmation uses the shared new-Section move branch. Preserve native keyboard controls, dialog closure on an accepted move, and focus restoration to the existing Stack grip ID. Because the Stack ID survives, its trigger remains identifiable after movement.
9. Preserve drag suppression of click insertion and floating headers. The new horizontal indicator is pointer-inert and occupies no layout space. Item top-boundary drop targets must not acquire a new Stack-source action.
10. After implementation, update [the App README](../../../apps/app/README.md) for top-band intent, horizontal reorder priority, full-Section behavior, empty source Sections, and Stack Move's New Section controls. Reconcile the existing glossary's Section and Stack definitions with actual ownership, named Stacks, and the current one-row layout; retain the Item definition unless implementation changes it.
11. Record the implementation outcome and the explicitly unperformed verification. Use the implement workflow to archive this plan, preserving its filename and repairing relative links, once implementation and documentation are complete. Do not create an ADR unless the implemented result meets all three repository criteria: hard to reverse, surprising without context, and the result of a real trade-off.

## Annotated drag target example

This annotated sketch explains the implemented Stack-source target behavior after source/target validation. It is illustrative code, not execution evidence.

```tsx
// 1. Measure the live Stack, avoiding saved geometry or observers.
const y = input.clientY - element.getBoundingClientRect().top;

// 2. The fixed top band selects a Section anchor, even if that Section is full.
if (y >= 0 && y < 16) {
  return {
    kind: "section-insertion",
    beforeSectionId: stack.sectionId,
    targetStackId: stack.id,
  };
}

// 3. Below the band, retain the existing horizontal reorder instruction.
return attachInstruction(
  { kind: "stack", id: stack.id },
  {
    input,
    element,
    axis: "horizontal",
    operations: {
      "reorder-before": "available",
      "reorder-after": "available",
    },
  },
);
```

1. `canDrop` must use the same top-band decision: allow a valid new-Section intent before testing horizontal capacity. Otherwise a full Section would reject the new operation before `getData` can describe it.
2. Feedback belongs to the Section container, not the individual Stack box:

```tsx
// 4. Render once at the entire destination row's top edge.
{drop?.kind === "section-insertion" &&
  drop.beforeSectionId === sectionId && (
    <BoxDropIndicator edge="top" />
  )}
```

## Annotated ownership example

This sketch runs only after current source and Section-anchor validation. The drag caller also validates the target Stack's current ownership.

```tsx
// 1. Resolve the Section's current position from its stable ID.
const beforeIndex = layout.sections.indexOf(beforeSectionId);
// Reject missing source/anchor before advancing any counter.

// 2. Allocate only the new Section's identity, outside a state updater.
const sectionId = String(nextSectionId.current++);
const sections = [...layout.sections];
sections.splice(beforeIndex, 0, sectionId);

// 3. Move the existing Stack atomically; its Items and identities survive.
setLayout({
  ...layout,
  sections,
  stacks: layout.stacks.map(stack =>
    stack.id === stackId ? { ...stack, sectionId } : stack,
  ),
});
```

## Expected scenarios — not executed

1. Section 1 contains A and B; Section 2 contains C. Drop C into B's top band. New Section 3 contains C before Section 1; Section 1 still contains A and B; Section 2 remains empty. C's Items keep their IDs and order. The Section ID is identity, not its display position.
2. Section 1 contains A and B. Drop A above B. A receives a new Section before Section 1; B stays in Section 1. Dropping directly onto A itself is ignored.
3. Section 1 is at its Stack limit. A top-band drop from another Section still creates a separate one-Stack Section. The same pointer below the top band cannot add an incoming Stack to the full existing Section.
4. Move a Stack with the keyboard using New Section → Before Section 1. The layout mutation matches the drag operation and focus returns to the moved Stack's grip. Existing Section → Position retains the current capacity behavior.
5. Cross from a target's top band into its main body. Feedback switches from one Section-wide horizontal line to the existing Stack-local left/right indicator, without changing layout or creating data during hover.
6. Cancel the drag, drop outside valid targets, drop onto the source Stack, or make the source/target/Section anchor obsolete. No new Section or allocation occurs. Repeated successful moves allocate one Section ID each; neither Item numbering nor Stack naming advances.
7. Item and palette drags still target their existing Item boundaries and Stack append areas. Floating headers and click insertion stay suppressed during dragging.

## Files

Legend: `+` create; `~` modify. Source and documentation implementation are complete; the plan is archived.

```text
qrk.sh/
├── apps/app/
│   ├── components/PragmaticTree.stories.tsx                 ~
│   └── README.md                                          ~
└── wiki/
    ├── glossary.md                                        ~
    └── archive/plans/033-plan-studio-stack-to-section-drop.md +
```

## Verification policy

1. The relevant behavioral seams are Stack target intent, the shared layout mutation, Section-wide feedback, and Move dialog dispatch/focus. The scenarios above specify expected outcomes; no tests or verification procedures were executed or added.
2. No browser verification, test/build/check target, formatter, diff review, or other validation is required under the user's explicit instruction. Implementation completion must not be represented as tested behavior.

## Implementation outcome

1. The existing Stack target now resolves a live 16px top band before capacity rejection, validates distinct current source and target Stacks, and emits the Section-insertion anchor. Feedback and drop dispatch validate the target's current Section ownership; invalidation clears obsolete feedback.
2. The existing `moveStack` owner accepts the new-Section input, validates source and anchor, and allocates only one Section ID outside the state updater. Its atomic ownership move preserves Stack and Item identities, Item order, and the source Section, and reports whether the move was accepted.
3. One pointer-inert Section-wide `BoxDropIndicator` renders above the row from the relative Section wrapper, outside the Stack grid's divider children. Stack-local indicators are suppressed for this intent.
4. Stack Move resets Destination to Existing Section on open. New Section uses stable Before Section IDs, permits full target rows, hides Position, and disables confirmation for missing source or anchor. It closes only on an accepted move and retains existing grip-focus restoration.
5. The App README and glossary describe the completed interaction and domain ownership. Completion is based on the implementing agent's source-work confirmation; no runtime, automated, browser, diff, or other verification is claimed.

## Remaining work

None.
