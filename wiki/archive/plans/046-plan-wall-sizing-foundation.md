# 046 — External contract upgrades and Wall sizing foundation

**Status:** Complete; verified and archived on 2026-11-02.

## Summary

1. Add external contract upgrades to Zerospin, including implementation inheritance and explicit `up`/`down` adaptation of retained continuation input.
2. Release the framework packages locally, then adopt them in QRK.
3. Persist proportional Placement widths and Row minimum heights, and apply them to automatic layout and publication snapshots.
4. Keep resize handles, sizing controls, sizing commands, and Zustand preview state for subsequent work.
5. Preserve concurrent work in both repositories. No storage reset or production deployment is authorized by this plan.

## Zerospin interface and execution

1. Add backend-only `upgradeAggregateExternalContractRelease` and `upgradeServiceExternalContractRelease`. Both take a canonical predecessor and props containing the next pure `definition`, model/operation patches, optional implementation overrides, and optional `up`/`down`.
2. The pure definition owns name, version, payload, response codec, timeout, and emission descriptor. Require matching family/name, a distinct valid version, one successor, and an unfinalized predecessor.
3. Inherit omitted request, guard, program, result, and failures. Construct a new evaluator using the new bindings; do not invoke the predecessor evaluator or expose its private program.
4. Link `.previous`/`.next` for declaration discovery and finalization. Keep external pair adapters under external metadata, separate from ordinary payload-only adapters. Each edge owns its adapters; they are not inherited.
5. Adapters receive and return decoded `{ payload, externalOutcome }`. Omitted `up` means identity followed by destination validation. Omitted `down` means unsupported reverse conversion.

   ```ts
   up: Effect.fn("renderV3.up")((props) => {
     const { payload, externalOutcome } = props;
     return Effect.succeed({
       payload,
       externalOutcome:
         externalOutcome._tag === "Success"
           ? {
               ...externalOutcome, // 1. Preserve observation metadata.
               success: {
                 document: { html: externalOutcome.success.html }, // 2. Convert domain data.
               },
             }
           : externalOutcome, // 3. Preserve infrastructure failure evidence.
     });
   }),
   ```

6. Source-decode a detached view of retained input once. Traverse declared edges and validate every destination's decoded payload and response shapes. Do not rerun wire-codec transformations on adapted values.
7. Preserve `_tag`, the instant represented by `recordedAt`, and infrastructure failure fields. Snapshot these before invoking an adapter so in-place mutation is detected. Business refusals inside `Success.success` remain adaptable domain data.
8. Centralize this processing in `decodeAndAdaptExternalCommandInput`, called by aggregate and service external preparation. Preparation accepts the resolved source contract; same-version calls use their current contract.
9. Replace runtime resolvers' source-decode/discard and destination raw-decode sequence. Cross-version execution requires authored lineage; remove implicit conversion between unrelated declarations and update affected fixtures.
10. Missing edges, failed adapters, invalid output, or envelope changes stop evaluation before model operations. Preserve existing per-release failure-recording semantics. Retained command bytes and provider observations remain unchanged; replay sends no provider requests.
11. Changed formats may require new request, guard, or program callbacks. Adapters convert historical input; they do not make incompatible inherited callbacks valid for fresh requests.

## QRK sizing foundation

1. Add Placement V2 with required numeric `widthWeight`. Initialize it explicitly from the selected module variant's positive, finite `defaultWidth`. Treat it as a relative preference after creation.
2. Add Wall V2 with a versioned layout schema whose Rows require `minHeight`: `null` or a finite pixel value of at least `45`. Use concrete V2 structural helpers; preserve schemas and behavior referenced by retained releases.
3. Initialize new Rows with `minHeight: null`. Preserve Placement weights on moves and Row minimums while their Rows survive. Removing a Row removes its height setting.
4. For horizontal layout, use zero flex basis and growth proportional to normalized weights. Preserve module minimum widths and gap insets. Minimums may override ideal proportions; insufficient width retains horizontal overflow.
5. For vertical layout, use the tallest module preferred height when `minHeight` is null. An explicit minimum replaces that preference while respecting module minimums and the shared 45px floor. Content may grow the Row; all Brick surfaces stretch with it. Measure the minimum against visible surfaces, with gaps outside it.
6. Apply prospective sizing to insertion shadows while preserving existing drag-preview identity, selection, targeting, and cancellation behavior. Catalog and native pointer previews retain module sizing.
7. Introduce User V7/Web Actor V7 with exact new model bindings. Upgrade directly affected commands, generation continuation, selections, and App session bindings. QRK's external request/response formats remain unchanged, so its external upgrade uses identity forward adaptation.
8. Add PageSnapshot V3 containing Placement weights and Row minimums. Use its builder for publication and saved-versus-published comparison. Public website rendering remains deferred.
9. Reconstruct V7 through retained commands without resetting storage or directly backfilling rows. Recheck active history before rollout; planning inspected 14 successful commands and no retired generic `movePlacement` commands.

