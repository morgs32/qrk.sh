# Zerospin declaration startup cost

Research date: 2026-11-03. Scope: QRK’s installed Zerospin 38.2.2 and Effect 4.0.2. This is a source investigation with one existing local CPU sample; it is not a completed before/after benchmark or a diagnosis of Cloudflare’s startup limit.

## Finding

“Construction” includes compiling and repeatedly copying portable metadata. A contract becomes a complete `ContractSpec`; an Actor embeds complete contract and model specs; an Aggregate embeds its contracts and its Actors. Actor updates reconstruct the Actor and its metadata even when the authored change is a small contract-map patch. This creates work proportional to the expanded metadata traversed by the constructors, multiplied by the versions evaluated during module import. The sources establish repeated work, but do not establish an exponential complexity bound or the feature’s incremental cost. [Contract construction](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/contracts/make/constructContractRelease.ts:305), [Actor projection](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/declaration/makeActorSpecs.ts:43), [Aggregate projection](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/declaration/makeReleaseSpecs.ts:52), [Actor update](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/aggregateActor/updateAggregateActorRelease.ts:120).

## Where the work happens

1. **Contracts generate several JSON Schema documents eagerly.** `finishContractDefinition` derives an operations codec, validates scopes, and constructs the failures codec. It then converts claims, result, failures, and operations schemas to JSON Schema, copies every model spec, projects operation specs, and validates/seals the resulting contract spec. A model operation also embeds another cloned copy of its model spec. This duplication exists before Actor construction. [Constructor](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/contracts/make/constructContractRelease.ts:305), [operation projection](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/contracts/operationSchema.ts:95).

2. **Actors repeat projection, nested validation, copying, and freezing.** `projectActorFacts` includes full `contract.spec` values and generates identity/claims JSON Schema. `makeAggregateActorSpec` decodes the complete nested spec, adds credentials JSON Schema, then calls `sealOwnedMetadata(structuredClone(spec))`. The Actor spec schema contains complete contract/model schemas; the contract schema treats its JSON Schema documents as `Schema.Json`. Already validated child documents are therefore checked again when validating the parent. [Actor projection](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/declaration/makeActorSpecs.ts:43), [Actor validation/copy](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/declaration/makeActorSpecs.ts:71), [nested spec schemas](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/declaration/ReleaseSpecSchemas.ts:36), [contract JSON fields](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/contracts/ContractSpecSchema.ts:10).

3. **Owners copy the expanded tree again.** `makeAggregateSpec` constructs a tree containing model metadata, complete contract specs, and complete Actor specs, then clones and seals that tree. Separately, `projectModelSpec` clones all of `model.spec` before replacing its attribute/property descriptors with individually cloned descriptors, discarding the initial copies of those descriptor trees. [Aggregate metadata](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/declaration/makeReleaseSpecs.ts:52), [model projection](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/system/project/projectModelSpec.ts:6).

4. **Sealing has an avoidable allocation in its current implementation.** It recursively freezes objects, skipping already frozen values. Its object branch invokes `mapValues` and discards the returned record; es-toolkit allocates that record and an `Object.keys` array. Cloning a previously frozen tree first produces new objects, so the frozen-object shortcut cannot reuse the original children. [Sealer](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/declaration/sealOwnedMetadata.ts:4), [mapValues implementation](/Users/morgs32/GitHub/qrk.sh/node_modules/.pnpm/es-toolkit@1.52.0/node_modules/es-toolkit/dist/object/mapValues.js:20).

5. **Effect caches some work, but not these entire repeated conversions/checks.** `Schema.Json` creates a new per-call traversal cache, rather than retaining a cache for previously validated frozen values. `toJsonSchemaDocument` performs representation generation and compilation with fresh maps. However, the JSON-codec AST transformation is memoized, and Zerospin memoizes model operation codecs per exact Model. It would be inaccurate to describe all schema work as uncached. [JSON validation](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/SchemaAST.ts:5209), [conversion entry point](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/Schema.ts:16355), [representation state](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/internal/schema/toRepresentation.ts:37), [compiler state](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/internal/schema/toJsonSchemaDocument.ts:184), [AST memoization](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/SchemaAST.ts:4440), [operation codec cache](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/contracts/operationCodecs.ts:265).

## What is required versus repeated

Declaration construction also performs meaningful exact-model, contract-scope, selection, and identity checks. For example, model visibility validation reads `model.spec.propertiesShape` to compare exposed fields with canonical fields; this is a metadata consumer outside final portable compilation. That does not establish a requirement for every nested JSON Schema document to be regenerated, cloned, or revalidated at each parent. Moving validation or changing the public declaration shape remains a separate design decision. [Actor construction checks](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease.ts:279), [model visibility checks](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/declaration/validateModelVisibility.ts:37).

