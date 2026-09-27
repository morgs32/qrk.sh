# wiki pattern index

Keyword → pattern file routing. Code shows good; `@bad` JSDoc tags document anti-patterns.

## declarations

- [Declaration casing](typescript/declaration-casing.md): camelCase domain declarations and filenames; PascalCase classes, Effect tags, React contexts, and JSX tags; preserve constants, schema values, Effect layers, state-machine states, and type naming.
- [One versioned declaration per file](declarations/one-version-per-file.ts): model version, contract version, aggregate version, aggregate actor version, service actor version, service version, system version, makeActorDbVersion, version ownership, shared guards, registries.
- [Plain domain modules](declarations/plain-domain-modules.ts): domain factories, final model and contract objects, checked collection merges, aggregate and service attachment, automations.

## system-worker

- [Automation group recovery](system-worker/automation-group-recovery.md): captured optimistic views, sibling failures, service recovery serialization, terminal staging rejections.

- [Repo schema, activation, and alarms](system-worker/repo-lifecycle.md): makeFixedDORepo, makeMigratableDORepo, onDOActivation, alarmRegistry, source subscriptions.
- [Identity and SystemRepo ownership](system-worker/identity-and-ownership.md): exact tuple fields, identity versus admission, SystemRepo responsibilities.
- [Never store canonical bytes in SQL](system-worker/no-canonical-bytes-in-sql.md): canonicalBytes, canonical JSON, SQL blobs, command rows, projection checkpoints, replay, deduplication, hashes; requires deep architectural design discussion.

| Keywords                                                                                                                                                                                                                                                                                                          | File                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| storage.sql guard, SQLite DO, makeDurableDb                                                                                                                                                                                                                                                                       | `system-worker/no-storage-sql-guard-on-sqlite-do.ts`              |
| systemModels, merge contracts, aggregate boundaries                                                                                                                                                                                                                                                               | `system-worker/never-merge-models-or-contracts.ts`                |
| command chain history pull, Repo catch-up, subscriber acknowledgement, anti-entropy                                                                                                                                                                                                                               | `system-worker/command-chain-subscriber-anti-entropy.ts`          |
| makeDeliveryQueue, default retry, outbox diagnostic, no retry counters                                                                                                                                                                                                                                            | `system-worker/effect-retry-no-persisted-counters.ts`             |
| aggregate Repo, actor.contracts, recorded actor lineage, contract lookup                                                                                                                                                                                                                                          | `system-worker/versioned-aggregate-repo-contract-lookup.ts`       |
| command chain admission, Repo execution, terminal history, subscriber fanout                                                                                                                                                                                                                                      | `system-worker/aggregate-chain-materialization.ts`                |
| complete command occurrence, chain, outbox, RPC, websocket, replica journal                                                                                                                                                                                                                                       | `system-worker/preserve-command-payloads-across-chains.ts`        |
| repo DB init, table graph, makeDbConfig                                                                                                                                                                                                                                                                           | `system-worker/repo-db-init-merged-schema.ts`                     |
| makeFixedDORepoConfig, getDbConfig, contextual callbacks                                                                                                                                                                                                                                                          | `system-worker/make-fixed-do-repo-config-contextual-callbacks.ts` |
| repo abbreviation, persisted \*RepoName, delivery                                                                                                                                                                                                                                                                 | `system-worker/persist-prefixed-repo-name-delivery.ts`            |
| makeAsync, readResult, IResult inference                                                                                                                                                                                                                                                                          | `system-worker/makeasync-infer-rpc-success.ts`                    |
| commands insert, SQL variables limit                                                                                                                                                                                                                                                                              | `system-worker/commands-inserts-one-row-per-statement.ts`         |
| Repo.getRepo, namespaceBinding, DORepoNamespaces, SystemRepo singleton                                                                                                                                                                                                                                            | `system-worker/repo-lookup-ownership.ts`                          |
| vitest node workerd, spec suffix                                                                                                                                                                                                                                                                                  | `system-worker/vitest-runtime-boundaries.ts`                      |
| Repo.getRepo, namespaceBinding, fixedDORepoConfig statics                                                                                                                                                                                                                                                         | `system-worker/use-fixed-do-repo-config-static-access.ts`         |
| inline non-public repo helper                                                                                                                                                                                                                                                                                     | `system-worker/inline-small-repo-logic-into-do-method.ts`         |
| IOutboxRepo, IOutboxSubscriberRepo, makeOutboxQueue, makeOutboxSubscriber, IFanoutRepo, IFanoutSubscriberRepo, IFanoutDelivery, fanout queue getter, sourceKey method accessor, getPage, fixed-destination catchup, subscribe, makeFanoutQueue, makeFanoutSubscriber, inline queue, no one-consumer queue factory | `system-worker/i-fanout-repo.ts`                                  |
| Repo JSDoc, architecture sync                                                                                                                                                                                                                                                                                     | `system-worker/repo-and-api-jsdoc-in-sync.ts`                     |
| AggregateActorVersionRepo push, optimistic journal, aggregate forwarding                                                                                                                                                                                                                                          | `system-worker/aggregate-session-admission.ts`                    |
| AggregateActorVersionRepo selection, source replica, projection, optimistic replay                                                                                                                                                                                                                                | `system-worker/versioned-aggregate-replica-owned-projection.ts`   |
| makeTx program, explicit db and tx arguments, typed transaction                                                                                                                                                                                                                                                   | `system-worker/maketx-program-effect-fn.ts`                       |
| Table.decodeRow, Table.encodeRow, dbConfig.tables, complete SQL row, partial field codec, encoded transfer                                                                                                                                                                                                        | `system-worker/table-owned-command-row-codecs.ts`                 |
| staging, admission, execution, structured failure, stagedDelta, executionDelta, actorDelta, selected resource naming                                                                                                                                                                                              | `system-worker/command-delta-names.ts`                            |
| makeTx atomic writes, single statement write                                                                                                                                                                                                                                                                      | `system-worker/maketx-only-for-atomic-multi-statement-writes.ts`  |
| Effect.sync drizzle, sync db query, tx.select                                                                                                                                                                                                                                                                     | `tooling/sync-drizzle-no-effect-sync.ts`                          |
| read-only Drizzle, makeTx                                                                                                                                                                                                                                                                                         | `system-worker/read-only-drizzle-on-db-not-maketx.ts`             |
| DbConfig.schema, DrizzleSchemas, schema alias, relations alias, Drizzle table alias                                                                                                                                                                                                                               | `system-worker/no-dbconfig-prop-alias.ts`                         |

