# llm-wiki pattern index

Keyword → pattern file routing. Code shows good; `@bad` JSDoc tags document anti-patterns.

## system-worker

| Keywords                                                                                         | File                                                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| storage.sql guard, SQLite DO, makeDurableDb                                                      | `system-worker/no-storage-sql-guard-on-sqlite-do.ts`                     |
| systemModels, merge contracts, aggregate boundaries                                              | `system-worker/never-merge-models-or-contracts.ts`                       |
| command chain history pull, materialized Repo catch-up, subscriber acknowledgement, anti-entropy | `system-worker/command-chain-subscriber-anti-entropy.ts`                 |
| makeDeliveryQueue, default retry, outbox diagnostic, no retry counters                           | `system-worker/effect-retry-no-persisted-counters.ts`                    |
| materialized aggregate, aggregate.contracts, contract lookup                                     | `system-worker/materialized-aggregate-repo-contract-lookup.ts`           |
| command chain admission, materialized Repo execution, terminal history, subscriber fanout        | `system-worker/aggregate-command-chain-materialization.ts`               |
| complete command occurrence, chain, outbox, RPC, websocket, replica journal                      | `system-worker/preserve-command-payloads-across-chains.ts`               |
| repo DB init, table graph, makeDbConfig                                                          | `system-worker/repo-db-init-merged-schema.ts`                            |
| makeFixedDORepoConfig, getDbConfig, contextual callbacks                                         | `system-worker/make-fixed-do-repo-config-contextual-callbacks.ts`        |
| repo abbreviation, persisted \*RepoName, delivery                                                | `system-worker/persist-prefixed-repo-name-delivery.ts`                   |
| makeAsync, decodeRpc, IEncodedResult inference                                                   | `system-worker/makeasync-infer-rpc-success.ts`                           |
| commands insert, SQL variables limit                                                             | `system-worker/commands-inserts-one-row-per-statement.ts`                |
| SYSTEM_REPO, SystemRepo.getRepo, systemId, singleton                                             | `system-worker/system-repo-lookup-ownership.ts`                          |
| vitest node workerd, spec suffix                                                                 | `system-worker/vitest-runtime-boundaries.ts`                             |
| get\*Repo helper, fixedDORepoConfig statics                                                      | `system-worker/use-fixed-do-repo-config-static-access.ts`                |
| inline non-public repo helper                                                                    | `system-worker/inline-small-repo-logic-into-do-method.ts`                |
| Repo JSDoc, architecture sync                                                                    | `system-worker/repo-and-api-jsdoc-in-sync.ts`                            |
| MaterializedAggregateFrontendRepo push, optimistic journal, aggregate forwarding                 | `system-worker/materialized-aggregate-frontend-repo-owned-push.ts`       |
| MaterializedAggregateFrontendRepo selection, source replica, projection, optimistic replay       | `system-worker/materialized-aggregate-frontend-repo-owned-projection.ts` |
| makeTx program, Effect.fn transaction                                                            | `system-worker/maketx-program-effect-fn.ts`                              |
| makeTx atomic writes, single statement write                                                     | `system-worker/maketx-only-for-atomic-multi-statement-writes.ts`         |
| Effect.sync drizzle, sync db query, tx.select                                                    | `tooling/sync-drizzle-no-effect-sync.ts`                                 |
| read-only Drizzle, makeTx                                                                        | `system-worker/read-only-drizzle-on-db-not-maketx.ts`                    |
| Drizzle table alias single use                                                                   | `system-worker/no-const-alias-single-use-drizzle-table.ts`               |

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
| makeContract mutation only               | `contracts/make-contract-mutation-only-return.ts`      |
| registry model scope, contract mutations | `contracts/contract-mutations-stay-in-owner-models.ts` |
| IEncodedCommand boundary                 | `contracts/iencoded-command-at-boundary-only.ts`       |
| omit program payload-only                | `contracts/omit-program-not-dummy-yields.ts`           |
| historical contract, adaptPayload, up    | `contracts/contract-history-adapts-up.ts`              |

## models

| Keywords                                                                       | File                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------- |
| historical model, adaptResource, down, direct                                  | `models/model-history-adapts-down.ts`       |
| makeReplica, authoritative service model, aggregate replica, replica tombstone | `models/authoritative-model-and-replica.ts` |

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

| Keywords                                                   | File                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| typecheck after core edit                                  | `typescript/typecheck-consumer-after-core-edit.ts`           |
| lib after new types                                        | `typescript/run-lib-after-adding-types.ts`                   |
| stale dist exports                                         | `typescript/dont-match-stale-dist.ts`                        |
| paths vs references                                        | `typescript/paths-with-project-references.ts`                |
| project reference flags                                    | `typescript/project-reference-performance-flags.ts`          |
| IConfig satisfies                                          | `typescript/fixing-vs-coercing-config.ts`                    |
| redundant export annotation                                | `typescript/redundant-annotations-on-inferred-exports.ts`    |
| encodeShape, table-bound ref metadata, no decodeShape      | `typescript/encode-shape-wire-format.ts`                     |
| IShape satisfies, IAnyTables, as const satisfies           | `typescript/shape-table-satisfies-without-as-const.ts`       |
| table ref, opaque ID, Model.primaryKey, payload key        | `typescript/table-ref-opaque-id-and-payload-primary-key.ts`  |
| makeSystem id inference                                    | `typescript/makesystem-system-entry-exports.ts`              |
| owner authenticate, userId, aggregate authorization target | `typescript/owner-authentication-returns-user-id.ts`         |
| intersection factory return                                | `typescript/intersection-return-types-on-factories.ts`       |
| frontend binding source model, aggregate model consistency | `typescript/aggregate-frontend-binding-model-consistency.ts` |
| unprompted type JSDoc                                      | `typescript/unrequested-annotations-on-types.ts`             |
| tautological typecheck                                     | `typescript/tautological-typecheck-assertions.ts`            |
| Equals inline expected                                     | `typescript/equals-expectations-in-typecheck.ts`             |
| Equals not extends ternary                                 | `typescript/use-equals-not-ternary-assignability.ts`         |
| single-consumer type shapes                                | `typescript/single-consumer-types.ts`                        |

## cases

See `cases/index.md` for smell → case → pattern links.
