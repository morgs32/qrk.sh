# Unified decoded database queries

**Date:** 2026-09-28
**Status:** Implemented and verified in this checkout.
**Source:** [Approved design](./017-spec-unified-decoded-queries.md).
**Repository baseline:** `89d6105b8`; recheck the working tree before execution.

## Review findings incorporated

1. **Configure relations, not persistence columns.**
   [makeDbConfig](../../../packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts)
   currently builds encoded relations in the ordinary configuration and both
   resource-configuration branches.
   The retired `makeSessionQueryDb` factory used the decoded mode supported by
   [primitiveMaps](../../../packages/schema/src/primitiveMaps.ts).
   Reuse that mode for configured relations; keep `config.schema` and model
   table objects encoded. The database adapters already accept these relations.
2. **Changing the shared snapshot reader is insufficient.**
   [getResourceRow](../../../packages/core/src/contracts/getResourceRow.ts)
   reads through `tx.select()`, while both
   [applyAggregateMutationTx](../../../packages/core/src/contracts/applyAggregateMutationTx.ts)
   and
   [applyAggregateSessionMutationTx](../../../packages/core/src/contracts/applyAggregateSessionMutationTx.ts)
   have separate previous-replica reads. All decoded snapshot consumers must be
   covered. Update snapshots currently decode attributes again and must change
   when the shared reader starts returning decoded values.
3. **Restoration needs explicit persistence encoding.**
   [applyMutationInverseTx](../../../packages/core/src/aggregateSession/applyAggregateActorCommand/applyMutationInverseTx/applyMutationInverseTx.ts)
   directly upserts delete/replica inverse resources into encoded tables;
   [upsertHelper](../../../packages/core/src/drizzle/upsertHelper.ts) does not
   encode them. Forward replica writes have the same boundary. Preserving these
   calls unchanged would not satisfy JSON snapshot restoration. Use the existing
   table codecs at these writes; keep storage and wire shapes unchanged.
4. **Actor selections also inherit relation mappers.**
   [ActorQuery.capture](../../../packages/core/src/models/make/makeActorDbVersion.ts)
   compiles its mapper from `config.relations` and supplies rows to
   [getGraph](../../../packages/core/src/models/getGraph.ts), which treats them
   as encoded resources. Also,
   [readServiceResources](../../../packages/system-worker/src/ServiceActorVersionRepo/readServiceResources.ts)
   mixes relational reads for the private service actor with encoded selection
   rows for other actors before a common decoder. Preserve one encoded export
   contract at these boundaries instead of decoding those rows twice.
5. **The consumer cutover includes reusable domain packages.**
   [makePurchaseModule](../../../packages/purchase/src/makePurchaseModule.ts)
   validates relational results against encoded schemas and parses `quote` from
   JSON text. Purchase guards have similar assumptions. Remove those assumptions
   only for relational results; explicit table reads, journal codecs, selection
   exports, backups, and transport decoders still have encoded inputs.
6. **Full database and callback types have different scopes.**
   [session state types](../../../packages/core/src/aggregateSession/types.ts)
   currently describe model-only relations even though the runtime also registers
   command tables. The unified database must describe all registered tables,
   while [useLiveQuery](../../../packages/react/src/useLiveQuery.ts), guards,
   and actor callbacks retain their existing model restrictions.
7. **Delivery and validation must use this checkout.** Use `wiki/dev/` and the
   resolved Nx project names below. Type validation uses `ts`; `system-worker`
   owns separate Node and workerd test targets. There is no downstream publish,
   vendor integration, application UI acceptance task, or automatic commit/push
   in this plan.

## Locked contract

1. Apply the approved design to all declared JSON columns in registered
   relational tables. For example, session command `claims`, `staging`,
   `admission`, `execution`, and `actorDelta` decode; `commands.payload` is
   declared text and remains a string. Do not recursively parse arbitrary strings.
2. Keep one database connection and handle per existing owner. Install decoded
   relational metadata when constructing the database, so Drizzle constructs
   `tx.query` with the active transaction. Do not attach queries from a separate
   connection or replace a transaction's queries with root-database queries.
3. Explicit persistence selects/writes retain their existing encoding. Preserve
   schema provisioning SQL, physical names, indexes, reference identities,
   backup data, selection/export formats, and mutation wire envelopes.
4. Remove the old session query handle and its factory with their callers and
   obsolete tests. Keep the `queryDb` name on existing guard parameters; it is
   an invocation capability, not a second owned database.

## Implementation sequence

### 1. Unify database configuration and inference

