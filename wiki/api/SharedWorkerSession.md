---
title: SharedWorker Session
type: api
updated: 2026-07-28
sources:
  - path: packages/shared-worker/package.json
    sha: cd3ff7d2d4af74a497aa816f5a50cd1dd11ff74d
    lines: 8-14
  - path: packages/shared-worker/src/makeSharedWorkerSession.ts
    sha: a023286b84eb3beff92e910b5cb07d11b0e6b28e
    lines: 33-396
  - path: packages/shared-worker/src/SharedWorker/partitionSchemas.ts
    sha: 6a67722b0d866bfd019f7363612b5df4d571f030
    lines: 212-464
  - path: packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts
    sha: 491f7e4055485cd66fe9ff63449190be2fcba395
    lines: 825-9200
  - path: packages/shared-worker/src/drizzle/WaSqliteAsyncSession.ts
    sha: c73a014149c53801364bd89ef63427fef796a1a8
    lines: 225-350
  - path: packages/shared-worker/src/drizzle/migrateDbAsync.ts
    sha: 2d17530e6bf4847c486211daeaee09352a74bab1
    lines: 11-89
---

# SharedWorker Session

`@zerospin/shared-worker/makeSharedWorkerSession` is the package's single public
entrypoint
(../../packages/shared-worker/package.json:8-14).
It exports the typed main-thread transport factory plus
`AccountFrontendReplicaProviderApi`, `ServiceFrontendReplicaProviderApi`, and
`PartitionApi` from the same defining module
(../../packages/shared-worker/src/makeSharedWorkerSession.ts:33-101,
../../packages/shared-worker/src/makeSharedWorkerSession.ts:292-396).

## Provider targets

`AccountFrontendReplicaProviderApi` lets the worker request full account state,
mint a WebSocket ticket, push full staged commands, deliver a replica block, or
replace a main-thread replica state
(../../packages/shared-worker/src/makeSharedWorkerSession.ts:33-70).
`ServiceFrontendReplicaProviderApi` is deliberately read-only with respect to
server commands: it can request service state, mint a ticket, deliver a service
replica block, or replace service replica state, but has no push method
(../../packages/shared-worker/src/makeSharedWorkerSession.ts:72-98).

## Partition target

`PartitionApi` exposes separate account and service acquisition methods. Each
returns a target that can read its persisted replica state and release that
acquisition. Both requests carry the matching compiled frontend specification;
the account catalog result, rather than the acquisition request, reports source
targets for dormant-command migration
(../../packages/shared-worker/src/makeSharedWorkerSession.ts:100-146,
../../packages/shared-worker/src/makeSharedWorkerSession.ts:235-267).

The same partition target exposes account command staging/migration operations
and separate account and service replica catalogs. The service catalog reports
its pending lineage transition instead of account command-journal health
(../../packages/shared-worker/src/makeSharedWorkerSession.ts:147-290).

## Catalog and commissioning contract

The partition persists separate account and service catalog rows. Both retain
the exact target/version/spec hash, current and previous physical database
names, `commissioning | ready | failed` status, `active | commissioned` role,
logical `frontendIndex`, physical `replicaIndex`, pending transition, socket
state, and last failure. Account rows additionally retain source targets,
journal health, and write suspension; service rows are read-only and have no
command journal
(../../packages/shared-worker/src/SharedWorker/partitionSchemas.ts:212-333).

Online authority may create or resume a commissioning row from authoritative
state. Cached-offline authority can acquire only an exact ready row with a
matching compiled specification hash; it cannot create or finish a commission.
An interrupted account commission re-verifies journal ownership and
materialization before it can become healthy. An acquisition first captures a
snapshot, then opens its delivery gate and drains buffered replica blocks, so
the Provider never observes a block before its initial state
(../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:5523-7003,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:7005-7568,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:1758-1883,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:4568-4712).

Promoting a commissioned replica to active persists the catalog role before
publishing the active provider count. For account replicas, an already-online
commissioned socket also starts journal push immediately after promotion rather
than waiting for another replay event; service promotion performs the same
catalog/registration transition without a command branch
(../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:1764-1835,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:4612-4659).

