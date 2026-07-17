# Table-bound references and repo releases design

**Date:** 2026-07-13
**Status:** Approved for implementation

## Problem Statement

The current primitive system conflates abbreviation-prefixed values, SQL primary-key constraints, cursors, and relationships. `primitives.id` can describe a row identity, a modeled relationship, or an opaque external identifier, while primary-key state is spread across otherwise unrelated primitives. As a result, a prefixed column can appear relational without identifying a concrete table, and database relation inference remains model-specific even though repos also own ordinary tables.

System-worker Durable Object names and controller versions have a related identity problem. Repo names do not encode their repo type, subscriber tables use generic `name` columns, service subscriptions store a service name rather than the actual ServiceRepo name, and DevZerospinApis controller tables are keyed by unqualified versions.

The design must separate these concepts, retain relational queries across model databases, allow schema-only repo tables to participate in the same relation system, and avoid synthetic primary-key columns where existing values or logical unique identities already suffice.

## User Stories

1. As a schema author, I can tell from a descriptor whether a column is a primary key, ordered cursor, table relationship, or opaque prefixed value.
2. As a query author, I can use forward and inverse Drizzle relational queries across model tables and ordinary repo tables.
3. As a controller author, I can validate model primary-key values in command payloads without describing payload values as database relationships.
4. As a system-worker maintainer, I can identify a Durable Object's repo type from its persisted name and pass exact repo names through subscriber and subscription queues.
5. As a dev-runtime maintainer, I can distinguish controller releases by controller category while leaving DevZerospinApis controller tables empty until population is designed separately.

## Primitive Taxonomy

1. Remove `PrimitiveKind.Id`, `IIdDescriptor`, `IAnyIdDescriptor`, and `primitives.id` without compatibility aliases.
2. Preserve domain ID value types and abbreviation-prefixed value factories such as `makeIdFromAbbreviation`; only the ambiguous schema primitive is removed.
3. Restore `PrimitiveKind.PrimaryKey`, `IPrimaryKeyDescriptor`, and `primitives.primaryKey({ abbreviation })`.
4. A primary key requires a non-empty abbreviation and always maps to `text PRIMARY KEY NOT NULL`. It does not accept `nullable`, `unique`, defaults, models, or autogeneration.
5. Keep `PrimitiveKind.Cursor`, `ICursorDescriptor`, and `primitives.cursor({ abbreviation, nullable?, unique? })` for ordered positions. Cursors cannot carry primary-key state.
6. Add `PrimitiveKind.Prefixed`, `IPrefixedDescriptor`, and `primitives.prefixed({ abbreviation, nullable?, unique? })` for opaque, polymorphic, provenance, self-context, external, or cross-database identities.
7. Keep `${abbreviation}_${string}` inference and Effect schemas for primary-key, cursor, prefixed, and ref values.
8. Remove `primaryKey` properties from text, cursor, and every other non-primary-key descriptor. Encoded descriptors therefore cannot acquire `primaryKey: false` state.
9. Update descriptor schemas, Drizzle builders, migration SQL, encoded shapes, inferred rows, inferred columns, and JSON schemas for the new taxonomy.

## Table-Bound References

1. `primitives.ref` is table-only. Contract payloads cannot contain refs.
2. Its public call shape is:

   ```ts
   primitives.ref({
     table: User.table,
     relation: 'user',
     inverse: 'lists',
     nullable: false,
     unique: false,
   });
   ```

3. `table` must be one concrete `ITable`; abbreviation-only, model-only, lazy, self, and union targets are not supported.
4. `relation` and `inverse` are mandatory non-empty names. `relation` names the forward query property on the source table and `inverse` names the query property on the target table.
5. A unique ref produces an inverse `one` relation. A non-unique ref produces an inverse `many` relation. There is no caller-supplied `inverse.kind`.
6. `nullable` controls only forward optionality.
7. A ref always targets the sole `primitives.primaryKey` column of its target table. Alternate-key and composite-key refs are not supported.
8. The source and target tables must belong to the same database configuration.
9. Refs infer Drizzle relations but do not emit SQLite `REFERENCES` constraints. Actor and frontend projection databases may legitimately omit a referenced row, and lifecycle ordering must not be constrained by SQLite foreign keys.
10. Table-ref graphs must be acyclic. Concrete table values and declaration order make ordinary direct cycles fail TypeScript; database construction performs an explicit runtime depth-first validation for erased or cross-module cycles.
11. Relation-name collisions, duplicate table names, missing targets, targets outside the database, and targets with zero or multiple primary keys fail database construction.
12. Encoded refs omit the runtime table object and contain `kind`, `abbreviation`, `targetTableName`, `targetColumnName`, `nullable`, `unique`, `relation`, and `inverse`.
13. Changing the target table, target column, target abbreviation, forward relation name, or inverse relation name is a breaking frontend-version change.

## Model Primary Keys and Payloads

