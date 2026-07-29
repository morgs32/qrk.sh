---
title: SystemApi
type: module
updated: 2026-07-28
sources:
  - path: packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts
    sha: 1a7bbb43c173bdd8967ab6d09f85f1eb2e907002
    lines: 129-410
  - path: packages/dispatch-worker/src/SystemApi/SystemApi.ts
    sha: c54223d45368499b2b347073e43e2560c0361ea8
    lines: 57-1316
  - path: packages/dispatch-worker/src/SystemWorkerResolver/SystemWorkerResolver.ts
    sha: 5701b2f09937c342c53a60d3e400a16cf512eb23
    lines: 1-18
  - path: packages/dispatch-worker/src/SystemWorkerResolver/WorkerExportsSystemWorkerResolver.ts
    sha: 5dd6bd7f35ef32bfe2d111bbf216c6933217d2b0
    lines: 7-30
  - path: packages/dispatch-worker/src/makeDispatchRuntime.ts
    sha: 6edc44830ff21a47443c533b6c50d637759eed76
    lines: 12-35
  - path: packages/system-worker/src/SystemWorker.ts
    sha: 86ec0244f0688ea6dd2bc4d97bda74a8ce055a16
    lines: 391-433
  - path: packages/system-worker/src/SystemLogRepo/appendTelemetryBatch/appendTelemetryBatch.ts
    sha: a67304fe51e10a0880fcf2069ad10db27976610c
    lines: 21-154
  - path: examples/shopping/src/Worker.ts
    sha: 3f3493229f0e869d7144ad62cbc0eb2b02eda200
    lines: 9-84
---

# SystemApi

`SystemApi` is the secret-key capability for imperative system operations and
generation-scoped repository inspection. `ZerospinApis.getSystemApi` validates
the request, resolves the supplied key through the configured identity
resolver, rejects non-secret identities, derives `systemWorkerName`, and
constructs `SystemApi` with the root's pinned `deployId` and `generationId`.
Failures are returned as `SystemApiFailure`
(../../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:161-203).

Service-owned browser admission is not a `SystemApi` operation. It enters
through `ZerospinApis.getServiceFrontendApi` and returns the separate
actor-bound `ServiceFrontendApi`; the secret-key capability remains an
operator/tooling surface
(../../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:235-410).

## Resolver-owned runtime

The gateway does not own an environment-specific dispatch implementation.
`makeDispatchRuntime` combines the public identity and SystemWorker resolver
layers with the shared async/id services. `ISystemWorkerResolver.get` is the
portable boundary: every leaf resolves a fresh disposable stub by
`systemWorkerName`, so an RPC target does not retain a stub across Durable
Object redeploys
(../../packages/dispatch-worker/src/makeDispatchRuntime.ts:12-35,
../../packages/dispatch-worker/src/SystemWorkerResolver/SystemWorkerResolver.ts:4-17).

Standalone Workers use `WorkerExportsSystemWorkerResolver`; it ignores the
logical dispatch name and returns the co-located `exports.SystemWorker` loopback
binding. The shopping example supplies that resolver and deployment-bound
identity to one concrete `ZerospinApis` root
(../../packages/dispatch-worker/src/SystemWorkerResolver/WorkerExportsSystemWorkerResolver.ts:7-30,
../../examples/shopping/src/Worker.ts:26-41).

```mermaid
sequenceDiagram
  participant Client
  participant Root as ZerospinApis
  participant Identity as ApiKeyIdentityResolver
  participant Api as SystemApi
  participant Resolver as SystemWorkerResolver
  participant Worker as SystemWorker

  Client->>Root: getSystemApi(secret key)
  Root->>Identity: resolve(secret key)
  Identity-->>Root: system identity
  Root-->>Client: SystemApi or SystemApiFailure
  Client->>Api: linked leaf request
  Api->>Resolver: get(systemWorkerName)
  Resolver-->>Api: fresh disposable stub
  Api->>Worker: operation(pinned deploy/generation)
  Worker-->>Api: encoded result
  Api-->>Client: linked result envelope
```

## Common leaf boundary