1. In `packages/core/src/drizzle/make/makeDbConfig/makeDbConfig.ts`, construct
   `relations` with decoded JSON enabled for `makeDbConfig` and both
   `makeResourceDbConfig` branches. Include the merged model/internal table graph
   and pass the same physical names and replica aliases used for persistence.
   Keep `tables` and `schema` on the existing encoded path.
2. Reuse `makeDrizzleRelationsFromTables`,
   `makeDrizzleSchemasRecordFromTables`, and the existing per-column codecs in
   `packages/schema/src/primitiveMaps.ts`. Build separate relational column
   objects; never modify mappers on `model.drizzleSchema` or `config.schema`.
   Do not add another database factory or per-query postprocessing wrapper.
3. In `packages/core/src/drizzle/types.ts`, make the configuration's relation
   table types decoded while its schema types remain encoded. Follow that
   contract through `IDb`, `ITx`, resource database types, actor query types,
   aggregate/service session types, and any explicit relation generic arguments.
   Avoid widening to `any`, replacing inference with casts, or adding
   `ALLOWED_CAST` annotations.
4. Type initialized aggregate/session databases from the complete registered
   model and internal table graph, including `sessionRepoDbConfig.tables` and
   service-session metadata as applicable. Derive model-only callback interfaces
   from the same decoded relation types. Keep mutation methods and internal
   tables unavailable in authored query/guard callbacks at the type boundary.
5. Verify the existing adapter plumbing in `makeWaSqliteDrizzle`,
   `WaSqliteSession`, `makeInMemorySqljsDb`, and `makeDurableDb`. These already
   accept `config.relations`; change adapter code only if regression coverage
   exposes missing transaction propagation. Preserve the existing synchronous
   transaction and nested-savepoint implementations.
6. Move the useful cases from `makeSessionQueryDb.node.spec.ts` into database
   configuration coverage, replacing obsolete two-handle expectations. Extend
   `makeDbConfig.node.spec.ts` for ordinary tables, both resource-config
   branches, internal tables, decoded predicates/results, and encoded explicit
   selects. Preserve its existing reference and physical-name cases.

### 2. Complete mutation capture and restoration

1. Change `packages/core/src/contracts/getResourceRow.ts` to read through
   `tx.query[model.modelName]` with the resource ID predicate. Use the registered
   model key, including for replicas; do not substitute the physical table name.
   An absent registered query is a configuration error, not a missing resource
   or a reason to fall back to an encoded select. Preserve the existing
   `mutation-row-not-found` and `updatedAt` checks.
2. In `applyMutationTx.ts`, keep delete-resource validation against the decoded
   schema. Update attribute snapshot validation to consume decoded attributes
   without running the storage decoder again. Preserve masks, previous
   timestamps, move behavior, and the existing create/update write encoders.
3. Change the separate previous-resource reads in `applyAggregateMutationTx.ts`
   and `applyAggregateSessionMutationTx.ts` to the caller's registered relational
   query. Preserve the optional missing-row result for first replication; do not
   route that case through a helper that requires an existing row. Preserve
   replica deletion, resurrection, and tombstone checks.
4. Before decoded full resources reach encoded table writes, encode them using
   `model.table.encodeRow` or its existing `codec`. Cover delete/replicate inverse
   upserts in `applyMutationInverseTx.ts` and forward replica upserts in both
   aggregate mutation helpers. `model.resourceSchema` is a transport codec;
   use the table codec for SQLite values. Keep `upsertHelper` an encoded write
   helper and preserve the existing error mapping.
5. Exercise the complete inverse path through `encodeAppliedMutation`,
   `decodeAppliedMutation`, and `applyMutationInverseTx`. The JSON branches of
   `makeOperationJsonSchema`/`makeInverseOperationJsonSchema` currently use
   `Schema.Unknown`; use the declared JSON codec where needed to round-trip
   transformed values, retaining the existing JSON strings/envelope fields.
   Do not change wire schemas or add a second encoding format.
6. Add focused mutation regression coverage using valid JSON-bearing models:
   ordinary deletion/restoration, masked updates, replica previous snapshots,
   replica deletion/restoration, and first replication. Include a transformed
   JSON field so a second decode or a missing encode cannot silently pass.

### 3. Preserve selection, service, and persistence boundaries

1. In `packages/core/src/models/make/makeActorDbVersion.ts`, keep authored
   relational predicates/results aligned with decoded relations. Preserve the
   captured selection's encoded export rows: encode mapped rows through the
   selected model's table codec before returning them from the captured `all`
   operation. Keep SQL/binding serialization, complete-row restrictions,
   identity placeholders, and selected membership unchanged. This needs no
   second query database.
