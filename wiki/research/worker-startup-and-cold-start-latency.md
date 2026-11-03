# Worker startup CPU and request cold starts

Researched 2026-11-03 against Cloudflare's current documentation and QRK's saved
Zerospin 39.0.0 deployment/profile artifacts. Research only; no implementation,
configuration, deployment, storage, or registry changes were made.

## What the 709 ms means

Cloudflare reported **Worker Startup Time: 709 ms** for the regular QRK Worker,
version `495cfbd0-1a34-4e14-832d-88ad2630a765`. This passed the platform's
**1000 ms startup limit**, which covers parsing and executing global-scope code
before request handlers. It is a deployment startup measurement, not an observed
HTTP request's time to first byte.
[Deployment output](/private/tmp/qrk-startup-39/regular-deploy.log),
[startup limit and measurement](https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time).

It is related to a cold start: Cloudflare defines a complete cold start as loading
and compiling source, executing the module's top level, and serving the initial
invocation. Preloading during TLS negotiation can overlap some work; it does not
guarantee that the whole delay disappears. Cloudflare's 2025 engineering account
explicitly revisits its older five-millisecond claims as applications grew.
[Cold-start phases and prewarming](https://blog.cloudflare.com/eliminating-cold-starts-2-shard-and-conquer/).

An existing isolate can serve multiple requests, including concurrent requests;
it does not rerun module initialization for every request. Isolates can also be
evicted, and requests have no guarantee of reaching the same instance. Therefore
709 ms is neither a charge applied to every request nor a measured cold-request
latency distribution.
[Worker isolate lifecycle](https://developers.cloudflare.com/workers/reference/how-workers-works/).

QRK also has a second initialization layer: an inactive Durable Object runs its
constructor on its first event, and a hibernated object runs that constructor
again when awakened. Obtaining its stub alone does not instantiate it. Worker
startup validation does not measure a particular object's constructor, SQLite
opening, or Zerospin recovery/replay during a real request.
[Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

## Is it long?

**Engineering judgment: 709 ms is substantial global initialization work.** It
uses about 71% of the permitted startup budget, leaving 291 ms of headroom. The
one-second limit is an acceptance ceiling, not a recommended latency objective.
The inspected primary sources provide no workload-matched percentile that would
justify calling QRK's complete request cold start typical or atypical from this
number alone.
[Measured candidate](/private/tmp/qrk-startup-39/regular-deploy.log),
[platform ceiling](https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time).

QRK's saved local profiles show active CPU of 265.9, 257.1, and 268.0 ms, with a
265.9 ms median; Cloudflare's value remains 709 ms. Local profiling is useful for
finding expensive functions, but its duration is not a substitute for Cloudflare
startup time because it runs on different hardware. Sampled function costs are
leads for experiments, not guaranteed remote savings.
[Sample 1](/private/tmp/qrk-startup-39/startup-1.log),
[sample 2](/private/tmp/qrk-startup-39/startup-2.log),
[sample 3](/private/tmp/qrk-startup-39/startup-3.log),
[Wrangler profiler limitations](https://developers.cloudflare.com/workers/wrangler/commands/workers/#startup).

## Highest-value next investigations

1. **Definition-location instrumentation in Zerospin.** Mapped frames for Effect
   function construction, `makeFn`, `makeTx`, and `rpcMethod` total about 82 ms of
   local mean self samples, roughly 31% of captured active CPU. The latter two
   eagerly read and split `new Error().stack`; `makeFn` captures an Error at
   definition and accesses its stack lazily. Benchmark cheaper definition-source
   handling, such as build-time locations or a deliberate production capture
   policy, while preserving named spans and useful error locations. This is not
   proof that 82 ms would disappear, and `makeFn` is not simply a second
   `Effect.fn` wrapper. Effect documents `fnUntraced` as removing tracing spans and
   stack traces, so that substitution changes observability semantics.
   [Profile](/private/tmp/qrk-startup-39/startup-1.cpuprofile),
   [Effect definition capture](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/internal/effect.ts:1275),
   [fnUntraced semantics](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/Effect.ts:22890),
   [makeFn](/Users/morgs32/GitHub/zerospin/packages/logger/src/makeFn.ts:26),
   [makeTx](/Users/morgs32/GitHub/zerospin/packages/core/src/drizzle/make/makeTx.ts:43),
   [rpcMethod](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeRpcApi/makeRpcApi.ts:237).
2. **Keep preview/catalog work out of the backend's import path.** QRK imports
   complete module versions; their factory builds a generation catalog and
   decodes preview defaults eagerly. The GitHub activity module also generates
   365 dated sample rows at module evaluation, with about 6.6 ms local self time.
   Keep native backend component/state/spec facts module-owned, while preparing
   preview data and generation catalogs where their App/API consumers need them,
   or precomputing suitable static data before deployment.
   [Backend imports](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/backendLibrary.ts:1),
   [module construction](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/makeModuleVersion.ts:106),
   [sample generation](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/githubActivity/githubActivityV1.ts:39),
   [preview consumer](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModulePreview.tsx:28),
   [generation consumer](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/generateSpec.ts:130).
3. **Construct the current Actor once.** Actor9 imports a chain back to Actor3;
   each upgrade reconstructs native Actor facts and captures selections again.
   A direct current declaration could reuse its owned authentication/identity
   facts without constructing predecessor Actor objects. Preserve every
   registered release, canonical selection, and required Contract upgrade chain.
   This opportunity has no measured saving yet and can overlap instrumentation
   costs above.
   [Actor chain](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/actors/userActorV9.ts:2),
   [Actor upgrade](/Users/morgs32/GitHub/zerospin/packages/core/src/aggregateActor/updateAggregateActorRelease.ts:120),
   [selection capture](/Users/morgs32/GitHub/zerospin/packages/core/src/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease.ts:311).

## Measuring the user-visible result

Measure actual request latency separately from startup CPU. Workers' wall-time
metric includes I/O and `waitUntil()` work and is not identical to response
completion time. Request CPU, request wall time, client-observed response timing,
and Durable Object activation/recovery each answer different questions. Repeating
a request or waiting for a fixed idle interval does not prove which isolate it
will use.
[Workers metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#wall-time-per-execution),
[instance routing and eviction](https://developers.cloudflare.com/workers/reference/how-workers-works/),
[object activation](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

Cloudflare recommends reducing expensive global work and unnecessary bundle
dependencies, or moving initialization to build time or a handler. Moving required
work to the first handler call improves the upload startup budget while shifting
that cost into the first request; it should be judged against actual latency too.
Removing work or doing it before deployment can reduce both.
[Startup optimization guidance](https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time).

Runtime splitting also requires a real module boundary: Wrangler normally bundles
a dynamic import back into the entrypoint. Its documented separate-module rules
and `find_additional_modules` support loading a module only when it is imported.
This is an option to investigate after locating an expensive, rarely used import,
not evidence that adding `import()` alone would improve QRK.
[Wrangler bundling and additional modules](https://developers.cloudflare.com/workers/wrangler/bundling/#find-additional-modules).
