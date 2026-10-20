# Separate Studio stacks from items

Status: implemented.

## Agreed behavior

1. Keep the prototype local to Storybook. Sections own ordered stacks; stacks own ordered peer items. Items never contain other items, and stacks have no visible headers.
2. Use separate opaque stack IDs from `makeId`. Item numbers identify mock content only. The initial first section has Stack A containing Items 1–3 and Stack B containing Items 4–5; the second section has Stack C containing Item 6.
3. Preserve the gray enclosure, two-column stack wrapping, always-visible items, empty stacks, and violet section insertion controls. A new section starts with one empty stack and does not consume an item number.
4. Item rows drag and reorder within or across stacks. A stack or its footer accepts an item at the end; a section background creates a stack containing that same item. Ignore drops on the source.
5. A separate footer grip drags the entire stack; clicking the grip opens its Move dialog. **Add item** remains a distinct button. Item Move chooses Section, destination Stack or **New stack**, and position; Stack Move chooses Section and position.

## Implementation

1. Replace the parent/child item model with one local layout containing ordered section IDs, stacks shaped as `{ id, sectionId }`, and items shaped as `{ id, stackId, isDraft }`. Keep shapes inline and retain the local item counter for Items 7 onward.
2. Render sections from stack ownership and stacks from item ownership. Preserve empty containers. Keep stack identity separate from item labels so moving every item out of a stack does not remove it.
3. Register item rows and stack grips as distinct drag sources. Route item placement to stack ownership and ordering; route stack placement to section ownership and ordering. Preserve item identity when a section-background drop creates its destination stack, and move a stack with all its items.
4. Replace Parent choices in Item Move with Stack choices filtered by Section, including **New stack**. Scope item positions to the destination stack. Give Stack Move Section and stack-position choices without item controls.
5. Keep section insertion and **Add item** as separate actions. Section insertion allocates a section and an empty stack; adding an item allocates its number once and appends it to the owning stack. Retain focus and announce changes through the existing live region.
6. Update the App README and glossary to distinguish Section, Stack, and Item. No new public APIs, named types, dependencies, persistence, or ADR are introduced.

## Annotated examples

```text
Section 1
  Stack A                 Stack B
    Item 1                  Item 4
    Item 2                  Item 5
    Item 3
    Add item / grip         Add item / grip
Section 2
  Stack C — full width
    Item 6
    Add item / grip
```

```ts
// 1. Stack identity is independent of the numbered content it owns.
const stack = { id: stackId, sectionId };

// 2. Items are peers; there is no parentId, child tree, or stack title item.
const item = { id: '7', stackId: stack.id, isDraft: false };

// 3. A move preserves the content identity and changes its owning stack.
const movedItem = { ...item, stackId: destinationStackId };
```

```text
1. Move Item 6 to Stack A → Stack C remains empty in Section 2.
2. Drop Item 2 on Section 2's background → create Stack D containing Item 2.
3. Drag Stack A's footer grip → move its current items together with Stack A.
4. Add a section, then Add item → the empty stack receives Item 7.
```

## Files

```text
apps/app/
  components/PragmaticTree.stories.tsx  # Local layout, rendering, drag and Move actions
  README.md                            # Current Storybook interaction description
wiki/
  glossary.md                          # Section, Stack, and Item terms
  archive/plans/030-plan-studio-stacks-and-items.md
```

## Acceptance and verification

1. The initial layout displays Items 1–6 across three distinct stacks, without visible stack headers or nested items.
2. Item movement preserves identity, destination order, empty source stacks, and the distinction between stack and section drop destinations.
3. Stack movement carries its items together. Item and Stack Move dialogs expose only their relevant destinations and positions; source drops do nothing.
4. Section insertion creates an empty stack without changing the item counter. **Add item** and the grip remain independent controls.
5. No tests, builds, checks, formatting commands, browser verification, or diff review were run, per the approved request. These were not required completion gates for this change.

## Implementation outcome

1. The story now owns one local sections/stacks/items layout, with opaque `makeId` stack identities and the six preserved numbered items.
2. Item dragging and Stack grip dragging are independent. Clicking the grip opens Stack Move; **Add item** remains separate. Section-background drops and **New stack** moves create their destination stack atomically while preserving the moved item.
3. Empty stacks remain in place. Typed drag kinds and source-drop rejection preserve the container/item distinction, and the existing gray enclosure and violet insertion styling remain.
4. The App README and glossary describe Section, Stack, and Item ownership. Implementation completion was confirmed by the implementing agent; no runtime or automated verification is claimed.

## Remaining work

None.