All 29 leaves use the same handler boundary. It validates the exact argument
tuple, returns schema failures as an encoded result with `link: null`, resolves
one fresh SystemWorker, annotates the server span with system/deploy/generation
identity, and runs the named Effect. After the domain operation settles, it
flushes and persists the telemetry batch with the same pinned pair; a valid
caller trace receives a `causedBy` link only when persistence succeeds
(../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:72-155).

The class keeps only the immutable auth result and dispatch runtime. Every
public Promise method is boundary glue that invokes the named Effect through
the common handler
(../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:679-1316).

## Operational leaves

1. `hello` checks the bound generation through `SystemWorker.hello`
   (../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:157-168,
   ../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:704-716).
2. `getFrontendState` reads one account/actor/frontend projection while adding
   the pinned deployment identity and system-worker name
   (../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:170-194,
   ../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:721-753).
3. `executeServiceQuery` delegates a named service query and unknown parameters
   (../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:196-216,
   ../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:755-784).
4. `finalizeAccountCommands` forwards full account commands through a traced
   SystemWorker call with transient Durable Object retries. It rejects a pushed
   block result on this direct path and validates the account-specific terminal
   command shapes before returning the block result
   (../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:218-282,
   ../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:786-844).
5. `executeSelectQuery` delegates an encoded select-only query with transient
   retries (../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:284-303,
   ../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:846-878).
6. `finalizeServiceCommands` forwards full service commands and returns the
   executed and failed terminal command arrays
   (../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:305-327,
   ../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:880-914).
7. `makeSystemSpec` returns the deployed system specification snapshot
   (../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:662-673,
   ../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:1302-1316).

## Repository explorer leaves

The remaining 22 leaves form eleven registration/table-read pairs. Each
`get*Repos` call returns the registered repos for one category, and each matching
`get*RepoTableRows` call accepts `{ repoName, tableName }` and returns that
table's data. The categories are SystemRepo, AccountRepo, AuthorizationRepo,
ActorRepo, FrontendRepo, ServiceRepo, AccountBlockRepo, ActorBlockRepo,
FrontendBlockRepo, ServiceBlockRepo, and SystemLogRepo
(../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:329-659,
../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:916-1299).

`ServiceFrontendRepo` and `ServiceFrontendBlockRepo` are deliberately absent
from these explorer pairs. They are actor-specific browser projection/archive
bindings reached through the service frontend admission path, not a merged
account/service explorer surface
(../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:916-1299).

```mermaid
flowchart LR
  SystemApi --> SystemWorker
  SystemWorker --> SystemRepo
  SystemWorker --> AccountRepo
  SystemWorker --> AuthorizationRepo
  SystemWorker --> ActorRepo
  SystemWorker --> FrontendRepo
  SystemWorker --> ServiceRepo
  SystemWorker --> AccountBlockRepo
  SystemWorker --> ActorBlockRepo
  SystemWorker --> FrontendBlockRepo
  SystemWorker --> ServiceBlockRepo
  SystemWorker --> SystemLogRepo
```

Every delegated leaf includes the capability's `deployId` and `generationId`;
the client cannot select another generation through repository-explorer input
(../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:329-657).

## Telemetry storage

`SystemApi` persists each completed server batch through
`SystemWorker.appendTelemetryBatch` using the same deploy/generation pair used
by the domain leaf. The Worker delegates to the generation-scoped SystemLogRepo,
whose append program validates the batch, stores spans/logs/links, and preserves
the supplied identity on the rows
(../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:124-131,
../../packages/system-worker/src/SystemWorker.ts:391-433,
../../packages/system-worker/src/SystemLogRepo/appendTelemetryBatch/appendTelemetryBatch.ts:21-154).

## Callers

1. A public Worker may expose `ZerospinApis` directly through Cap'n Web, as the
   standalone shopping example does for requests outside its fixed frontend
   WebSocket route (../../examples/shopping/src/Worker.ts:43-84).
2. Tooling clients request `SystemApi` from the concrete root and consume the
   linked envelopes; environment-specific key verification and SystemWorker
   lookup remain resolver responsibilities
   (../../packages/dispatch-worker/src/ZerospinApis/ZerospinApis.ts:129-199,
   ../../packages/dispatch-worker/src/SystemWorkerResolver/SystemWorkerResolver.ts:4-17).