2. Verify `getGraph` and its snapshot/automation consumers still receive encoded
   resource rows. Retain their actual storage/transport decoding. Add a
   JSON-bearing actor selection regression, including a decoded JSON predicate,
   so the mapper change cannot silently alter exported rows.
3. In `ServiceActorVersionRepo/readServiceResources.ts`, use explicit encoded
   table selects for the private `__service` branch, matching the encoded rows
   returned by the selected-actor branch. Retain the common validation and
   transport encoding. Verify both branches with JSON-bearing resources.
4. Audit relational-result consumers in `packages/purchase`,
   `packages/fulfillment`, `packages/fixtures`, `packages/devtools`, and
   `examples/`. In particular, replace Purchase's encoded-row validation and
   `Schema.fromJsonString` calls applied to decoded query fields. Keep any
   meaningful decoded-domain validation and business failure mapping.
5. Classify each remaining decoder by its actual input. Keep decoders after
   explicit persistence selects and on journal, backup, and RPC boundaries.
   Update `applyExecutionDeltaTx.node.spec.ts` to assert decoded relational
   results **and** encoded explicit-table results; do not lose its storage
   preservation guarantee. Verify DevTools model/command tables can render
   decoded relational fields without changing their layout or controls.

### 4. Cut sessions and React over to one handle

1. Remove session-state `queryDb` from aggregate and service types and initial
   states, then remove its construction/publication/release from
   `packages/browser/src/bootstrapAggregateSession.ts`,
   `bootstrapServiceSession.ts`, `makeSession/makeSession.ts`,
   `makeStandaloneSession/makeStandaloneSession.ts`, and both mock session
   factories. Preserve `db`, `schema`, connection ownership, and finalizers.
2. Change `packages/react/src/useLiveQuery.ts` to subscribe to state `db`, use
   that handle's existing `$client`, and type callbacks through a model-only
   query interface instead of `ReturnType<typeof makeSessionQueryDb>`.
   Keep uninitialized-session errors, stable keys, partial/nested inference,
   and live-query error propagation. A restricted callback type does not
   require another stored handle or a new runtime database wrapper.
3. Remove the redundant `queryDb` member returned by
   `AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.ts` and
   propagated by `optimistic/makeOptimisticActorDb.ts`. Pass their existing `db`
   to validation and automation callbacks through the restricted interface.
   Update Shopping's scratch-database tests and other affected callers.
4. Delete `packages/core/src/drizzle/make/makeSessionQueryDb.ts` and its obsolete
   test file after their coverage and callers have moved. Search tracked source
   for remaining imports and session/scratch state accesses. Keep valid guard
   `queryDb` parameters; a blanket rename is not part of the cutover.
5. Update `packages/browser/src/sessionQueries.node.spec.ts`,
   `makeSession/sessionBackup.node.spec.ts`, mock lifecycle/execution tests, and
   `packages/react/src/useLiveQuery.react.spec.tsx`. Cover initialization,
   disposal/reinitialization, restored databases, and notifications through the
   surviving handle. Include standalone coverage, which the current session
   query test's four-case matrix omits.

### 5. Update documentation and close the cutover

1. Rewrite `packages/core/src/drizzle/README.md` around the single handle:
   `db.query`/`tx.query` return decoded JSON; explicit table selects/writes stay
   encoded; `useLiveQuery` retains its restricted callback; raw SQL needs
   explicit mapping. Include a transaction example and an encoded write beside
   a decoded read.
2. Update current affected docs/comments that describe the removed session
   handle. Preserve glossary and architecture uses of the guard parameter name
   `queryDb`; those are still valid. Do not rewrite historical archived plans.
3. Preserve unrelated WIP and run the checks below against the actual changed
   owners. Record executed commands, results, and unrelated blockers. No
   persistence reset, schema migration, package publication, or downstream
   repository work is needed for this change.
4. Archived after the acceptance checks below passed.

## Verification and execution commands

The following target names were verified with `pnpm nx show project <name>
--json` during review. Executed checks and results are recorded below. Run
from `/Users/morgs32/GitHub/zerospin`.

1. **Database and transaction behavior.** Extend the existing database-config
   and `makeTx.node.spec.ts` seams. Exercise both ordinary and resource
   configurations, selected JSON objects/arrays/scalars/nulls/transformations,
   internal JSON columns, partial projections, nested relations, predicates,
   physical aliases, and replica refs. Malformed or schema-invalid selected JSON
   fails; selecting another column succeeds. Confirm explicit selects still
   return encoded JSON. Verify preceding writes, nested release/rollback, outer
   rollback, and committed notifications using real wa-sqlite and sql.js.
