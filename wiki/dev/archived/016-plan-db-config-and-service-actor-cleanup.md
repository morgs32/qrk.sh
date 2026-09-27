# DB config and service actor cleanup

**Date:** 2026-09-27\
**Status:** Implemented and verified on `codex/db-config-service-actor-cleanup`, developed on PR #34 and rebased onto its identical merged `main` tree.\
**Scope:** Production DB-config declarations and the private service-automation branches around ServiceActorVersionRepo. Existing uncommitted work on `main` was preserved in a separate checkout.

## 1. Settled rules and original review result

1. Each DB-config file has one declaration: its exported config, with tables and shapes inline. Imports do not count. The only exception is `SystemLogRepo/systemLogRepoDbConfig.ts`, whose spans table is referenced by logs and links. This replaces the broader private-table exception in [declare-db-config-once.ts](../../patterns/typescript/declare-db-config-once.ts).
2. The review found 13 production config modules: nine have one declaration, three have extra declarations, and SystemLogRepo is the exception. Four of the nine still hide table definitions in `mutationTable.ts`.
3. Service automations intentionally use the existing ServiceActorVersionRepo with `actorName: '__service'`, `actorVersion: serviceVersion`, and `actorPath: '/'`. [Plan 013, section 3.2](../archived/013-plan-state-machine-modules.md) already settled that ownership. Removing the sentinel or introducing another Repo is an architecture change, not a prerequisite for this cleanup.
4. The quoted empty branch is unnecessary code shape. The distinction it expresses is necessary: ordinary actors require authored identity and projection validation; the internal binding has no authored actor entry or browser session.
5. No production code or tests were changed for this review. No root `CONTEXT.md` or `docs/adr/` was present. Findings are grounded in current source and the existing local patterns and plans, not a repository-wide quality claim.

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

1. [aggregateActorVersionRepoDbConfig.ts:12,84](../../../packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.ts) and [serviceActorVersionRepoDbConfig.ts:10,58](../../../packages/system-worker/src/ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.ts) each declare `commands` and `automationGroups` before the config. Both `pendingCommands.commandRowId` and `automationRuns.outputCommandRowId` reference `commands`; each run's source-position field references `automationGroups`.
2. These declarations earn their current identity: [primitives.ref](../../../packages/schema/src/primitives.ts) requires an already-created Table and eagerly reads its primary key at lines 654–714. [makeDbConfig](../../../packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts) accepts an already-built table map at lines 12–16. [makeDrizzleRelationsFromTables](../../../packages/core/src/drizzle/make/makeDbConfig/makeDrizzleRelationsFromTables/makeDrizzleRelationsFromTables.ts) matches reference targets by object identity at lines 122–130.
3. The maintainer approved `primitives.ref({ table: 'commands', column: 'rowId', relation: 'command', inverse: 'pending' })` in chat. `makeDbConfig` now validates the sibling table key and sole primary-key column, resolves the actual owned table, and returns the inferred resolved shapes. Object references remain for separately authored tables, including SystemLogRepo; this is an explicitly approved authoring form, not a compatibility path.
4. The resulting module must preserve primary-key codec inference, nullable references, forward/inverse relations, and emitted SQL foreign keys. Cover the three actor-repo associations above, including references to non-`id` primary keys. Resolve targets to the actual owned table objects, not copies.
5. Then inline all tables in both configs and remove the old private declarations. Do not hide them in an IIFE, factory, extra file, or a second table map. Do not replace `primitives.ref` with scalar fields and silently drop relationships. Preserve the explicit SystemLogRepo exception.
6. The reference mechanism is settled and implemented. Codecs for named-reference tables become available after config resolution; attempts to use unresolved codecs, encoded shapes, or SQL fail explicitly. The physical schemas are unchanged, so no storage reset or translation migration is required.

### 3. Delete the mutation-table helper module — ready

1. [mutationTable.ts:3–29](../../../packages/system-worker/src/mutationTable.ts) contains a shared field map and two table-only factories. The declarations are hidden from their owning configs, and the filename matches neither export. Both factories have two callers; this finding is about declaration locality, not an inaccurate claim that they are one-caller wrappers.
2. Inline the mutation table at [AggregateVersionRepo:12](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts), [AggregateVersionChain:13](../../../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts), [ServiceVersionRepo:11](../../../packages/system-worker/src/ServiceVersionRepo/serviceVersionRepoDbConfig.ts), and [ServiceVersionChain:12](../../../packages/system-worker/src/ServiceVersionChain/serviceVersionChainDbConfig.ts). Preserve every primitive option and the aggregate `executedIndex` versus service `serviceIndex` difference.
3. Delete `mutationTable.ts` and its imports once those four declarations are local. Do not split it into two same-named factory files or another shared shape module: neither move satisfies the inline-config rule.
4. Accept the explicit repeated field declarations here. Do not mechanically merge neighboring command tables: publication shapes intentionally omit local delivery acknowledgement/failure fields.

### 4. Replace the empty internal-actor branch with an explicit validation guard — ready

