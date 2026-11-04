# 050 — Stack insertion and layouts that fit

**Status:** Feature code is on current main; production reconciliation and final fresh-session verification remain. Reviewed 2026-11-04 at `afa8ed05d`. Current source consumes SDK 42.0.3. The SDK 39 backend acceptance and App deployment below are historical rollout evidence, not confirmation of today's production versions.

## Summary

1. Wire Stack actions **Insert left** and **Insert right** to create an empty adjacent Stack. Size Stacks equally when possible, redistributing width only when their contents require larger minimums.
2. Replace breakpoint Stack-count caps with content-based fit. Reject additions, moves, and gap changes that cannot fit without squeezing a Brick below its module minimum. Keep this authoritative in commands and visible in destination availability.
3. Use the approved clean cutover: reset **local development and deployed QRK Zerospin data** after implementation and verification. This supersedes the earlier proposal to grandfather existing overflow. Add no Page legacy flag, historical-overflow mode, SDK change, or compatibility migration.

## Agreed behavior

1. Use the selected Wall's authored width: sm 360px, md 720px, lg 1080px, xl 1440px. Editor viewport width does not independently change layout capacity.
2. A Row requires the sum of its Placement cell minimums. A Stack requires its widest Row, with a floor of 160px usable width plus its gap allowance. An empty Stack has that same floor; it still receives an equal share whenever possible.
3. Divide Section width equally among unfixed Stacks. Fix any Stack whose minimum exceeds that share at its minimum, then divide the remaining width among the remaining Stacks. Repeat until every Stack has a width. Persist no Stack width preferences and add no Stack resize controls.
4. Insertion is unavailable when the new empty Stack and existing contents cannot fit. Create the Stack immediately, named `Stack`, with no Rows. Keep the current selection and normal menu-close focus behavior; do not automatically open the name editor. Show existing Stack actions on empty Stacks too.
5. Reject an explicitly chosen Brick destination when the resulting Section cannot fit, even after Stack redistribution. Do not silently wrap into a new Row or fall through from an invalid central Row target to a parent Stack target. Existing explicit Row-creation edges remain valid destinations when they fit.
6. New Bricks still receive Placements at all four breakpoints. On the active Wall, honor the chosen target or reject the addition. On another Wall, try the existing automatic destination first: a new Row in the last Stack. If that candidate cannot fit, append a new Section/Stack/Row there. An impossible fallback rejects the whole addition atomically.
7. Gap changes validate every affected Page and Wall of the Site before recording the update. Preserve existing variable-height Row compatibility rules. Placement variants currently only support `default`; add no variant-change API or UI. The fit calculation reads variant minimums so a future variant-changing command must enforce the same rule.
8. Preserve unrelated empty Sections, Stacks, and Rows during moves. Prune only containers emptied by removing the moved source, and retain the identity and contents of a whole Stack being moved.
9. No horizontal Row scrolling, automatic layout repair, Stack deletion, undo feature, or new provider behavior is included. Direct removal of an accidentally inserted empty Stack remains a separate feature.

## Shared sizing and command changes

1. Add the approved browser-safe `measureWallFit` and `allocateStackWidths` functions in the Wall layout directory. Use concrete inline inputs and inferred returns; no new named types, generic adapters, wrappers, or barrels. The functions consume numeric module minimums rather than owning module rules. Backend commands obtain those minimums from `backendLibrary`; the renderer obtains them from `modulesHash`.
2. `measureWallFit({ layout, placementMinimumWidths, wallWidth, brickGap })` takes the existing layout schema and a Placement-ID-to-minimum-width map. Return Section results in saved order, with Section ID, ordered Stack minimums, required width, and fit status. A missing referenced Placement is a broken model invariant, not a default-width fallback. Keep authored breakpoint width values in this module and reuse them in the existing App breakpoint definitions.
3. Preserve the existing half-gap geometry. For canonical content width `W` and gap `g`, the negative outer margins provide a Section track budget of `W + g`; each cell requires `moduleMinimum + g`. Do not add a second inter-Stack gap or count preview borders as available content width.

   ```ts
   const availableWidth = wallWidth + brickGap; // 1. Existing outer half-gap allowances.
   const rowMinimum = minimums.reduce((sum, min) => sum + min + brickGap, 0); // 2. Cell insets.
   const stackMinimum = Math.max(160 + brickGap, ...rowMinimums); // 3. Widest Row or empty floor.
   const fits = stackMinimums.reduce((sum, min) => sum + min, 0) <= availableWidth; // 4. Exact fit.
   ```

