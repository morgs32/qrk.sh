---
title: ServiceFrontendApi
type: module
updated: 2026-07-28
sources:
  - path: packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts
    sha: 1a7bbb43c173bdd8967ab6d09f85f1eb2e907002
    lines: 235-410
  - path: packages/dispatch-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts
    sha: 4017d31788e6fa6e90190ec4f36237dbf1ef5aef
    lines: 29-266
  - path: packages/dispatch-worker/src/ServiceFrontendApi/ServiceFrontendApiFailure.ts
    sha: d5171ae3516ebf6fb61b5861d833945c6cfccb83
    lines: 8-27
  - path: packages/system-worker/src/authenticateServiceFrontend/authenticateServiceFrontend.ts
    sha: 11230976ef6334db580ad85a46a0b8e6c4a8b313
    lines: 22-103
  - path: packages/system-worker/src/ServiceRepo/authenticateServiceFrontend/authenticateServiceFrontend.ts
    sha: 564c16c99c5f5a0d023a81e4b856ab1798e7708a
    lines: 8-74
  - path: packages/system-worker/src/getServiceFrontendState/getServiceFrontendState.ts
    sha: 96e4196bca64fa89b0586f28330cd03860fccca7
    lines: 25-259
  - path: packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts
    sha: 7c5d036a67378072550af1a57d7afa0611b89e32
    lines: 28-452
  - path: packages/frontend/src/fetchServiceFrontend.ts
    sha: 98cd63865af04ca33b1e619541e268be030dc85d
    lines: 23-184
  - path: packages/frontend/src/fetchServiceFrontendState.ts
    sha: aa549596c692e9b8b182c442537e93d504ae4a5f
    lines: 12-36
  - path: packages/frontend/src/createServiceFrontendWebSocketTicket.ts
    sha: 437e25741b80ce8ce02c1a9a2c4735f9e86614c8
    lines: 13-46
---

# ServiceFrontendApi

`ServiceFrontendApi` is the distinct, actor-bound RPC capability for one
service-owned frontend. Admission returns the authenticated actor identity, the
exact client-safe frontend specification, and a capability with only
`getFrontendState()` and `createFrontendWebSocketTicket()`; it has no command or
query leaf
(../../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:235-252,
../../packages/dispatch-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts:182-266).

## Public construction boundary

`ZerospinApis.getServiceFrontendApi` validates the exact
`publishableKey/serviceName/actorName/frontendName/signature` record, resolves a
fresh SystemWorker from the publishable-key claims, and authenticates the
service frontend once
(../../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:257-306).
The returned actor ID is decoded before any actor-specific projection target is
created, and the returned frontend specification must match the requested
service, actor, and frontend names
(../../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:307-355).

Authentication first validates the deployed service/actor/frontend graph and
the authored signature schema. Its first repository lookup is the singleton
ServiceRepo for that service, not an actor-specific projection
(../../packages/system-worker/src/authenticateServiceFrontend/authenticateServiceFrontend.ts:44-86).
ServiceRepo re-resolves the executable authentication callback from its trusted
deployed system and constructs a fresh null-prototype query registry containing
only the service actor's approved readable model queries. No raw client,
transaction, SQL, mutation, finalization capability, or sibling service model
is reachable through that callback
(../../packages/system-worker/src/ServiceRepo/authenticateServiceFrontend/authenticateServiceFrontend.ts:25-74).

```mermaid
sequenceDiagram
  autonumber
  participant Client
  participant Root as ZerospinApis
  participant Worker as SystemWorker
  participant Service as ServiceRepo
  participant Api as ServiceFrontendApi

  Client->>Root: getServiceFrontendApi(auth tuple)
  Root->>Worker: authenticateServiceFrontend(pinned generation)
  Worker->>Service: authenticateServiceFrontend(decoded signature)
  Service-->>Worker: actorId
  Worker-->>Root: actorId and frontend spec
  Root-->>Client: identity, spec, actor-bound Api
```

On success, the capability stores the authenticated actor ID, complete target
names, frontend version, system identity, worker name, deploy ID, and generation
ID. A caller cannot replace that scope on either leaf
(../../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:356-389,
../../packages/dispatch-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts:182-217).

## Trigger