1. In [serviceActorVersionRepoFixedDORepoConfig.ts:47–55](../../../packages/system-worker/src/ServiceActorVersionRepo/serviceActorVersionRepoFixedDORepoConfig.ts), invert the complete condition and remove the empty arm. Keep the explanation immediately above the guard:

   ```ts
   // Only the private service-automation binding skips authored actor resolution.
   if (
     key.actorName !== '__service' ||
     key.actorVersion !== key.serviceVersion ||
     key.actorPath !== '/'
   ) {
     yield * resolveServiceActorView(version, key);
   }
   ```

2. Do not weaken this to an actor-name-only check. The complete durable key is `{ systemId, serviceName, serviceVersion, actorName, actorVersion, actorPath }`; the internal exception constrains its last three fields relative to the selected service version. Keep normal service/version lookup failures and `resolveServiceActorView`'s canonical-path errors.
3. Keep this short guard local. A one-use predicate or a wrapper around `resolveServiceActorView` would add navigation without depth. The resolver itself owns real validation and should remain.
4. Make the phase comment explain validation before resource-schema construction. The config still uses exactly the selected service's model registry for both kinds of binding.
5. Add coverage through the owning config/Repo interface for the valid internal tuple, a mismatched internal actor version, a non-root internal path, and a valid authored actor. Retain authored path rejection and the browser chain's rejection of the internal binding. These tests protect the validation exception rather than assert the spelling of the `if` statement.

### 5. Stop treating an absent required model query as an empty table — ready

1. The internal branch of [readServiceResources.ts:24–34](../../../packages/system-worker/src/ServiceActorVersionRepo/readServiceResources.ts) uses `db.query[modelName]?.findMany()... ?? []`. Its model list comes from the same service whose full registry provisions the resource config. A missing query is therefore a broken database/config relationship, not an empty result.
2. Require that lookup and report the existing repository error style with the missing model name. Keep a present table with zero rows as a valid empty result. Preserve the subsequent resource validation/encoding and the ordinary actor's selection behavior.
3. This removes a silent fallback that could give replay or automation capture an incomplete graph if that invariant breaks. No live missing-table incident was demonstrated in this review. Add one missing-query case and one legitimate empty-table case through the resource-reading interface; do not create a generic lookup adapter.

### 6. Make the existing two workflows legible without changing ownership — bounded follow-through

1. Keep the distinction visible at the operations that need it, and document why later actor-name checks rely on constructor validation. [makeDORepo.ts:265](../../../packages/system-worker/src/makeDORepo/makeDORepo.ts) resolves the config while constructing the Repo, before creating its database. The different predicate shapes below are therefore maintenance friction, not evidence of a demonstrated validation bypass.

   | Operation        | Authored actor                                              | Internal service-automation binding                            |
   | ---------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
   | Config selection | Validate authored actor/version and canonical identity path | Require the exact private tuple                                |
   | Activation       | Subscribe/catch up via `onDOActivation`                     | Registration retains the frontier and holds the recovery alarm |
   | Resource read    | Actor-selected graph                                        | Complete service model rows                                    |
   | Retained command | Set `actorServiceIndex` for browser publication             | Leave `actorServiceIndex` null                                 |
   | Automation RPCs  | Reject                                                      | Register, read saved output, drain staged output               |
   | Confirmed replay | Update projection and cursor                                | Also enroll eligible runs after the registration frontier      |

2. Source anchors are [ServiceActorVersionRepo.ts:57,127,148,200](../../../packages/system-worker/src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts), [executeTx.ts:153,198](../../../packages/system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts), and [ServiceChain.ts:89,143](../../../packages/system-worker/src/ServiceChain/ServiceChain.ts). Do not try to centralize all these branches in a boolean helper: startup, selection, publication, and enrollment have different jobs.
3. Correct the [Repo README](../../../packages/system-worker/src/ServiceActorVersionRepo/README.md): it currently says activation holds the recovery alarm, while `registerAutomations` holds it and internal `onDOActivation` returns without subscribing. Explain that the retained alarm resumes groups and performs catch-up, then releases its hold. Preserve the registration-before-admission ordering and avoid a subscription callback into a held admission operation.
4. Keep the current recovery gate, SQL transaction limits, alarm leases, replay cursors, and saved output IDs. This plan does not simplify their lifetimes. Any later split of browser projection and automation execution into different modules must preserve this table and show added locality/leverage before introducing an interface; a new Repo or generic adapter is outside this cleanup.

## 4. Execution order and verification

