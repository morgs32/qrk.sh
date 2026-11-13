# Brick-owned drag and drop

## Findings

1. Pragmatic Drag and Drop delivers drag events to the source first, then the current drop targets from inner to outer, then monitors. A source `onDrop` therefore cannot rely on a target or monitor having handled the same drop first. The current drop-target records are available in `location.current.dropTargets`. Source `onDrop` also runs when a drag is cancelled. [Atlassian: events](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/events/)
2. `canDrop` rejecting a target does not reject its ancestors or descendants. When a target rejects a drag, lookup continues upwards; each relevant target must decide its own eligibility. Feedback is reevaluated as the drag moves. [Atlassian: drop targets](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/drop-targets/)
3. Drag-source and target data are records of unknown values because targets can appear independently. Callers must validate a record before using its values. [Atlassian: typing data](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/recipes/typing-data)

## Application

For a Brick-owned drop, expose the proposed Wall destination and local layout eligibility in the current target data before the source handles the drop. Decode that data at the source and stage only a valid destination. A cancellation, outside drop, or invalid destination must not create a Brick. This is local feedback, not a reservation: the Brick's authoritative add command rechecks the destination, ownership, and layout against current state before recording the Brick and Placements atomically.
