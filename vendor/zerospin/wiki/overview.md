---
title: Overview
type: meta
updated: 2026-07-15
sources:
  - path: packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts
    sha: 5fbd6cb4a8df630a48ec18b3357b2df87fc0a63a
    lines: 129-230
  - path: packages/dispatch-worker/src/DevZerospinApis/DevZerospinApis.ts
    sha: 814212ae97aae99a7fc04c1b283f31e8f0d2a117
    lines: 227-285
  - path: packages/dispatch-worker/src/makeDispatchRuntime.ts
    sha: 6edc44830ff21a47443c533b6c50d637759eed76
    lines: 12-35
  - path: packages/system-worker/src/AccountRepo/AccountRepo.ts
    sha: 2d418b60b7bb367f69d2b9f761094809a700f487
    lines: 103-223
  - path: packages/system-worker/src/FrontendRepo/FrontendRepo.ts
    sha: 0f67aa7553b5ab97444a8358f82a11cc561afe5b
    lines: 41-275
---

# Overview

Zerospin is an Nx workspace for a sync engine built from Cloudflare Workers,
Durable Object repositories, Cap'n Web RPC gateways, and browser session
state. The repository contains public packages, documentation, and runnable
examples.

## What this project does

`packages/dispatch-worker` provides the environment-independent `ZerospinApis`,
`SystemApi`, and `FrontendApi` capability classes. Resolver interfaces supply
the environment-specific API-key identity and `SystemWorker` stub. Local
development is a concrete public implementation: `DevZerospinApis` owns deploy
readiness and constructs the gateway with static local identity plus the
same-isolate Worker export resolver
(../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:129-230,
../packages/dispatch-worker/src/makeDispatchRuntime.ts:12-35,
../packages/dispatch-worker/src/DevZerospinApis/DevZerospinApis.ts:227-285).

`packages/system-worker` owns the generation-scoped Durable Object graph.
AccountRepo owns canonical service replicas; account and service changes
converge through ActorRepo into one FrontendRepo projection per actor/frontend.
The browser packages bootstrap and live-sync that projection through
`FrontendApi` and FrontendBlockRepo
(../packages/system-worker/src/AccountRepo/AccountRepo.ts:103-223,
../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:41-275).

## Key modules

| Area          | Public modules                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Core domain   | `packages/core` — contracts, models, sessions, and system specs                                             |
| System worker | `packages/system-worker` — generation-scoped `*Repo` Durable Objects and block pipelines                   |
| Gateways      | `packages/dispatch-worker` — `ZerospinApis`, `SystemApi`, `FrontendApi`, resolvers, and `DevZerospinApis`   |
| Browser       | `packages/frontend`, `packages/react`, `packages/sdk`, `packages/shared-worker`, and `packages/devtools`    |
| Tooling       | `packages/cli`, `packages/logger`, `packages/studio`, and supporting packages                               |
| Docs          | `docs` and this generated `wiki`                                                                           |
| Examples      | `examples/parking` and `examples/shopping`                                                                 |

## Data flow

See [[architecture/Blockchain]] for the account/service → frontend block chains and [[architecture/bootstrapBrowserSession]] for client bootstrap and live block application.

## Entry points

- Deploy: [[architecture/DeploySystem]]
- Session: [[architecture/bootstrapBrowserSession]]
- Imperative system API: `SystemApi.finalizeAccountCommands` and `SystemApi.finalizeServiceCommands`

## Related pages

- [[index]]
- [[glossary]]
- [AGENTS.md](../../AGENTS.md) — agent scope and docs routing
