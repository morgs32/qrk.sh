# Raise the active Studio stack drop target

Status: implemented and manually verified on 2026-10-20.

## Problem and evidence

1. The blue whole-stack outline can be obscured by neighboring stacks. Pragmatic's `GroupDropIndicator` paints that outline on a wrapper outside `[data-layout-stack]`; the existing inner stack's `hover:z-30` does not raise its ancestor's decoration. The existing relative outer cell encloses both. [Current structure](../../../apps/app/components/PragmaticTree.stories.tsx).
2. Neighboring first/empty insertion boundaries can reach `z-40`. Sections currently introduce no independent stacking context or clipping in the story's JSX. Raise the existing outer cell to `z-50` when its group outline is active. [Research and primary sources](../../research/studio-stack-drop-outline-layering.md).
3. This concerns the local Storybook prototype. A Section contains peer Stacks; a Stack contains peer Items. No nested-stack behavior is involved. No relevant ADR exists.

## Agreed behavior and decisions

1. Promote the **whole existing stack wrapper**, including its outline, items, and insertion indicator, above neighboring stacks. The user explicitly selected this over promoting only the outline.
2. Reuse exactly `` activeGroup === `stack-${stack.id}` ``, the existing `GroupDropIndicator` activation condition. Restore the wrapper's normal automatic stacking level when that condition becomes false. Ordinary pointer hover alone does not activate this promotion.
3. Preserve current activation semantics: direct stack append targets activate the whole-stack outline; item-row and insertion-boundary targets use their existing insertion feedback. Do not extend the outline to every item drag within a stack.
4. Retain existing inner hover/focus layers, floating header behavior, pointer handling, insertion hit bands, drag state cleanup, outline styling, item/stack movement, and palette creation. The wrapper adds no layout space.
5. Keep ownership in `PragmaticTree.stories.tsx`. No new component, state, helper, named type, dependency, public contract, portal, or overlay is needed.

## Alternatives and rationale

1. **Raise the existing outer cell — chosen.** It already owns the outlined subtree. Conditional `z-50` exceeds the current neighboring `z-40` layer without introducing another owner or reproducing library decoration.
2. **Raise only the inner stack — rejected.** Its outline belongs to an ancestor, so this targets the wrong element.
3. **Add an independent outline overlay — rejected for this scope.** It would require owning or reproducing the library's outline geometry and tokens. The user accepted promotion of the whole wrapper.

## Implementation steps

1. Add conditional `z-50` to the existing relative outer stack cell immediately enclosing `GroupDropIndicator`. Leave its base classes and child structure intact. Use the existing activation expression directly; do not extract a single-use abstraction.
2. Use the existing Storybook story for the manual verification below. Promoting the wrapper also changes the paint order of its current hit bands, so check adjacent-section seams before claiming completion. Address only regressions caused by this change; stop for a material design decision if an independent decoration layer becomes necessary.
3. After implementation, update the App README's prototype description to state that the active stack group wrapper rises above its neighbors and returns to its normal layer when inactive. Reconcile the plan and research decision with the actual result and verification evidence.
4. After implementation, review existing glossary terminology against this change. It introduces no domain term or ownership change, so no new entry is expected; unrelated stale header/layout wording remains outside scope. Create an ADR only if the implemented decision is hard to reverse, surprising without context, and involves a real trade-off; this local CSS choice is not expected to qualify.
5. When implementation, manual verification, and affected documentation are complete, record the outcome and archive this plan with `$implement`. Preserve its filename and repair relative links.

## Annotated implementation example

```tsx
// 1. The outer cell contains the library's outline and the stack's contents.
// 2. Promote it only while the existing stack group indicator is active.
// 3. An inactive cell has no explicit z-index, preserving ordinary layering.
<div
  key={stack.id}
  className={`relative min-w-0 [&>div]:h-full ${activeGroup === `stack-${stack.id}` ? "z-50" : ""}`}
>
  <GroupDropIndicator isActive={activeGroup === `stack-${stack.id}`}>
    {/* Keep the existing stack subtree unchanged. */}
  </GroupDropIndicator>
</div>
```