## Planned files

Legend: `+` create; `~` modify. Braces enumerate individual files.

```text
/Users/morgs32/GitHub/zerospin/
├── packages/core/src/contracts/
│   ├── + make/upgrade{Aggregate,Service}ExternalContractRelease.ts
│   ├── + decodeAndAdaptExternalCommandInput.ts
│   ├── ~ make/constructContractRelease.ts
│   ├── ~ externalContract.ts
│   └── ~ prepare/prepare{Aggregate,Service}ExternalInvocation.ts
├── packages/sdk/src/~ index.ts
├── packages/system-worker/src/
│   ├── AggregateVersionRepo/utils/~ resolveAggregateExecution.ts
│   └── ServiceVersionRepo/utils/~ resolveServiceExecution.ts
├── packages/core/tests/~ {contracts.typecheck.ts,receipt-delivery.spec.ts}
├── packages/system-worker/tests/
│   └── ~ existing aggregate-adapter and service-external replay tests/fixtures
├── fragment/content/~ external-work, versioning, and SDK reference pages
├── packages/sdk/skills/~ declaration-evolution and external-work guidance
└── wiki/architecture/server/~ affected external execution and recovery docs

/Users/morgs32/GitHub/qrk.sh/
├── apps/zerospin/src/
│   ├── aggregates/user/
│   │   ├── + UserV7.ts
│   │   ├── actors/+ userActorV7.ts
│   │   ├── models/{wall/+ WallV2.ts,placement/+ PlacementV2.ts}
│   │   ├── models/pageSnapshot/+ PageSnapshotV3.ts
│   │   ├── layout/+ {wallLayoutSchemaV2.ts,wallLayoutV2.ts}
│   │   ├── snapshots/+ {pageSnapshotSchemaV3.ts,makePageSnapshotV3.ts}
│   │   └── contracts/+ next directly affected declaration versions
│   ├── modules/~ make/makeModuleVersion.ts
│   └── ~ system.ts
├── apps/app/
│   ├── zerospin/~ userSessionDefinition.ts
│   ├── modules/lib/wall/~ {WallEditor.tsx,WallPlacement.tsx,makeWallLayoutView.ts}
│   ├── modules/~ bricks.css
│   ├── components/~ WallEditor.stories.tsx
│   ├── modules/lib/wall/~ WallPlacement.stories.tsx
│   └── app/[username]/site/[siteId]/page/[pageId]/(drawer)/
│       └── ~ {DrawerHeader.tsx,PublishSiteDialog.tsx}
├── apps/zerospin/test/~ placementMoves.spec.ts
├── ~ affected manifests and pnpm-lock.yaml
└── wiki/~ glossary.md, brick-layout conventions, and affected module docs
```

## Verification and delivery

1. Extend existing framework tests to cover both upgrade families, inferred adapter inputs/outputs, callback inheritance with new bindings, lineage finalization, and immutable predecessor specifications.
2. Exercise forward and reverse conversion with a transforming response codec. Verify missing `down`, adapter failure, invalid destination data, and envelope mutation are rejected before model changes.
3. Use existing aggregate/service Workerd replay seams to prove adaptation uses retained evidence and makes no additional provider requests. Preserve their existing outcome/checkpoint behavior.
4. Verify QRK command-created sizing defaults, movement/deletion preservation, and snapshot geometry through the existing harness. Use trusted fixture claims without claiming authentication coverage.
5. Extend Storybook checks across all breakpoints: proportional filling, minimum-width overflow, automatic and explicit Row minimums, taller content, gaps, card surfaces, and shadow/drop/cancel regressions.
6. Run scoped framework Nx library/type/lint and focused tests, then QRK backend tests, App build/typecheck, affected Storybook scenarios, and a real browser reload/reconstruction check. Keep provider calls mocked.
7. Publish the next minor fixed-group release, expected `38.2.0` from `38.1.1`, from a clean committed checkout to the existing local registry. Update QRK exact pins and lockfile, verify frozen installation, and reload installed Intent guidance.
8. After implementation, reconcile the glossary and affected documentation. Create an ADR only for an implemented decision meeting the agreed criteria. Archive this plan and open ready-for-review PRs in both repositories.

