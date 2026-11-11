# 055 — Row width and alignment

**Status:** Ready for implementation.

A Row spans its Stack and can leave space beside its Bricks. Give the Row one outer width handle and a Left / Center / Right control. Keep the dividers between Bricks for changing their share of the occupied width. Apply the new sizing rule to existing Rows using their saved Placement width weights.

## Behavior

1. The full Stack width remains the Row’s drop area. A new Brick starts at its module’s default width, subject to its minimum. In a Row with no explicit width, existing Bricks keep their preferred widths when the incoming Brick and the gaps fit. When space runs short, reduce widths proportionally, pin each Brick at its minimum as it reaches that limit, and redistribute the remaining deficit among the others. Existing compatibility and Stack fit rules still determine whether the drop is available.
2. A Row can save a preferred content width in CSS pixels, including gaps between Bricks. Its Bricks divide that width in proportion to their saved weights, subject to their minimums. The effective width can shrink to the Stack width or grow to the combined minimum, and returns to the saved width when it fits again. The width of a Row’s contents does not determine the Stack’s minimum width.
3. Left is the default alignment. Center splits the unused space evenly. Right leaves unused space on the left. Keep one outer width grip on the right for Left and Center, and on the left for Right. Keep the opposite edge anchored for Left and Right, and keep the center anchored for Center. An empty Row has a drop area and gains its width grip when it has a Brick.
4. Give the outer grip a distinct visual treatment and the accessible label “Resize Row width.” During drag, show the measured width of the group including its interior gaps. Internal dividers sit between Bricks and show the two Brick widths as they do today. Keep the Row height grip on the bottom edge and verify that all three hit areas stay distinct on short Rows. Reuse existing resize visibility, capture, cancellation, and single-command commit behavior.
5. A divider changes adjacent surface widths while holding the occupied group width and all other Brick widths steady for that gesture. It saves the resulting surface widths as Placement weights. An outer resize changes only the Row’s preferred width. Alignment saves independently, including when the group currently fills its Stack.
6. Migrate existing editable Rows by interpreting each saved weight as its preferred surface width in pixels. Weights written by an earlier divider drag take part directly. Existing Rows default to Left and automatic content width. Preserve their IDs, order, weights, and minimum heights. A Brick that previously stretched across its Stack may render narrower immediately after adoption.

```ts
// 1. Work in surface pixels and count each interior gap once.
const gapWidth = Math.max(0, placements.length - 1) * brickGap;
const minimumWidth = totalBrickMinimumWidths + gapWidth;
const naturalWidth = totalFlooredPreferredWidths + gapWidth;

// 2. The fit check has already established that minimumWidth fits the Stack.
const contentWidth = Math.min(
  stackWidth,
  Math.max(minimumWidth, row.preferredWidth ?? naturalWidth),
);

// 3. Distribute this surface budget and position the group inside the Row.
const surfaceBudget = contentWidth - gapWidth;
const spareWidth = stackWidth - contentWidth;
```

1. In a 720px Stack with a 16px gap, a 320px Brick occupies 320px. Dropping another 320px Brick gives a 656px group, with 64px left over.
2. In a 560px Stack with the same gap, the two Bricks get 272px each if both minimums allow it. If the first minimum is 300px, the widths become 300px and 244px. If both minimums are 300px, the Row cannot fit in that Stack.
3. A Row resized to 480px with two equal weights and a 16px gap gives each Brick 232px if their minimums allow it. Center alignment in a 720px Stack leaves 120px on each side. With the center anchored, dragging the right grip 20px inward reduces the requested group width by 40px.

## Implementation

