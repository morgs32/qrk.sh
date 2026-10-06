---
title: Concrete Browser Node Bootstrap
updated: 2026-10-05
sources:
  - path: packages/browser/src/AggregateNode/resolveAggregateNode.ts
    sha: d7a7d17be98d0913d2c3602916320b6b75e89c50
    lines: 28-47
  - path: packages/browser/src/ServiceNode/resolveServiceNode.ts
    sha: 27dc461952f04211435e798892e7b2c42ac3d00a
    lines: 28-47
  - path: packages/browser/src/AggregateNode/connectAggregateNode.ts
    sha: fdbb6541c27e9eaa106d89fa7d55960f1de83964
    lines: 116-236
  - path: packages/browser/src/ServiceNode/connectServiceNode.ts
    sha: 08694f2db7aa80a99adfaaa2bb45639a16e6a044
    lines: 115-230
  - path: packages/browser/src/sharedWorkerNames.ts
    sha: ed96bdccaae4b7363c7d593e91c1ee57477a8243
    lines: 7-39
  - path: examples/shopping/src/zerospin/zerospin.worker.ts
    sha: 77e8347e8fd91276bbbb31e77eaeaee649f4eab0
    lines: 4-4
  - path: packages/browser/src/makeSharedWorker.ts
    sha: 7c72f8f0c898ea7aaf4b638ee52b812ce3557061
    lines: 11-15
  - path: packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts
    sha: 5e8b033b013cab3fa05177bc54b5fb0365bd025b
    lines: 81-197
  - path: packages/browser/src/ServiceNode/makeServiceSharedWorker.ts
    sha: 9fd0186c335297056038f4be2a45da51207cacca
    lines: 76-191
  - path: packages/browser/src/AggregateNode/AggregateSharedWorkerApi.ts
    sha: 2a0c9da95837ec4f5368290e080a0a4d7e08a056
    lines: 52-52
  - path: packages/browser/src/ServiceNode/ServiceSharedWorkerApi.ts
    sha: b42fdc6888841d6c577434b3755eca6eb9143ad2
    lines: 52-52
  - path: packages/browser/src/AggregateNode/AggregateBrowserSessionApi.ts
    sha: 6b75b32a3a8bb71b073f5213e360f3fc790a8553
    lines: 68-72
  - path: packages/browser/src/ServiceNode/ServiceBrowserSessionApi.ts
    sha: 7f4de6e99e0c26a302e4eafb00b81f52c0f87c8f
    lines: 67-71
  - path: packages/core/src/AggregateNode/AggregateNode.ts
    sha: e0d511f8a840ff9222648120b84d42223b52bacf
    lines: 376-400
  - path: packages/core/src/ServiceNode/ServiceNode.ts
    sha: 845c23f902dbf69b58f353711e6522e078afe7b5
    lines: 374-398
  - path: packages/browser/src/bootstrapAggregateSession.ts
    sha: 5c5dadc36281901338f3f61ae3e5afddb16bedf0
    lines: 272-285
  - path: packages/browser/src/bootstrapServiceSession.ts
    sha: 144f22356fb3acca8000eb6bb9880bd6eb190853
    lines: 445-458
  - path: packages/browser/src/Node/publicRpcError.ts
    sha: 6177359f5866b8554193558e08611502b52a3a0f
    lines: 9-25
  - path: packages/core/src/aggregateSession/initializeAggregateNodeProjection.ts
    sha: 70fe137e54f2aadee6e94476c900882259246af4
    lines: 64-78
  - path: packages/core/src/serviceSession/initializeServiceNodeProjection.ts
    sha: 27e810a8e244b9cefc76cf091a58ab1cf4c26934
    lines: 65-79
  - path: packages/core/src/aggregateSession/importAggregateNodeCommands.ts
    sha: 32750091b68b8f6331e8c00f52a848def9a5a2ae
    lines: 160-172
  - path: packages/core/src/serviceSession/importServiceNodeCommands.ts
    sha: 8d6699809b7315dfe1c020c5f65af1d7fb750e97
    lines: 168-180
---

# Concrete browser Node bootstrap

An application keeps one entry calling `makeSharedWorker({ sqliteWasmUrl })`. The application factory constructs a module `SharedWorker` using the supplied name. Construction and parsing share these RoutePattern declarations:

