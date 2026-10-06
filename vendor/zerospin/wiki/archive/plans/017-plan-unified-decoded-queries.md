# Unified decoded database queries

**Date:** 2026-09-28
**Status:** Implemented and verified in this checkout.
**Source:** [Approved design](../specs/017-spec-unified-decoded-queries.md).
**Repository baseline:** `89d6105b8`; recheck the working tree before execution.

## Review findings incorporated

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
   `packages/shapes/src/primitiveMaps.ts`. Build separate relational column
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

### 4. Cut sessions and React over to one handle

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

   Add `@zerospin/shapes` to the first graph if its codec/type implementation
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