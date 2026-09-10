# Typed system configuration design

**Date:** 2026-09-08
**Status:** Approved design

## Problem Statement

`zerospin.jsonc` connects the System and seeds through unchecked module-path strings. The CLI separately discovers their exports, while the seed factory erases command types needed to check compatibility at configuration time.

## Solution

Replace JSONC with a root `zerospin.config.ts` importing the System and seed Effects. Both CLI loading and Worker builds use this shared entry.

```ts
import { system } from './src/zerospin/system';
import { seeds } from './src/zerospin/seeds';

export default system.config({
  seeds: { dev: seeds },
});
```

## User Stories

1. As an application author, I can compose configuration using checked imports and the concrete System's types.
2. As an application author, I can configure seeds containing only commands supported by the receiving System; adding unrelated definitions leaves those seeds compatible.
3. As an operator, I can load configuration and build Workers without executing seeds or running a typechecker.
4. As an operator, I can explicitly run the selected environment's seeds and receive useful configuration, resolution, validation, and submission errors.
5. As a maintainer, I can exercise the same configuration through CLI loading and a Worker harness, including generated-file cleanup.

## Implementation Decisions

1. Add synchronous `system.config(...)`, returning an immutable configuration with the original System and an immutable environment map. Do not mutate the System or execute seed Effects.
2. Replace path-based `ISystemConfig` with a generic value-based shape preserving concrete System and seed types. Omitted `seeds`, `seeds.dev`, and `seeds.production` normalize to `null`; explicit `null` also disables an environment.
3. Preserve `makeSeeds({ system, aggregates, services })` and its lazy Effect behavior. Preserve the actual commands used through command factories and the seed factory: aggregate/service names, command names, versions, payloads, and aggregate commands' `systemName`.
4. Check compatibility against the receiving System's supported commands. Do not require identical System objects or compatibility with unused source definitions. Correct widening in owning factories and existing types.
5. Import the exact project-root TypeScript config's default export using existing import and alias-resolution machinery. Validate its runtime shape, retain source context on failures, and never invoke a CLI typechecker.
6. Update development, deployment, Studio, seeding, and e2e to consume configuration values. Remove separate System and seed module discovery.
7. Generate a scoped module exporting `config.system` as the named `system` export for Worker aliases and CLI-driven e2e. Keep it alive throughout the child process and remove it on success, failure, or interruption.
8. Require config and seed imports to work in both Node and Workers. Seed code may be bundled into Workers; importing it never runs seed Effects.
9. Execute only explicitly selected seeds through `zerospin seed --env`. Preserve command ordering, full command objects, runtime validation, payload encoding, submission behavior, and failure propagation. Report unconfigured environments clearly.
10. Hard-cut Shopping, its adverse fixture, the system-worker test system, and frontend-adapters e2e. Update affected tests, tooling references, and documentation. Remove JSONC loading, its generated JSON schema and SDK export, and obsolete schema tests. Retain dependencies needed for Wrangler configuration.

## Testing Decisions

1. Use runtime tests and one shared fixture through CLI loading and a Worker harness, including the generated System entry.
2. Verify immutable configuration, the original System reference, normalized environments, and deferred seed execution.
3. Verify selected-environment resolution and submission, missing configuration, invalid exports, import failures, seed failures, invalid targets, and submission failures.
4. Verify generated entry cleanup after success, failure, and interruption. Retain existing runtime seed validation tests.
5. Add no compile-time assertion tests, CLI typecheck gate, or full Shopping e2e requirement. Run relevant runtime tests and ordinary workspace checks through Nx.

## Out of Scope

1. Automatic startup or deployment seeding.
2. New scheduling, retry, or persistence semantics for seeds.
3. Runtime topology, database schemas, deployment coordination, or compatibility loaders.
4. Vendor changes and unrelated workspace cleanup.

## Further Notes

1. This is an approved hard cutover. Imported seed Effects remain runtime-validated when explicitly executed; TypeScript inference does not replace those checks.