4. `allocateStackWidths({ minimumWidths, availableWidth })` returns ordered fractional pixel widths using the allocation in Agreed behavior step 3. Call it after a successful fit calculation; infeasible persisted input is an invariant error. Keep fractional values through rendering and use the resulting tracks instead of equal `auto-cols-fr`. Preserve existing Brick flex sizing and Row width-weight behavior.
5. Add `insertStackV1`, payload `{ id, wallId, anchorStackId, side: "left" | "right" }`. Follow `addWallSection`'s ID-seed convention to derive the Stack ID. Check Page ownership, current Wall/anchor membership, identity collisions, and candidate fit before recording one Wall update. Missing/stale targets and insufficient space are normal declared refusals. No model schema changes are needed.
6. Add current contract releases: `addBrickV5`, `movePlacementToRowV4`, `movePlacementToNewRowV3`, `movePlacementToNewStackV3`, `movePlacementToNewSectionV3`, `moveStackV3`, and `updateSiteSettingsV2`. Validate candidate layouts before recording operations. Include incoming Placement metadata explicitly: recorded creates are not queryable as applied rows during the same command.
7. Keep structural changes in `wallLayoutV3`, based on the existing concrete helpers: remove count-based capacity arguments and narrow source-container pruning. Do not change predecessor helper semantics for older source declarations. Empty-Section creation, rename, deletion, Brick state updates, and Row sizing need no new horizontal-fit behavior because they do not increase the required minimum width.
8. Register Actor9 and Aggregate9, expose the new exact contracts in `userSessionDefinition`, and select Aggregate9 as the sole supported user release in the clean-cutover System registry. Leave predecessor source files intact; do not maintain old live session grants or backport fit checks. Update current fixtures/tests to the registered release.
9. Wire both menu items through existing session command validation/staging. Disable unavailable items with a concise reason, `Not enough space in this Section`. Use command rehearsal for destination eligibility and revalidate on staging, so stale UI cannot bypass command checks. Reuse session error reporting rather than adding a second notification path.
10. Apply candidate minimums and allocation to valid insertion shadows as well as saved content. Invalid candidates show no accepting shadow. Preserve existing drag identities, edge zones, Brick selection, focus, and resize cancellation when available Row width changes.

## Annotated examples and verification

1. **Equal widths:** 900px available, Stack minimums `[160, 160, 160]` → `[300, 300, 300]`.
2. **Redistribution:** 900px available, minimums `[400, 160, 160]` → `[400, 250, 250]`. The first Stack stops condensing at 400px; the other two share the remainder.
3. **Full Section:** 720px available and minimums `[400, 320]` fit exactly at zero gap. Inserting a 160px empty Stack is rejected. A 360px Wall may contain two 160px Stacks when their gap allowances fit, replacing the former one-Stack cap.
4. **Other-breakpoint fallback:** a 720px Section whose Stacks require `[480, 160]` cannot accept a 320px-minimum Brick in a new Row of the last Stack. Keep the active placement, and put the other-breakpoint Placement in a fresh full-width Section.

   ```ts
   // 1. Check the actual proposed arrangement, including the incoming Brick.
   const proposed = measureWallFit({ layout: candidate, placementMinimumWidths, wallWidth, brickGap });
   // 2. Refuse before recording any Wall/Placement mutations when a Section cannot fit.
   if (proposed.some((section) => !section.fits)) {
     return yield* failures.invalidLayout.make({ message: "Not enough space in this Section", status: 409 });
   }
   ```

