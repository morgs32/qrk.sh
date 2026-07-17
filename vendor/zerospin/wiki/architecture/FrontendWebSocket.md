---
title: Frontend WebSocket
type: module
updated: 2026-07-17
sources:
  - path: packages/frontend/src/createFrontendWebSocketTicket.ts
    sha: 5898383a2c3be28dfddcdd1505b979218515c9d0
    lines: 16-47
  - path: packages/react/src/acquireFrontendWebSocket.ts
    sha: 4eea39c3a926bc94014e1c006d040254a72a6d9e
    lines: 17-194
  - path: packages/dispatch-worker/src/FrontendApi/FrontendApi.ts
    sha: b0cb96df80fa967717868bdb82091b5dcf21dca2
    lines: 324-348
  - path: packages/system-worker/src/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts
    sha: 4a4a0e5c1b08e19ec1d5fb143eb599fb7d1c268f
    lines: 15-48
  - path: packages/system-worker/src/SystemRepo/SystemRepo.ts
    sha: 7064d1caef9da512bd027d0273a4c0d8f84cdac7
    lines: 51-182
  - path: packages/system-worker/src/SystemRepo/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts
    sha: fba8bd7929781ae27c18a331d790ff2ddbb0c0f1
    lines: 42-116
  - path: packages/system-worker/src/SystemRepo/consumeFrontendWebSocketTicket/consumeFrontendWebSocketTicket.ts
    sha: e786d9ea1c2965795c773f1668ed4f9c8293584d
    lines: 43-182
  - path: packages/system-worker/src/SystemWorker.ts
    sha: 635b5321cfdd30d05bb423874df3c49561e40a32
    lines: 2086-2162
  - path: packages/system-worker/src/FrontendBlockRepo/FrontendBlockRepo.ts
    sha: 3c44fd361688681314927055d1e502d278991065
    lines: 23-78
  - path: packages/dispatch-worker/src/Worker.ts
    sha: 1eca022f6fdd5fd643f3f0cbb1f3c3a773ec7d3b
    lines: 21-55
  - path: examples/shopping/src/Worker.ts
    sha: fce5a09dc4e9b4ce13c1cd46b36e7d645504b63b
    lines: 43-84
---

# Frontend WebSocket

Frontend-block delivery uses a two-stage boundary: the browser authenticates
over Cap'n Web to mint a short-lived capability, then spends that capability on
one native WebSocket upgrade. The long-lived connection belongs directly to
the hibernating FrontendBlockRepo; neither the RPC session, SystemRepo, nor a
stateless Worker remains in the socket lifetime
(../../packages/frontend/src/createFrontendWebSocketTicket.ts:16-47,
../../packages/system-worker/src/SystemWorker.ts:2086-2162,
../../packages/system-worker/src/FrontendBlockRepo/FrontendBlockRepo.ts:50-78).

## Why the route has two stages

Cap'n Web already authenticates the complete frontend identity, but its live
RPC capability is not the durable owner of browser block delivery. The ticket
transfers only permission to perform one native upgrade. This preserves the
FrontendBlockRepo PartyServer's `hibernate: true` ownership after the stateless
request chain has returned
(../../packages/dispatch-worker/src/FrontendApi/FrontendApi.ts:324-348,
../../packages/system-worker/src/FrontendBlockRepo/FrontendBlockRepo.ts:37-58).

The WebSocket URL contains exactly the fixed path plus `publishableKey` and
`ticket`. It contains no signature, deploy, generation, account, actor,
frontend, or Durable Object name. The publishable key selects the public
environment; the one-use ticket is the admission credential
(../../packages/react/src/acquireFrontendWebSocket.ts:38-57).

## Trigger

1. [`createFrontendWebSocketTicket`](../../packages/frontend/src/createFrontendWebSocketTicket.ts)
   authenticates the session through FrontendApi and returns a fresh raw ticket
   (../../packages/frontend/src/createFrontendWebSocketTicket.ts:25-46).
2. [`acquireFrontendWebSocket`](../../packages/react/src/acquireFrontendWebSocket.ts)
   changes the configured API protocol to `ws:` or `wss:`, builds the exact
   two-parameter URL, creates the browser WebSocket, and waits for `open`
   (../../packages/react/src/acquireFrontendWebSocket.ts:38-72,
   ../../packages/react/src/acquireFrontendWebSocket.ts:119-181).
3. A public Worker entrypoint validates the fixed request and forwards it
   unchanged to SystemWorker. The default dispatch entrypoint and Shopping
   example use the same-isolate Worker export
   (../../packages/dispatch-worker/src/Worker.ts:21-55,
   ../../examples/shopping/src/Worker.ts:43-84).

## Annotated workflow steps

```mermaid
sequenceDiagram
  autonumber
  participant Browser
  participant FrontendApi
  participant SystemWorker
  participant SystemRepo
  participant Gateway as Public Worker gateway
  participant Blocks as FrontendBlockRepo

  Browser->>FrontendApi: createFrontendWebSocketTicket()
  FrontendApi->>SystemWorker: authenticated frontend identity
  SystemWorker->>SystemWorker: derive FrontendBlockRepo name
  SystemWorker->>SystemRepo: mint(deployId, repoName)
  SystemRepo->>SystemRepo: write admission; store SHA-256 hash
  SystemRepo-->>Browser: raw 30-second ticket through Cap'n Web

  Browser->>Gateway: /ws-frontend-blocks?publishableKey&ticket
  Gateway->>SystemWorker: forward unchanged upgrade
  SystemWorker->>SystemRepo: consume(ticket)
  SystemRepo->>SystemRepo: read admission; atomic delete
  SystemRepo-->>SystemWorker: stored repoName
  SystemWorker->>Blocks: getByName(repoName).fetch(upgrade)
  Blocks-->>Browser: hibernatable WebSocket
```

