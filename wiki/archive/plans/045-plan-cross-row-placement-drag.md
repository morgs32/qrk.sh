# 045: Drag Placements between Rows

**Status:** Implemented and verified.

## Agreed behavior

1. Extend grip dragging to existing and new Rows anywhere among the current Wall's existing Stacks and Sections. Create no Stacks or Sections.
2. On compatible populated Rows, use the top/bottom **8px** for creating a Row above/below; the remaining area joins or reorders horizontally.
3. On incompatible Rows, use top/bottom halves for creating a separate Row. Article and other variable-height Bricks remain exclusive.
4. Empty Rows accept a Placement directly. Empty Stack backgrounds create their first Row.
5. Keep the source dimmed in place. Show a vertical blue line for existing-Row insertion and a horizontal blue line for new-Row insertion. Feedback changes no layout geometry.
6. Preserve identity, content, specs, generation, selection, drawer state, and existing cleanup. Keep current shrink/overflow sizing and native desktop dragging; add no custom scrolling or dependencies.
7. Suppress unchanged drops, including replacing a singleton source Row at its current position. Cancellation, outside drops, and invalidated destinations stage nothing.

## Commands and retained history

1. Use `movePlacementToRow` for joins and reordering, and `movePlacementToNewRow` for new Rows. Keep their payload shapes unchanged.
2. Introduce `movePlacementToRowV2` through the existing V1 lineage. Add Brick read access and enforce the shared `canShareRow` rule using actual module/variant definitions. Exclude the moving Placement from destination members when checking same-row moves.
3. Add Actor/owner V6 and update the browser bindings together. Replace the same-named grant through the Actor update helper; retain V5 and the contract lineage for existing history.
4. Allocate `newRowId` only after validating an accepted new-Row drop:

   ```ts
   // 1. Existing destination: no new identity.
   payload: {
     (placementId, rowId, beforePlacementId);
   }

   // 2. New destination: explicitly identify the Row being created.
   payload: {
     (placementId, stackId, newRowId, beforeRowId);
   }
   ```

5. Preserve current local data. No reset, upstream framework change, or production deployment is included. This does not resolve the separate pre-V5 generic-command history limitation.

## Implementation

1. Extend the existing saved-Placement target registration and monitor in `WallEditor`. Resolve source membership, destination compatibility, and insertion anchors against current data.
2. Preserve full horizontal insertion behavior outside the new edge strips. Keep visible boundary ownership distinct from the command's `beforeRowId`, so “after A” remains drawn after A.
3. Extend move feedback for horizontal boundaries, including empty Stack destinations. Keep drawer-template shadows and their existing targeting unchanged.
4. Implement the authoritative sharing check directly in the concrete command. Missing referenced records remain invariant failures rather than silently excluded members.
5. Reference: [ADR 001: Wall-owned layout tree](../../adrs/001-wall-owned-layout-tree.md). Its persistence and cleanup decisions remain unchanged.
6. Planned hierarchy (`+` create, `~` modify):

   ```text
   qrk.sh/
   ├── apps/app/
   │   ├── components/~ WallEditor.stories.tsx
   │   ├── modules/lib/wall/
   │   │   ├── ~ WallEditor.tsx
   │   │   └── ~ WallPlacement.tsx
   │   └── zerospin/~ userSessionDefinition.ts
   ├── apps/zerospin/
   │   ├── src/
   │   │   ├── aggregates/user/
   │   │   │   ├── + UserV6.ts
   │   │   │   ├── actors/+ userActorV6.ts
   │   │   │   └── contracts/wall/+ MovePlacementToRowContractV2.ts
   │   │   └── ~ system.ts
   │   └── test/~ placementMoves.spec.ts
   └── wiki/plans/+ 045-plan-cross-row-placement-drag.md
   ```

## Verification and completion

1. Extend backend tests for compatible joins, Article exclusivity in both directions, empty destinations, and atomic rejection. Verify V5/V1 same-row history materializes identically under V6.
2. Extend command-backed Storybook scenarios for joins and new Rows across Stacks/Sections, own-Row splitting, singleton no-ops, 8px boundaries, empty targets, cancellation, and stale destinations.
3. Verify zero/nonzero gaps, crowded Rows, stable geometry, unchanged other breakpoints, and preserved selection/content. Rerun same-row and drawer-shadow regressions.
4. Perform real-pointer cross-row moves and reload verification. Run backend tests, App TypeScript/build, and scoped formatting checks.
5. After implementation, update affected READMEs, layout conventions, and glossary wording—including the stale width-fit description of compatibility. Create an ADR only if the implemented result meets all three grill-me criteria.
6. Record evidence, archive the completed plan, and open a ready-for-review PR.

## Verification outcome

1. Backend TypeScript and all 15 tests across four files pass. Tests cover compatible joins, Article sharing refusals in both directions, atomic preservation, and V1 payload adaptation through the actual SDK decoder. The harness addresses exact owners rather than projecting history; runtime evidence below establishes cross-owner materialization.
2. App TypeScript and the Nx production build pass. Eight Storybook play functions pass: CrossRowMoves, CrossRowMovesWithGaps, CrossRowEmptyRow, CrossRowEmptyStack, RowReorder, RowReorderWithGaps, ShadowBrick, and ShadowStability. Responsive content assertions use rendered text, encoded SVG payload, and color rather than unstable HTML details.
3. Native grip dragging joined the existing local fixture's lg Rows and split the Diamond back into a fresh Row; both changes survived reload with the selected Brick and drawer preserved. Canonical V6 archive indices 7/8 finalized Success, each with exactly one lg Wall update. All 2 Brick records, 8 Placement records, and complete sm/md/xl Wall records stayed unchanged.
4. The retained V5/Actor5/V1 move at index 6 evaluated under V6 with byte-identical outcome and recorded operations, preserving its xl arrangement. Existing local database and browser data were retained; no reset, upstream modification, or production deployment occurred.
5. Affected READMEs, layout conventions, glossary compatibility wording, and the grip's accessible label now match the implemented behavior. No ADR was warranted: this extends existing movement and Row-sharing decisions without a new architecture trade-off.

## Remaining work

None.
