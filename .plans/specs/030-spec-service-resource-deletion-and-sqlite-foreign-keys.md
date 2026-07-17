# Service-resource deletion metadata and SQLite foreign keys

**Date:** 2026-07-17
**Status:** Implemented and verified

## Problem Statement

Service-resource deletion currently removes the authoritative row and every replicated projection row. That makes the delete block the only remaining evidence of the resource, prevents later replicas from distinguishing a deleted resource from an unknown ID, and lets the same ID be recreated or replicated as though it had never existed.

Persisted `primitives.ref` descriptors also describe relations without emitting SQLite foreign-key constraints. Relation metadata helps Drizzle queries, but SQLite does not reject an orphaning write or a referenced-row delete.

## Solution

Make `deletedAt` framework-owned metadata on every service model. Keep the existing encoded `delete` mutation unchanged, but apply it to a service model by retaining the row and setting `deletedAt` and `updatedAt` to the mutation's `appliedAt`. Plain-model deletes remain physical. Propagate the unchanged applied delete through ServiceRepo, AccountRepo, ActorRepo, FrontendRepo, and sessions so every retained projection receives the identical timestamp.

Build each resource database as one table graph. Resolve every persisted `primitives.ref` to its concrete Drizzle target column, emit an immediate SQLite foreign key with implicit `NO ACTION`, and explicitly enable enforcement whenever a SQLite connection is opened.

## User Stories

1. As a service owner, I want a deleted resource ID to remain authoritatively known so that it cannot be recreated, mutated, or newly replicated.
2. As a replica owner, I want the original delete mutation and timestamp to reach every projection so that all copies converge on the same retained deleted row.
3. As a query author, I want deletion filtering to remain explicit so that administrative and recovery queries can still inspect deleted rows.
4. As a model author, I want persisted references enforced by SQLite so that a mutation cannot create an orphan or delete a referenced row.
5. As a command author, I want one referential-integrity or terminal-deletion failure to fail only that command while later sibling commands continue.
6. As a generation author, I want post-feature ledgers to replay deleted resources without compatibility paths for unpublished pre-feature state.

## Implementation Decisions

1. Export `makeModelAndMetadata` directly from its defining module. Do not add a barrel re-export.
2. `makeModel` calls `makeModelAndMetadata` with explicit `id`, `modelName`, `createdAt`, `updatedAt`, and `version` descriptors.
3. `makeServiceModel` independently supplies those same five descriptors plus nullable `deletedAt`; the duplication is deliberate and keeps service metadata visible at its ownership boundary.
4. Add readonly `metadata` to `IModel`. Keep metadata out of `attributes`, authored create schemas, and authored update schemas. Build `propertiesShape`, current resource schemas, historical resource schemas, and system specs from `model.metadata` plus the authored attributes.
5. Reserve every framework metadata key globally. `deletedAt` is reserved even on plain models, so callers cannot author a lookalike attribute.
6. A service-model create writes `deletedAt: null`.
7. The existing `delete` mutation remains the only delete operation. Applying it to a service model preserves every authored attribute and sets `deletedAt` and `updatedAt` to `appliedAt`. Applying it to a plain model physically removes the row.
8. Add no implicit deletion predicate to model queries, service queries, selections, or live queries. Callers opt into `deletedAt IS NULL` when they need only live resources.
9. Service deletion is terminal. A delete replay with the same timestamp succeeds without changing the row. A delete with another timestamp fails. Create, update, move, or replication against the deleted ID fails with `service-resource-deleted` and includes `modelName`, `resourceId`, `operationName`, and the persisted `deletedAt` in error context.
10. Deleted resources cannot be returned as canonical resources for new replication. `getReplicatedResources` returns the `service-resource-deleted` failure for that requested resource.
11. Preserve the existing encoded delete, applied mutation, inverse operation, block representation, and generation-replay envelope. Do not introduce a retirement mutation or rewrite delete operations in transit.
12. Extend `makeDrizzleSchemasRecordFromTables` with the approved explicit table-graph loop. Record logical table identities, construct the complete schema record, and give ref columns lazy Drizzle `.references(...)` closures that resolve the registered target table and primary-key column.
13. Extend `makeTableMigrationStatements` with the approved explicit foreign-key loop. Read Drizzle table configuration and append `FOREIGN KEY (...) REFERENCES ... (...)` table clauses.
14. Construct resource-model tables and `otherTables` through one database graph so refs resolve across either group.
15. Enable `PRAGMA foreign_keys = ON` at every database-open boundary before opening a transaction. Do not depend on SQLite defaults or attempt to change the pragma inside a transaction.
16. Keep constraints immediate and use SQLite's implicit `NO ACTION`. Add no cascade, set-null, restrict spelling, or deferred configuration.
17. Map foreign-key write failures to `mutation-referential-integrity-failed` with `modelName`, `resourceId`, and `operationName` context.
18. Wrap each ordinary ServiceRepo and AccountRepo command's mutation application in the existing `withSavepoint`. A failed command rolls back all of its mutations, records a normal failed command, and does not prevent later sibling commands from running. Preserve cursor, index, block, and outbox ordering. Leave pushed-command savepoints unchanged.
19. Treat the implementation as an unpublished baseline. Use a destructive reset and detached clean generation, do not replay pre-feature ledgers, and add no decoder, schema fallback, migration adapter, nullable compatibility default, in-place migration, or version bump.