1. [`fetchServiceFrontend`](../../packages/frontend/src/fetchServiceFrontend.ts)
   obtains the locally generated signature, opens a typed Cap'n Web session, and
   requests `getServiceFrontendApi` with the compiled service frontend identity
   (../../packages/frontend/src/fetchServiceFrontend.ts:23-110).
2. The admission result must match the compiled service, actor, frontend, and
   frontend version before the browser retains the returned capability
   (../../packages/frontend/src/fetchServiceFrontend.ts:111-150).
3. The returned `releaseFrontendApi` closes both the actor-bound capability and
   its owning root transport exactly once
   (../../packages/frontend/src/fetchServiceFrontend.ts:151-181).

## Annotated workflow steps

Each leaf rejects excess arguments, resolves a fresh SystemWorker, supplies the
stored authentication scope, captures telemetry, persists that batch through
SystemWorker, and returns the linked encoded envelope. Invalid arguments return
an encoded failure without invoking the domain handler
(../../packages/dispatch-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts:51-129).

1. `getFrontendState()` forwards the stored actor and frontend identity to
   `SystemWorker.getServiceFrontendState`
   (../../packages/dispatch-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts:132-155).
2. SystemWorker first verifies that the bound generation and exact controller
   binding remain authoritative, then checks read admission, validates the opaque
   actor ID, resolves that generation's frontend lineage, and invokes its
   deterministic ServiceFrontendRepo target
   (../../packages/system-worker/src/getServiceFrontendState/getServiceFrontendState.ts:25-154,
   ../../packages/system-worker/src/getServiceFrontendState/getServiceFrontendState.ts:156-259).
3. `createFrontendWebSocketTicket()` forwards the same stored actor target and
   returns the raw ticket together with the exact authoritative system,
   generation, service, actor, frontend, and frontend-version identity
   (../../packages/dispatch-worker/src/ServiceFrontendApi/ServiceFrontendApi.ts:157-180).
4. SystemWorker follows only a complete recorded successor chain to a ready,
   open target, refuses ticket creation until the ServiceFrontendRepo and
   ServiceFrontendBlockRepo registrations both exist, and requires the archive
   to cover the projection's advertised frontend index before minting the ticket
   in the target SystemRepo
   (../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:82-265,
   ../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:268-452).

```mermaid
flowchart LR
  Api["Actor-bound ServiceFrontendApi"] --> State["getFrontendState()"]
  Api --> Ticket["createFrontendWebSocketTicket()"]
  State --> Projection["ServiceFrontendRepo"]
  Ticket --> Ready["Projection plus archive readiness"]
  Ready --> Archive["ServiceFrontendBlockRepo WebSocket room"]
```

Admission failures return `ServiceFrontendApiFailure`, whose two leaves preserve
the same method shapes while returning the original encoded error and no
telemetry link
(../../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:397-408,
../../packages/dispatch-worker/src/ServiceFrontendApi/ServiceFrontendApiFailure.ts:8-27).

## Provider authority

The capability remains source-bound. Its state leaf does not follow a successor:
a drained source returns `frontend-generation-changed`, a removed target returns
`frontend-identity-changed`, and a same-generation controller version or spec
change returns `frontend-version-changed`. The stored source projection remains
untouched; this leaf returns the authority failure instead of replacing it with
successor or newer-version state
(../../packages/system-worker/src/getServiceFrontendState/getServiceFrontendState.ts:37-154).

The ticket leaf is the read-continuity exception. It verifies each drained
generation's recorded successor and the successor's inverse predecessor, rejects
cycles or incomplete lifecycle state, and mints only against the final ready,
open projection/archive pair. For a same-generation frontend-version change it
may return the newer version over the same immutable archive, while generation
reuse is rejected if model or projection schemas changed. The service surface
remains read-only throughout
(../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:82-265,
../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:268-452).

## Callers

1. The public frontend admission Effect retains the admitted capability and
   returns an explicit release that closes the capability and owning transport
   together (../../packages/frontend/src/fetchServiceFrontend.ts:93-181).
2. The frontend state and ticket Effects consume that admitted capability
   directly; neither adds a command or query operation
   (../../packages/frontend/src/fetchServiceFrontendState.ts:12-36,
   ../../packages/frontend/src/createServiceFrontendWebSocketTicket.ts:13-46).

See [[ServiceFrontendProjection]] for snapshot installation, bounded catch-up,
archive acknowledgement, and cross-generation lineage.
