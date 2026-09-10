# llm-wiki pattern index

Keyword → pattern file routing. Code shows good; `@bad` JSDoc tags document anti-patterns.

## system-worker

| Keywords                                                                                                                                                                                                                                                                                                          | File                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| storage.sql guard, SQLite DO, makeDurableDb                                                                                                                                                                                                                                                                       | `system-worker/no-storage-sql-guard-on-sqlite-do.ts`              |
| systemModels, merge contracts, aggregate boundaries                                                                                                                                                                                                                                                               | `system-worker/never-merge-models-or-contracts.ts`                |
| command chain history pull, Repo catch-up, subscriber acknowledgement, anti-entropy                                                                                                                                                                                                                               | `system-worker/command-chain-subscriber-anti-entropy.ts`          |
| makeDeliveryQueue, default retry, outbox diagnostic, no retry counters                                                                                                                                                                                                                                            | `system-worker/effect-retry-no-persisted-counters.ts`             |
| aggregate Repo, aggregate.contracts, contract lookup                                                                                                                                                                                                                                                              | `system-worker/versioned-aggregate-repo-contract-lookup.ts`       |
| command chain admission, Repo execution, terminal history, subscriber fanout                                                                                                                                                                                                                                      | `system-worker/aggregate-chain-materialization.ts`                |
| complete command occurrence, chain, outbox, RPC, websocket, replica journal                                                                                                                                                                                                                                       | `system-worker/preserve-command-payloads-across-chains.ts`        |
| repo DB init, table graph, makeDbConfig                                                                                                                                                                                                                                                                           | `system-worker/repo-db-init-merged-schema.ts`                     |
| makeFixedDORepoConfig, getDbConfig, contextual callbacks                                                                                                                                                                                                                                                          | `system-worker/make-fixed-do-repo-config-contextual-callbacks.ts` |
| repo abbreviation, persisted \*RepoName, delivery                                                                                                                                                                                                                                                                 | `system-worker/persist-prefixed-repo-name-delivery.ts`            |
| makeAsync, decodeRpc, IEncodedResult inference                                                                                                                                                                                                                                                                    | `system-worker/makeasync-infer-rpc-success.ts`                    |
| commands insert, SQL variables limit                                                                                                                                                                                                                                                                              | `system-worker/commands-inserts-one-row-per-statement.ts`         |
| Repo.getRepo, namespaceBinding, DORepoNamespaces, SystemRepo singleton                                                                                                                                                                                                                                            | `system-worker/repo-lookup-ownership.ts`                          |
| vitest node workerd, spec suffix                                                                                                                                                                                                                                                                                  | `system-worker/vitest-runtime-boundaries.ts`                      |
| Repo.getRepo, namespaceBinding, fixedDORepoConfig statics                                                                                                                                                                                                                                                         | `system-worker/use-fixed-do-repo-config-static-access.ts`         |
| inline non-public repo helper                                                                                                                                                                                                                                                                                     | `system-worker/inline-small-repo-logic-into-do-method.ts`         |
| IOutboxRepo, IOutboxSubscriberRepo, makeOutboxQueue, makeOutboxSubscriber, IFanoutRepo, IFanoutSubscriberRepo, IFanoutDelivery, fanout queue getter, sourceKey method accessor, getPage, fixed-destination catchup, subscribe, makeFanoutQueue, makeFanoutSubscriber, inline queue, no one-consumer queue factory | `system-worker/i-fanout-repo.ts`                                  |
| Repo JSDoc, architecture sync                                                                                                                                                                                                                                                                                     | `system-worker/repo-and-api-jsdoc-in-sync.ts`                     |
| UserVersionedAggregateRepo push, optimistic journal, aggregate forwarding                                                                                                                                                                                                                                         | `system-worker/aggregate-frontend-admission.ts`                   |
| UserVersionedAggregateRepo selection, source replica, projection, optimistic replay                                                                                                                                                                                                                               | `system-worker/versioned-aggregate-replica-owned-projection.ts`   |
| makeTx program, Db.Tx, typed database service                                                                                                                                                                                                                                                                     | `system-worker/maketx-program-effect-fn.ts`                       |
| makeTx atomic writes, single statement write                                                                                                                                                                                                                                                                      | `system-worker/maketx-only-for-atomic-multi-statement-writes.ts`  |
| Effect.sync drizzle, sync db query, tx.select                                                                                                                                                                                                                                                                     | `tooling/sync-drizzle-no-effect-sync.ts`                          |
| read-only Drizzle, makeTx                                                                                                                                                                                                                                                                                         | `system-worker/read-only-drizzle-on-db-not-maketx.ts`             |
| DbConfig.schema, DrizzleSchemas, schema alias, relations alias, Drizzle table alias                                                                                                                                                                                                                               | `system-worker/no-dbconfig-prop-alias.ts`                         |

## rpc

| Keywords                                                                                                                      | File                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| RpcTarget method folders, same-named Effect.fn, Api, Repo                                                                     | `rpc/rpc-target-method-folders.ts`    |
| IEncodedResult, Success, Failure, RpcResultSchema, encodeRpc, decodeRpc, domain failure, Promise rejection, transport failure | `rpc/encoded-result-wire-boundary.ts` |

## apis

