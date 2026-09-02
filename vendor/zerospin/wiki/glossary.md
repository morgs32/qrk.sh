---
title: Glossary
updated: 2026-09-01
---

# Glossary

## System

The authored application definition produced by `makeSystem`: authentication,
aggregate and service models, contracts, queries, selections, and frontend
controllers. `system.version` is application/format metadata; it does not select
runtime code or a database namespace.

- [`system.ts:23-116`](../examples/shopping/src/zerospin/system.ts#L23-L116) — defines the Shopping System and its current version.

## systemId

The `sys_`-prefixed deployment identifier supplied by Worker configuration. It
keys the singleton SystemRepo and is the first identity field for every direct
Repo.

- [`SystemRepo.ts:65-89`](../packages/system-worker/src/SystemRepo/SystemRepo.ts#L65-L89) — addresses the singleton SystemRepo by the decoded configured system id.
- [`AggregateCommandChain.ts:32-47`](../packages/system-worker/src/AggregateCommandChain/AggregateCommandChain.ts#L32-L47) — includes `systemId` in aggregate-chain instance identity and configures one fixed schema.

## Repo

A direct Durable Object class that owns one keyed database, durable boundary,
and its deferred work. The static runtime has SystemRepo, five command chains,
four materialized domain Repos, and SystemLogRepo.

- [`types.ts:36-47`](../packages/core/src/system/types.ts#L36-L47) — enumerates the eleven registered Repo kinds.
- [`Worker.ts:8-19`](../examples/shopping/src/Worker.ts#L8-L19) — exports every direct Repo class from a static Worker.

## SystemRepo

The singleton Repo keyed by `{ systemId }`. It owns aggregate IDs, Repo
registrations, and single-use frontend WebSocket tickets; it also routes
WebSocket traffic to finalized command chains and SystemLogRepo.

- [`SystemRepoDbConfig.ts:8-89`](../packages/system-worker/src/SystemRepo/SystemRepoDbConfig.ts#L8-L89) — defines frontend-ticket, aggregate, and Repo-registration tables.
- [`SystemRepo.ts:185-339`](../packages/system-worker/src/SystemRepo/SystemRepo.ts#L185-L339) — exposes aggregate lookup, one-time ticket, and Repo-catalog operations.
- [`fetch.ts:46-205`](../packages/system-worker/src/SystemRepo/fetch/fetch.ts#L46-L205) — routes system logs and both singular finalized-command sockets.

## GatewayApi

The Worker-hosted root capability with exactly three public getters:
`getSystemApi`, `getAggregateFrontendApi`, and `getServiceFrontendApi`.

- [`GatewayApi.ts:27-74`](../packages/system-worker/src/GatewayApi/GatewayApi.ts#L27-L74) — defines the complete public Gateway surface.

## SystemApi

The secret-key child capability bound to `{ systemId }`. It serves the System
spec, aggregate/service queries, singular aggregate/service command
finalization, Repo inspection, and health checks through statically imported
System Worker Effects.

- [`SystemApi.ts:57-78`](../packages/system-worker/src/SystemApi/SystemApi.ts#L57-L78) — binds the capability to `systemId` and exposes its health check.
- [`SystemApi.ts:119-164`](../packages/system-worker/src/SystemApi/SystemApi.ts#L119-L164) — accepts one aggregate or service command per finalization call.

## AggregateFrontendApi

The independently disposable child capability bound to `{ systemId,
aggregateId, aggregateName, userId, frontendName, aggregateFrontendLock }`. It
serves state, finalized and pushed history, tickets, queries, and singular
command push through statically imported System Worker Effects.

- [`getAggregateFrontendApi.ts:76-113`](../packages/system-worker/src/GatewayApi/getAggregateFrontendApi/getAggregateFrontendApi.ts#L76-L113) — authenticates, authorizes, and constructs the exact six-field child binding.
- [`AggregateFrontendApi.ts:61-113`](../packages/system-worker/src/AggregateFrontendApi/AggregateFrontendApi.ts#L61-L113) — exposes one-command push plus paginated finalized and pushed history.

## ServiceFrontendApi

The independently disposable read-only child capability bound to `{ systemId,
serviceName, userId, frontendName, serviceFrontendLock }` plus the authored
SystemWorker route. It serves state and WebSocket tickets.

- [`getServiceFrontendApi.ts:68-102`](../packages/system-worker/src/GatewayApi/getServiceFrontendApi/getServiceFrontendApi.ts#L68-L102) — authenticates, authorizes, and constructs the exact five-field child binding.
- [`ServiceFrontendApi.ts:48-85`](../packages/system-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts#L48-L85) — exposes state, finalized history, and one-time ticket operations without a push method.

## command chain

A durable ordered history of complete encoded command occurrences. Each source
chain owns its next index, canonical retained bytes, terminal state, and
subscriber tips; finalized chains retain and broadcast materializer output.

- [`types.ts:36-47`](../packages/core/src/system/types.ts#L36-L47) — names the aggregate, service, pushed, and two finalized command-chain Repo kinds.
- [`AggregateCommandChainDbConfig.ts:13-86`](../packages/system-worker/src/AggregateCommandChain/AggregateCommandChainDbConfig.ts#L13-L86) — stores aggregate occurrences, their execution state, and downstream subscriber tips.

## materialized Repo

One of four authored-schema durable owners: MaterializedAggregateRepo,
MaterializedServiceRepo, MaterializedAggregateFrontendRepo, or
MaterializedServiceFrontendRepo. It pulls contiguous terminal chain history,
owns current state, and commits durable downstream output before advancing its
source frontier.

- [`types.ts:35-52`](../packages/core/src/system/types.ts#L35-L52) — names the materialized Repo kinds and their registration shape without schema targets.
- [`catchup.ts:35-116`](../packages/system-worker/src/MaterializedServiceFrontendRepo/catchup/catchup.ts#L35-L116) — pulls contiguous service history and passes each occurrence to the materialized execute boundary.

## frontend lock

An authored, signed description of the exact frontend schema and query surface.
Gateway validates the lock and requires authorization to return the same exact
target before constructing a frontend capability.

- [`getAggregateFrontendApi.ts:59-76`](../packages/system-worker/src/GatewayApi/getAggregateFrontendApi/getAggregateFrontendApi.ts#L59-L76) — decodes the aggregate frontend lock before authentication and authorization.
- [`getServiceFrontendApi.ts:52-67`](../packages/system-worker/src/GatewayApi/getServiceFrontendApi/getServiceFrontendApi.ts#L52-L67) — decodes the service frontend lock.

## WebSocket ticket

A short-lived, single-use opaque token persisted by SystemRepo for one exact
finalized command chain and authenticated frontend target. The browser
exchanges it at the singular-command Worker WebSocket route.

- [`SystemRepoDbConfig.ts:34-78`](../packages/system-worker/src/SystemRepo/SystemRepoDbConfig.ts#L34-L78) — defines the aggregate and service ticket rows with exact target fields and chain name.

## command finalization

A singular AggregateCommandChain or ServiceCommandChain operation that accepts
one complete encoded command, assigns the next `aggregateIndex` or
`serviceIndex`, drives its retained materializer, and returns only a retained
terminal occurrence.

- [`finalizeAggregateCommand.ts:64-177`](../packages/system-worker/src/AggregateCommandChain/finalizeAggregateCommand/finalizeAggregateCommand.ts#L64-L177) — handles exact duplicate bytes and stores one indexed aggregate occurrence.
- [`finalizeServiceCommand.ts:61-147`](../packages/system-worker/src/ServiceCommandChain/finalizeServiceCommand/finalizeServiceCommand.ts#L61-L147) — applies the same singular admission boundary to service occurrences.

## main-thread frontend replica

One page-owned in-memory SQLite database plus its recovery, live finalized
socket, session state, and aggregate push lane. It authenticates every network
operation independently and is never shared across pages.

- [`bootstrapAggregateFrontendSession.ts:72-115`](../packages/frontend/src/bootstrapAggregateFrontendSession.ts#L72-L115) — declares the aggregate main-thread bootstrap boundary and returned push controls.
- [`bootstrapAggregateFrontendSession.ts:440-712`](../packages/frontend/src/bootstrapAggregateFrontendSession.ts#L440-L712) — owns aggregate recovery and the live finalized socket.
- [`bootstrapServiceFrontendSession.ts:282-482`](../packages/frontend/src/bootstrapServiceFrontendSession.ts#L282-L482) — owns equivalent service recovery and live delivery.

## OPFS backup worker

The page-facing backup abstraction backed by a SharedWorker mediator and one
Web-Lock-elected dedicated storage Worker per emitted worker graph. The
dedicated Worker owns synchronous wa-sqlite, exact-file claims, and OPFS SQLite
connections; neither worker owns live frontend state, authentication, Gateway
capabilities, sockets, command execution, or a durable request journal.

- [`acquireOpfsBackupWorker.ts:14-42`](../packages/opfs-backup-worker/src/acquireOpfsBackupWorker/acquireOpfsBackupWorker.ts#L14-L42) — exposes the unchanged six-method backup-only interface to the page.
- [`opfsBackupWorker.entry.ts:45-106`](../packages/opfs-backup-worker/src/opfsBackupWorker.entry.ts#L45-L106) — registers numeric clients and routes or queues requests without owning storage.
- [`opfsBackupLeader.entry.ts:14-37`](../packages/opfs-backup-worker/src/opfsBackupLeader.entry.ts#L14-L37) — owns synchronous `OPFSCoopSyncVFS`, the local operation turn, and open exact-file claims.
- [`applyTransaction.ts:17-59`](../packages/opfs-backup-worker/src/OpfsBackupLeader/applyTransaction/applyTransaction.ts#L17-L59) — applies one claimant-owned SQL batch transactionally.
