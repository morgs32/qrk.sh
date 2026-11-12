# 083 — Stack width dividers

**Status:** Implemented; runtime verification remains.

## Problem and decisions

1. Stacks currently fill their Section and divide its width equally, subject to the widest Row's Brick minimums. Authors want to adjust neighboring Stack widths using a divider like the existing Brick divider.
2. A divider transfers width between its two adjacent Stacks, keeps the Section filled, and keeps other Stacks' visible widths fixed during the gesture. A single Stack fills its Section and has no divider. A Stack cannot be dragged below its content minimum; an empty Stack retains its existing minimum.
3. Save positive relative width weights on Stacks in each breakpoint Wall. Unresized historical Stacks have equal weights. Allocate the Section proportionally, pinning Stacks at their minimums and redistributing the remainder. A temporary minimum constraint does not overwrite the saved weights, so their proportions return when space permits.
4. A new Stack receives the mean weight of its destination Section's existing Stacks. Moving a Stack to a different Section assigns that same destination mean; the source's remaining weights stay unchanged. A new single-Stack Section uses the equal default. Reordering within one Section keeps the weight attached to its Stack. Removing a Stack preserves the remaining weights.
5. Publish the Stack weights so a published Page uses the same sizing as the editor. Older snapshots without weights render as equal-weighted Stacks. Preserve existing historical snapshot builders, commands, and releases.
6. Add the approved `setStackWidthWeights` command with Wall ID, Section ID, adjacent Stack IDs, and their positive finite weights. The editor submits it once after a completed drag. The command checks ownership and current adjacency and updates both weights atomically. A stale, missing, foreign, nonadjacent, duplicate, or invalid target is refused; an unchanged value records no operation.
7. Keep canonical User V9 and all registered releases. Add a User V16 candidate based on the current V15 bindings. The user personally handwrites any canonical promotion after reviewing retained-history, admission, and publication evidence. No storage reset is part of this plan. The accepted [Wall-owned layout ADR](../adrs/001-wall-owned-layout-tree.md) remains the ownership reference.

## Examples

1. Ignoring gaps and assuming minimums permit it, Stacks at 300px and 600px become 200px, 400px, and 300px when a new Stack is added. The first two keep their 1:2 proportion.
2. Three equally weighted Stacks in 900px have minimums of 400px, 0px, and 0px. Their displayed widths are 400px, 250px, and 250px. Dragging the first divider to 425px and 225px must keep the third at 250px; storing all displayed widths would lose hidden preferences.
3. Reordering two differently weighted Stacks moves each weight with its Stack. Moving one into another Section instead assigns it the mean destination weight.

```ts
// 1. Use the existing track geometry, including its gap allowance.
// 2. Pin minimum-constrained Stacks and share the rest by saved weight.
// 3. On release, update only the two adjacent weights so allocation reproduces
//    the preview; preserve unrelated weights, including constrained ones.
stageAggregateSessionCommand({
  session,
  contractName: "setStackWidthWeights",
  payload: { wallId, sectionId, leftStackId, rightStackId, leftWeight, rightWeight },
});
```

## Implementation

1. Add a new Wall/layout version with an optional positive finite Stack weight. Missing weights represent the equal default; preserve stored historic data without a backfill. Version the current Wall-writing and reading contract bindings as needed, including Page creation, Brick and Placement changes, Stack insertion, moves and deletion, settings, generation, and publication. Preserve historical programs and exact contract lineage.
2. In the candidate's structural operations, assign a destination mean weight on every Stack creation path, including explicit insertion and placement-to-new-Stack. Apply the same rule on cross-Section moves. Preserve a Stack's weight on same-Section reorders and all unaffected weights on deletion or other layout changes. Continue using the current fit checks and refuse a destination that cannot satisfy minimums.
3. Implement the new command against the candidate Wall version. Validate finite positive weights, finite aggregate weight, current Wall and Section, left-to-right adjacency, and ownership through Wall → Page → Site → User. Make one Wall update preserving unrelated layout fields and Stack weights. Recheck the current state at execution rather than accepting a replacement layout from the client.
4. Update shared Stack allocation for weights and minimums. Normalize proportions safely without overflow, use the existing Section track budget of Wall width plus one gap, and keep track weights, pointer measurements, and gap conversions in the same units. Insertion shadows participate in temporary minimums without saving them.
5. Extend the existing resize gesture and Section grid with a divider at each adjacent Stack boundary, including empty Stacks. Reuse pointer capture, touch and pen support, preview, width readout, cancellation, and a single commit. Clamp the drag to both minimums; invalidate it when Wall, Section membership or order, weights, minimums, gap, available width, or editing availability changes. Keep the Brick dividers, Row height grips, Stack actions, and drag/drop hit areas usable.
6. Compute committed weights from the rendered preview and the allocation's current proportional multiplier. Update only the two neighbors and retain the underlying weight of a Stack still pinned at its minimum when that weight already produces the displayed boundary. Preserve every non-neighbor weight. The next allocation must reproduce the preview, including when a dragged Stack leaves its minimum; do not fix the old sum of the pair's weights or save all measured Stack widths. A gesture with no visible change stages no command.
7. Add the next PageSnapshot schema, model, builder, and Page/Site publishing contract versions. New publish payloads set `preferredStackSizing` to true; older commands adapt to false and use the V6 builder. The reverse adapter refuses a weighted publication that an older release cannot represent. Include Stack weights for new snapshots, preserve historic snapshot outputs during replay, and render missing historical weights equally. Update Web `WallViewer` and the editor's saved-versus-published comparison to the new shape; normalize an absent historical weight to the equal default for comparison while continuing to ignore historical Row preferred-width differences. Other content and layout changes must still enable Publish Updates.
8. Add the V16 actor and owner candidate and exact App session bindings. Retain all previously registered releases and the existing canonical selection. Verify how the installed SDK handles the new command when a retained older release lacks its declaration; do not assume a `DownAdapterRefused` edge exists. If old-release replay or coexistence cannot be demonstrated, stop before proposing activation and identify the actual Zerospin boundary rather than changing retained releases or persisted data.
9. After implementation, reconcile the glossary and layout conventions with the implemented Stack terminology and sizing. Create an ADR only if the implemented decision is hard to reverse, surprising without context, and the result of a real trade-off. Archive this plan after the required automated checks; the user performs manual verification on their own time.

