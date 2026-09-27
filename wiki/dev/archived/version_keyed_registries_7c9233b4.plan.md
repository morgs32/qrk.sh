---
name: Version keyed registries
overview: Change `makeSystem` so aggregate and service registries are authored as version-keyed records, matching the resolved system, and cut over every caller.
todos:
  - id: factory
    content: Retype makeSystem and decodeSystemProps to version-keyed records, with key === version checks
    status: completed
  - id: callers
    content: Cut over every makeSystem call site from version arrays to version records
    status: completed
  - id: checks
    content: Update typechecks, normalization spec, and AuthoredSystem registration sentence
    status: completed
isProject: false
---

# Version-keyed system registries

**Status:** Archived at the maintainer’s request after implementation in [PR #22](https://github.com/morgs32/zerospin/pull/22). Recorded verification results and remaining acceptance limitations are preserved below.

`makeSystem` already returns `services[name][version]`. The array exists only on the way in, in [`packages/core/src/system/make/makeSystem/makeSystem.ts`](packages/core/src/system/make/makeSystem/makeSystem.ts) and [`packages/core/src/system/make/makeSystem/decodeSystemProps/decodeSystemProps.ts`](packages/core/src/system/make/makeSystem/decodeSystemProps/decodeSystemProps.ts). Replace that input outright. No array overload.

Authored shape:

```ts
services: {
  app: { '1.0.0': appServiceV1 },
  promotion: { '1.0.0': promotionService },
},
aggregates: {
  shopper: { '2.0.0': shopperAggregateV2 },
},
```

The record key must equal that definition’s `version`, the same way the outer key must equal `name`.

## Factory

In both `makeSystem` overloads, change the generics from `Record<string, readonly Definition[]>` to `Record<string, Readonly<Record<string, Definition>>>`.

Constrain each inner key the way the name key is constrained today: the value must be `{ name: SERVICE_NAME; version: VERSION }` (and the existing layer-requirement check). [`IResolvedAggregates`](packages/core/src/system/make/makeSystem/makeSystem.ts) indexes `AGGREGATES[NAME][VERSION]` instead of `AGGREGATES[NAME][number]`. The service return map stops remapping array elements with `as DEFINITION['version']` and keeps the authored version keys.

Runtime: `decodeSystemProps` accepts `Schema.Record(Schema.String, Schema.Record(Schema.String, AggregateSchema | ServiceSchema))`. `makeSystem` walks `Object.entries`, throws when the key differs from `definition.version`, and still resolves each definition into the version map. Delete the duplicate-version throws; object keys cannot repeat.

## Call sites

Rewrite every `makeSystem({...})` array to an explicit version key. About twenty files, including [`examples/shopping/src/zerospin/system.ts`](examples/shopping/src/zerospin/system.ts), [`examples/tic-tac-toe/src/system.ts`](examples/tic-tac-toe/src/system.ts), [`e2e/frontend-adapters/src/system.ts`](e2e/frontend-adapters/src/system.ts), [`packages/config/src/config.ts`](packages/config/src/config.ts), [`packages/core/src/fixtures/system.ts`](packages/core/src/fixtures/system.ts), and [`packages/system-worker/src/fixtures/system.ts`](packages/system-worker/src/fixtures/system.ts).

The notes fixture currently builds three versions with `.map`. Write three literal keys (`'0.8.0'`, `'0.9.0'`, `'1.0.0'`) so the key stays a version literal.

Update the normalization spec so it still expects `system.services.catalog['1.0.0']`.

Mention the version-keyed registry in the `makeSystem` registration sentence in [`wiki/architecture/AuthoredSystem.md`](wiki/architecture/AuthoredSystem.md).

## Patterns review — 2026-09-23

1. Reviewed shared factory inference/assertion guidance and the local naming/typecheck patterns. Preserve exact inferred definitions and literal version keys without caller casts. Use the existing `mapValues` mechanism for record transformation; validate authored keys before resolving definitions.
2. This is PR 3, based on `codex/split-mock-sessions` (PR 21). Current source has 38 `makeSystem` call sites across packages/examples; the historical `e2e/` directory is absent. Search current source rather than relying on the original twenty-file estimate.
3. Update both overloads, decoded input schemas, and all authored registries. Preserve owner-layer requirements until the following system-runtime plan replaces that machinery. Keep actor-version conflict validation and cross-owner service binding checks.
4. Add runtime mismatched-version tests for both registries and compile-time proofs for both overload variants. Preserve normalization and service-model ownership behavior, and update active authored-system documentation.
5. Run Core typecheck and focused system registry/ownership tests, then the affected SDK, worker, CLI/config, React, and example consumer typechecks through one Nx task graph. Keep unrelated baseline failures separate.

## Implementation and verification — 2026-09-23

1. Both `makeSystem` overloads and `decodeSystemProps` accept version-keyed records only. Each nested version key is checked statically and at runtime against the definition. Resolution preserves authored version keys; obsolete array normalization and duplicate-version checks are removed.
2. Migrated current callers, including the indirect schema-validation fixture and explicit three-version notes registry. Updated the authored-system registration documentation. Owner-layer requirements and actor/service binding validation remain unchanged.
3. Added aggregate/service mismatched-version runtime cases and type proofs for both overloads; retained exact version-key inference and moved existing rejection directives to the new inner-entry diagnostic locations.
4. Core, React, worker, CLI, and Tic-Tac-Toe Nx typechecks pass; dependent config and SDK declaration builds pass (those projects have no `ts` target). Shopping's typecheck is blocked by unchanged configs importing three deleted test fixtures; the fixture files are also absent from the parent commit.
5. `pnpm nx run @zerospin/core:test -- src/system src/aggregateActor/serverActors.node.spec.ts` passes 15 tests across five files, including registry validation, ownership, schema normalization, spec generation, and actor service bindings. Scoped lint reports no errors and existing style warnings; formatting and `git diff --check` pass. No storage was reset.
