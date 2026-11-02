# 047 — Persist Row sizing commands

**Status:** Complete; verified and archived on 2026-11-02.

## Summary

Add two commands using the existing sizing models. Width changes save every Placement weight in a Row atomically. Height changes set or clear its saved minimum. Handles, controls, and Zustand previews remain subsequent work.

## Command behavior

1. **`setRowWidthWeights({ wallId, rowId, placements: [{ placementId, widthWeight }] })`**
   - Require positive finite weights and a finite total; preserve submitted values without normalization.
   - Require each current Row Placement exactly once. Reject duplicates, missing members, and foreign Placements before recording updates.
   - Match by Placement ID; payload order does not reorder the Row.
   - Update only changed weights, atomically. An empty list is valid only for an empty Row.
2. **`setRowMinHeight({ wallId, rowId, minHeight })`**
   - Accept `null` for automatic sizing or a finite pixel minimum of at least 45.
   - Update only the target Row's minimum, preserving its identity, membership, and surrounding layout.
   - Module minimums and natural content continue to constrain rendered height.
3. Both commands verify authenticated ownership through Wall → Page → Site → User. Reject unavailable targets or changed membership without partial writes. Identical values produce no model operations.

```ts
setRowWidthWeights({
  wallId,
  rowId,
  placements: [
    { placementId: firstId, widthWeight: 2 }, // 1. Relative preference.
    { placementId: secondId, widthWeight: 1 }, // 2. Saved in the same transaction.
  ],
});

setRowMinHeight({ wallId, rowId, minHeight: null }); // 3. Restore automatic height.
```

## Implementation

1. Add concrete, browser-safe V1 contracts using existing command conventions, inline schemas, declared failures, and named `Effect.fn` programs. Add no shared wrappers or named types.
2. Introduce Web Actor V8 and User V8. Retain existing model versions, selections, authentication, and commands; add the sizing commands. Register V8 as canonical while preserving retained releases.
3. Update the App session to owner/actor V8 and expose both commands. Existing layout and snapshot code already consume these fields.
4. At implementation start, save this plan under `wiki/plans/047-plan-row-sizing-commands.md`. Update affected documentation after verification, archive the completed plan, and open a ready PR.

Legend: `+` create; `~` modify.

```text
apps/zerospin/src/
├── aggregates/user/
│   ├── + UserV8.ts
│   ├── actors/+ userActorV8.ts
│   └── contracts/wall/
│       ├── + SetRowWidthWeightsV1.ts
│       └── + SetRowMinHeightV1.ts
└── ~ system.ts
apps/zerospin/test/~ placementMoves.spec.ts
apps/app/zerospin/~ userSessionDefinition.ts
wiki/
├── plans/+ 047-plan-row-sizing-commands.md
└── ~ brick-layout-conventions.md
```

## Verification and delivery

1. Extend the existing harness tests with command-created fixtures: atomic weight updates, explicit height and automatic reset, unchanged siblings/breakpoints, and preservation through moves.
2. Cover malformed values, duplicate/incomplete/foreign membership, deleted targets, and ownership refusals; assert no partial changes.
3. Publish a snapshot after sizing and verify it contains the saved geometry. Keep harness fixture claims distinct from authentication coverage.
4. Run backend tests, App typecheck/build, and a focused session-load check for V8 bindings.
5. Preserve storage and concurrent work. No framework release, backfill, reset, production deployment, or UI controls are required.

## Implementation and verification evidence

[PR #50](https://github.com/morgs32/qrk.sh/pull/50) is ready for review.

1. Added concrete browser-safe `setRowWidthWeightsV1` and `setRowMinHeightV1` contracts. Payload codecs reject malformed scalar sizing; programs verify ownership/current Row membership, check finite weight totals, record only changed values, and preserve submitted weights without normalization. No new shared wrappers, named types, dependencies, model versions, or framework release were introduced.
2. Added User V8/Web Actor V8, retained existing selections/authentication/model bindings and all V3–V7 releases, selected canonical V8, and exposed both commands through the App V8 session definition.
3. `pnpm nx run @qrk.sh/zerospin:test` passed all 17 tests across four files, including the new command-created sizing scenario. It covers atomic weights and saved order, explicit/fractional/minimum/automatic heights, unchanged sibling/breakpoint resources, no-op timestamps, duplicate/incomplete/foreign/stale membership, finite-total overflow, malformed inputs through the SDK encoding boundary, ownership refusal, deletion, move preservation, and published V3 geometry. Captured harness claims verify authored behavior rather than credential authentication or distributed admission.
4. App `tsc --noEmit` and the Nx App production build passed. A focused runtime probe initialized the actual V8 mock aggregate session, checked exact command bindings, staged both commands against missing targets and received their authored refusals without losing readiness, then disposed successfully. This ran under Node with the shipped SQLite WASM and a file-URL fetch adapter; probe files are under `/private/tmp/qrk-plan047/apps/zerospin/tmp/plan047-session-load.*` and its passing output is `/private/tmp/plan047-session-load.log`. The browser-control transport was unavailable, so this evidence establishes session initialization/staging rather than rendered UI behavior. No product UI changed.
5. Updated Brick layout/persistence conventions and reconciled the existing glossary, whose sizing terminology remains accurate. No implemented decision required a new ADR. Source work is isolated in `/private/tmp/qrk-plan047` on `codex/row-sizing-commands`; original source/configuration, servers, and storage remain preserved. No reset, backfill, deployment, live provider test, resizing controls, or preview store was added.

## Remaining work

None.