| Keywords                                                                | File                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| Schema.decodeUnknownEffect trust boundary                               | `apis/validate-at-boundary.ts`                      |
| \*Api validation, direct System Worker Effects, no ctx.exports loopback | `apis/trust-boundary-validation-in-api-not-repo.ts` |
| \*Api JSDoc architecture                                                | `apis/api-gateway-jsdoc-in-sync.ts`                 |

## contracts

| Keywords                                 | File                                                   |
| ---------------------------------------- | ------------------------------------------------------ |
| Effect.all program                       | `contracts/contract-program-effect-all.ts`             |
| makeVersion mutation only                | `contracts/make-contract-mutation-only-return.ts`      |
| registry model scope, contract mutations | `contracts/contract-mutations-stay-in-owner-models.ts` |
| IEncodedCommand boundary                 | `contracts/iencoded-command-at-boundary-only.ts`       |
| omit program payload-only                | `contracts/omit-program-not-dummy-yields.ts`           |

## models

| Keywords                                                                                                                  | File                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| makeReplica, authoritative service model, aggregate replica, replica tombstone, Model.isReplica, immutable authored model | `models/authoritative-model-and-replica.ts` |

## react

| Keywords                                                         | File                                          |
| ---------------------------------------------------------------- | --------------------------------------------- |
| executeCommand, local execution, optimistic UI, no pending state | `react/no-pending-ui-for-local-execution.tsx` |

## error

| Keywords                      | File                                      |
| ----------------------------- | ----------------------------------------- |
| yield ZerospinError           | `error/yield-zerospin-error-directly.ts`  |
| Effect.catch yieldable        | `error/catch-return-yieldable-error.ts`   |
| one-step Effect.gen wrapper   | `error/no-one-step-effect-gen-wrapper.ts` |
| Result Failure yieldable      | `error/result-failure-is-yieldable.ts`    |
| deploy-invalid-config         | `error/deploy-config-load-errors.ts`      |
| AsyncLive runPromise boundary | `error/async-live-at-run-promise.ts`      |

## schemas

| Keywords                                                    | File                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| decodeUnknownEffect, onExcessProperty ignore, inline Struct | `schemas/rpc-boundary-validate.ts`               |
| decodeUnknownEffect in Api method                           | `schemas/rpc-prop-validation-in-api-method.ts`   |
| decode unknown request without cast                         | `schemas/validate-unknown-without-cast.ts`       |
| SchemaError stable message prefix                           | `schemas/schema-error-on-message-not-cause.ts`   |
| mapParseError, SchemaIssue                                  | `schemas/map-parse-error-for-schema-failures.ts` |

## testing

| Keywords                                    | File                                               |
| ------------------------------------------- | -------------------------------------------------- |
| test DB fixture, assertion readback, makeTx | `testing/direct-db-in-test-fixtures-not-maketx.ts` |

## cli

| Keywords                                     | File                                                   |
| -------------------------------------------- | ------------------------------------------------------ |
| ProcedureStepError, ProcedureNextStep, null  | `cli/procedure-step-error-exit-code-and-next-step.tsx` |
| process.exitCode, Ink command, terminal step | `cli/procedure-step-error-exit-code-and-next-step.tsx` |

## typescript

| Keywords                                                                                     | File                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| typecheck after core edit                                                                    | `typescript/typecheck-consumer-after-core-edit.ts`           |
| lib after new types                                                                          | `typescript/run-lib-after-adding-types.ts`                   |
| stale dist exports                                                                           | `typescript/dont-match-stale-dist.ts`                        |
| paths vs references                                                                          | `typescript/paths-with-project-references.ts`                |
| project reference flags                                                                      | `typescript/project-reference-performance-flags.ts`          |
| IConfig satisfies                                                                            | `typescript/fixing-vs-coercing-config.ts`                    |
| redundant export annotation                                                                  | `typescript/redundant-annotations-on-inferred-exports.ts`    |
| encodeShape, encodedShapeSchema, ISO date defaults, table-bound ref metadata, no decodeShape | `typescript/encode-shape-wire-format.ts`                     |
| IShape satisfies, IAnyTables, as const satisfies                                             | `typescript/shape-table-satisfies-without-as-const.ts`       |
| table ref, foreign key, foreignKey, payload key                                              | `typescript/table-ref-and-foreign-key.ts`                    |
| makeSystem id inference                                                                      | `typescript/makesystem-system-entry-exports.ts`              |
| owner authenticate, userId, aggregate authorization target                                   | `typescript/owner-authentication-returns-user-id.ts`         |
| intersection factory return                                                                  | `typescript/intersection-return-types-on-factories.ts`       |
| frontend binding source model, aggregate model consistency                                   | `typescript/aggregate-frontend-binding-model-consistency.ts` |
| unprompted type JSDoc                                                                        | `typescript/unrequested-annotations-on-types.ts`             |
| tautological typecheck                                                                       | `typescript/tautological-typecheck-assertions.ts`            |
| Equals inline expected                                                                       | `typescript/equals-expectations-in-typecheck.ts`             |
| Equals not extends ternary                                                                   | `typescript/use-equals-not-ternary-assignability.ts`         |
| single-consumer type shapes                                                                  | `typescript/single-consumer-types.ts`                        |

## cases

See `cases/index.md` for smell → case → pattern links.