## Verification

1. Test shared allocation for equal historical defaults, unequal weights, minimum pinning and restoration, multiple constrained Stacks, gap accounting, and no-fit refusal. Verify the constrained 400/250/250 example and a divider drag that releases a formerly pinned neighbor without moving the third Stack or changing its stored weight.
2. Use scoped `it.effect` and `makeSystemHarness` with the actual System and registered releases where the harness supports the command origin. Verify resize success, unchanged values, ownership, invalid weights, missing targets, stale or nonadjacent Stacks, and atomic preservation of unrelated state. Cover new Stack insertion, cross-Section movement, same-Section reorder, deletion, and preserved proportions across temporary constraints. The harness does not prove actor authentication or actor-origin commands; verify those at their actual runtime boundary.
3. Extend the existing Wall Editor scripted stories for divider drag, minimum clamps, canceled and invalidated gestures, one-Stack and empty-Stack cases, a constrained third Stack, insertion shadows, and retained Brick resize and drag/drop. Add viewer coverage for old snapshots and newly published weights, and comparison coverage for width-only changes and unchanged legacy defaults.
4. Run the backend Nx test target and App and Web builds. User manual verification covers dragging, touch, readouts, insertion, reordering, cross-Section moves, reload, breakpoint independence, and published rendering. Report the actual Web viewer integration boundary.
5. Before recommending promotion, verify candidate replay of the relevant retained history, old and new publication outputs, candidate-only command behavior against retained releases, admission, and browser session bindings. Report each boundary separately; do not treat a typecheck or harness pass as proof of live Chain delivery or publication progress.

## Planned files

`+` creates a file and `~` modifies one. Version numbers assume the current V15 owner and V6 snapshot baseline. Versioned contract files below represent the next releases of the listed active contracts, preserving earlier files.

```text
qrk.sh/
├── apps/
│   ├── app/
│   │   ├── components/WallEditor/~ {WallEditor.tsx, useWallResize.ts, makeWallLayoutView.ts, WallEditor.stories.tsx}
│   │   ├── components/WallEditor/Scripted/~ PointerResize.stories.tsx
│   │   ├── modules/~ bricks.css
│   │   ├── zerospin/~ userSessionDefinition.ts
│   │   ├── app/[username]/site/[siteId]/page/[pageId]/~ PublishSiteDialog.tsx
│   │   └── app/[username]/site/[siteId]/page/[pageId]/(sidebar)/~ layout.tsx
│   ├── web/library/~ {WallViewer.tsx, WallViewer.stories.tsx}
│   └── zerospin/
│       ├── src/~ system.ts
│       ├── src/aggregates/user/
│       │   ├── + UserV16.ts
│       │   ├── actors/+ userActorV16.ts
│       │   ├── layout/+ {wallLayoutSchemaV4.ts, wallLayoutV4.ts}
│       │   ├── layout/~ wallSizing.ts
│       │   ├── models/wall/+ WallV4.ts
│       │   ├── models/pageSnapshot/+ PageSnapshotV7.ts
│       │   ├── snapshots/+ {pageSnapshotSchemaV7.ts, makePageSnapshotV7.ts}
│       │   └── contracts/
│       │       ├── wall/+ SetStackWidthWeightsV1.ts
│       │       └── {wall, brick, createPage, publishPage, publishSite, updateSiteSettings}/+ next versions of affected current bindings
│       └── test/~ {wallFit.spec.ts, placementMoves.spec.ts, deleteStack.spec.ts}
└── wiki/
    ├── ~ {brick-layout-conventions.md, glossary.md}
    └── plans/+ 083-plan-stack-width-dividers.md
```

## Remaining work

1. Before recommending canonical promotion, verify unauthorized ownership and live actor admission, relevant retained history beyond the isolated four-command sample, Chain fanout, and publication acknowledgements with the exact V16 session. The user performs manual verification of the editor on their own time.

## Implementation evidence

1. App build, App TypeScript, and 37 Zerospin tests passed. The Web build passed through Nx with Webpack. The default Turbopack build could not bind its local worker port in this environment.
2. An isolated in-memory replay using installed Zerospin 44.0.2 replayed four retained commands into V16, inserted and resized a Stack, rejected reversed adjacency with no operations, and recorded no operation for an unchanged resize. V9 recorded the V16-only resize as unsupported and advanced. After the resize, an old publish produced identical V9 and V16 snapshot content without Stack weights, while a V7 publish contained the new weights. This did not exercise actor authentication, live admission, Chain fanout, or acknowledgements.
3. Existing and absent Stack weights compare as equal for saved-versus-published content; a changed Stack weight and other content changes are detected. The viewer remains fixture-backed in this checkout.
4. Extremely small or large valid weights can make a requested pair-only resize unrepresentable in JavaScript numbers while preserving other Stacks' weights. The editor cancels such a resize and shows an error instead of staging invalid or inaccurate values.
5. The Stack divider and weighted viewer Storybook play functions were added and typechecked but were not run in this pass.
