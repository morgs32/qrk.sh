# Single-Brick Row width

Researched 2026-11-12 against the current local checkout, including its existing uncommitted work. This is a source inspection, not a browser measurement.

An automatic Row with one Brick does not necessarily fill its Stack. Its content width is the smaller of the Stack width and the Placement's saved width weight floored at the Brick variant's minimum width. The single Brick receives that content width. A new Placement initially saves its module's default width as its width weight. [Allocation](../../apps/zerospin/src/aggregates/user/layout/wallSizing.ts), [Placement creation](../../apps/zerospin/src/aggregates/user/contracts/wall/AddBrickContractV5.ts).

For example, a new Image has a 480px default and a 320px minimum. In an automatic Row in a 720px Stack, it occupies 480px and leaves 240px. In a 360px Stack, it occupies 360px. [Image definition](../../apps/bricks/src/modules/image/definition/imageV1.ts), [Allocation](../../apps/zerospin/src/aggregates/user/layout/wallSizing.ts).

When a Row has a saved preferred width, that width sets the content target instead, constrained by the Brick minimum and Stack width. The editor uses the saved value or a resize preview, and the Web WallViewer uses the saved value. Alignment positions the group within the remaining Stack space. [Editor allocation](../../apps/app/components/WallEditor/WallEditor.tsx), [WallViewer](../../apps/web/library/WallViewer.tsx), [Allocation](../../apps/zerospin/src/aggregates/user/layout/wallSizing.ts).