## rpc

| Keywords                                                                                                                                      | File                               |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| RpcTarget method folders, same-named Effect.fn, Api, Repo                                                                                     | `rpc/rpc-target-method-folders.ts` |
| IResult, Success, Failure, encodeRpcOutcome, decodeRpcOutcome, settleResult, readResult, domain failure, Promise rejection, transport failure | `rpc/result-envelopes.ts`          |

## apis

| Keywords                                                                | File                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| Schema.decodeUnknownEffect trust boundary                               | `apis/validate-at-boundary.ts`                      |
| \*Api validation, direct System Worker Effects, no ctx.exports loopback | `apis/trust-boundary-validation-in-api-not-repo.ts` |
| \*Api JSDoc architecture                                                | `apis/api-gateway-jsdoc-in-sync.ts`                 |
| obvious result, return the command, receipt, commandId, position        | `apis/return-the-domain-object.md`                  |

## contracts

- [Explicit failures at each use site](contracts/explicit-failures-at-use-site.ts): failures, camelCase, inline error schemas, injected constructors, default null extra, declared errors.

| Keywords                                                              | File                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| Effect.all program                                                    | `contracts/contract-program-effect-all.ts`             |
| makeContractVersion mutation only                                     | `contracts/make-contract-mutation-only-return.ts`      |
| registry model scope, contract mutations                              | `contracts/contract-mutations-stay-in-owner-models.ts` |
| IEncodedCommand boundary                                              | `contracts/iencoded-command-at-boundary-only.ts`       |
| omit program payload-only                                             | `contracts/omit-program-not-dummy-yields.ts`           |
| upgradeContractVersion, up, down, Effect.fn, fixture, spec, typecheck | `contracts/upgrade-payload-edges-effect-fn.ts`         |

## models

- [Explicit models at each use site](models/explicit-models-at-use-site.ts): models, model maps, commonModels, purchaseGuardModels, model spreads, guard dependencies, authored declarations.

| Keywords                                                                                                                  | File                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| makeReplica, authoritative service model, aggregate replica, replica tombstone, Model.isReplica, immutable authored model | `models/authoritative-model-and-replica.ts` |

## react

- [One session per file](react/one-session-per-file.ts): makeSession, makeSessions, session declarations, module-level session values, no session factories, applicationLayer, session.runtime, useInitializeSession, dispose/reinitialize, HMR, root.unmount, operation IDs.

| Keywords                                                                | File                                          |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| stageCommand, local execution, optimistic UI, no pending state          | `react/no-pending-ui-for-local-execution.tsx` |
| frontend binding, makeAggregateFrontend, makeServiceFrontend, FrontendV | `react/versioned-frontend-binding.ts`         |

## error

- [Yieldable errors](error/yieldable-errors.ts): ContractError, ActorError, AggregateError, owner guard callbacks, direct yield\*, AccountNotOwned.make, api calls, no single-use temporaries, local Error versus serialized JSON; spec 005 target.

