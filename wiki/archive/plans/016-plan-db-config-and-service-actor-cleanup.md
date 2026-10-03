# DB config and service actor cleanup

## 1. Settled rules and original review result

## 2. Original DB-config inventory

Paths below are under `packages/system-worker/src/` unless specified. Declaration counts exclude imports and count each top-level binding, including private bindings.

| Config module                                                      | Declarations | Finding                                                                            |
| ------------------------------------------------------------------ | -----------: | ---------------------------------------------------------------------------------- |
| `packages/core/src/aggregateSession/sessionRepoDbConfig.ts`        |            1 | Keep.                                                                              |
| `AggregateChain/aggregateChainDbConfig.ts`                         |            1 | Keep.                                                                              |
| `AggregateVersionChain/aggregateVersionChainDbConfig.ts`           |            1 | Inline its mutation table; see finding 3.                                          |
| `AggregateVersionRepo/aggregateVersionRepoDbConfig.ts`             |            1 | Inline its mutation table; see finding 3.                                          |
| `AggregateActorVersionChain/aggregateActorVersionChainDbConfig.ts` |            2 | Delete `source`; finding 1.                                                        |
| `AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.ts`   |            4 | Inline `identitySchema`; resolve referenced-table declaration shape; findings 1–2. |
| `ServiceChain/serviceChainDbConfig.ts`                             |            1 | Keep.                                                                              |
| `ServiceVersionChain/serviceVersionChainDbConfig.ts`               |            1 | Inline its mutation table; finding 3.                                              |
| `ServiceVersionRepo/serviceVersionRepoDbConfig.ts`                 |            1 | Inline its mutation table; finding 3.                                              |
| `ServiceActorVersionChain/serviceActorVersionChainDbConfig.ts`     |            1 | Keep.                                                                              |
| `ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.ts`       |            3 | Resolve referenced-table declaration shape; finding 2.                             |
| `SystemRepo/systemRepoDbConfig.ts`                                 |            1 | Keep.                                                                              |
| `SystemLogRepo/systemLogRepoDbConfig.ts`                           |            2 | Explicit exception: keep `telemetrySpansTable` and config.                         |

## 3. Ordered cleanup findings (implemented)

### 1. Remove the two declaration aliases that add no behavior — ready

1. In [aggregateActorVersionChainDbConfig.ts:6](../../../packages/system-worker/src/AggregateActorVersionChain/aggregateActorVersionChainDbConfig.ts), remove `source`. Read `aggregateActorVersionRepoDbConfig.tables.commands.shape` directly at both uses, including `.shape.identity` for `completionIdentity`.
2. In [aggregateActorVersionRepoDbConfig.ts:10](../../../packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.ts), inline the one-use `Schema.Record(Schema.String, Schema.Unknown)` at the `identity` primitive and remove `identitySchema`.
3. Preserve the existing repo-to-chain row-shape derivation and completion fields. This is the deletion test's straightforward case: the aliases add no policy, and removing them improves locality without adding a module or changing the interface.
4. Neither file exports these extra bindings. Callers already use the config; no compatibility export or consumer rewrite is needed.

### 2. Make referenced tables compatible with one config declaration — resolved and implemented

### 3. Delete the mutation-table helper module — ready

1. [mutationTable.ts:3–29](../../../packages/system-worker/src/mutationTable.ts) contains a shared field map and two table-only factories. The declarations are hidden from their owning configs, and the filename matches neither export. Both factories have two callers; this finding is about declaration locality, not an inaccurate claim that they are one-caller wrappers.
2. Inline the mutation table at [AggregateVersionRepo:12](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts), [AggregateVersionChain:13](../../../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts), [ServiceVersionRepo:11](../../../packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoDbConfig.ts), and [ServiceVersionChain:12](../../../packages/system-worker/src/ServiceVersionChain/serviceVersionChainDbConfig.ts). Preserve every primitive option and the aggregate `executedIndex` versus service `serviceIndex` difference.
3. Delete `mutationTable.ts` and its imports once those four declarations are local. Do not split it into two same-named factory files or another shared shape module: neither move satisfies the inline-config rule.
4. Accept the explicit repeated field declarations here. Do not mechanically merge neighboring command tables: publication shapes intentionally omit local delivery acknowledgement/failure fields.

