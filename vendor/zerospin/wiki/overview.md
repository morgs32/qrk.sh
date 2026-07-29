---
title: Overview
type: meta
updated: 2026-07-28
sources:
  - path: packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts
    sha: 1a7bbb43c173bdd8967ab6d09f85f1eb2e907002
    lines: 129-410
  - path: packages/dispatch-worker/src/DevZerospinApis/DevZerospinApis.ts
    sha: 0cc477bb520a8a2cc592ad81595fa5f76047d11a
    lines: 227-285
  - path: packages/dispatch-worker/src/SelfHostedZerospinApis/SelfHostedZerospinApis.ts
    sha: 9d0e90f9b743bc9e3e6c463e365db8bc2d1473bb
    lines: 235-344
  - path: packages/dispatch-worker/src/Worker.ts
    sha: f65a437ebbc271f9f00bdfb01b4cb725c6374d9f
    lines: 106-148
  - path: packages/dispatch-worker/src/LocalWorker.ts
    sha: c4580799a485a4ece97a5b0d5b6ae253c97922ca
    lines: 22-33
  - path: packages/dispatch-worker/src/makeDispatchRuntime.ts
    sha: 6edc44830ff21a47443c533b6c50d637759eed76
    lines: 12-35
  - path: packages/system-worker/src/AccountRepo/AccountRepo.ts
    sha: 4f4aa1d9b55e102e83f28dbc857335b8d0f24e46
    lines: 103-223
  - path: packages/system-worker/src/FrontendRepo/FrontendRepo.ts
    sha: 9312c62b6e61dffb65c85912fc1bd4a958e27409
    lines: 41-500
  - path: packages/react/src/acquireFrontendWebSocket.ts
    sha: af08d68747ba61629b37af6e0c12057c44cf42b3
    lines: 62-877
  - path: packages/system-worker/src/SystemWorker.ts
    sha: 5f5d7f276395d82c6708fada17960068fa914e85
    lines: 2584-2802
  - path: packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts
    sha: 365b12f0ef26b8a27aabf6a209b2d84035ca3741
    lines: 45-326
  - path: packages/system-worker/src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts
    sha: 0c7aff28b20709526ff7825b74726de91473e113
    lines: 38-168
  - path: packages/react/src/ZerospinConfig.tsx
    sha: 233f700d012ecd2d71a0f30b810dce81d8a59b50
    lines: 23-279
  - path: packages/react/src/makeReactFrontend.ts
    sha: c718f318c46bfd16063d4fed46bd2a4f40a39e6a
    lines: 63-121
  - path: packages/frontend/src/authenticate.ts
    sha: 3979f3541656b870901b3813ce63ff94a54d3ae7
    lines: 19-54
  - path: packages/devtools/src/zerospinDevtoolsController.ts
    sha: cf6c7227acddbc4a45189267554bfd7971d810e5
    lines: 1-107
  - path: packages/react/src/useCommissionFrontendReplica.ts
    sha: 21d08dda77eb1b4546b0f3bd0921333570193ac1
    lines: 45-1041
  - path: packages/shared-worker/src/SharedWorker/partitionSchemas.ts
    sha: 6a67722b0d866bfd019f7363612b5df4d571f030
    lines: 181-453
  - path: packages/react/src/acquireServiceFrontendWebSocket.ts
    sha: 672893661d59941da2e047707f13b4bb9d5a299f
    lines: 85-903
  - path: packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts
    sha: 491f7e4055485cd66fe9ff63449190be2fcba395
    lines: 1992-3869
  - path: packages/system-worker/src/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts
    sha: e412e8734eb3e77a19930016f10516ed148e3521
    lines: 38-418
  - path: packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts
    sha: 7c5d036a67378072550af1a57d7afa0611b89e32
    lines: 82-452
  - path: packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts
    sha: 6976de7c19ea26659199baa289d688973128066c
    lines: 39-1689
  - path: packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts
    sha: f397bf94edc70075ee9799c0b243cf28170bb226
    lines: 1325-1731
---

# Overview

Zerospin is an Nx workspace for a sync engine built from Cloudflare Workers,
Durable Object repositories, Cap'n Web RPC gateways, and browser session
state. The repository contains public packages, documentation, and runnable
examples.

## What this project does

`packages/dispatch-worker` provides the environment-independent `ZerospinApis`,
`SystemApi`, account-only `FrontendApi`, and read-only `ServiceFrontendApi`
capability classes. Resolver interfaces supply
the environment-specific API-key identity and `SystemWorker` stub. Current
self-hosted routing keeps the environments distinct: the private local Worker
entrypoint exports the historical `DevZerospinApis` namespace for
`ZEROSPIN_INSTANCE_ID=local`, while the production Worker exports and routes to
the separate `SelfHostedZerospinApis` namespace. Both construct the gateway with
the same-isolate Worker export resolver; local identity is static and production
validates the project-owned publishable or secret key
(../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:161-410,
../packages/dispatch-worker/src/makeDispatchRuntime.ts:12-35,
../packages/dispatch-worker/src/DevZerospinApis/DevZerospinApis.ts:233-280,
../packages/dispatch-worker/src/SelfHostedZerospinApis/SelfHostedZerospinApis.ts:235-344,
../packages/dispatch-worker/src/Worker.ts:106-148,
../packages/dispatch-worker/src/LocalWorker.ts:22-33).