| Keywords                      | File                                 |
| ----------------------------- | ------------------------------------ |
| deploy-invalid-config         | `error/deploy-config-load-errors.ts` |
| AsyncLive runPromise boundary | `error/async-live-at-run-promise.ts` |

## schemas

| Keywords                                                    | File                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| decodeUnknownEffect, onExcessProperty ignore, inline Struct | `schemas/rpc-boundary-validate.ts`               |
| decodeUnknownEffect in Api method                           | `schemas/rpc-prop-validation-in-api-method.ts`   |
| decode unknown request without cast                         | `schemas/validate-unknown-without-cast.ts`       |
| SchemaError stable message prefix                           | `schemas/schema-error-on-message-not-cause.ts`   |
| mapParseError, SchemaIssue                                  | `schemas/map-parse-error-for-schema-failures.ts` |

## testing

| Keywords                                                                                                                          | File                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| test organization, runtime lanes, Node, workerd, React, Playwright, typecheck                                                     | `testing/runtime-lanes.md`                         |
| test DB fixture, assertion readback, makeTx                                                                                       | `testing/direct-db-in-test-fixtures-not-maketx.ts` |
| malformed props, RPC seam, Schema.SchemaError, schema catalog, JSON.stringify loss, journal replay, outbox decode, public handler | `testing/malformed-props-at-rpc-seam.ts`           |

## cli

| Keywords                                     | File                                                   |
| -------------------------------------------- | ------------------------------------------------------ |
| ProcedureStepError, ProcedureNextStep, null  | `cli/procedure-step-error-exit-code-and-next-step.tsx` |
| process.exitCode, Ink command, terminal step | `cli/procedure-step-error-exit-code-and-next-step.tsx` |

## typescript

- [Declare each DB config once](typescript/declare-db-config-once.ts): one declaration per DB config file, makeDbConfig, inline tables and shapes, Table.codec, row schemas, SystemLogRepo exception, private table aliases, typecheck assertions.

- [Inline SQL placeholders](typescript/inline-sql-placeholders.ts): sql.placeholder, identity, identity, query filters, placeholder variables.

- [Inline primitive descriptors](typescript/inline-primitives.ts): primitives, foreignKey, json, descriptor variables, payload, attributes, shape fixtures.

- [Use make, not to, for construction helpers](typescript/make-prefix-not-to.ts): make*, to*, factory naming, result wrappers, makeRpcResult.

| Keywords                                                                                                   | File                                                        |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| props destructure, props.field, pass props                                                                 | `typescript/no-props-after-destructure.ts`                  |
| typecheck after core edit                                                                                  | `typescript/typecheck-consumer-after-core-edit.ts`          |
| lib after new types                                                                                        | `typescript/run-lib-after-adding-types.ts`                  |
| stale dist exports                                                                                         | `typescript/dont-match-stale-dist.ts`                       |
| paths vs references                                                                                        | `typescript/paths-with-project-references.ts`               |
| project reference flags                                                                                    | `typescript/project-reference-performance-flags.ts`         |
| IConfig satisfies                                                                                          | `typescript/fixing-vs-coercing-config.ts`                   |
| redundant export annotation                                                                                | `typescript/redundant-annotations-on-inferred-exports.ts`   |
| encodeShape, encodedShapeSchema, ISO date defaults, table-bound ref metadata, no decodeShape               | `typescript/encode-shape-wire-format.ts`                    |
| IShape satisfies, IAnyTables, as const satisfies                                                           | `typescript/shape-table-satisfies-without-as-const.ts`      |
| table ref, foreign key, foreignKey, payload key                                                            | `typescript/table-ref-and-foreign-key.ts`                   |
| makeSystem id inference                                                                                    | `typescript/makesystem-system-entry-exports.ts`             |
| owner authenticate, full claims, selection partition                                                       | `typescript/owner-identity-and-actor.ts`                    |
| intersection factory return                                                                                | `typescript/intersection-return-types-on-factories.ts`      |
| session binding source model, aggregate model consistency                                                  | `typescript/aggregate-session-binding-model-consistency.ts` |
| unprompted type JSDoc                                                                                      | `typescript/unrequested-annotations-on-types.ts`            |
| tautological typecheck                                                                                     | `typescript/tautological-typecheck-assertions.ts`           |
| Equals inline expected                                                                                     | `typescript/equals-expectations-in-typecheck.ts`            |
| Equals not extends ternary                                                                                 | `typescript/use-equals-not-ternary-assignability.ts`        |
| single-consumer type shapes                                                                                | `typescript/single-consumer-types.ts`                       |
| I prefix, type alias, interface, AggregateSessionModel                                                     | `typescript/type-aliases-use-i-prefix.ts`                   |
| Context.Service id, service key, unique class name, path-prefixed reused class name, @zerospin package tag | `typescript/context-service-id-is-class-name.ts`            |

## cases

See `cases/index.md` for smell → case → pattern links.
