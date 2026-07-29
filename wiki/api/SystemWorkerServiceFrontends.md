---
title: SystemWorker Service Frontend Bindings
type: api
updated: 2026-07-28
sources:
  - path: packages/system-worker/package.json
    sha: 01b8f4a5ce89b7768731503cfd2af3e325b9163d
    lines: 8-26
  - path: packages/system-worker/src/SystemWorker.ts
    sha: 86ec0244f0688ea6dd2bc4d97bda74a8ce055a16
    lines: 92-2814
  - path: packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts
    sha: 365b12f0ef26b8a27aabf6a209b2d84035ca3741
    lines: 44-334
  - path: packages/system-worker/src/ServiceFrontendRepo/drainGeneration/drainGeneration.ts
    sha: b2a0a609358af0bd5ff7d26732522abd5a8864e4
    lines: 10-65
  - path: packages/system-worker/src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts
    sha: 0c7aff28b20709526ff7825b74726de91473e113
    lines: 37-329
  - path: packages/system-worker/src/authenticateServiceFrontend/authenticateServiceFrontend.ts
    sha: 11230976ef6334db580ad85a46a0b8e6c4a8b313
    lines: 22-103
  - path: packages/system-worker/src/getServiceFrontendState/getServiceFrontendState.ts
    sha: 96e4196bca64fa89b0586f28330cd03860fccca7
    lines: 25-259
  - path: packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts
    sha: 7c5d036a67378072550af1a57d7afa0611b89e32
    lines: 28-452
  - path: packages/dispatch-worker/src/Worker.ts
    sha: f65a437ebbc271f9f00bdfb01b4cb725c6374d9f
    lines: 9-149
  - path: packages/dispatch-worker/src/LocalWorker.ts
    sha: c4580799a485a4ece97a5b0d5b6ae253c97922ca
    lines: 3-33
---

# SystemWorker Service Frontend Bindings

The `system-worker` package's root export resolves to the Cloudflare Worker
entrypoint, which exports `ServiceFrontendRepo` and
`ServiceFrontendBlockRepo` alongside the existing Durable Object classes
(../../packages/system-worker/package.json:8-14,
../../packages/system-worker/src/SystemWorker.ts:92-106).

The production and local dispatch entrypoints both export those two Durable
Object classes. The production entrypoint also exports the distinct
`SelfHostedZerospinApis` controller, while `LocalWorker` preserves the
`DevZerospinApis` class name and reuses the same request handler. That handler
forwards both account and service-frontend WebSocket upgrades through the
co-located `SystemWorker`
(../../packages/dispatch-worker/src/Worker.ts:9-24,
../../packages/dispatch-worker/src/Worker.ts:31-105,
../../packages/dispatch-worker/src/Worker.ts:110-147,
../../packages/dispatch-worker/src/LocalWorker.ts:3-33).

## `ServiceFrontendRepo`

The direct-RPC surface supports state bootstrap, ServiceBlock delivery, outbox
drain, projection-readiness inspection, successor preparation, and generation
drain. State and readiness results retain the generation, service watermark,
frontend index, segment classification, and predecessor descriptor needed by
the lifecycle coordinator
(../../packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts:44-93).

The generation-drain boundary actively drains the archive outbox for a hosted
Worker. Under `ZEROSPIN_SELF_HOSTED`, it instead performs an inspection-only
count and rejects any unpublished or failed outbox rows, preventing newly
uploaded code from completing archive work owned by the previous upload
(../../packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts:309-323,
../../packages/system-worker/src/ServiceFrontendRepo/drainGeneration/drainGeneration.ts:27-63).

## `ServiceFrontendBlockRepo`

The archive RPC surface records immutable predecessor metadata, stores lineage
blocks, reads and asserts archive bounds, reads indexed suffixes, exposes the
predecessor descriptor, and accepts generation-superseded notifications
(../../packages/system-worker/src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts:37-81).

## SystemWorker admission and socket bindings

`SystemWorker.authenticateServiceFrontend`, `getServiceFrontendSpec`,
`getServiceFrontendState`, and `createServiceFrontendWebSocketTicket` are thin
encoded RPC boundaries over the named Effects. Admission resolves the service,
actor, and frontend binding, decodes the signature before executing the
server-only callback, and returns an actor ID before any actor-specific
projection repo name is constructed
(../../packages/system-worker/src/SystemWorker.ts:314-390,
../../packages/system-worker/src/authenticateServiceFrontend/authenticateServiceFrontend.ts:22-103,
../../packages/system-worker/src/getServiceFrontendState/getServiceFrontendState.ts:25-259,
../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:28-452).

State and ticket authority deliberately differ. State rejects a drained source,
removed identity, or same-generation controller mismatch instead of reading a
different projection. Ticket creation may follow a complete durable successor
chain with verified inverse predecessors, or report a newer frontend version in
the same generation, but mints only after the final ready/open projection and
archive prove coverage. The dispatch capability forwards its stored target to
these boundaries; it does not choose authority itself
(../../packages/system-worker/src/getServiceFrontendState/getServiceFrontendState.ts:37-154,
../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:82-265,
../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:268-452).

The service websocket route consumes its service-specific ticket, derives and
validates the `ServiceFrontendBlockRepo` name, and forwards the upgrade only to
the matching service archive. The spent ticket's persisted `frontendVersion` is
forwarded in a private header rather than accepted from the browser. The route
does not share the account FrontendBlockRepo route or ticket table. Hosted
Workers require the ticket generation to equal the upload-bound generation;
self-hosted Workers admit the generation selected by their durable deployment
controller
(../../packages/system-worker/src/SystemWorker.ts:2693-2811).

These classes are Worker binding targets, not browser gateways. Public browser
admission remains in `ServiceFrontendApi`, and projection/archive behavior is
documented separately
(../../packages/system-worker/src/SystemWorker.ts:92-106,
../../packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts:195-204,
../../packages/system-worker/src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts:158-171).

See [[ServiceFrontendApi]] and [[ServiceFrontendProjection]].