1. Add a Wall layout version with Row-owned preferred width and alignment. Use missing values for the historical defaults at the stored boundary, normalize them once when projecting the Row, and keep concrete values in the editor. The preferred width is a positive finite pixel value when set. Keep the existing Placement declaration and the module default assignment. Follow [the Wall-owned layout decision](../adrs/001-wall-owned-layout-tree.md) for ownership and [the sizing commands](../archive/plans/047-plan-row-sizing-commands.md) for validation and writes.
2. Add concrete width and alignment commands following the existing Row minimum-height command. Each takes the Wall and Row IDs plus its own value, validates the target and ownership, updates only that property on the current Row, and emits no operation for an identical value. Size calculation stays in the editor. Keep model updates command-driven. Bind the new model through exact owner, actor, query, command, and external declarations. Check every active `WallV2` binding, including Page creation, Stack and Placement edits, generation, and publishing. Reuse compatible programs and preserve prior contract lineage. Confirm that new Row settings survive subsequent add, move, remove, height, and Stack operations.
3. Add the candidate owner release beside every existing registration. Evaluate retained commands into the candidate and verify that reconstructed Walls and Placements contain their historical layout and weights. Existing weights require no data rewrite or per-Row migration command. Verify that the retained release can coexist with the candidate, including admission and handling of candidate-only sizing commands, before proposing activation. The user personally handwrites any canonical selection change after reviewing the evidence.
4. Apply one group width calculation in the editor for saved rendering, resize drafts, and insertion shadows. Keep the full Row hit area available for insertion and use aligned Brick bounds to locate insertion seams. In an automatic Row use each floored preferred width when there is room, and use those floored widths as the proportions when shrinking. In a manually sized Row use the saved weights as proportions. In either case, freeze minimum-constrained Bricks and redistribute the balance. Apply the existing minimum-fit check before previewing an incoming Brick. Account for the editor’s half-gap cell insets when converting between DOM measurements and surface geometry.
5. Extend the existing resize gesture for the one outer grip and stage one width command on release. Save the final displayed width after clamping, and preserve the previous preference when the visible width has not changed. Reuse the existing drop and resize cancellation rules, including invalidation if the active Row’s alignment, membership, sizing, or available width changes. Use a compact Left / Center / Right control on the Row with an accessible selected state. A change stages only alignment.
6. Version the publication snapshot content to include the sizing rule and the saved Row settings. Preserve historical snapshot IDs and legacy geometry on replay. In the candidate publish lineage, verify that a retained publish command still produces legacy snapshot content and a new publish command produces the new shape. Prove this against the installed SDK’s replay and payload adaptation behavior before adopting the release. Keep Page and Site publishing and the saved-versus-published comparison on the same new builder. A Page with a legacy snapshot can show unpublished changes after migration until the next publish. Public rendering stays outside the feature scope.
7. After implementation and verification, update the layout conventions and reconcile the existing glossary with the implemented Row sizing terms. Record an ADR only if the implemented decision is hard to reverse, surprising without context, and the result of a real trade-off. Archive this plan when its work is complete.

```ts
// 1. Width drag writes one Row property and preserves its alignment.
stageAggregateSessionCommand({
  session,
  contractName: "setRowPreferredWidth",
  payload: { wallId, rowId, preferredWidth: 480 },
});

// 2. Alignment writes a separate property and preserves the width preference.
stageAggregateSessionCommand({
  session,
  contractName: "setRowAlignment",
  payload: { wallId, rowId, alignment: "center" },
});

// 3. A divider continues to submit Placement widths through setRowWidthWeights.
```

## Verification

1. Extend the existing backend sizing harness coverage with command-created Rows. Check finite positive width, alignment, ownership and missing-target refusals, no-op saves, and preservation of other fields and breakpoint Walls. Check a moved Placement retains its weight and a resized destination retains its preferred width. Cover a legacy publish and a new publish through the candidate release. Run the backend Nx test target.
2. Use the existing Wall Editor Storybook and the configured local App to exercise one Brick, adding a second with spare space, proportional shrink at a minimum, and unavailable insertion when minimums exceed the Stack. Check empty-space drops, all three alignments, grip separation from the dividers and height grip, centered drag, canceled drag, and divider resize. Change Stack width and restore it to verify the saved preference survives temporary clamping. Reload to check persisted width and alignment. Run the App build through Nx.
3. Before activation, check retained-history replay and exact owner/actor session bindings against existing development data, including a Row with previously resized dividers. Validate publication comparison before and after republishing. Report replay, admission, and session evidence separately from the harness. Preserve existing storage throughout verification.

## Planned files

`+` creates a file. `~` modifies a file. Braces group files in the same directory. Version suffixes assume the current V9 baseline.

```text
qrk.sh/
├── apps/
│   ├── app/
│   │   ├── app/[username]/site/[siteId]/page/[pageId]/(drawer)/
│   │   │   ├── ~ DrawerHeader.tsx
│   │   │   └── ~ PublishSiteDialog.tsx
│   │   ├── components/~ WallEditor.stories.tsx
│   │   ├── modules/
│   │   │   ├── ~ bricks.css
│   │   │   └── lib/wall/
│   │   │       ├── ~ WallEditor.tsx
│   │   │       ├── ~ WallPlacement.tsx
│   │   │       ├── ~ makeWallLayoutView.ts
│   │   │       └── ~ useWallResize.ts
│   │   └── zerospin/~ userSessionDefinition.ts
│   └── zerospin/
│       ├── src/
│       │   ├── ~ system.ts (candidate registration)
│       │   └── aggregates/user/
│       │       ├── + UserV10.ts
│       │       ├── actors/+ userActorV10.ts
│       │       ├── layout/+ wallLayoutSchemaV3.ts
│       │       ├── models/{wall/+ WallV3.ts, pageSnapshot/+ PageSnapshotV4.ts}
│       │       ├── snapshots/+ {makePageSnapshotV4.ts, pageSnapshotSchemaV4.ts}
│       │       └── contracts/
│       │           ├── wall/+ {SetRowPreferredWidthV1.ts, SetRowAlignmentV1.ts}
│       │           ├── publishPage/+ PublishPageV4.ts
│       │           ├── publishSite/+ PublishSiteV4.ts
│       │           └── + next versions of the remaining active WallV2 bindings
│       │               in brick/, createPage/, updateSiteSettings/, and wall/
│       └── test/~ placementMoves.spec.ts
└── wiki/
    ├── ~ brick-layout-conventions.md
    ├── ~ glossary.md
    └── plans/+ 055-plan-row-width-and-alignment.md
```