1. Preserve a scoped diff baseline. Complete findings 1, 3, 4, and 5 independently; update the README with finding 6. Do not wait on the referenced-table design to make those changes.
2. Resolve finding 2's schema-interface decision, then implement both actor configs together with the affected schema/core code and consumers. Do not mark the single-declaration cleanup complete while those two configs still violate it.
3. For declaration-only changes, compare table names, columns, nullability, defaults, primary/unique keys, indexes, foreign keys, and forward/inverse relations before and after. No persistence behavior change is intended. If a fixed physical schema does change, require empty affected storage; do not add a migration or fallback decoder.
4. Run the relevant Nx targets with their dependency graph intact. Current `system-worker` targets include `tsc:typecheck`, `ts`, `lint`, `test` (Node), and `test:workerd`; invoke them with `pnpm nx run system-worker:<target>`. Use focused test-file arguments for the cases below. For schema/core changes, inspect those projects' resolved targets and include their affected checks.

   | Existing evidence to retain                                                                | Promise protected / additional case needed                                                                 |
   | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
   | `core/src/drizzle/make/makeDbConfig/makeDbConfig.node.spec.ts`                             | Config construction; add reference-resolution/SQL-relation cases for the new interface.                    |
   | `system-worker/src/AggregateActorVersionRepo/retainedCommands.node.spec.ts`                | Flat retained rows and completion fields survive declaration edits.                                        |
   | `system-worker/src/AggregateActorVersionRepo/automations/automations.node.spec.ts`         | Aggregate automation recovery and referenced command storage.                                              |
   | `system-worker/src/ServiceActorVersionRepo/automations/serviceAutomations.node.spec.ts`    | Restart recovery, saved outputs, staging retry, and group capture.                                         |
   | `system-worker/src/ServiceActorVersionRepo/automations/serviceAutomations.workerd.spec.ts` | Registration before first admission, saved-output reuse, authority rejection, addressed-version execution. |
   | `system-worker/src/ServiceActorVersionRepo/automations/fulfillment.workerd.spec.ts`        | Older commands materialize in both versions and the carrier automation runs.                               |
   | New owning-interface cases from findings 4–5                                               | Exact private binding validation; missing model query versus an empty table.                               |

5. Do not add source-spelling tests for declaration counts or helper names. Review the final config inventory and imports directly. Keep Node and workerd coverage in their existing lanes; no browser workflow is needed for this cleanup.
6. The later explicit request superseded the original uncommitted-on-main instruction: implement in an isolated branch and create a PR stacked on #34. Archive this plan after completion and verification.

## 5. Deliberate exclusions

1. Keep SystemLogRepo's referenced spans table. Keep `satisfies IAnyTables` checks; they are not casts or extra declarations.
2. Do not count the `makeDbConfig.ts` factory implementation as a concrete config file. `FixtureRepo/FixtureRepo.ts` also has a separate test-only tables map, but test-fixture cleanup is outside this production inventory.
3. Preserve the accepted `__service` architecture, browser-session exclusion, existing error channels, and ServiceChain admission ownership. Do not turn a naming/readability review into a storage or routing redesign.
4. Leave unrelated module composition, purchase/fulfillment behavior, flat-row cutover work, and broad formatting/lint cleanup untouched.

## 6. Implementation and verification results

1. Completed all six findings. Both actor configs now inline their tables and use named sibling references. Removed the two schema/source aliases and `mutationTable.ts`; all four mutation declarations retain their original fields and options. The production inventory has twelve one-declaration configs and the unchanged two-declaration SystemLogRepo exception.
2. Kept the exact private service tuple, authored actor/path validation, browser-chain exclusion, registration/alarm ownership, replay cursors, and automation recovery behavior. Missing required model queries fail with `service-model-query-not-found` and the model name; a provisioned empty model still yields an empty graph. Updated the Repo README and the DB-config pattern.
3. Compared all seven edited DB configs with PR #34 using a temporary verification fixture. Encoded descriptors, indexes, generated provisioning SQL, and forward/inverse relation names matched exactly. Removed the temporary baseline fixtures after their seven parity cases passed.
4. `pnpm nx run @zerospin/schema:test`: five tests passed. `pnpm nx run core:test makeDbConfig.node.spec.ts`: seven tests passed, including named-reference inference, invalid table/column rejection, actual SQLite foreign-key enforcement for all three actor associations, nullable outputs, integer keys, owned table identity, and forward/inverse queries.
5. `pnpm nx run system-worker:test dbConfigParity.node.spec.ts retainedCommands.node.spec.ts automations.node.spec.ts serviceAutomations.node.spec.ts readServiceResources.node.spec.ts`: 25 tests passed, comprising seven temporary schema parity cases and 18 retained-command, automation recovery, and resource-reading cases.
6. `pnpm nx run system-worker:test:workerd serviceActorVersionRepoFixedDORepoConfig.workerd.spec.ts serviceAutomations.workerd.spec.ts fulfillment.workerd.spec.ts`: nine tests across four files passed. Coverage includes the exact private tuple, mismatched private version, non-root private path, authored actor success/path rejection, browser-chain rejection, registration before admission, saved-output reuse, addressed-version execution, and fulfillment.
7. `pnpm nx run-many -t ts lint -p @zerospin/schema core system-worker`: passed with dependencies intact. Core typechecking and lint were repeated after adding the SQLite query assertions. Scoped formatting and `git diff --check` passed. Nx Cloud reported workspace-access code 401; local tasks completed successfully.