5. Add focused pure sizing tests for equal shares, repeated minimum freezing, fractional remainder, exact fit, overflow rejection, and gap accounting at 0px and 12px. These test the domain math, not a duplicate renderer.
6. Extend the actual-System `makeSystemHarness` tests with command-created rows and `harness.flush()`: left/right insertion order, empty shape, stale-anchor/ownership rejection, no partial changes on rejection, inactive-Wall fallback, gap rejection across Pages, removal of count caps, and preservation of unrelated empty scaffolding. Use the installed harness's supported Actor command path for Actor-granted commands, with captured claims and complete producer coordinates. This verifies authored behavior, not credential authentication or distributed admission.
7. Extend the existing command-backed WallEditor Storybook fixtures: empty Stack actions, equal/constrained tracks, disabled insertion, fitting and rejected drag destinations, shadows, selection/focus, and unchanged Brick divider resize behavior. Cover all canonical widths and both gap values with representative cases. Replace fixtures that deliberately create overflowing saved layouts; the clean-cutover contract now refuses those arrangements.
8. Assert rendered Brick surfaces meet their module minimums and Section contents stay within their track budget, allowing only subpixel DOM measurement tolerance. Exercise a genuine native drag for a rejected central Row destination and an accepted explicit new-Row edge, including a gap change that would invalidate the layout.
9. Run `pnpm nx run @qrk.sh/zerospin:test`, App typecheck/build, and affected Storybook interaction checks through the existing available tooling. Use `pnpm nx` for configured workspace targets; do not add a runner or dependency solely for this plan. Preserve Plan 048's separately tracked native-touch verification and other concurrent work.

## Planned files

Legend: `+` create; `~` modify. Number 050 follows the previously observed concurrent 049 plan; do not reuse its number or alter that work.

```text
qrk.sh/
├── apps/zerospin/src/
│   ├── ~ system.ts
│   └── aggregates/user/
│       ├── + UserV9.ts
│       ├── actors/+ userActorV9.ts
│       ├── layout/
│       │   ├── + wallSizing.ts
│       │   └── + wallLayoutV3.ts
│       └── contracts/
│           ├── updateSiteSettings/+ UpdateSiteSettingsV2.ts
│           └── wall/
│               ├── + InsertStackContractV1.ts
│               ├── + AddBrickContractV5.ts
│               ├── + MovePlacementToRowContractV4.ts
│               ├── + MovePlacementToNewRowContractV3.ts
│               ├── + MovePlacementToNewStackContractV3.ts
│               ├── + MovePlacementToNewSectionContractV3.ts
│               └── + MoveStackContractV3.ts
├── apps/zerospin/test/
│   ├── + wallFit.spec.ts
│   ├── ~ placementMoves.spec.ts
│   ├── ~ system.spec.ts
│   ├── ~ brickBorderWidth.spec.ts
│   └── ~ stackName.spec.ts
├── apps/app/
│   ├── zerospin/~ userSessionDefinition.ts
│   ├── modules/lib/~ breakpoints.ts
│   ├── modules/lib/wall/~ WallEditor.tsx
│   └── components/~ WallEditor.stories.tsx
└── wiki/
    ├── plans/+ 050-plan-stack-insertion-and-fit.md
    ├── research/~ zerospin-layout-policy-contract-upgrades.md
    ├── ~ brick-layout-conventions.md
    └── ~ glossary.md
```

## Cutover and completion