The final `makeSystemSpec` compiler already collects contract lineages into a version map and replaces owner/Actor contract values with version references. However, that flattening occurs after the eager expanded declaration metadata has been built. Its request path invokes the compiler inside an Effect; no `makeSystemSpec`, `compileOwner`, or `hashSystemSpec` frames appeared in the saved startup sample. Do not charge its final hashing/validation to that observed import profile. [Portable compilation](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/@zerospin/core/src/system/make/makeSystemSpec.ts:30), [request invocation](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/system-worker/src/getSystemSpec/getSystemSpec.ts:16).

## Measurement and limits

The existing [local CPU profile](/private/tmp/qrk-plan050-startup.cpuprofile) spans approximately 775 ms. About 187 ms was sampled beneath `makeAggregateActorSpec` frames, and about 77 ms in garbage collection. Native operations can be attributed to their calling JavaScript frame, so Actor-spec self time is not a precise independent measurement of cloning or freezing. These samples support investigating metadata construction and allocation; they do not assign exact costs to each operation.

QRK’s current Actor import chain reaches Actor versions 3–9 even though the System registers version 9. Thus unregistered historical declarations can still incur module-evaluation work; registry membership and import evaluation are distinct. This does not imply that those Actors are admitted for new runtime operations. [Actor V9 imports/update](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/actors/userActorV9.ts:2), [Actor V7 imports/construction](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/actors/userActorV7.ts:3), [initial Actor V3 construction](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/actors/userActorV3.ts:61), [System registration](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/system.ts).

A controlled baseline comparison, repeated samples, and remote attribution remain incomplete. Neither Plan 050 nor session locks are proven to be the cause of the deployed startup rejection. The separate [session-lock identity investigation](/Users/morgs32/GitHub/qrk.sh/wiki/research/zerospin-session-lock-identities.md) covers the lock question. This research changed documentation only; it did not resume rollout or alter SDK code, databases, or backups.

## Published 39.0.0 adoption check — 2026-11-03

QRK now consumes exact Zerospin 39.0.0 pins: 25 direct dependency entries across
five manifests. The configured local registry served the published artifacts;
the frozen-lockfile installation passed. The SDK-managed AGENTS.md rule was
refreshed and its check passed. No application declaration, canonical selection,
or registered release was changed during adoption.

Wrangler 4.128.0 profiled the actual current production entry and QRK config,
with Aggregate9 as the existing sole registered release. Both outer and nested
commands used an empty env file. This was local `check startup` work, which builds
with `deploy --dry-run`; it performed no upload or deployed-resource changes.

1. Sample 1: 322.4 ms profile window, 265.9 ms active CPU, including 18.8 ms GC.
2. Sample 2: 309.6 ms profile window, 257.1 ms active CPU, including 18.8 ms GC.
3. Sample 3: 320.0 ms profile window, 268.0 ms active CPU, including 16.7 ms GC.

The median active CPU is 265.9 ms, about 63% below the earlier 38.2.2 sample's
716.7 ms on this machine. The generated bundle is 3907.80 KiB / gzip 683.88 KiB,
versus the earlier 3913.01 KiB / gzip 684.34 KiB. Profiles and command logs are in
`/private/tmp/qrk-startup-39/`; these are diagnostics, not database backups.

These samples are below 1000 ms locally. **They do not prove Cloudflare accepts
the Worker.** Wrangler has no local threshold assertion, and Cloudflare documents
that local CPU timings can differ substantially from its platform. An upload or
deployment is required for authoritative `startup_time_ms` and error-10021
acceptance. Before deployment was authorized, the live backend returned
maintenance HTTP 503 during a read-only probe.
[Startup limit](https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time),
[local profiler limitations](https://developers.cloudflare.com/workers/wrangler/commands/workers/#startup).

Consumer verification passed: backend 20 tests in five files, App/Admin builds,
API dry-run build, and App/API/Scraper TypeScript checks. Admin's typecheck still
fails because its `SystemDiagrams` call omits the required `navigation` prop;
the retained 38.2.2 and installed 39.0.0 declarations have the same requirement,
so this is an existing host-routing issue outside this adoption change.

### Regular Worker: Cloudflare acceptance confirmed

The user then authorized using the regular Worker rather than an isolated test.
Cloudflare accepted `qrk-zerospin` with **Worker Startup Time: 709 ms**, below its
1000 ms limit. The deployed version is
`495cfbd0-1a34-4e14-832d-88ad2630a765`, on `zerospin.qrk.sh`. The upload and trigger
deployment succeeded; this is authoritative acceptance for the tested candidate.
The deployment log is `/private/tmp/qrk-startup-39/regular-deploy.log`.

All three secret binding names and the existing authorized-party binding were
preserved through `--keep-vars`; the custom domain is unchanged, and workers.dev
and preview URLs remain disabled. Paginated inventory confirms all 21 QRK
bindings resolve to its new namespaces and the separate `qrk-api` still has its
five namespaces. No further data deletion or backup creation occurred.

The standard SDK post-upload flow accepted the executing SystemSpec and
initialized its metadata; the current configuration has no Services or Agents.
Authenticated `SystemApi.healthcheck` returned `healthy`. No temporary Cloudflare
Worker was created. Matching App production deployment remains a separate step.