## Outcome and verification

[QRK PR #49](https://github.com/morgs32/qrk.sh/pull/49) and [Zerospin PR #113](https://github.com/morgs32/zerospin/pull/113) are ready for review. Implementation used isolated worktrees at `/private/tmp/qrk-plan046` and `/private/tmp/zerospin-plan046`.

1. Implemented backend-only Aggregate and Service external upgrades, edge-local decoded continuation adapters, inherited implementations with new bindings, request compatibility checks, canonical lineage, and source-aware preparation. Historical wire inputs and provider evidence remain unchanged. Published all 20 fixed-group packages as `38.2.0` from clean commit `46b24cb8a5`; [Zerospin PR #113](https://github.com/morgs32/zerospin/pull/113) is ready for review.
2. Framework verification passed the full test typecheck, nine core receipt-delivery tests, 34 Aggregate/Service Workerd tests, all 19 available fixed-group library targets, and scoped Core/System Worker lint targets. Existing unrelated lint warnings remain. Tests cover transforming codecs, forward/reverse adaptation, missing `down`, adapter/output/envelope rejection, callback inheritance, finalization, and unchanged provider request counts.
3. QRK now uses exact `38.2.0` pins and a package-manager-generated lockfile. Frozen installation passed and installed Intent guidance was reloaded. User V7/Web Actor V7 bind Wall V2, Placement V2, and PageSnapshot V3 with new directly affected contract releases; retained releases remain intact. The backend test target passed all 16 tests across four files, including creation defaults, move/deletion preservation, and publication geometry. These harness cases use trusted fixture claims and do not establish authentication coverage.
4. The App fills Rows with normalized zero-basis flex weights, retains module width minimums and overflow, uses automatic or explicit visible-surface height minimums, and stretches Brick surfaces through natural content growth. Insertion shadows use prospective geometry; the empty-Wall shadow includes the outside half-gap allowance. Catalog and native previews keep their existing sizing.
5. Browser checks passed SizingFoundation and SizingFoundationWithGaps at all four breakpoints; EqualHeightRowsWithGaps, ShadowStability, CrossRowMovesWithGaps, RowReorderWithGaps, PlacementBrick, ShadowBrick, and the new ShadowBrickEmptyWallWithGaps. A real pointer drag moved a Brick between Rows. PreviewBrick passed after updating its retained catalog sizing expectations; explicit minimum-width checks prove a 160px Swatch and 320px Figma shadow overflow the sm Row rather than shrinking below their module minimums.
6. Rechecked the original live history before rollout: it had advanced from the planning inspection's 14 commands to 21 successful commands. It contains no retired generic `movePlacement` or external continuations. A consistent, read-only SQLite backup copied this current state into an isolated Worker. A typed V7 query triggered real reconstruction to head 21, yielding four Walls, twelve Placements, and three Bricks. All row minimums are null; eight weights are 240 and four are 360. Command identities, retained input bytes, finalized instants, topology, and content are preserved; provider and V7 publication outboxes are empty. Older-release missing-down errors also occur in original logs and do not affect V7 reconstruction.
7. The isolated real App authenticated, opened this reconstructed page, and reloaded successfully at sm/md/lg/xl (xl used a temporary 2000px browser viewport, then reset). At lg, the 240:360 Row renders 432px:648px with equal 360px surfaces; singleton Rows fill 1080px. Only ignored isolated development configuration was matched to the isolated App origin. Original application configuration, servers, and storage remain unchanged. Verification evidence is at `/private/tmp/plan046-reconstruction-evidence.json`; screenshot: `/Users/morgs32/.codex/visualizations/2026/11/02/01a1999a-439f-7353-a9f1-5a61a92ca4e0/wall-sizing-reconstructed.jpg`.
8. Updated the glossary, Brick layout conventions, module documentation, SDK/Fragment guidance, and affected upstream execution/recovery documentation with refreshed source citations. No new ADR met the additional criteria. Resize handles, controls, sizing commands, Zustand preview state, and public website rendering remain subsequent work as planned. No storage reset, backfill, production deployment, or live provider test was performed.

## Remaining work

None.