`packages/system-worker` owns the generation-scoped Durable Object graph.
AccountRepo owns canonical service replicas; account and service changes
converge through ActorRepo into one account FrontendRepo projection per
actor/frontend. Independently, the singleton ServiceBlockRepo fans relevant
service blocks into actor-scoped, read-only ServiceFrontendRepo projections.
Account and service projections have distinct immutable lineage archives and
browser capabilities
(../packages/system-worker/src/AccountRepo/AccountRepo.ts:103-223,
../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:41-275,
../packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts:45-204,
../packages/system-worker/src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts:38-168).

`packages/react` owns Config-level authentication, active and commissioned
replica lifetimes, and direct-mode sockets. With SharedWorker enabled,
`packages/shared-worker` persists separate account/service catalogs and
physical SQLite databases; account local intent lives in a partition-owned
command journal so repair or generation transition can replace a materialized
database without deleting the only unpushed copy
(../packages/react/src/ZerospinConfig.tsx:93-143,
../packages/react/src/useCommissionFrontendReplica.ts:45-375,
../packages/shared-worker/src/SharedWorker/partitionSchemas.ts:181-453).

The account React factory also exposes a pre-Provider
`authenticate(signature)` Promise. It uses ordinary compiled-target admission,
returns identity metadata, and releases the temporary capability immediately.
Separately, mounted Config installs `window.zerospin.devtools.open()` and loads
the DevTools React shell only when that method is first invoked
(../packages/react/src/makeReactFrontend.ts:63-121,
../packages/frontend/src/authenticate.ts:19-54,
../packages/react/src/ZerospinConfig.tsx:145-235,
../packages/devtools/src/zerospinDevtoolsController.ts:64-106).

When authority changes within one generation, old account and service replicas
remain readable and continue archive replay under `update-required`. Service
stays read-only; account write admission is suspended and unfinished command
journal rows become dormant without deleting source data
(../packages/react/src/acquireFrontendWebSocket.ts:274-417,
../packages/react/src/acquireServiceFrontendWebSocket.ts:290-433,
../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:1992-2060,
../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:3170-3369,
../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:4739-4934).

## Key modules

| Area          | Public modules                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core domain   | `packages/core` — contracts, models, sessions, and system specs                                                                                   |
| System worker | `packages/system-worker` — generation-scoped `*Repo` Durable Objects and block pipelines                                                          |
| Gateways      | `packages/dispatch-worker` — capability gateways, resolvers, local `DevZerospinApis`, and production `SelfHostedZerospinApis`                   |
| Browser       | `packages/frontend`, `packages/react`, `packages/sdk`, `packages/shared-worker`, and `packages/devtools`                                          |
| Tooling       | `packages/cli`, `packages/logger`, `packages/studio`, and supporting packages                                                                     |
| Docs          | `docs` and this generated `wiki`                                                                                                                  |
| Examples      | `examples/parking` and `examples/shopping`                                                                                                        |

## Data flow

See [[architecture/Blockchain]] for the authoritative and projection chains,
[[architecture/ServiceFrontendProjection]] for actor-scoped service reads,
[[architecture/bootstrapBrowserSession]] for online-first direct/SharedWorker
bootstrap, and [[architecture/FrontendWebSocket]] for exact resume and
generation transitions. The browser's two fixed routes contain no Durable
Object name; SystemWorker consumes the appropriate account or service ticket
before selecting the server-derived archive. Ticket creation may follow only a
complete recorded successor chain, with the inverse predecessor verified at
every hop, to a ready/open projection and archive
(../packages/react/src/acquireFrontendWebSocket.ts:62-691,
../packages/react/src/acquireServiceFrontendWebSocket.ts:85-715,
../packages/system-worker/src/SystemWorker.ts:2584-2802,
../packages/system-worker/src/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts:38-417,
../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:82-451).

Deployment migrations use a finite two-phase drain. The predecessor freezes
write admission and exact owner/projection bounds while remaining readable;
the candidate replays owners and prepares account/service successor
projections through one explicit boundary. After the candidate is open and
routing is promoted, drain completion marks the predecessor drained, purges
both ticket kinds, and supersedes its archive rooms
(../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:39-117,
../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:176-381,
../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:384-1691,
../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:1325-1731).

## Entry points

- Deploy: [[architecture/DeploySystem]]
- Production seed: `zerospin seed --wrangler --env production`
- Session: [[architecture/bootstrapBrowserSession]]
- Service projection: [[architecture/ServiceFrontendProjection]]
- Imperative system API: `SystemApi.finalizeAccountCommands` and `SystemApi.finalizeServiceCommands`

## Related pages

- [[index]]
- [[glossary]]
- [AGENTS.md](../AGENTS.md) — agent scope and docs routing
