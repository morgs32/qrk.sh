---
title: Core Frontend Replica Primitives
type: api
updated: 2026-07-28
sources:
  - path: packages/core/package.json
    sha: ff68dfce824266c8cdea060f7a2509e9eacca27b
    lines: 8-43
  - path: packages/core/src/serviceSession/ServiceFrontendBlockSchema.ts
    sha: 6030e7a47e3f51d660784bfb4bb7b65e40b57911
    lines: 20-111
  - path: packages/core/src/serviceSession/types.ts
    sha: fb75ac2e4d3403492656f4ef66b5245af49eb60f
    lines: 19-193
  - path: packages/core/src/serviceSession/makeServiceSession.ts
    sha: c1b664b533aee7a8b069ed854ed9e561ee6b81ff
    lines: 13-128
  - path: packages/core/src/serviceSession/applyServiceFrontendState.ts
    sha: 693acffcff00f6b854a214e8754ab76c15b9d409
    lines: 14-127
  - path: packages/core/src/serviceSession/applyServiceFrontendBlock.ts
    sha: 003e8de3391ed1f83bd2d6985a8284b1952e4939
    lines: 16-153
  - path: packages/core/src/frontendController/makeFrontendSpecHash.ts
    sha: 4d2acd770b09519980514b42a69dc13a8dd2c795
    lines: 4-56
  - path: packages/core/src/session/applyFrontendLineageBlock.ts
    sha: bc970edcc8dac4830b1513b26146312c8d14f59f
    lines: 1-541
  - path: packages/core/src/session/FrontendBlockSchema.ts
    sha: 1e89909f0ae513bf51d05deb2de18cbcee20fe0f
    lines: 31-180
  - path: packages/core/src/session/types.ts
    sha: 7198ef0e0cf4f350e51ec075d8ce8e75a1ecc2d6
    lines: 68-212
  - path: packages/core/src/session/applyFrontendReplicaState.ts
    sha: d36160f3dfa5e61f6df3809b9dcb37f2d129c69f
    lines: 23-343
---

# Core Frontend Replica Primitives

The core package's wildcard export makes each schema, type, session factory,
and application Effect below available at its defining deep import path
(../../packages/core/package.json:39-43).

## Account wire surface

`session/FrontendBlockSchema` and `session/types` define account sync state,
the durable worker replica state including staged and pushed local intent,
ordinary lineage blocks, explicit generation-boundary blocks, server and local
command replica blocks, and the transition-required control. Every envelope
carries the complete system/generation/account/actor/frontend identity; the
logical server `frontendIndex` remains distinct from the physical worker
`replicaIndex`
(../../packages/core/src/session/FrontendBlockSchema.ts:31-180,
../../packages/core/src/session/types.ts:68-212).

## Service wire and session surface

`serviceSession/ServiceFrontendBlockSchema` exports schemas for full frontend
state, resource-delta blocks, generation boundaries, lineage blocks, persisted
replica state/blocks, and the lineage-transition control. Every lineage and
replica envelope carries complete service/actor/actor-ID/frontend identity
(../../packages/core/src/serviceSession/ServiceFrontendBlockSchema.ts:20-111).

`serviceSession/types` defines the corresponding wire shapes plus the
initialized/uninitialized service-session store states. Initialized state keeps
the bound identity, database, frontend index, nullable replica index, worker
mode/status, bootstrap source, and telemetry collector
(../../packages/core/src/serviceSession/types.ts:19-97,
../../packages/core/src/serviceSession/types.ts:99-193).

`serviceSession/makeServiceSession` creates that store in either
`shared-worker` or `direct` mode, initializes it in `authenticating`, and exposes
`onInitialized`, which fires immediately for ready state or once when the store
first becomes initialized
(../../packages/core/src/serviceSession/makeServiceSession.ts:13-128).

## Replica application Effects

| Import path                                               | Behavior                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zerospin/core/serviceSession/applyServiceFrontendState` | Validates complete bound identity and every declared-model resource before replacing the projection rows in one SQLite transaction (../../packages/core/src/serviceSession/applyServiceFrontendState.ts:14-30, ../../packages/core/src/serviceSession/applyServiceFrontendState.ts:43-127).                                                                          |
| `@zerospin/core/serviceSession/applyServiceFrontendBlock` | Requires the exact target and next frontend index, validates every resource/ref, and applies the complete delta in one transaction (../../packages/core/src/serviceSession/applyServiceFrontendBlock.ts:16-29, ../../packages/core/src/serviceSession/applyServiceFrontendBlock.ts:39-153).                                                                          |
| `@zerospin/core/session/applyFrontendLineageBlock`        | Applies account lineage separately: it validates the archived target and exact next index, treats boundaries as lineage rather than resource deltas, then rewinds local overlays, applies the authoritative resource and command lifecycle state, and replays stored encoded optimistic mutations without rerunning contracts (../../packages/core/src/session/applyFrontendLineageBlock.ts:1-10, ../../packages/core/src/session/applyFrontendLineageBlock.ts:73-253, ../../packages/core/src/session/applyFrontendLineageBlock.ts:255-539). |
| `@zerospin/core/session/applyFrontendReplicaState`        | Replaces a main-thread account session from the fully materialized worker replica, validating target identity, resources, every command lifecycle row, and optimistic mutation material without re-executing application contracts (../../packages/core/src/session/applyFrontendReplicaState.ts:23-343).                                                            |

Account replica replacement treats `systemVersion` as retained snapshot and
command provenance, not as a second physical target key: it still requires the
exact system, generation, worker, account, actor, frontend, and compiled
frontend version before replacing state. Direct lineage application follows the
same compatible-version rule while preserving every command's original
`systemVersion`
(../../packages/core/src/session/applyFrontendReplicaState.ts:30-114,
../../packages/core/src/session/applyFrontendLineageBlock.ts:1-10,
../../packages/core/src/session/applyFrontendLineageBlock.ts:82-153,
../../packages/core/src/session/applyFrontendLineageBlock.ts:255-539).

## Deterministic specification identity

`@zerospin/core/frontendController/makeFrontendSpecHash` recursively orders
object keys while preserving array order, hashes the canonical JSON with
SHA-256, and returns lowercase hexadecimal. Account and service frontend specs
therefore share one deterministic comparison primitive
(../../packages/core/src/frontendController/makeFrontendSpecHash.ts:4-56).

See [[ServiceFrontendProjection]] for the server-side producer of the service
state and lineage blocks.