```text
1. Drag a palette Item into the spare lower area of Stack 1.
   Stack 1's existing append target activates its outline.
   Its whole wrapper rises above Stack 2 and the adjoining Section.

2. Move onto an Item boundary, then into another Stack's append area.
   Existing target selection controls the feedback and which wrapper rises.
   No hover-only state or additional drop target is introduced.

3. Cancel the drag or finish a successful drop.
   Existing cleanup clears activeGroup; the wrapper returns to normal order.
```

## Verification at existing seams

1. **Source seam:** confirm the stacking change is on the outer cell containing `GroupDropIndicator`, uses the identical activation condition, and supplies no inactive stacking level. Existing target data, hit-area geometry, and cleanup remain intact.
2. **Manual Storybook seam:** use **App / Studio / Pragmatic Tree / Default** at the existing local Storybook. Exercise existing Item and palette drags into left/right Stack append areas, including an empty Stack. Inspect the complete outline beside both horizontal neighbors and above/below adjoining Sections. Choose append areas rather than Item boundaries when assessing the whole-stack outline.
3. Move between append areas and first/last insertion boundaries at section seams. Confirm existing target selection and insertion position remain usable without oscillation or a newly unreachable target. Finish one drop and cancel another; confirm promotion clears in both cases.
4. Outside dragging, confirm stack header hover/focus and Move controls retain their current layering. During dragging, headers remain hidden. No automated tests, integration suite, new checks, or backend work are introduced.
5. Record actual observations and any unverified cases. Planning and source research do not establish browser drag behavior.

## Files

Legend: `+` create; `~` modify. Paths are rooted at the project directory.

```text
qrk.sh/
  apps/app/
    components/
      ~ PragmaticTree.stories.tsx
    ~ README.md
  wiki/
    archive/plans/
      + 033-plan-studio-stack-drop-layer.md
    research/
      ~ studio-stack-drop-outline-layering.md
```

## Scope

1. Scope is the active whole-stack outline's stacking order and affected documentation. Preserve neighboring controls, source opacity, layout, all other feedback activation, and existing drag/drop semantics.
2. This plan does not authorize deployment or broader Studio refactoring. Concurrent Stack-to-new-section work in the story, README, glossary, and its separate plan was preserved.

## Implementation outcome

1. The existing outer cell now receives `z-50` under the exact same `activeGroup` expression as its `GroupDropIndicator`. Inactive cells have no explicit z-index. No target, state, hit-area geometry, or inner layer was changed by this plan.
2. Source review confirmed the scoped wrapper change. Manual review in the existing in-app Storybook observed computed `z-index: 50` on active left, right, and empty-stack cells, with `auto` on their neighbors. The complete outlines remained visible over horizontal neighbors and adjoining sections.
3. Native palette and existing-Item drags reached append targets and insertion boundaries. Moving from append space to an Item/first-empty boundary cleared the whole-stack outline and promotion while showing the existing insertion line. Returning to append space restored promotion. No target oscillation or unreachable boundary was observed in these cases.
4. Successful palette insertion and cross-stack Item moves restored all outer cells to `auto`. Cancelling an existing-Item drag by releasing outside the layout preserved Item placement and also restored `auto`. Header pointer interaction was disabled during drag; ordinary hover and retained keyboard focus still revealed headers afterward, and Stack Move opened normally.
5. The original mock layout (Items 1–3, Items 4–5, Item 6) and existing Storybook controls were restored with Reload story after verification. The browser remains on the original story. No standalone automated checks, test suite, build, backend change, or deployment was run for this CSS change.
6. The App README and research note reflect the implemented behavior. Glossary review found no new domain term from this change; unrelated glossary edits were preserved. This reversible local CSS choice does not warrant an ADR. Relative and inbound plan links were repaired on archival.

## Remaining work

None.
