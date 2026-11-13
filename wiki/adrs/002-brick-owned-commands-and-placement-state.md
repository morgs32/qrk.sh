# 002: Brick-owned commands and Placement state

**Status:** Accepted; implemented in source and accepted by the fresh local System. Production publication remains unverified.  
**Date:** 2026-11-13  
**Plan:** [089 — Brick-Owned Commands and Text Brick](../archive/plans/089-plan-text-brick.md)

## Context

All Brick types shared generic add and update commands. Adding Text exposed the coupling between module-specific state validation, shared model revisions, arbitrary generated Placement specs, and version-specific callback types. Text also needs one shared content block with independently chosen typography at each breakpoint.

A Placement changes independently at each breakpoint, while the Brick's content stays shared. A publication must capture the appearance selected at publication time. The current development data and retained command history could be reset for this cutover; production storage is a separate, unconfirmed operation.

## Decision

Keep one Page-owned Brick model with a closed module ID list. Each module owns concrete add and update commands and validates its own content. Each add records its Brick and calls the shared Wall insertion Effect to record all four breakpoint Placements and Wall changes in the same command batch. Wall movement remains shared.

`Brick.state` holds shared content. `Placement.state` holds module-owned breakpoint settings, and `Placement.layoutId` selects a Brick-defined layout. The Text module stores font family and pixel size on each Placement. The editor renders module-owned layouts with separate Brick and Placement state namespaces. Each published snapshot records the Brick content, Placement settings, and resolved layout spec.

Bricks owns the shared QRK model declarations and module commands. The App passes its actual session through context; each module stages its own command. Generic stored-spec generation and editing are retired for the fresh graph. Storybook retains separate spec-generation tooling.

## Consequences and alternatives

A new Brick adds commands and registrations, but its guards and state validation stay with the module. The shared Wall insertion function preserves one atomic operation and repeats eligibility checks against current state. Placing typography on the shared Brick would force the same typography at every breakpoint; storing arbitrary per-Placement specs would retain a second editing and validation surface.

The new V1 graph reuses the existing System identity and is incompatible with the prior retained User declaration history. The user explicitly approved retiring the old registrations and wiping the local development store. No production reset or migration is implied. Local runtime and production publication evidence remain separate from source and harness tests.

This decision supersedes the Placement spec, revision, and generation-state details in [ADR 001](001-wall-owned-layout-tree.md). ADR 001 continues to govern the Wall-owned layout tree and its structural operations.

## Source

1. [Fresh Brick and Placement models](../../apps/bricks/src/zerospin/models/brick/BrickV1.ts), [Placement](../../apps/bricks/src/zerospin/models/placement/PlacementV1.ts).
2. [Wall insertion](../../apps/bricks/src/zerospin/wall/insertBrickInWall.ts), [Text commands](../../apps/bricks/src/modules/text/commands/AddTextBrickV1.ts), [fresh snapshot producer](../../apps/zerospin/src/fresh/makePageSnapshotV1.ts).
3. [Brick session context](../../apps/bricks/src/modules/react/BrickSessionContext.tsx), [fresh User release](../../apps/zerospin/src/fresh/userAggregateV1.ts).