```text
/zerospin/aggregate/:sharedWorkerVersion/:sessionKey
/zerospin/service/:sharedWorkerVersion/:sessionKey
```

`AggregateNode` and `ServiceNode` each own their schema, journal, authentication integration, synchronization, and recovery. Shared primitives provide SQLite, hashing, serialization, storage opening, and RPC. The sequence shows aggregate ownership; each service path is cited alongside its aggregate counterpart.

## Trigger

1. `bootstrapAggregateSession` or `bootstrapServiceSession` captures the bound definition and creates the tab SQLite projection.
2. Its concrete connector resolves admitted claims, computes `sessionKey`, and invokes the application worker factory.
3. The worker selects its concrete initializer from its name. Attachment returns a per-tab capability; subscription completes initial projection or catch-up before uncertain handoffs retry.

```mermaid
sequenceDiagram
  participant connectAggregateNode
  participant resolveAggregateNode
  participant SharedWorker
  participant makeSharedWorker
  participant makeAggregateSharedWorker
  participant connection as connection: AggregateSharedWorkerApi
  participant authentication as authentication: AggregateNodeAuthentication
  participant node as node: AggregateNode
  participant attached as attached: AggregateBrowserSessionApi
  participant bootstrapAggregateSession
  connectAggregateNode->>resolveAggregateNode: resolveAggregateNode(...)
  connectAggregateNode->>SharedWorker: sharedWorker(...)
  SharedWorker->>makeSharedWorker: makeSharedWorker(...)
  makeSharedWorker->>makeAggregateSharedWorker: makeAggregateSharedWorker(...)
  connectAggregateNode->>connection: connection.attach(...)
  makeAggregateSharedWorker->>authentication: authentication.authenticate()
  opt metadata.initialized is false
    makeAggregateSharedWorker->>node: node.initializeBaseline(...)
  end
  connection-->>connectAggregateNode: attached
  connectAggregateNode->>attached: attached.subscribe(...)
  attached->>node: node.subscribe(...)
  node->>node: serialized(...)
  node->>attached: subscriber.sink.initialize(...)
  attached->>connectAggregateNode: retained.initialize(...)
  connectAggregateNode->>bootstrapAggregateSession: initialize(...)
```

## Annotated workflow steps