### 4. Replace the empty internal-actor branch with an explicit validation guard — ready

1. In [serviceActorVersionRepoFixedDORepoConfig.ts:47–55](../../../packages/system-worker/src/ServiceActorVersionRepo/serviceActorVersionRepoFixedDORepoConfig.ts), invert the complete condition and remove the empty arm. Keep the explanation immediately above the guard:

2. Do not weaken this to an actor-name-only check. The complete durable key is `{ systemId, serviceName, serviceVersion, actorName, actorVersion, actorPath }`; the internal exception constrains its last three fields relative to the selected service version. Keep normal service/version lookup failures and `resolveServiceActorView`'s canonical-path errors.
3. Keep this short guard local. A one-use predicate or a wrapper around `resolveServiceActorView` would add navigation without depth. The resolver itself owns real validation and should remain.
4. Make the phase comment explain validation before resource-schema construction. The config still uses exactly the selected service's model registry for both kinds of binding.
5. Add coverage through the owning config/Repo interface for the valid internal tuple, a mismatched internal actor version, a non-root internal path, and a valid authored actor. Retain authored path rejection and the browser chain's rejection of the internal binding. These tests protect the validation exception rather than assert the spelling of the `if` statement.

### 5. Stop treating an absent required model query as an empty table — ready

### 6. Make the existing two workflows legible without changing ownership — bounded follow-through

1. Keep the distinction visible at the operations that need it, and document why later actor-name checks rely on constructor validation. [makeDORepo.ts:265](../../../packages/system-worker/src/makeDORepo/makeDORepo.ts) resolves the config while constructing the Repo, before creating its database. The different predicate shapes below are therefore maintenance friction, not evidence of a demonstrated validation bypass.

## 4. Execution order and verification

1. Preserve a scoped diff baseline. Complete findings 1, 3, 4, and 5 independently; update the README with finding 6. Do not wait on the referenced-table design to make those changes.
2. Resolve finding 2's schema-interface decision, then implement both actor configs together with the affected schema/core code and consumers. Do not mark the single-declaration cleanup complete while those two configs still violate it.
3. For declaration-only changes, compare table names, columns, nullability, defaults, primary/unique keys, indexes, foreign keys, and forward/inverse relations before and after. No persistence behavior change is intended. If a fixed physical schema does change, require empty affected storage; do not add a migration or fallback decoder.
4. Run the relevant Nx targets with their dependency graph intact. Current `system-worker` targets include `tsc:typecheck`, `ts`, `lint`, `test` (Node), and `test:workerd`; invoke them with `pnpm nx run system-worker:<target>`. Use focused test-file arguments for the cases below. For schema/core changes, inspect those projects' resolved targets and include their affected checks.

5. Do not add source-spelling tests for declaration counts or helper names. Review the final config inventory and imports directly. Keep Node and workerd coverage in their existing lanes; no browser workflow is needed for this cleanup.
6. The later explicit request superseded the original uncommitted-on-main instruction: implement in an isolated branch and create a PR stacked on #34. Archive this plan after completion and verification.

## 5. Deliberate exclusions

1. Keep SystemLogRepo's referenced spans table. Keep `satisfies IAnyTables` checks; they are not casts or extra declarations.
2. Do not count the `makeDbConfig.ts` factory implementation as a concrete config file. `FixtureRepo/FixtureRepo.ts` also has a separate test-only tables map, but test-fixture cleanup is outside this production inventory.
3. Preserve the accepted `__service` architecture, browser-session exclusion, existing error channels, and ServiceChain admission ownership. Do not turn a naming/readability review into a storage or routing redesign.
4. Leave unrelated module composition, purchase/fulfillment behavior, flat-row cutover work, and broad formatting/lint cleanup untouched.

## 6. Implementation and verification results