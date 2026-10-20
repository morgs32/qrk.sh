# Harden Studio insertion controls

Status: implemented.

## Agreed behavior

1. Keep this change local to the Storybook Studio prototype. Share one private `InsertionSeparator` between item boundaries and section boundaries, without new public APIs, named types, dependencies, or persistence.
2. `StoryRender` owns the current pointer anchor, one 150ms dismissal timer, and `insertAt`. Item anchors identify their stack and following item; section anchors identify the following section. A null following ID means append. Do not use array positions as insertion identity.
3. Validate the current destination stack and following identity before allocating IDs once, outside the pure state updater. Obsolete targets do nothing. Keep a focused separator anchored across insertions so repeated activation preserves order.
4. Pointer hover reveals only the nearby boundary, with delayed dismissal to allow pointer travel onto the line or plus. Native keyboard focus reveals the focused control. Touch, coarse-pointer, and no-hover environments keep insertion controls visible.
5. Preserve item geometry: 12px circle, directly joined 1px border and lines, fully opaque circle and Plus, 60% line arms, violet colors, no fill, and 140ms opacity/color transitions with reduced-motion support. Item boundaries retain 16px hit bands in zero-height overlays; inset the last boundary around the final item's rounded corners.
6. Give section insertion controls a 16px layout slot and 16px hit band, retaining the existing 8px section padding so controls do not overlap items. Keep Stack grips and Move controls above insertion hit areas.
7. Disable click insertion controls and pointer zones throughout an internal drag. Clear pointer state and cancel its timer on drag start, window blur, and unmount. Reuse the separator as a noninteractive item drag-insertion indicator.

## Implementation

1. Replace the item-only separator presentation with one private story-local `InsertionSeparator`. Keep all placement, reveal, disabled, and presentation-only behavior behind its existing story ownership; avoid new public interfaces or named shapes.
2. Move pointer anchor and dismissal-timer ownership into `StoryRender`. Use an inline item/section discriminated union, keep one revealed pointer boundary, and cancel pending dismissal when the pointer re-enters the boundary control. Handle keyboard focus independently of pointer dismissal.
3. Route item and section activations through `insertAt`. Resolve the current destination from stable IDs, reject obsolete targets before identity allocation, and leave state updaters pure. Insert before the current following identity or append at a null anchor. Section insertion still creates one empty stack without consuming an item number.
4. Preserve stable control keys and focus anchors through insertion, including repeated insertions at the same boundary. Retain existing live-region announcements and sequential item numbering.
5. Apply persistent visibility for touch/coarse/no-hover users, native keyboard activation and focus visibility, reduced-motion styles, and the distinct item/section hit geometry. Keep existing stack/item layout, rounding, and insertion colors.
6. During internal dragging, disable click controls and hover zones. Render the shared separator in presentation-only mode at the current item insertion boundary without adding another drag source or drop registration to the separator itself.
7. Update the App README. After the implementing agent confirms completion, record the outcome, set Remaining work to None, and archive this plan.

## Annotated examples

```ts
// 1. A stable item boundary belongs to one Stack and precedes one Item.
const itemBoundary = { kind: 'item', stackId, beforeItemId: '3' };

// 2. End anchors append without depending on the current array length.
const stackEnd = { kind: 'item', stackId, beforeItemId: null };

// 3. Section insertion uses the same boundary model, with a separate kind.
const sectionBoundary = { kind: 'section', beforeSectionId: sectionId };
```

```text
1. Focus the boundary before Item 3; activate twice.
   Existing [Item 1, Item 2, Item 3] becomes
   [Item 1, Item 2, Item 7, Item 8, Item 3].
   The focused control still targets Item 3; it does not move to an index.

2. A Stack or its following Item is no longer present when activated.
   insertAt does nothing and does not allocate a new identity.

3. Move the pointer from the boundary hit band to its plus circle.
   The 150ms dismissal delay prevents a flicker; re-entry cancels the timer.

4. Start dragging an Item.
   Click insertion and hover zones disable; the same separator view presents
   the existing Item's drop boundary without becoming an interactive button.
```

## Approved steering: future palette insertion

1. The shared separator and stable anchor can later support dragging new items from outside the Tree, such as a Studio palette. Use the same boundary presentation for click and drag insertion.
2. Keep creation and movement distinct: a future palette drop creates an item; moving an existing item preserves its identity. External palette payloads, drag registration, and integration remain deferred.
3. This implementation includes only reuse of the separator view for the current internal Item drag insertion indicator. It does not introduce external drag machinery.

## Files

```text
apps/app/
  components/PragmaticTree.stories.tsx  # Shared view, anchor ownership, insertion and drag presentation
  README.md                            # Current prototype behavior
wiki/archive/plans/
  032-plan-studio-insertion-controls.md
```

## Acceptance and verification

1. Item and section insertion use stable following IDs or end anchors. Repeated activation keeps focus and order; obsolete destinations cause no allocation or state change.
2. Pointer travel, keyboard focus, and touch/coarse/no-hover visibility expose usable insertion controls without overlap or new layout spacing between items.
3. Item circle, line arms, lower-corner inset, flush item layout, section spacing, violet treatment, and reduced-motion behavior follow the agreed geometry.
4. Internal dragging disables every click insertion control and pointer zone, clears delayed hover state, and displays the shared item separator only as a noninteractive indicator. Blur and unmount also cancel the dismissal timer.
5. No tests, builds, checks, formatting commands, diff reviews, browser verification, or other verification were performed, as explicitly requested. These were not completion gates for this change.

## Implementation outcome

1. The implementing agent confirmed that all Item and Section add boundaries share `InsertionSeparator`, one pointer owner, a 150ms dismissal timer, and stable-anchor `insertAt` behavior.
2. Native focus and touch/coarse/no-hover visibility, reduced-motion-aware 140ms transitions, 16px hit bands, item geometry, section spacing, and elevated Move/grip controls are implemented.
3. Internal dragging suppresses Add actions and pointer zones. Current Item drag indicators reuse `InsertionSeparator` in a noninteractive presentation state; external palette payloads and creation integration remain future scope.
4. The App README describes the current insertion controls and drag indicator reuse. Implementation completion is based on the implementing agent's source-work confirmation; no runtime, automated, or other verification is claimed.

## Remaining work

None.
