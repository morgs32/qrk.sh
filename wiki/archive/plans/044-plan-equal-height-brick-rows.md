# 044: Equal-height Brick rows with Flexbox

**Status:** Implemented and verified on 2026-11-01.

## Problem and agreed behavior

1. Rows currently align Bricks at the top, leaving shorter surfaces and insertion shadows below their Row's height. A Row must instead size to its tallest current Brick or shadow and stretch every surface to match.
2. Use natural content heights and existing module CSS minimums. A taller shadow grows the Row; a shorter shadow fills it. Committed Bricks remain equal height after placement.
3. Leaving, cancellation, or removal of the tallest Brick lets the Row shrink naturally. Preserve widths, gaps, row-sharing eligibility, cloned shadows, and stable drop destinations.
4. Height remains derived. No model, command, snapshot, sizing metadata, public props, named types, dependencies, or storage changes. Existing Article exclusive-Row rules remain.

## Decision and examples

1. Use an auto-height flex Row with `align-items: stretch`, following the [Flexbox cross-sizing algorithm](https://www.w3.org/TR/css-flexbox-1/#cross-sizing). Carry content-based vertical growth through Placement/shadow hosts, Brick surfaces, and content roots.
2. For example, dragging a 200px surface into a 64px Row makes both surfaces 200px during feedback. Cancelling restores 64px. Dragging a 64px surface into a 200px Row stretches its shadow to 200px; the placed surface also fills the Row. These are illustrative content heights, not new sizing constants.
3. Preserve horizontal sizing while making the cells column flex containers:

   ```css
   .wall-placement,
   .wall-shadow-placeholder {
     flex: 0 1 auto; /* 1. Keep preferred widths and existing horizontal shrink. */
     display: flex;
     flex-direction: column;
   }

   .wall-placement-content {
     display: flex;
     flex-direction: column;
     flex: 1 0 auto; /* 2. Fill the Row without discarding intrinsic content height. */
   }
   ```

4. Scope wrapper/root growth to Placements and shadows, preserving catalog and native pointer preview sizing. Let shared BrickShell, Figma's nested placeholder column, and GitHub Activity's calendar root grow through their extra nesting.
5. Reject saved height and JavaScript equalization: the browser already owns this layout calculation. Existing drag-start Row measurements continue to serve drop targeting, independently of surface stretching.
6. Reference: [ADR 001: Wall-owned layout tree](../../adrs/001-wall-owned-layout-tree.md). Its persisted structure is unchanged.

## Implementation steps

1. Replace Row `items-start` with `items-stretch` and add column flex/growth along the scoped Placement and shadow chains.
2. Add content-based growth to BrickShell, Figma placeholder's nested column, and the ActivityCalendar root. Preserve module interaction, clipping, and resizing behavior.
3. Extend existing command-backed Storybook fixtures with mixed-height compatible Bricks. Preserve existing shadow and stability assertions outside the newly specified stretching behavior.
4. Verify the scenarios below, then update the existing Row glossary term and layout conventions to reflect the implemented result. No ADR is warranted for this routine rendering change.
5. Archive this plan only after verification, and open a ready-for-review PR.

## Planned file hierarchy

Legend: `+` create; `~` modify. Existing WallPlacement markup can remain unchanged because its class hooks already provide the required CSS scope.

```text
qrk.sh/
├── apps/app/
│   ├── components/
│   │   └── ~ WallEditor.stories.tsx
│   └── modules/
│       ├── ~ bricks.css
│       ├── components/brick/
│       │   └── ~ BrickShell.tsx
│       ├── figmaThumbnail/
│       │   └── ~ FigmaThumbnailPlaceholder.tsx
│       ├── githubActivity/
│       │   └── ~ ActivityCalendar.tsx
│       └── lib/wall/
│           └── ~ WallEditor.tsx
└── wiki/
    ├── ~ brick-layout-conventions.md
    ├── ~ glossary.md
    └── plans/
        └── + 044-plan-equal-height-brick-rows.md
```

## Verification

1. In Storybook, check taller-shadow Row growth, shorter-shadow stretch, equality after a successful drop, shrink after cancellation/leaving/removal, and no creation on cancellation. Assert visible surfaces and gap insets, not only outer cells.
2. Cover all four breakpoints, zero/nonzero gaps, and flat/card appearance. Rerun existing ShadowBrick and ShadowStability play functions, including stationary-pointer destinations and before/after insertion.
3. Inspect configured, placeholder, and generated-default representatives including Swatch, Map, Figma, and GitHub Activity; retain Article exclusivity, natural catalog/native sizing, calendar behavior, and Map resizing. Use local fixtures without live provider calls.
4. Run App build, TypeScript, targeted formatting, affected Storybook play functions, and a real pointer drag in the browser.

## Outcome and verification evidence

1. Rows now stretch their Placement and shadow surfaces through column flex wrappers. Natural heights and module CSS minimums determine the shared height, and cancellation/removal restores the natural remaining height. No height state or persisted shape was introduced.
2. Equal Height Rows and Equal Height Rows With Gaps passed their complete browser play functions at all four breakpoints, including direct module-root fill, taller hover, shorter hover, leaving, drop, cancellation, deletion, gap insets, and card corners.
3. ShadowBrick and ShadowStability passed in the isolated height-only checkout with the full preview viewport. The Article ShadowBrick variant also passed at a 12px gap in the original checkout. With the addon panel open, the existing stability fixture's fixed pointer can hit the drawer; it passed after restoring the full preview viewport.
4. Real pointer drops verified a GitHub Activity placeholder beside a Swatch at matching 128px surface/content-root heights. A Map drop in the original checkout produced matching 208px surface/root heights across three Bricks. Configured preview surfaces retained natural height; the Figma tests cover its configured shadow and committed placeholder using the same shared shell as generated defaults. Source inspection confirmed the existing Map ResizeObserver and calendar scrolling remain unchanged.
5. App build, `pnpm exec tsc --noEmit -p apps/app/tsconfig.json`, targeted formatting, and `git diff --check` passed in `/tmp/qrk-row-height-review`. The isolated checkout excludes concurrent drag/reorder work. Browser verification reused installed packages with temporary Storybook filesystem access configuration; that configuration is excluded from the change.
6. Updated the existing Row glossary definition and Brick layout conventions. No ADR or migration was warranted. WallPlacement required no markup change because its existing class hooks provide the CSS scope.

## Remaining work

None.