1. The frontend program generates a fresh session signature, opens the
   authenticated FrontendApi capability, and invokes its empty-argument ticket
   leaf (../../packages/frontend/src/createFrontendWebSocketTicket.ts:25-46).
2. FrontendApi supplies the already-authenticated account, actor, frontend,
   deploy, and generation identity. SystemWorker derives the private
   FrontendBlockRepo name; no browser-supplied target crosses this boundary
   (../../packages/dispatch-worker/src/FrontendApi/FrontendApi.ts:324-348,
   ../../packages/system-worker/src/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts:15-47).
3. SystemRepo requires write admission, removes expired rows, creates 32 random
   bytes, returns their unpadded base64url encoding, and persists only its
   SHA-256 hash, deploy, server-derived repo name, and 30-second expiry
   (../../packages/system-worker/src/SystemRepo/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts:42-115,
   ../../packages/system-worker/src/SystemRepo/SystemRepo.ts:139-156).
4. Consumption validates and hashes the ticket, checks read admission against
   its stored deploy, then conditionally deletes the matching row while
   returning only the stored repo name. Replay and concurrent second use see
   the same invalid-or-expired failure
   (../../packages/system-worker/src/SystemRepo/consumeFrontendWebSocketTicket/consumeFrontendWebSocketTicket.ts:43-88,
   ../../packages/system-worker/src/SystemRepo/consumeFrontendWebSocketTicket/consumeFrontendWebSocketTicket.ts:103-181).
5. SystemWorker spends the ticket before the final Durable Object fetch. A
   failed final forward does not restore the ticket
   (../../packages/system-worker/src/SystemWorker.ts:2112-2162).

## Gateway routing

Standalone and local entrypoints validate the exact fixed path, WebSocket
upgrade header, and two required query parameters, then forward the unchanged
request to the same-isolate SystemWorker export. They never select a
FrontendBlockRepo themselves
(../../packages/dispatch-worker/src/Worker.ts:21-55,
../../examples/shopping/src/Worker.ts:43-84).

Hosted deployment uses the same boundary with an environment-specific first
step: its public gateway resolves the publishable key to the active dispatched
SystemWorker before forwarding the unchanged fixed request. Authentication
still comes from the ticket minted through FrontendApi, not from possession of
the public routing key. SystemWorker remains the only component that consumes
the ticket and resolves the stored repo target
(../../packages/dispatch-worker/src/FrontendApi/FrontendApi.ts:324-348,
../../packages/system-worker/src/SystemWorker.ts:2086-2162).

## Admission, expiry, and drain

Minting is a write and therefore succeeds only for the active deploy in
`ready + open`. Consumption is a read, so an unexpired ticket may still be
spent in `ready + draining`. Once the generation becomes `drained`, all
remaining ticket rows are purged and no new upgrade is admitted
(../../packages/system-worker/src/SystemRepo/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts:42-51,
../../packages/system-worker/src/SystemRepo/consumeFrontendWebSocketTicket/consumeFrontendWebSocketTicket.ts:103-151,
../../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:515-547).

Drain does not actively close sockets that already reached FrontendBlockRepo.
The admission state controls new operations; the final socket remains owned by
the hibernating room
(../../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:175-298,
../../packages/system-worker/src/FrontendBlockRepo/FrontendBlockRepo.ts:50-78).

## External response surface

| Condition | Status | Public meaning |
| --- | ---: | --- |
| Not a WebSocket upgrade | 426 | Upgrade required |
| Missing, repeated, empty, or malformed parameter | 400 | Invalid request shape |
| Unknown, expired, replayed, wrong-deploy, or admission-rejected ticket | 401 | Ticket invalid or expired |
| Hashing, storage, decoding, or final routing failure | 500 | Admission or forwarding failed |
| FrontendBlockRepo accepts the upgrade | 101 | Native WebSocket established |

The 401 surface deliberately does not reveal ticket existence, generation
state, deploy identity, or repo name. The successful and error mappings occur
after the fixed request-shape checks in SystemWorker
(../../packages/system-worker/src/SystemWorker.ts:2086-2162).

## Browser connection lifecycle

React does not report acquisition success until the browser emits `open`.
`error` or `close` before `open` removes the temporary listeners, fails
bootstrap, and releases the socket. After open, the existing message handler
continues to reject stale indexes, apply newer frontend blocks, and advance the
session cursor state; scope release closes the socket
(../../packages/react/src/acquireFrontendWebSocket.ts:63-191).

There is no reconnect, ticket refresh, or ticket restoration. A later explicit
bootstrap authenticates again, generates a fresh signature, and mints a new
one-use ticket
(../../packages/frontend/src/createFrontendWebSocketTicket.ts:25-46,
../../packages/react/src/acquireFrontendWebSocket.ts:119-191).

## Related pages

- [[FrontendApi]]
- [[Blockchain]]
- [[DeploySystem]]
- [[bootstrapBrowserSession]]