## Testing Decisions

1. Core model tests prove plain and service metadata shapes, readonly model metadata, global reserved-key rejection, authored-attribute exclusion, and current and historical resource/schema/spec inclusion.
2. Core database tests prove migration SQL contains concrete `REFERENCES` clauses and SQL.js, wa-sqlite, and Durable Object SQLite enforce foreign keys after their open boundaries.
3. Core mutation tests prove service create initializes `deletedAt` to null, service delete retains attributes, inverse application restores the prior resource, exact replay is idempotent, all terminal operations fail, and plain delete still removes its row.
4. Core mutation tests prove referenced writes and referenced-row deletes fail with `mutation-referential-integrity-failed` and the approved context.
5. System-worker workerd tests prove ServiceRepo retains the authoritative deleted row and that the unchanged delete reaches AccountRepo, ActorRepo, and FrontendRepo with one identical `deletedAt`.
6. System-worker workerd tests prove FrontendRepo emits a retained service resource as `updated`, not `deleted`, and that a deleted service resource cannot be newly replicated.
7. System-worker workerd tests prove foreign-key and terminal-deletion failures roll back only their command while later sibling commands execute.
8. System-worker workerd tests prove post-feature generation replay retains deleted service rows and unfiltered service queries can still return them.
9. Verify `@zerospin/core:test`, `@zerospin/core:ts`, `system-worker:test:workerd`, `system-worker:ts`, relevant lint targets, `.llmwiki/freshness.sh --stale-only`, and `git diff --check` through Nx where targets exist.

## Out of Scope

1. Automatic query filtering or a default live-only model scope.
2. A new retirement operation, renamed delete payload, or block-format change.
3. Cascading, set-null, explicitly deferred, or configurable foreign-key actions.
4. Compatibility with pre-feature persisted databases or ledgers.
5. In-place migrations, adapters, fallbacks, nullable compatibility fields, or model/system version bumps.
6. Replaying unpublished pre-feature generations after the destructive reset.

## Further Notes

1. `deletedAt` is a retained deletion marker, but the public domain term remains deletion. The implementation does not expose tombstone or retirement vocabulary.
2. Immediate `NO ACTION` means mutation order inside one command remains observable. Contracts must write referenced parents before children and delete children before parents.
3. A retained deleted service row continues satisfying inbound foreign keys. The terminal-deletion checks, rather than a cascade, prevent that row from returning to live service state.
