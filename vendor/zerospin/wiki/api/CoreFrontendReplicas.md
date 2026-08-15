---
title: Core Frontend Replica Contracts
type: api
updated: 2026-08-11
---

# Core Frontend Replica Contracts

`@zerospin/core` defines separate browser state and replica envelopes for
writable aggregate frontends and read-only service frontends. Authoritative
state carries the logical target and monotonic `frontendIndex`; SharedWorker to
main-thread replica envelopes add the exact aggregate/service lock key and
worker-owned `replicaIndex`. Neither wire boundary exposes `generationId`,
`systemWorkerName`, or deploy identity
([`session/types.ts:70-159`](../../packages/core/src/session/types.ts#L70-L159),
[`serviceSession/types.ts:18-52`](../../packages/core/src/serviceSession/types.ts#L18-L52)).

## Aggregate frontend contracts

`IAggregateFrontendSyncState` is the complete server-owned state used for
replica creation and repair. It carries `{ aggregateId, aggregateName, userId,
frontendName }`, `systemId`, `systemVersion`, `frontendIndex`, projected
resources, the rebase watermark, and complete pending, executed, and failed
pushed-command collections
([`session/types.ts:83-97`](../../packages/core/src/session/types.ts#L83-L97)).

`IAggregateFrontendReplicaState` adds `aggregateFrontendLockKey`,
`replicaIndex`, staged and failed-staged commands, and already-applied
optimistic mutations. `IAggregateFrontendReplicaBlock` is the union of:

1. `server`, which carries the exact target, lock key, replica/frontend
   indexes, and one canonical `IAggregateFrontendBlock`.
2. `local-command`, which carries the same envelope plus the resource delta and
   complete command-journal additions/removals.

The schemas use the same aggregate-qualified names; the internal block leaf
remains receiver-local `frontendBlock`
([`session/types.ts:99-159`](../../packages/core/src/session/types.ts#L99-L159),
[`AggregateFrontendBlockSchema.ts:33-130`](../../packages/core/src/session/AggregateFrontendBlockSchema.ts#L33-L130)).

## Service frontend contracts

`IServiceFrontendState` carries `{ serviceName, userId, frontendName }`,
`systemId`, `systemVersion`, `frontendIndex`, and projected resources.
`IServiceFrontendReplicaState` adds `serviceFrontendLockKey` and
`replicaIndex`; `IServiceFrontendReplicaBlock` carries the same exact target,
lock key, indexes, and one service frontend block. Service replica contracts
contain no aggregate command journal or optimistic mutations
([`serviceSession/types.ts:18-52`](../../packages/core/src/serviceSession/types.ts#L18-L52)).

## Application boundaries

`applyAggregateFrontendReplicaState` schema-encodes the replacement, validates
the exact System/aggregate/user/frontend/lock-key target, checks every resource,
command, and optimistic mutation, then replaces authoritative rows while
preserving unrelated local intent and replaying its encoded operations in one
transaction
([`applyAggregateFrontendReplicaState.ts:42-213`](../../packages/core/src/session/applyAggregateFrontendReplicaState.ts#L42-L213),
[`applyAggregateFrontendReplicaState.ts:215-418`](../../packages/core/src/session/applyAggregateFrontendReplicaState.ts#L215-L418)).

`applyAggregateFrontendReplicaBlock` validates the same exact target and lock
key, requires contiguous `replicaIndex`, proves equal-index duplicates by exact
encoded bytes, and applies different frontend-index rules for `server` and
`local-command` blocks. Server application rewinds local overlays, applies the
canonical delta and lifecycle result, then replays remaining local intent
([`applyAggregateFrontendReplicaBlock.ts:47-159`](../../packages/core/src/session/applyAggregateFrontendReplicaBlock.ts#L47-L159),
[`applyAggregateFrontendReplicaBlock.ts:161-573`](../../packages/core/src/session/applyAggregateFrontendReplicaBlock.ts#L161-L573),
[`applyAggregateFrontendReplicaBlock.ts:576-960`](../../packages/core/src/session/applyAggregateFrontendReplicaBlock.ts#L576-L960)).

`applyServiceFrontendReplicaState` and
`applyServiceFrontendReplicaBlock` perform the parallel service target/lock
checks. Service blocks require both the next `replicaIndex` and the next
`frontendIndex`
([`applyServiceFrontendReplicaState.ts:16-89`](../../packages/core/src/serviceSession/applyServiceFrontendReplicaState.ts#L16-L89),
[`applyServiceFrontendReplicaBlock.ts:16-147`](../../packages/core/src/serviceSession/applyServiceFrontendReplicaBlock.ts#L16-L147)).

## Readable failure state

Initialized aggregate and service session states retain their database,
identity, lock key, and indexes when `workerState.status` becomes `failed`;
`workerState.failure` carries the encoded terminal error. Failure is readable
session state rather than a replacement envelope or an uninitialized state
([`session/types.ts:161-246`](../../packages/core/src/session/types.ts#L161-L246),
[`serviceSession/types.ts:54-89`](../../packages/core/src/serviceSession/types.ts#L54-L89)).