2. **Durable SQLite.** Add workerd coverage beside
   `packages/system-worker/src/makeDORepo/makeDurableDb.ts` for decoded queries
   and transaction visibility/rollback on real Durable Object storage. Extend
   `makeActorSnapshotDb.workerd.spec.ts` for the scratch adapter. Keep these
   tests in the existing workerd target; Node's Cloudflare stub is not evidence
   for Durable Object behavior.
3. **Mutation and export behavior.** Prove delete → capture → encode → decode →
   restore for a JSON-bearing model. Compare decoded reads and encoded stored
   fields after restoration, including transformed values, masks, and timestamps.
   Verify replica tombstones, first replication, optional previous state,
   unchanged selection exports/service responses, and the existing missing-row
   and referential-integrity failures.
4. **Session and type behavior.** Run the browser/React seams named above.
   Compile assertions for decoded result/predicate types, partial/nested results,
   transformed values, encoded explicit selects/writes, and full-database
   internal tables. Negative type assertions must reject unknown model tables,
   internal tables, and mutation methods in restricted callbacks. Use files
   included in the owners' `ts`/`lib` configurations.
5. **Focused checks while editing.** Run only the relevant seam at each step;
   the final owner pass below supersedes these when source has not changed.

   ```sh
   CI=true pnpm nx run @zerospin/core:test -- makeDbConfig.node.spec.ts makeTx.node.spec.ts
   CI=true pnpm nx run @zerospin/browser:test -- sessionQueries.node.spec.ts sessionBackup.node.spec.ts sessionLifecycle.node.spec.ts sessionExecution.node.spec.ts
   CI=true pnpm nx run @zerospin/react:test -- useLiveQuery.react.spec.tsx
   CI=true pnpm nx run system-worker:test:workerd -- makeActorSnapshotDb.workerd.spec.ts makeDurableDb.workerd.spec.ts
   ```

   `makeDurableDb.workerd.spec.ts` is a planned new regression file. Include the
   new mutation regression file in the focused Core run once created. Existing
   runtime-lane suffixes and discovery configuration remain authoritative.

6. **Final owner checks.** Run one task graph for the packages directly affected
   by the plan, preserving Nx dependency execution and caching. No separate
   overlapping dependency builds are needed.

   ```sh
   CI=true pnpm nx run-many -t ts lint test -p @zerospin/core @zerospin/browser @zerospin/react system-worker @zerospin/purchase @zerospin/fulfillment @zerospin/devtools
   CI=true pnpm nx run system-worker:test:workerd
   ```

   Add `@zerospin/schema` to the first graph if its codec/type implementation
   changes. Add other owners only when the consumer audit identifies relevant
   changes. Do not use a whole-repository polish pass to repair unrelated work.

7. **In-repo consumers.** Check the affected examples explicitly and use the
   fixture package's actual runtime targets when its consumers change:

   ```sh
   CI=true pnpm nx run-many -t ts lint -p shopping tic-tac-toe domain-modules-fixture
   CI=true pnpm nx run shopping:test
   pnpm nx run-many -t ts:node ts:workerd lint -p @zerospin/fixtures
   ```

   The fixture package has no generic `ts` target. Its `config:lib` and required
   dependency builds are already part of the task graph. There is no substitute
   application-specific manual deletion gate; the local mutation regression
   establishes the JSON deletion/restoration behavior.

8. **Finish.** Check changed-document formatting and `git diff --check`, confirm
   no removed-factory imports or session-state handles remain, and inspect the
   scoped diff for accidental schema/format changes. Report any unrun lane
   explicitly. Archive only after the complete acceptance contract passes.

## Implementation verification

- `CI=true pnpm nx run-many -t ts lint test -p @zerospin/core @zerospin/browser @zerospin/react system-worker @zerospin/purchase @zerospin/fulfillment @zerospin/devtools --parallel=1` passed.
- `CI=true pnpm nx run system-worker:test:workerd` passed (8 files, 24 tests).
- `CI=true pnpm nx run-many -t ts lint -p shopping tic-tac-toe domain-modules-fixture --parallel=1` passed after updating Shopping's command journal hook.
- `CI=true pnpm nx run shopping:test` passed (4 files, 9 tests).
- `pnpm nx run-many -t ts:node ts:workerd lint -p @zerospin/fixtures --parallel=1` passed.
- Focused Core configuration, mutation, actor selection, execution delta, browser session, and Durable SQLite tests passed. Changed-document formatting and `git diff --check` passed.
- Nx Cloud reported insufficient access to its remote cache; local tasks completed. An initial parallel owner run encountered a generated-output race, so the final owner graph ran serially.
