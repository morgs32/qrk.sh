# Brick width in the details drawer

Researched 2026-11-10 against main at `c53c647`, which includes Row width and alignment and the Article drawer changes. The Storybook `InspectorNumberField` is in PR #84. [Main snapshot][main], [Row width and alignment][row-pr], [Storybook input][inspector].

## What the Wall saves

- Brick content is shared across breakpoints. Each Wall’s Placement carries its own `widthWeight`. Automatic Rows use weights as preferred surface widths. Explicit Rows use them as proportions after subtracting gaps. Module minimums and Stack fit can change the rendered width. [Layout conventions][layout], [Width allocation][allocation], [Placement model][placement].
- A divider captures the Row’s visible surface widths, then holds a React draft while two neighbors trade width within their minimums. On release, a changed draft stages one `setRowWidthWeights` with the complete Row. The outer grip stages `setRowPreferredWidth`. [Divider calculation][divider], [Measurements][measure], [Pointer completion][pointer-up], [Commit paths][commit].
- `setRowWidthWeights` checks ownership, positive finite weights and total, and exact current Row membership. It saves changed weights without normalization. The V10 App selects the V2 contract with the same payload. The registry still names V9 canonical and Plan 055 records local V10 verification on copied data. [Contract][contract], [V2 upgrade][v2], [App session][session], [Registry][registry], [Verification record][verification].

A 480px explicit Row with a 16px gap gives two equal Bricks 232px each. Changing one weight from 320 to 400 yields about 258px before floors apply. The drawer needs to choose which quantity it edits. [Width allocation][allocation].

## Numeric divider in the drawer

Show the selected Placement’s surface width in pixels at the active breakpoint. On Apply, use the following neighbor, or the preceding neighbor for the last Brick. Keep the divider’s minimums and occupied group width. For a lone Brick, show the width read-only and point to Row width. That decision matters because variable-height variants always occupy their Row alone. [Divider calculation][divider], [Width allocation][allocation], [Layout glossary][glossary].

Keep geometry and commands in `WallEditor`. It already computes the surface width for the field’s initial value and owns the resize hook for Apply. The drawer route resolves the active Placement, and `PagePreview` can portal a Wall-owned layout control alongside the module form. `BrickDetail` returns early for inline-editor modules, so the field needs a place outside that content form. [Wall resize owner][wall-owner], [Rendered surface width][rendered-width], [Wall cell geometry][cell], [Drawer Placement query][drawer-placement], [Inline editor branch][drawer-inline], [Drawer host][host], [PagePreview portal][portal].

Use `InspectorNumberField` with a local draft. Apply resolves current Row geometry and the neighbor, then stages one changed vector in Row order and hands rendering back to the optimistic query. A live preview could reuse the Row overlay. Base UI’s `onValueCommitted` fires on blur and per keyboard step, so keep Apply explicit. [Storybook input][inspector], [Base UI commit events](https://base-ui.com/react/components/number-field#api-reference), [Draft invalidation][invalidate], [Zerospin staging][stage].

Editing a compressed automatic Row adopts the current surface widths as the new preferences, including compressed widths of untouched siblings. This follows divider behavior. Also, membership validation allows concurrent updates to overwrite prior weights when the members stay the same. Resolve current data on Apply and cancel drafts invalidated by changes the client has observed. [Divider calculation][divider], [Contract][contract], [Draft invalidation][invalidate].

## Preferred width in automatic Rows

A `Preferred width` field could make a Brick naturally wider even when alone. In an automatic Row, submit the edited weight alongside the others’ current saved weights. The occupied group can grow and the other preferences survive. Explicit Rows still use weights proportionally. Stack Details provides a route-owned draft and explicit-save precedent for an edit that needs only saved values. [Width allocation][allocation], [Contract][contract], [Stack Details draft and save][stack].

[main]: https://github.com/morgs32/qrk.sh/tree/c53c64707566bbaf15d07f5577537dc0ed03154a
[row-pr]: https://github.com/morgs32/qrk.sh/pull/87
[inspector]: https://github.com/morgs32/qrk.sh/blob/b07cbc70f629ea53764960cb0263469e9a4e1296/apps/app/components/InspectorNumberField.tsx#L8-L57
[layout]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/wiki/brick-layout-conventions.md#L12-L35
[glossary]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/wiki/glossary.md#L19-L27
[placement]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/zerospin/src/aggregates/user/models/placement/PlacementV2.ts#L4-L8
[allocation]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/modules/lib/wall/WallEditor.tsx#L1054-L1109
[divider]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/modules/lib/wall/useWallResize.ts#L154-L170
[measure]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/modules/lib/wall/useWallResize.ts#L343-L364
[pointer-up]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/modules/lib/wall/useWallResize.ts#L425-L485
[commit]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/modules/lib/wall/useWallResize.ts#L286-L309
[contract]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/zerospin/src/aggregates/user/contracts/wall/SetRowWidthWeightsV1.ts#L22-L126
[v2]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/zerospin/src/aggregates/user/contracts/wall/SetRowWidthWeightsV2.ts#L6-L14
[session]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/zerospin/userSessionDefinition.ts#L28-L68
[registry]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/zerospin/src/system.ts#L6-L14
[verification]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/wiki/archive/plans/055-plan-row-width-and-alignment.md#L114-L124
[wall-owner]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/modules/lib/wall/WallEditor.tsx#L127-L130
[rendered-width]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/modules/lib/wall/WallEditor.tsx#L1145-L1198
[cell]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/modules/lib/wall/WallPlacement.tsx#L22-L29
[drawer-placement]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/BrickDetail/BrickDetail.tsx#L33-L76
[drawer-inline]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/BrickDetail/BrickDetail.tsx#L127-L170
[host]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/layout.tsx#L7-L20
[portal]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/PagePreview.tsx#L73-L84
[invalidate]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/modules/lib/wall/useWallResize.ts#L245-L271
[stage]: https://github.com/morgs32/zerospin/blob/90a41dc24563d7293604698a8234b9e06116db9d/packages/core/src/aggregateSession/stageCommand/stageAggregateSessionCommand.ts#L43-L85
[stack]: https://github.com/morgs32/qrk.sh/blob/c53c64707566bbaf15d07f5577537dc0ed03154a/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/StackDetails/StackDetails.tsx#L24-L89
