# Unified decoded database queries

**Date:** 2026-09-28
**Status:** Implemented and verified; archived with the [implementation plan](./017-plan-unified-decoded-queries.md).
**Source:** Approved design supplied in this chat, adapted to this repository.

## Problem

Sessions currently expose an encoded `db.query` and a separate decoded
`queryDb.query`. Guards and transaction callers therefore observe different JSON
representations from application queries. Mutation snapshot readers also read
encoded persistence rows and then validate them as decoded resources. A valid
JSON-bearing resource can fail deletion or replica snapshot validation.

## Required behavior

1. `db.query` and `tx.query` decode declared JSON columns for every table
   registered in the database configuration, including internal tables.
   Decoding follows each column's existing codec, including nullability and
   schema transformations. Text columns that happen to contain JSON stay text.
2. Transactions and nested transactions query their active connection and see
   preceding writes. Commit, rollback, savepoints, and committed-write
   notifications retain their existing semantics.
3. `config.schema`, `model.drizzleSchema`, and existing persistence table objects
   retain encoded JSON values for explicit selects and writes. Physical schemas,
   stored representations, backup formats, and transport formats stay unchanged.
4. Sessions publish one `db` handle. Remove session-state `queryDb`, the
   `makeSessionQueryDb` factory, and redundant scratch/optimistic query handles
   outright. Existing callback parameter names such as guard `queryDb` remain;
   they receive a restricted interface to the invocation database or transaction.
5. Relational predicates accept decoded JSON values and encode them through the
   same column codecs. Partial selections decode only selected columns, and
   nested relations decode their selected columns. Preserve relation names,
   physical table names, reference resolution, and replica aliases.
6. Invalid selected JSON or schema values fail through the existing query error
   path. Do not return encoded strings as a fallback. Raw SQL expressions retain
   Drizzle's explicit mapping requirements.
7. `useLiveQuery` subscribes to the session's `db` and existing `$client`, while
   retaining its model-only, query-only TypeScript callback interface and result
   inference. The complete session database includes its registered internal
   tables; model callbacks do not gain those tables or mutation methods.
8. Delete, update, and replica snapshots contain decoded values. Restoration
   encodes those values at the persistence boundary using existing table codecs.
   Preserve inverse-operation shapes, masks, timestamps, replica tombstones,
   missing-resource failures, and the existing encoded mutation format.
9. Actor selection exports, snapshots, command persistence, and service responses
   retain their encoded contracts. Adapt their representation boundaries where
   they consume decoded relational results; do not add mixed-format fallbacks.

## User stories

1. As an application author, I use ordinary relational queries without choosing
   another handle or manually decoding declared JSON fields.
2. As a guard author, I query decoded values and see preceding writes in the
   transaction supplied to my callback.
3. As a mutation caller, I delete a JSON-bearing resource and restore its
   captured inverse without representation errors or lost attributes.
4. As a persistence maintainer, I keep explicit table reads/writes and durable
   formats encoded while relational reads return domain values.

## Testing decisions

1. Cover query behavior through the existing database factories and real
   adapters: wa-sqlite and sql.js in Node, durable SQLite in workerd.
2. Exercise successful reads, JSON predicates, partial/nested selection,
   registered internal tables, transformed fields, reference/replica aliases,
   and the explicitly required invalid-selected-JSON error behavior.
3. Exercise transaction visibility and rollback, JSON-bearing mutation
   capture/encode/decode/restore, and unchanged encoded persistence/export data.
4. Reuse browser session lifecycle/backup tests and the React live-query test.
   Compile result/predicate inference and restricted callback assertions;
   running Vitest alone does not establish type safety.

## Scope and lifecycle

1. Implementation belongs in this Zerospin checkout and its affected packages,
   fixtures, examples, and documentation. Preserve unrelated working-tree work.
2. No new dependency, storage migration, storage reset, compatibility alias,
   parallel query handle, unrelated UI work, or downstream repository delivery.
   This change must not alter fixed schemas; a discovered need to do so is a
   scope change, not grounds for a compatibility decoder.
3. The completed plan is `wiki/dev/archived/017-plan-unified-decoded-queries.md`.
