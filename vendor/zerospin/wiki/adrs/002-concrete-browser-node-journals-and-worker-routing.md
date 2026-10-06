# Concrete browser Node journals and worker routing

**Date:** 2026-10-05
**Status:** Accepted
**Implementation:** [Archived plan 040](../archive/plans/040-plan-live-command-synchronization.md) and [session row cutover plan 041](../archive/plans/041-plan-session-command-index.md).

## Context

Aggregate and service sessions consume different owner identities and terminal checkpoints. A single Node journal obscured those boundaries with generic identity fields and command wrappers. Replacing a reconnecting projection from a newer snapshot also erased a tab's observed history and could cover a pending local result before its terminal occurrence arrived. A command ID alone cannot identify retained history because the same original ID can occur at distinct execution positions.

## Decision

Implement independent `AggregateNode` and `ServiceNode` schemas, journals, authentication integration, synchronization, and recovery. Keep one application worker entry. Shared RoutePattern declarations construct and parse `/zerospin/aggregate/:sharedWorkerVersion/:sessionKey` and `/zerospin/service/:sharedWorkerVersion/:sessionKey`. Validate the name before accepting ports, select the concrete initializer once, and independently verify the complete attachment identity.

Each Node journal row has a stable `journalIndex` independent of command ID. Local acceptance allocates one `nodeIndex`; every retained Node row mutation receives a durable `changeIndex`. Each aggregate or service session row instead uses its own stable `sessionIndex`, allocated from one retained `nextSessionIndex` sequence for local staging and received commands alike. Updates preserve that position, and restored session history preserves its allocator across live session identity changes. Terminals are flat concrete commands carrying the appropriate numeric owner watermark and execution position/hash. Deduplicate by execution position, preserve every distinct occurrence, and keep the originating submission's first terminal result. Resource application, row allocation, journal mutation, settlement, and checkpoints commit together before publication.

A fresh Node installs one authenticated baseline. Initialized Nodes resume committed execution and contiguous originating outcome cursors. Fresh tabs capture resources, unresolved staged input, checkpoints, and their starting change cursor within one Node serialization boundary. Existing tabs resume `afterChangeIndex`, import bounded direct arrays transactionally, and retain their resource tables and observation history. Conflicts block synchronization while preserving storage.

## Alternatives

A generic Node runtime shares more orchestration but requires domain discriminators, generic identity fields, and branches wherever aggregate and service checkpoints differ. Separate application worker entry files expose that runtime choice to every application and can drift from the framework's name parsing. Snapshot replacement simplifies reconnection but loses observation history and requires another pending-outcome reconciliation boundary. Command-ID primary keys collapse repeated execution occurrences; an in-memory broadcast queue loses slow subscribers' recovery progress.

## Consequences

The concrete runtimes duplicate domain orchestration while sharing SQLite, canonical hashing, serialization, storage opening, and RPC primitives. Applications retain one worker entry, and worker names select isolated concrete runtimes. Persistent journal identities and independent replay cursors are a storage contract: this pre-release cutover requires empty storage, with no compatibility decoder, translation migration, or automatic deletion. Reversing it would require a new persistent history model and coordinated client/server cutover. History pruning remains separate work.

- [`AggregateNode.ts`](../../packages/core/src/AggregateNode/AggregateNode.ts), [`ServiceNode.ts`](../../packages/core/src/ServiceNode/ServiceNode.ts) — concrete journal ownership and atomic publication.
- [`sharedWorkerNames.ts`](../../packages/browser/src/sharedWorkerNames.ts), [`makeSharedWorker.ts`](../../packages/browser/src/makeSharedWorker.ts) — route construction, strict parsing, and runtime selection.
- [Browser bootstrap](../architecture/browser/bootstrapBrowserSession.md), [session replay](../architecture/browser/SessionWebSocket.md) — identity admission and incremental recovery.
