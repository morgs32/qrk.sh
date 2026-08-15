---
title: React Frontends
type: api
updated: 2026-08-14
---

# React Frontends

`makeZerospinApp` creates one application root with source-selected frontend
selectors and one generated production `Provider`. It requires `systemName`, an
authentication signature selection, frontend selections, and a session runtime,
then returns `{ frontends, Provider }`
([`makeZerospinApp.tsx:61-135`](../../packages/react/src/makeZerospinApp.tsx#L61-L135),
[`makeZerospinApp.tsx:462`](../../packages/react/src/makeZerospinApp.tsx#L462)).

## Production Provider

Production Provider props are exactly:

1. `generateSignature`, whose result type follows the selected authentication
   signature version
   ([`makeZerospinApp.tsx:144-156`](../../packages/react/src/makeZerospinApp.tsx#L144-L156)).
2. `aggregateIds`, keyed by configured aggregate name rather than frontend name
   ([`makeZerospinApp.tsx:157-164`](../../packages/react/src/makeZerospinApp.tsx#L157-L164),
   [`makeZerospinApp.tsx:279-295`](../../packages/react/src/makeZerospinApp.tsx#L279-L295)).
3. `children`, rendered only after every configured frontend session is ready
   ([`makeZerospinApp.tsx:165`](../../packages/react/src/makeZerospinApp.tsx#L165),
   [`makeZerospinApp.tsx:452-458`](../../packages/react/src/makeZerospinApp.tsx#L452-L458)).

The production Provider has no `userId` prop. The main thread keeps the latest
`generateSignature` function in a ref, validates each result against the
selected signature schema, and exposes that encoded callback to the
SharedWorker. It does not call universal authentication, read an authenticated
receipt, choose offline fallback, or consult `localStorage`
([`makeZerospinApp.tsx:174-177`](../../packages/react/src/makeZerospinApp.tsx#L174-L177),
[`makeZerospinApp.tsx:206-237`](../../packages/react/src/makeZerospinApp.tsx#L206-L237)).

Only one production `ZerospinApp.Provider` may be active in a page. Its scoped
lifecycle is keyed by the serialized aggregate-ID map. Updating
`generateSignature` changes the callback observed by the existing port without
restarting that Provider scope
([`makeZerospinApp.tsx:167-201`](../../packages/react/src/makeZerospinApp.tsx#L167-L201),
[`makeZerospinApp.tsx:438-445`](../../packages/react/src/makeZerospinApp.tsx#L438-L445)).

## Worker acquisition and returned identity

The Provider acquires the worker directly with exact
`{ systemName, authenticationLock, generateSignature }`. The neutral worker URL
contains only `apiUrl`, `publishableKey`, and `wasmUrl`; the page sends no
`systemId`, `userId`, or mode to the host
([`makeZerospinApp.tsx:206-237`](../../packages/react/src/makeZerospinApp.tsx#L206-L237),
[`acquireUserPartitionRepo.ts:193-207`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L193-L207),
[`acquireUserPartitionRepo.ts:223-246`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L223-L246)).

The worker returns `systemId`, `userId`, and `mode` beside the bound
`UserPartitionRepo`. The Provider uses those returned values for SharedWorker
diagnostics and for every aggregate and service bootstrap; the page does not
reconstruct or verify identity from a separate authentication result
([`makeZerospinApp.tsx:238-267`](../../packages/react/src/makeZerospinApp.tsx#L238-L267),
[`makeZerospinApp.tsx:317-334`](../../packages/react/src/makeZerospinApp.tsx#L317-L334),
[`makeZerospinApp.tsx:371-387`](../../packages/react/src/makeZerospinApp.tsx#L371-L387)).

The worker attempts authentication first. Only the exact five
transport/readiness failures can make the returned mode `existing-only`, and
that mode comes from a strict native IndexedDB locator plus an existing post-056
user root. The Provider contains no fallback branch of its own
([`getUserPartitionRepo.ts:381-469`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L381-L469),
[`getUserPartitionRepo.ts:517-566`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L517-L566),
[`getUserPartitionRepo.ts:717-734`](../../packages/shared-worker/src/SharedWorker/SharedWorkerApi/getUserPartitionRepo/getUserPartitionRepo.ts#L717-L734)).

## Session ownership

The Provider constructs and acquires every configured aggregate and service
session concurrently through the same `UserPartitionRepo`, then publishes one
complete selector-to-session map atomically. Aggregate bootstrap supplies the
selected `aggregateId`; both bootstrap paths receive the worker-returned
`systemId`, `userId`, and mode
([`makeZerospinApp.tsx:269-334`](../../packages/react/src/makeZerospinApp.tsx#L269-L334),
[`makeZerospinApp.tsx:360-420`](../../packages/react/src/makeZerospinApp.tsx#L360-L420),
[`makeZerospinApp.tsx:422-427`](../../packages/react/src/makeZerospinApp.tsx#L422-L427)).

In `existing-only`, each bootstrap opens and hydrates only an existing exact
replica. It registers one `online` listener; transport regain reacquires the
same exact registration through the same `UserPartitionRepo`, lets the worker
authenticate the already-bound identity, and promotes the session without
creating a second sink registration
([`bootstrapBrowserSession.ts:318-380`](../../packages/react/src/bootstrapBrowserSession.ts#L318-L380),
[`bootstrapBrowserServiceSession.ts:294-355`](../../packages/react/src/bootstrapBrowserServiceSession.ts#L294-L355)).

There is no per-frontend generated Provider, direct browser execution branch,
manual registry callback, or React push queue. Aggregate staging delegates the
complete command and mutation array to `UserPartitionRepo`; its public durable
receipt is `{ commandId }`
([`bootstrapBrowserSession.ts:383-401`](../../packages/react/src/bootstrapBrowserSession.ts#L383-L401),
[`stageAggregateFrontendCommand.ts:43-108`](../../packages/shared-worker/src/SharedWorker/UserPartitionRepo/stageAggregateFrontendCommand/stageAggregateFrontendCommand.ts#L43-L108),
[`acquireUserPartitionRepo.ts:102-114`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L102-L114)).

WebSocket ownership is also outside React. The exact aggregate Repo owns its
socket, command-journal push, repair, and fan-out; the journal-free exact service
Repo owns its socket, repair, and fan-out. React supplies only the main-thread
sinks that apply delivered blocks, replacement state, or terminal failure
([`AggregateFrontendReplicaRepo.ts:1409-1477`](../../packages/shared-worker/src/SharedWorker/AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts#L1409-L1477),
[`AggregateFrontendReplicaRepo.ts:2082-2812`](../../packages/shared-worker/src/SharedWorker/AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts#L2082-L2812),
[`ServiceFrontendReplicaRepo.ts:467-529`](../../packages/shared-worker/src/SharedWorker/ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts#L467-L529),
[`ServiceFrontendReplicaRepo.ts:1126-1632`](../../packages/shared-worker/src/SharedWorker/ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts#L1126-L1632)).

## Release order

Provider bootstrap is one Effect scope. On partial failure, replacement, or
normal unmount, every completed frontend bootstrap finalizer runs before the
parent SharedWorker-client finalizer. Tests assert that all aggregate/service
session releases precede the port release, including a partially successful
parallel bootstrap
([`makeZerospinApp.tsx:227-237`](../../packages/react/src/makeZerospinApp.tsx#L227-L237),
[`makeZerospinApp.tsx:317-334`](../../packages/react/src/makeZerospinApp.tsx#L317-L334),
[`makeZerospinApp.tsx:371-420`](../../packages/react/src/makeZerospinApp.tsx#L371-L420),
[`makeZerospinAppDevtools.react.spec.tsx:372-436`](../../packages/react/src/makeZerospinAppDevtools.react.spec.tsx#L372-L436),
[`makeZerospinAppDevtools.react.spec.tsx:558-612`](../../packages/react/src/makeZerospinAppDevtools.react.spec.tsx#L558-L612)).

Each frontend release removes its `online` listener, releases its exact-Repo
registration, closes its main-thread SQLite database, and marks the session
released, in that order. Only after all frontend releases does the Provider
release the worker client, which disposes the RPC session and closes the
MessagePort
([`bootstrapBrowserSession.ts:402-436`](../../packages/react/src/bootstrapBrowserSession.ts#L402-L436),
[`bootstrapBrowserServiceSession.ts:357-390`](../../packages/react/src/bootstrapBrowserServiceSession.ts#L357-L390),
[`acquireUserPartitionRepo.ts:299-325`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L299-L325),
[`acquireUserPartitionRepo.ts:360-371`](../../packages/shared-worker/src/acquireUserPartitionRepo.ts#L360-L371)).

## Mock

`makeMockProvider` remains a separate no-transport fixture. It accepts
`generateSignature`, optional `userId`, aggregate-name-keyed `aggregateIds`, and
`systemVersion`; because it deliberately does not simulate authentication, it
requires `userId` at runtime and creates only one in-memory aggregate session
database
([`mock.ts:53-74`](../../packages/react/src/mock.ts#L53-L74),
[`mock.ts:127-185`](../../packages/react/src/mock.ts#L127-L185)).

## Related pages

- [Browser Session Bootstrap](../architecture/bootstrapBrowserSession.md)
- [Browser Frontend Lifecycle](../dev/diagrams/BrowserFrontendLifecycle.md)