## Same-generation version authority

When fresh state or a ticket reports a different frontend version in the same
generation, the old account and service replicas remain readable and continue
consuming their immutable archives under `update-required`. Service needs no
write transition because its provider is always read-only. Account handling also
marks the catalog `writeSuspended`, moves staged, pushing, and
transport-uncertain journal rows to `dormant`, and prevents further journal push;
it does not delete the source replica or command bytes
(../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:1992-2060,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:2198-2305,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:3170-3369,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:4739-4772,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:4908-4934).

## Account journal and repair

The partition-owned account command journal is the durable copy of local
intent. Each row keeps the exact source target, original contract version and
payload, source or adapted command, frontend mutations, applied mutations,
staged cursor/time, push provenance, terminal outcome, migration target, and
lifecycle from `staged` through transport uncertainty, dormancy, or migration.
It is deliberately outside every physical replica database
(../../packages/shared-worker/src/SharedWorker/partitionSchemas.ts:335-447).

`stagedAt` is stored as an integer millisecond value so full encoded-command
staging provenance round-trips across worker restart; the second-resolution
`date()` descriptor is intentionally not used
(../../packages/shared-worker/src/SharedWorker/partitionSchemas.ts:378-384).

`stageFrontendCommand`, `getDormantFrontendCommands`,
`importAdaptedFrontendCommands`, and `markFrontendCommandsMigrated` expose the
explicit local-intent and migration boundaries. They require exact source and
target locators and physical replica indexes; they do not silently reinterpret
commands for a new generation or frontend version
(../../packages/shared-worker/src/makeSharedWorkerSession.ts:147-234,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:7570-8870).

A pending transition is accepted only after the worker matches its applied
index to the catalog, rereads the replica's previous block, proves that block is
the exact source generation boundary, and validates the remaining ordered chain
through the target. The same proof is repeated before source journal rows can be
marked migrated; invalid or stale proof fails closed and retains the source
bytes
(../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:5982-6130,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:7275-7419,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:8527-8729).

When authoritative repair is required, the worker constructs a replacement
database, validates and rematerializes eligible journal commands, commits the
replacement state, and atomically repoints the catalog. The prior database name
is retained in history and is not deleted as part of acquisition or repair. A
failed rebuild leaves the prior catalog/database in place with a durable failure
(../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:825-1756).

## Async SQLite execution

Every prepared wa-sqlite operation enters one session queue, including reads,
writes, relational queries, and custom mappers. A transaction holds one outer
queue slot and gives its statements a private inner session queue, preserving
statement order without waiting recursively on the outer transaction. Commit or
rollback completes before the next operation begins
(../../packages/shared-worker/src/drizzle/WaSqliteAsyncSession.ts:225-350).

Async database opening is idempotent for both fresh and existing files:
`migrateDbAsync` creates missing tables with their configured indexes and, for
an existing table, creates only indexes absent from `sqlite_master`, all inside
the serialized async transaction boundary
(../../packages/shared-worker/src/drizzle/migrateDbAsync.ts:11-89).

## Root session

`makeSharedWorkerSession` requires a system ID, generation ID, API URL, and
publishable key. It fails when the browser lacks SharedWorker/MessagePort,
constructs the emitted worker and WASM asset URLs, opens a Cap'n Web MessagePort
session, and returns `getPartitionApi({ partitionKey })` with an Effect release
that disposes the RPC session and closes the port. Unexpected MessagePort close
uses the same idempotent disposal path, so pending RPC promises reject instead
of surviving a crashed SharedWorker; explicit release removes the listener,
disposes once, and then closes the port
(../../packages/shared-worker/src/makeSharedWorkerSession.ts:292-396).

The worker assigns one owner token per connected MessagePort. Every account and
service provider registration retains that token; disposing, closing, or
erroring one port releases only registrations owned by that port
(../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:1945-1952,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:5616-5622,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:9093-9198).

See [[ReactFrontends]] for the Config-owned main-thread consumer.