1. Resolve the admitted definition before selecting a named worker.
   - [`resolveAggregateNode.ts:28-47`](../../../packages/browser/src/AggregateNode/resolveAggregateNode.ts#L28-L47) — The server snapshot supplies aggregate ID and claims before definition construction. (`packages/browser/src/AggregateNode/resolveAggregateNode.ts:28-47`)
   - [`resolveServiceNode.ts:28-47`](../../../packages/browser/src/ServiceNode/resolveServiceNode.ts#L28-L47) — The server snapshot supplies the service claims before definition construction. (`packages/browser/src/ServiceNode/resolveServiceNode.ts:28-47`)

2. Construct the domain name and invoke the application worker factory.
   - [`connectAggregateNode.ts:116-119`](../../../packages/browser/src/AggregateNode/connectAggregateNode.ts#L116-L119) — The connector passes the identity-derived aggregate worker name to sharedWorker. (`packages/browser/src/AggregateNode/connectAggregateNode.ts:116-119`)
   - [`connectServiceNode.ts:115-118`](../../../packages/browser/src/ServiceNode/connectServiceNode.ts#L115-L118) — The connector passes the identity-derived service worker name to sharedWorker. (`packages/browser/src/ServiceNode/connectServiceNode.ts:115-118`)
   - [`sharedWorkerNames.ts:7-18`](../../../packages/browser/src/sharedWorkerNames.ts#L7-L18) — Both names use shared RoutePattern declarations and the compiled worker version. (`packages/browser/src/sharedWorkerNames.ts:7-18`)

3. The application worker entry calls makeSharedWorker.
   - [`zerospin.worker.ts:4-4`](../../../examples/shopping/src/zerospin/zerospin.worker.ts#L4-L4) — The application entry supplies only the WASM URL to the shared dispatcher. (`examples/shopping/src/zerospin/zerospin.worker.ts:4-4`)

4. Parse and validate the name, then initialize its concrete runtime once.
   - [`sharedWorkerNames.ts:19-39`](../../../packages/browser/src/sharedWorkerNames.ts#L19-L39) — Name parsing validates domain, compiled version, canonical path, and a 64-character session key. (`packages/browser/src/sharedWorkerNames.ts:19-39`)
   - [`makeSharedWorker.ts:11-15`](../../../packages/browser/src/makeSharedWorker.ts#L11-L15) — Parsed aggregate names dispatch to makeAggregateSharedWorker; service names dispatch to makeServiceSharedWorker. (`packages/browser/src/makeSharedWorker.ts:11-15`)

5. Attach through the worker RPC capability and independently check the complete identity.
   - [`connectAggregateNode.ts:176-179`](../../../packages/browser/src/AggregateNode/connectAggregateNode.ts#L176-L179) — The connector sends the resolved attachment and admission callback. (`packages/browser/src/AggregateNode/connectAggregateNode.ts:176-179`)
   - [`connectServiceNode.ts:175-178`](../../../packages/browser/src/ServiceNode/connectServiceNode.ts#L175-L178) — The connector sends the resolved attachment and admission callback. (`packages/browser/src/ServiceNode/connectServiceNode.ts:175-178`)
   - [`makeAggregateSharedWorker.ts:81-85`](../../../packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts#L81-L85) — The attachment definition must hash to the name-bound sessionKey. (`packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts:81-85`)
   - [`makeServiceSharedWorker.ts:76-80`](../../../packages/browser/src/ServiceNode/makeServiceSharedWorker.ts#L76-L80) — The attachment definition must hash to the name-bound sessionKey. (`packages/browser/src/ServiceNode/makeServiceSharedWorker.ts:76-80`)

6. The concrete worker authenticates through the registered tab capability.
   - [`makeAggregateSharedWorker.ts:175-192`](../../../packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts#L175-L192) — The attachment registers its admission provider before authenticate verifies a server-returned identity. (`packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts:175-192`)
   - [`makeServiceSharedWorker.ts:169-186`](../../../packages/browser/src/ServiceNode/makeServiceSharedWorker.ts#L169-L186) — The attachment registers its admission provider before authenticate verifies a server-returned identity. (`packages/browser/src/ServiceNode/makeServiceSharedWorker.ts:169-186`)

7. Fresh storage installs the independently authenticated baseline.
   - [`makeAggregateSharedWorker.ts:192-197`](../../../packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts#L192-L197) — Only uninitialized storage receives verified resources and progress; initialized storage retains its own state. (`packages/browser/src/AggregateNode/makeAggregateSharedWorker.ts:192-197`)
   - [`makeServiceSharedWorker.ts:186-191`](../../../packages/browser/src/ServiceNode/makeServiceSharedWorker.ts#L186-L191) — Only uninitialized storage receives verified resources and progress; initialized storage retains its own state. (`packages/browser/src/ServiceNode/makeServiceSharedWorker.ts:186-191`)

8. Return the per-tab session capability.
   - [`AggregateSharedWorkerApi.ts:52-52`](../../../packages/browser/src/AggregateNode/AggregateSharedWorkerApi.ts#L52-L52) — Each attachment returns a distinct session RPC stub with its own disposal lifetime. (`packages/browser/src/AggregateNode/AggregateSharedWorkerApi.ts:52-52`)
   - [`ServiceSharedWorkerApi.ts:52-52`](../../../packages/browser/src/ServiceNode/ServiceSharedWorkerApi.ts#L52-L52) — Each attachment returns a distinct session RPC stub with its own disposal lifetime. (`packages/browser/src/ServiceNode/ServiceSharedWorkerApi.ts:52-52`)

9. Subscribe the tab with its last committed cursor, or no cursor for a fresh observation window.
   - [`connectAggregateNode.ts:226-231`](../../../packages/browser/src/AggregateNode/connectAggregateNode.ts#L226-L231) — Reconnection supplies afterChangeIndex; fresh initialization omits it. (`packages/browser/src/AggregateNode/connectAggregateNode.ts:226-231`)
   - [`connectServiceNode.ts:222-227`](../../../packages/browser/src/ServiceNode/connectServiceNode.ts#L222-L227) — Reconnection supplies afterChangeIndex; fresh initialization omits it. (`packages/browser/src/ServiceNode/connectServiceNode.ts:222-227`)

10. The attached capability forwards the subscription to its concrete Node.
    - [`AggregateBrowserSessionApi.ts:68-72`](../../../packages/browser/src/AggregateNode/AggregateBrowserSessionApi.ts#L68-L72) — The per-tab API wraps callback lifetime and delegates Node subscription. (`packages/browser/src/AggregateNode/AggregateBrowserSessionApi.ts:68-72`)
    - [`ServiceBrowserSessionApi.ts:67-71`](../../../packages/browser/src/ServiceNode/ServiceBrowserSessionApi.ts#L67-L71) — The per-tab API wraps callback lifetime and delegates Node subscription. (`packages/browser/src/ServiceNode/ServiceBrowserSessionApi.ts:67-71`)

11. Capture fresh resources, unresolved commands, progress, and the change cursor in one serialization boundary.
    - [`AggregateNode.ts:376-381`](../../../packages/core/src/AggregateNode/AggregateNode.ts#L376-L381) — Snapshot capture, the registration watermark, and subscriber registration occur inside serialized work. (`packages/core/src/AggregateNode/AggregateNode.ts:376-381`)
    - [`ServiceNode.ts:374-379`](../../../packages/core/src/ServiceNode/ServiceNode.ts#L374-L379) — Snapshot capture, the registration watermark, and subscriber registration occur inside serialized work. (`packages/core/src/ServiceNode/ServiceNode.ts:374-379`)

12. Initialize the registered sink outside the SQLite boundary.
    - [`AggregateNode.ts:400-400`](../../../packages/core/src/AggregateNode/AggregateNode.ts#L400-L400) — The captured baseline callback is awaited before replay scheduling. (`packages/core/src/AggregateNode/AggregateNode.ts:400-400`)
    - [`ServiceNode.ts:398-398`](../../../packages/core/src/ServiceNode/ServiceNode.ts#L398-L398) — The captured baseline callback is awaited before replay scheduling. (`packages/core/src/ServiceNode/ServiceNode.ts:398-398`)

13. The per-tab capability forwards the captured baseline to the connector callback.
    - [`AggregateBrowserSessionApi.ts:71-71`](../../../packages/browser/src/AggregateNode/AggregateBrowserSessionApi.ts#L71-L71) — The duplicated callback capability receives the baseline only while the attachment remains current. (`packages/browser/src/AggregateNode/AggregateBrowserSessionApi.ts:71-71`)
    - [`ServiceBrowserSessionApi.ts:70-70`](../../../packages/browser/src/ServiceNode/ServiceBrowserSessionApi.ts#L70-L70) — The duplicated callback capability receives the baseline only while the attachment remains current. (`packages/browser/src/ServiceNode/ServiceBrowserSessionApi.ts:70-70`)

14. Commit the tab projection before advancing the connector cursor.
    - [`connectAggregateNode.ts:189-193`](../../../packages/browser/src/AggregateNode/connectAggregateNode.ts#L189-L193) — The change cursor is set only after initialization succeeds. (`packages/browser/src/AggregateNode/connectAggregateNode.ts:189-193`)
    - [`connectServiceNode.ts:188-192`](../../../packages/browser/src/ServiceNode/connectServiceNode.ts#L188-L192) — The change cursor is set only after initialization succeeds. (`packages/browser/src/ServiceNode/connectServiceNode.ts:188-192`)
    - [`bootstrapAggregateSession.ts:272-285`](../../../packages/browser/src/bootstrapAggregateSession.ts#L272-L285) — The bootstrap validates full claims and initializes the concrete SQLite projection. (`packages/browser/src/bootstrapAggregateSession.ts:272-285`)
    - [`bootstrapServiceSession.ts:445-458`](../../../packages/browser/src/bootstrapServiceSession.ts#L445-L458) — The bootstrap validates full claims and initializes the concrete SQLite projection. (`packages/browser/src/bootstrapServiceSession.ts:445-458`)

## Observation window and recovery

A fresh tab starts its observation window at one serialized Node capture. Its baseline includes resources, numeric domain progress, execution position/hash, unresolved staged commands, and `changeIndex`; it does not import older resolved history. Reconnection supplies `afterChangeIndex`, preserving the tab's resource tables and observed journal. Subscription readiness waits for the initialization callback or committed delivery through the registration watermark. Uncertain local submissions retry afterward, so retained outcomes settle them first.

Slow subscribers independently page retained SQLite changes. Known staged input precedes its terminal command; callbacks acknowledge only after the tab transaction commits. Navigation and DevTools toggling preserve the current session's observed history. Detaching one tab leaves other attachments running; the last detach stops synchronization, and later attachment reopens retained storage.

Every command first retained in either session database receives a local `sessionIndex`, including unresolved input captured at initialization and terminal-only history received afterward. Staging and imports advance the same `nextSessionIndex` within their resource and command transaction. Matching updates preserve row identity; new repeated-ID executions allocate distinct rows. These tab coordinates never replace Node `journalIndex`/`nodeIndex` or enter submitted Node input.

- [`initializeAggregateNodeProjection.ts:64-78`](../../../packages/core/src/aggregateSession/initializeAggregateNodeProjection.ts#L64-L78) — Fresh aggregate metadata starts its retention allocator at one, then imports the baseline unresolved rows in that transaction. (`packages/core/src/aggregateSession/initializeAggregateNodeProjection.ts:64-78`)
- [`initializeServiceNodeProjection.ts:65-79`](../../../packages/core/src/serviceSession/initializeServiceNodeProjection.ts#L65-L79) — Fresh service metadata starts its retention allocator at one, then imports the baseline unresolved rows in that transaction. (`packages/core/src/serviceSession/initializeServiceNodeProjection.ts:65-79`)
- [`importAggregateNodeCommands.ts:160-172`](../../../packages/core/src/aggregateSession/importAggregateNodeCommands.ts#L160-L172) — A matched aggregate occurrence reuses its key; new retention validates the next position and its safe successor. (`packages/core/src/aggregateSession/importAggregateNodeCommands.ts:160-172`)
- [`importServiceNodeCommands.ts:168-180`](../../../packages/core/src/serviceSession/importServiceNodeCommands.ts#L168-L180) — A matched service occurrence reuses its key; new retention validates the same positive safe-integer allocation boundary. (`packages/core/src/serviceSession/importServiceNodeCommands.ts:168-180`)

Nontelemetry worker RPC returns domain values directly and rejects with existing public error fields. Error codes survive serialization; stacks and causes do not cross that boundary. Identity or checkpoint conflicts preserve storage and block synchronization. Changed fixed schemas require empty storage, with no translation or automatic deletion.

- [`AggregateNode.ts:383-387`](../../../packages/core/src/AggregateNode/AggregateNode.ts#L383-L387) — Subscription readiness waits for initialization or committed replay through the registration watermark. (`packages/core/src/AggregateNode/AggregateNode.ts:383-387`)
- [`ServiceNode.ts:381-385`](../../../packages/core/src/ServiceNode/ServiceNode.ts#L381-L385) — Subscription readiness waits for initialization or committed replay through the registration watermark. (`packages/core/src/ServiceNode/ServiceNode.ts:381-385`)
- [`connectAggregateNode.ts:234-236`](../../../packages/browser/src/AggregateNode/connectAggregateNode.ts#L234-L236) — Uncertain handoff retry occurs after subscription readiness. (`packages/browser/src/AggregateNode/connectAggregateNode.ts:234-236`)
- [`connectServiceNode.ts:230-230`](../../../packages/browser/src/ServiceNode/connectServiceNode.ts#L230-L230) — Uncertain handoff retry occurs after subscription readiness. (`packages/browser/src/ServiceNode/connectServiceNode.ts:230-230`)
- [`publicRpcError.ts:9-25`](../../../packages/browser/src/Node/publicRpcError.ts#L9-L25) — Worker errors retain existing encoded public fields and discard stacks. (`packages/browser/src/Node/publicRpcError.ts:9-25`)

See [identity and admission](./Identity.md), [session WebSocket](./SessionWebSocket.md), and [command admission](./PushSequence.md).