1. `makeModel` constructs and exposes one `model.table`.
2. The synthesized model `id` column uses `primitives.primaryKey({ abbreviation: model.abbreviation })`.
3. Model attributes cannot contain another primary key or an autogenerated descriptor. Compile-time and runtime checks enforce this invariant.
4. `Model.primaryKey` is the only way to describe that model's primary-key value in a contract payload.
5. `autogenerate` is mandatory:

   ```ts
   User.primaryKey({ autogenerate: false });
   User.primaryKey({ autogenerate: true });
   ```

6. `autogenerate: false` requires a supplied value and is used for existing identities and caller-supplied create identities.
7. `autogenerate: true` allows omission or null and mints a model-prefixed value during payload validation.
8. Raw `primitives.primaryKey` is table-only and is rejected in contract payloads.
9. The descriptor boundary is enforced without adding contract-result inspection or a contract-to-mutation generic validator. Existing create, update, delete, and relationship payloads are migrated to the semantically correct `Model.primaryKey` form.

## Database Configuration and Relation Queries

1. Change ordinary database construction to `makeDbConfig({ tables })`.
2. `makeDbConfig` derives the Drizzle schema and relations from the supplied table graph.
3. Preserve `makeResourceDbConfig({ models, otherTables? })`. It combines each `model.table` with optional repo tables and delegates to the same table-graph machinery.
4. Replace `makeDrizzleRelationsFromModels` and `makeDrizzleRelationsFromSchema` with the approved defining-module export `makeDrizzleRelationsFromTables(tables)`.
5. Do not retain compatibility exports or manual empty-relation construction.
6. Implement relation derivation with explicit, annotated table and column loops plus an explicit DFS cycle check. Do not add a generic traversal or graph utility.
7. Preserve typed model relational queries and extend the same forward/inverse `db.query.*({ with: ... })` behavior to ordinary tables.

## Primary-Key Migration Policy

1. Tables may have zero or one SQL primary key.
2. Do not add synthetic columns.
3. Existing composite, numeric, or heterogeneous logical identities remain unique indexes rather than becoming SQL primary keys.
4. A table must have one primary key only when another table refs it.
5. Promote these existing values to `primitives.primaryKey` without adding columns:
   1. `finalizedBlocks.lastAccountCursor`
   2. `accountBlockOutbox.lastAccountCursor`
   3. `actorBlocks.lastAccountCursor`
   4. `actorBlockOutbox.lastAccountCursor`
   5. `serviceBlocks.lastServiceCursor`
   6. `serviceCursors.serviceCursor`
   7. `serviceBlockOutbox.lastServiceCursor`
   8. `SystemRepo.accounts.accountId`
6. Remove only uniqueness indexes made redundant by those promotions. Preserve independent ordering and lookup indexes.
7. Retain logical unique identities and no SQL primary key for:
   1. `AccountBlockRepo.mutations` using `commandId + mutationIndex`
   2. `AccountRepo.replicatedResources` using `serviceName + modelName + resourceId`
   3. `ActorRepo.graph` using heterogeneous `resourceId`
   4. `AuthorizationRepo.authorizations` using `actorId + actorName + frontendName`
   5. `FrontendBlockRepo.frontendBlocks` using numeric `frontendIndex`
   6. `FrontendRepo.graph` using heterogeneous `resourceId`
   7. `FrontendRepo.pushedMutations` using `commandId + mutationIndex`
   8. `FrontendRepo.frontendBlockOutbox` using numeric `frontendIndex`
   9. `SystemRepo.repos` using `repoType + repoName`
   10. `FixtureRepo.fixtureValues` using `scope + id`

## Consumer Migration Rules

1. Replace every old `primitives.id` call according to the value's actual role:
   1. SQL row identity becomes `primitives.primaryKey`.
   2. Same-database, single-target relationship becomes `primitives.ref`.
   3. Ordered position becomes `primitives.cursor`.
   4. Cross-database, polymorphic, provenance, external, and self-context identity becomes `primitives.prefixed`.
   5. Model payload identity becomes `Model.primaryKey({ autogenerate })`.
2. Model relationships become refs.
3. External API-key IDs, telemetry trace IDs, cross-store system IDs, polymorphic command/resource IDs, and similar values remain prefixed rather than becoming refs.
4. LogRepo may use refs only for unambiguous acyclic same-database links. Self-parent and cross-store provenance values remain prefixed.
5. A cursor or primary-key watermark is not automatically a relation merely because another table stores the same value.

## System-Worker Repo Names

1. Add one stable abbreviation per registered system-worker repo type:
   1. `SystemRepo`: `sysrepo`
   2. `AccountRepo`: `acctrepo`
   3. `AuthorizationRepo`: `atzrepo`
   4. `ActorRepo`: `actrrepo`
   5. `FrontendRepo`: `frtrepo`
   6. `ServiceRepo`: `svcrepo`
   7. `AccountBlockRepo`: `acctbrepo`
   8. `ActorBlockRepo`: `actrbrepo`
   9. `FrontendBlockRepo`: `frtbrepo`
   10. `ServiceBlockRepo`: `svcbrepo`
   11. `LogRepo`: `logrepo`