1. **Authorization recorded:** the user explicitly approved wiping local development and deployed QRK databases for this feature. Target the QRK Zerospin backend and its complete command/materialization/history storage, including Archives. Preserve Clerk accounts, existing keys/secrets, uploaded objects, the separate `qrk-api` Worker's provider stores, sibling systems, and unrelated WIP. The user subsequently stopped rollout and explicitly required deleting all backups; those backups were deleted and must not be recreated. Feature code deployment is a separate rollout action; this plan does not imply it has happened.
2. Complete implementation and checks before resetting. Close QRK clients and stop the local Zerospin producer process before the reset; reload clients only after the matching backend/App bindings in step 5 are ready. Start the backend through the existing workspace launch path with `zerospin dev --clean`; the installed clean target is `apps/zerospin/.wrangler/zerospin/dev-worker/sys_qrk_sh_1`. Preserve the existing launch environment and wait for actual readiness.
3. At deployed cutover, verify the live Cloudflare account, Worker `qrk-zerospin`, its bound namespace IDs/classes, and external references read-only. The current generator declares 21 SQLite DO classes; use the actual deployed inventory, not a historical hardcoded count. Use an isolated temporary maintenance Worker on that same target, with no class code/bindings and `exports` tombstones marked `state: "deleted"` for the verified namespaces. Keep it returning 503 while deletion is applied and verify the old namespace IDs are gone. Restore the final backend's live SQLite exports through a second direct Wrangler deployment. This removes history as well as materialized rows, preventing replay from restoring wiped data. Cloudflare class lifecycle changes require direct deployment, not gradual versions upload. [Cloudflare class lifecycle](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).
4. Preserve secrets through maintenance. Use the existing authenticated System-spec acceptance/initialization flow after namespace recreation. The installed normal Zerospin CLI stages incumbent Workers with `versions upload`, so do not use that staging path for the deletion/recreation lifecycle. Keep temporary reset files outside tracked source; add no permanent reset API or framework changes.
5. Before reopening session admission, ensure the final backend registers only Aggregate9/Actor9 as specified above; selecting a new canonical release while retaining old registered grants is insufficient. Bring up the matching App bindings and verify fresh empty domain state before creating smoke-test data. Actor9 and the changed session definition select fresh browser Node storage through existing identity hashing; no origin-wide IndexedDB/Clerk reset is needed. Verify old owner/Actor sessions cannot reconnect and replay stale drafts.
6. After implementation, reconcile the existing glossary and layout conventions with the actual result. Consult [ADR 001](../adrs/001-wall-owned-layout-tree.md) for structural ownership; the Wall tree ownership remains applicable. Create an ADR only if the implemented result meets all three grill-me criteria: hard to reverse, surprising without context, and the result of a real trade-off.
7. Record actual reset targets and verification evidence, open a ready-for-review PR for completed code, then set Remaining work to None and archive this plan after all required work is complete. Do not claim type/build or mock-session checks prove production delivery.

## Current-line review — 2026-11-04

1. The implementation entered main through checkpoint commit `436850f20`, which is an ancestor of reviewed main `afa8ed05d`. A new implementation PR would duplicate landed work. `InsertStackContractV1`, Actor9, `userSessionDefinition` and WallEditor's Insert left/right controls are wired. `measureWallFit` / `allocateStackWidths`, Add Brick V5 fallback and Update Site Settings V2 gap checks are present.
2. Current `system.ts` already registers only Aggregate9 with canonical 9. This review makes no registry change. Current packages are exactly 42.0.3; the 39.0.0 dependency and startup figures describe the earlier rollout only.
3. The retained `/private/tmp/qrk-plan050-vercel-stage-prebuilt.log` records a READY, production-target App artifact: deployment `dpl_EiW2HXMrsr9Q6FQ9nBdtbFdoomru` at `qrk-studio-awferab06-morganatwork.vercel.app`. Therefore the prior blanket statement that App deployment had not happened was incomplete. That log does not establish custom-domain promotion, current-line parity or final fresh-session behavior.
4. The recorded Cloudflare acceptance of backend version `495cfbd0-1a34-4e14-832d-88ad2630a765` at 709 ms remains historical evidence. No current Cloudflare/Vercel inventory or production browser session was verified in this review. GitHub's deployment list returned no records; it cannot establish the deployed App or backend versions.
5. The review required no implementation change, tests, storage operation or deployment. No reset or backup recreation should be repeated. Instagram account verification resumes separately and does not block this plan's rollout reconciliation.

## Remaining work

1. Inspect current production App/domain routing and `qrk-zerospin` deployment versions read-only. Compare the actual artifacts and session bindings with the current development line; do not revert pins to SDK 39 merely to match historical notes.
2. If a matching App/backend rollout is still required, prepare the concrete change for authorization. This review does not authorize deployment, storage deletion or registry edits. Preserve the earlier reset evidence and do not repeat deletion or recreate backups.
3. Complete final fresh-session browser verification on an authorized matching deployment, including fitting Stack insertion and refusal when contents cannot fit. Existing source, mock-session checks and startup acceptance do not prove production session behavior. Keep Plan 048's native-touch check separate.
4. Record the final routing, deployment and browser evidence, set Remaining work to None and archive this plan. The feature code is already on main; no duplicate implementation PR is needed. Any future canonical change or registration omission must be personally handwritten by the user.
