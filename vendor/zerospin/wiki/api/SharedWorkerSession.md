---
title: SharedWorker User Partition Session
type: api
updated: 2026-08-14
---

# SharedWorker User Partition Session

`acquireUserPartitionRepo` requires browser `SharedWorker` support and accepts
exact `{ systemName, authenticationLock, generateSignature }`. It returns exact
`{ api, release, systemId, userId, mode }`, where `mode` is `online` or
`existing-only` and `release` is a main-thread-local idempotent Effect. There is
no direct browser transport fallback
([`acquireUserPartitionRepo.ts:193-220`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L193-L220),
[`acquireUserPartitionRepo.ts:328-382`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L328-L382)).

## Identity-neutral host

The SharedWorker URL contains only `apiUrl`, `publishableKey`, and `wasmUrl` and
uses the fixed worker name `zerospin:shared-worker`. It contains no `systemId`,
`userId`, `systemName`, authentication lock, signature, or acquisition mode
([`acquireUserPartitionRepo.ts:223-246`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L223-L246),
[`startSharedWorker.ts:35-65`](../../packages/shared-worker/src/SharedWorker/startSharedWorker.ts#L35-L65)).

The host keeps user-root and exact-Repo maps globally, but creates one initially
unbound `SharedWorkerApi` and opaque `ownerToken` for every accepted MessagePort
([`startSharedWorker.ts:67-101`](../../packages/shared-worker/src/SharedWorker/startSharedWorker.ts#L67-L101),
[`startSharedWorker.ts:103-132`](../../packages/shared-worker/src/SharedWorker/startSharedWorker.ts#L103-L132)).

## Per-port authentication

The first `getUserPartitionRepo` call binds the port to exact
`{ systemName, authenticationLock, generateSignature }`. A later call must use
the same System name and lock. The port owns its bound
`{ systemId, userId, systemName }`, current authenticated root, one pending
authentication token/promise, last failure classification, and terminal error
([`SharedWorkerApi.ts:28-61`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/SharedWorkerApi.ts#L28-L61),
[`getUserPartitionRepo.ts:117-162`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L117-L162)).

Authentication is online-first and runs inside the SharedWorker. The page's
capability is invoked only to generate the current signature; the worker then
calls universal authentication, validates the requested `systemName`, binds the
returned `systemId` and `userId`, and retains that exact root. A successful
same-identity replacement is installed before the prior root is released, and
late or mismatched results cannot install
([`getUserPartitionRepo.ts:164-224`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L164-L224),
[`getUserPartitionRepo.ts:227-379`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L227-L379)).

Only an initial authentication failure with one of these five codes may enter
offline fallback: `user-authentication-transport-failed`,
`gateway-infrastructure-failure`, `system-deploy-activating`,
`system-deploy-failed`, or `system-not-ready`. Page-capability failures, decoded
callback failures, invalid signatures, configuration mismatches, and identity
mismatches do not consult the locator
([`getUserPartitionRepo.ts:261-291`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L261-L291),
[`getUserPartitionRepo.ts:381-407`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L381-L407)).

## Native last-user locator

Every authentication outcome is followed by native IndexedDB epoch/layout
validation before a user-partition VFS opens. The locator database is exactly
`zerospin/056/last-user-partition-store`, version `1`, with the sole object store
`lastUserPartitions`, key path `key`, and no indexes
([`lastUserPartitionStore.ts:7-16`](../../packages/shared-worker/src/SharedWorker/lastUserPartitionStore.ts#L7-L16),
[`lastUserPartitionStore.ts:157-303`](../../packages/shared-worker/src/SharedWorker/lastUserPartitionStore.ts#L157-L303),
[`getUserPartitionRepo.ts:409-415`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L409-L415)).

The key is built in fixed order as
`JSON.stringify({ apiUrl, publishableKey, systemName, authenticationLock })`.
The stored value is strict `{ key, systemId, userId }`; missing data becomes
`offline-user-locator-unavailable`, while malformed or excess data requires a
browser reset. The runtime does not read or write a legacy `localStorage`
locator
([`getUserPartitionRepo.ts:417-469`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L417-L469),
[`lastUserPartitionStore.ts:306-391`](../../packages/shared-worker/src/SharedWorker/lastUserPartitionStore.ts#L306-L391),
[`lastUserPartitionStore.ts:395-465`](../../packages/shared-worker/src/SharedWorker/lastUserPartitionStore.ts#L395-L465)).

Before opening the 056 store, the worker inspects every native database whose
name begins with `zerospin/` but not `zerospin/056/`. Any non-empty pre-056
database fails with `browser-persistence-reset-required`; runtime code neither
upgrades nor deletes legacy persistence
([`lastUserPartitionStore.ts:19-155`](../../packages/shared-worker/src/SharedWorker/lastUserPartitionStore.ts#L19-L155)).

## Post-056 persistence root

The user-partition VFS name is exactly
`zerospin/056/${systemId}/users/${userId}`. The worker keys its published
user-root map by `${systemId}/${userId}`, opens `replicas.db` in
`create-or-open` for online acquisition or `existing-only` for locator fallback,
and serializes the first physical open through that exact key
([`makeVfsName.ts:3-10`](../../packages/shared-worker/src/SharedWorker/makeVfsName.ts#L3-L10),
[`getUserPartitionRepo.ts:517-566`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L517-L566),
[`getUserPartitionRepo.ts:621-679`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L621-L679)).

An online acquisition writes its configuration locator only after the
user-partition SQLite schema is valid and before a newly opened handle is
published. Existing published roots still receive the caller's locator write
before return. A failed write leaves a new handle unpublished and its SQLite
database and VFS are closed
([`getUserPartitionRepo.ts:568-657`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L568-L657),
[`getUserPartitionRepo.ts:681-715`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L681-L715)).

Every native wa-sqlite VFS open preflights the exact IndexedDB version `5`, sole
`blocks` store, compound key path `[path, offset, version]`, and sole `version`
index with key path `[path, version]`. `existing-only` additionally requires the
native VFS to exist and omits `SQLITE_OPEN_CREATE`; incompatible layouts require
a browser reset without an upgrade
([`makeIdbSQLite3.ts:12-45`](../../packages/shared-worker/src/drizzle/makeIdbSQLite3.ts#L12-L45),
[`makeIdbSQLite3.ts:47-155`](../../packages/shared-worker/src/drizzle/makeIdbSQLite3.ts#L47-L155),
[`makeIdbSQLite3.ts:158-175`](../../packages/shared-worker/src/drizzle/makeIdbSQLite3.ts#L158-L175)).

The current user root remains a catalog containing exactly
`aggregateFrontendReplicas` and `serviceFrontendReplicas`. Its initializer
accepts only an empty database in `create-or-open` or the exact current baseline
and migration receipt. `existing-only` rejects an empty or mismatched root and
never enters the migration transaction
([`userReplicaSchemas.ts:176-247`](../../packages/shared-worker/src/SharedWorker/userReplicaSchemas.ts#L176-L247),
[`migrateUserReplicaDbAsync.ts:214-251`](../../packages/shared-worker/src/SharedWorker/migrateUserReplicaDbAsync.ts#L214-L251),
[`migrateUserReplicaDbAsync.ts:253-308`](../../packages/shared-worker/src/SharedWorker/migrateUserReplicaDbAsync.ts#L253-L308)).

Exact aggregate and service VFS names derive beneath the 056 user root. In
`existing-only`, their native VFS, catalog row, exact schema, and metadata must
already exist; schema migration and catalog/metadata creation are online-only
([`acquireAggregateFrontendReplica.ts:154-208`](../../packages/shared-worker/src/SharedWorker/UserPartitionRepo/acquireAggregateFrontendReplica/acquireAggregateFrontendReplica.ts#L154-L208),
[`acquireAggregateFrontendReplica.ts:319-420`](../../packages/shared-worker/src/SharedWorker/UserPartitionRepo/acquireAggregateFrontendReplica/acquireAggregateFrontendReplica.ts#L319-L420),
[`acquireServiceFrontendReplica.ts:159-206`](../../packages/shared-worker/src/SharedWorker/UserPartitionRepo/acquireServiceFrontendReplica/acquireServiceFrontendReplica.ts#L159-L206),
[`acquireServiceFrontendReplica.ts:316-430`](../../packages/shared-worker/src/SharedWorker/UserPartitionRepo/acquireServiceFrontendReplica/acquireServiceFrontendReplica.ts#L316-L430)).

## UserPartitionRepo

1. `acquireAggregateFrontendReplica` and `acquireServiceFrontendReplica` receive
   one exact target, complete lock and lock key, frontend spec, `online` or
   `existing-only` mode, and a main-thread delivery sink. Each returns a
   capability with `getState` and `release`
   ([`acquireUserPartitionRepo.ts:59-101`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L59-L101),
   [`UserPartitionRepo.ts:80-130`](../../packages/shared-worker/src/SharedWorker/UserPartitionRepo/UserPartitionRepo.ts#L80-L130)).
2. `stageAggregateFrontendCommand` preserves the complete encoded staged command
   and mutation array and delegates to the acquired exact aggregate Repo. Its
   durable public receipt is `{ commandId }`
   ([`acquireUserPartitionRepo.ts:102-114`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L102-L114),
   [`UserPartitionRepo.ts:132-148`](../../packages/shared-worker/src/SharedWorker/UserPartitionRepo/UserPartitionRepo.ts#L132-L148)).
3. `getPushPaused`, `setPushPaused`, and `pushNow` address one exact aggregate
   replica; the two list methods expose aggregate and service diagnostics for
   the bound user
   ([`acquireUserPartitionRepo.ts:115-190`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L115-L190),
   [`UserPartitionRepo.ts:150-228`](../../packages/shared-worker/src/SharedWorker/UserPartitionRepo/UserPartitionRepo.ts#L150-L228)).

## Exact-Repo authority

Each exact Repo can retain many page registrations but owns only one selected
authority with exact `{ registrationId, ownerToken, authenticatedApi,
frontendApi }`. Registration order is stable, a healthy selected authority is
sticky, and a later operation replaces it only after the selected root or child
becomes unusable. `existing-only` registrations keep local state and aggregate
journal work but cannot be selected for server authority
([`AggregateFrontendReplicaRepo.ts:188-243`](../../packages/shared-worker/src/SharedWorker/AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts#L188-L243),
[`AggregateFrontendReplicaRepo.ts:1209-1280`](../../packages/shared-worker/src/SharedWorker/AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts#L1209-L1280),
[`ServiceFrontendReplicaRepo.ts:87-133`](../../packages/shared-worker/src/SharedWorker/ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts#L87-L133),
[`ServiceFrontendReplicaRepo.ts:344-415`](../../packages/shared-worker/src/SharedWorker/ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts#L344-L415)).

Selection authenticates through the candidate port, checks exact current-root
identity, acquires and validates one aggregate or service child, then installs
the four-field authority. Sibling registrations do not retain sibling children
([`AggregateFrontendReplicaRepo.ts:1601-1809`](../../packages/shared-worker/src/SharedWorker/AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts#L1601-L1809),
[`ServiceFrontendReplicaRepo.ts:641-830`](../../packages/shared-worker/src/SharedWorker/ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts#L641-L830)).

## Release lifecycle

The main-thread release first disposes its RPC session and closes its
MessagePort. The port's `SharedWorkerApi` is then marked terminal, clears its
installable configuration/root/attempt state, releases the authenticated root
and retained signature capability, and asks every aggregate and service exact
Repo to release registrations carrying the same `ownerToken`. Persistent
user-root and exact-replica handles remain SharedWorker-host-owned
([`acquireUserPartitionRepo.ts:299-325`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L299-L325),
[`acquireUserPartitionRepo.ts:360-371`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L360-L371),
[`SharedWorkerApi.ts:121-131`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/SharedWorkerApi.ts#L121-L131),
[`dispose.ts:26-45`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/dispose/dispose.ts#L26-L45)).

## Related pages

- [Browser Session Bootstrap](../architecture/bootstrapBrowserSession.md)
- [Browser Frontend Lifecycle](../dev/diagrams/BrowserFrontendLifecycle.md)