2. Add the abbreviation to `makeRepoUtils` and `makeRepoNameUtils`.
3. `makeName` prepends `${abbreviation}_` to the existing route-derived worker name.
4. `parseName` validates and removes the exact prefix before applying the unchanged route matcher.
5. Prefix SystemRepo's fixed name as well as route-derived names.
6. Exclude FixtureRepo, DevZerospinApis, LogAgent, tests, and migration-only placeholder repo types.
7. Update every name producer, parser, `getByName` call, repo-opening helper, repo-to-repo call, explorer method, and websocket constructor.
8. Rename subscriber and subscription identity columns and every corresponding RPC/queue/predicate/conflict-target field:
   1. `ServiceBlockRepo.accountSubscribers.name` becomes `accountRepoName` using `acctrepo`.
   2. `AccountBlockRepo.actorSubscribers.name` becomes `actorRepoName` using `actrrepo`.
   3. `ActorBlockRepo.frontendSubscribers.name` becomes `frontendRepoName` using `frtrepo`.
   4. `AccountRepo.serviceSubscriptions.serviceName` becomes `serviceRepoName` using `svcrepo`.
9. These columns are row identities and use `primitives.primaryKey` with the corresponding repo abbreviation.
10. The new names intentionally create fresh Durable Object roots. Do not add fallback parsing, old-name lookup, or state-copy behavior.

## Controller Releases and DevZerospinApis

1. Add one release abbreviation per controller category:
   1. System: `sysrel`
   2. Account: `acctrel`
   3. Actor: `actrrel`
   4. Frontend: `frtrel`
   5. Service: `svcrel`
2. Account, actor, and service controller factories gain a required `version`. Frontend and system retain their existing required versions.
3. Each returned controller exposes an inline `getRelease()` method returning `${categoryReleaseAbbreviation}_${version}` with exact template-literal inference.
4. Do not add a shared release helper.
5. Convert DevZerospinApis through its existing `makeRepo({ repoUtils })` boundary, retain `/:systemRelease`, and omit `repoType` registration.
6. Preserve the existing seed receipt, command journal, readiness Promise, Cap'n Web fetch behavior, release equality check, and Wrangler migration.
7. Define exactly four schema-only tables:
   1. `accountControllers` with only `release: primitives.primaryKey({ abbreviation: 'acctrel' })`
   2. `frontendControllers` with only `release: primitives.primaryKey({ abbreviation: 'frtrel' })`
   3. `actorControllers` with only `release: primitives.primaryKey({ abbreviation: 'actrrel' })`
   4. `systemControllers` with only `release: primitives.primaryKey({ abbreviation: 'sysrel' })`
8. Add no `serviceControllers` table, controller rows, timestamps, or population behavior. Population is a separate follow-up.

## Testing Decisions

1. Add a core in-memory database integration test that performs real forward and inverse relational queries across model tables and ordinary tables.
2. Add core primitive, schema, Drizzle, migration, inference, and encoded-shape tests for primary keys, cursors, prefixed values, refs, and model payload keys.
3. Add typecheck fixtures rejecting payload refs, raw payload primary keys, missing relation/inverse names, invalid targets, nullable or multiple primary keys, additional model primary keys, and direct cycles.
4. Add runtime validation tests for erased/cross-module cycles, missing targets, targets outside the database, duplicate table/relation names, and invalid target primary keys.
5. Prove that ref target/relation changes require a frontend version bump.
6. Extend system-worker workerd coverage for the eight promoted primary keys, the ten retained logical identities, repo prefixes, renamed subscriber/subscription keys, delivery lookup paths, and wrong-prefix rejection.
7. Extend React websocket tests for the prefixed actor-repo constructor path.
8. Extend the DevZerospinApis clean-workerd suite with four explicit assertions proving each table has only one non-null text primary-key `release` column and zero rows.
9. Run focused Nx typecheck, lint, unit, and workerd targets for core, system-worker, dispatch-worker, shared-worker, frontend/react, shopping, and parking, followed by affected targets and `git diff --check`.
10. Finish with stale-symbol searches for removed ID primitives, model-based refs, `inverse.kind`, old subscriber field names, and removed relation builders across production, tests, plans, wiki, and patterns.

## Documentation

1. Update SystemApi, DeploySystem, Blockchain, websocket, and model-relation architecture pages with current names and citations.
2. Update static patterns for encoded shapes, table shapes, primary keys, refs, prefixed values, and repo names.
3. Remove deprecated examples rather than documenting compatibility APIs.

## Out of Scope

1. Synthetic keys for tables with valid logical identities.
2. SQLite foreign-key constraints or cascades.
3. Composite, alternate-key, polymorphic, self, lazy, or cyclic refs.
4. Payload refs.
5. Contract-result validation tying autogenerated payload keys to emitted mutations.
6. Durable Object name or database state migration.
7. DevZerospinApis controller-table population.
8. New barrels, unrelated helpers, wrapper functions, named types beyond the approved descriptor types, `ALLOWED_CAST`, or unrelated cleanup.
