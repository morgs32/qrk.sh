# llm-wiki pattern index

Keyword → pattern file routing. Code shows good; `@bad` JSDoc tags document anti-patterns.

## system-worker

| Keywords                                                                                                  | File                                                                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| makeCursor, coreAbbreviations, cursor cast                                                                | `system-worker/make-cursor-core-abbreviations.ts`                         |
| DO KV cursor, UndefinedOr, NullOr, bootstrap absence                                                      | `system-worker/do-kv-optional-cursor-reads.ts`                            |
| storage.sql guard, SQLite DO, makeDurableDb                                                               | `system-worker/no-storage-sql-guard-on-sqlite-do.ts`                      |
| systemModels, merge contracts, aggregate boundaries                                                       | `system-worker/never-merge-models-or-contracts.ts`                        |
| AggregateBlockRepo history pull, AggregateFrontendRepo catch-up, frozen projection rejection, live fanout | `system-worker/direct-aggregate-frontend-fanout.ts`                       |
| makeFanoutQueue, subscriber order, 100 concurrency, failure isolation                                     | `system-worker/fanout-retry-behavior-in-apply-fanout-batch-in-tx.ts`      |
| makeDeliveryQueue, default retry, outbox diagnostic, no retry counters                                    | `system-worker/effect-retry-no-persisted-counters.ts`                     |
| aggregate.contracts, contract lookup                                                                      | `system-worker/aggregate-repo-contract-lookup.ts`                         |
| Effect.partition, batch finalization                                                                      | `system-worker/effect-partition-batch-finalization.ts`                    |
| AggregateRepo finalization, outbox, AggregateBlockRepo publish                                            | `system-worker/aggregate-repo-finalization-fanout.ts`                     |
| command payloads, blocks, sync, websocket                                                                 | `system-worker/preserve-command-payloads-across-blocks.ts`                |
| repo DB init, table graph, makeDbConfig                                                                   | `system-worker/repo-db-init-merged-schema.ts`                             |
| makeBoundDORepoConfig, getDbConfig, contextual callbacks                                                  | `system-worker/make-bound-do-repo-config-contextual-callbacks.ts`         |
| repo abbreviation, persisted \*RepoName, delivery                                                         | `system-worker/persist-prefixed-repo-name-delivery.ts`                    |
| makeAsync, decodeRpc, EitherEncoded inference                                                             | `system-worker/makeasync-infer-rpc-success.ts`                            |
| commands insert, SQL variables limit                                                                      | `system-worker/commands-inserts-one-row-per-statement.ts`                 |
| SYSTEM_REPO, SystemRepo.getRepo, systemId, generationId                                                   | `system-worker/system-repo-lookup-ownership.ts`                           |
| vitest node workerd, spec suffix                                                                          | `system-worker/vitest-runtime-boundaries.ts`                              |
| SystemWorker thin, Api validation                                                                         | `system-worker/system-worker-stays-thin-after-api-validation.ts`          |
| get\*Repo helper, boundDORepoConfig statics                                                               | `system-worker/use-bound-do-repo-config-static-access.ts`                 |
| inline non-public repo helper                                                                             | `system-worker/inline-small-repo-logic-into-do-method.ts`                 |
| Repo JSDoc, architecture sync                                                                             | `system-worker/repo-and-api-jsdoc-in-sync.ts`                             |
| AggregateFrontendRepo push, pushed block, admission cursor, stale guard revalidation                      | `system-worker/aggregate-frontend-repo-owned-push.ts`                     |
| AggregateFrontendRepo selection, source replica, projection, canonical block                              | `system-worker/aggregate-frontend-repo-owned-selection-and-projection.ts` |
| makeTx program, Effect.fn transaction                                                                     | `system-worker/maketx-program-effect-fn.ts`                               |
| makeTx atomic writes, single statement write                                                              | `system-worker/maketx-only-for-atomic-multi-statement-writes.ts`          |
| Effect.sync drizzle, sync db query, tx.select                                                             | `tooling/sync-drizzle-no-effect-sync.ts`                                  |
| read-only Drizzle, makeTx                                                                                 | `system-worker/read-only-drizzle-on-db-not-maketx.ts`                     |
| Drizzle table alias single use                                                                            | `system-worker/no-const-alias-single-use-drizzle-table.ts`                |

## rpc

| Keywords                                                  | File                               |
| --------------------------------------------------------- | ---------------------------------- |
| RpcTarget method folders, same-named Effect.fn, Api, Repo | `rpc/rpc-target-method-folders.ts` |

## apis

| Keywords                       | File                                                |
| ------------------------------ | --------------------------------------------------- |
| Schema.validate trust boundary | `apis/validate-at-boundary.ts`                      |
| *Api not *Repo validation      | `apis/trust-boundary-validation-in-api-not-repo.ts` |
| \*Api JSDoc architecture       | `apis/api-gateway-jsdoc-in-sync.ts`                 |

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

| Keywords                                      | File                                  |
| --------------------------------------------- | ------------------------------------- |
| historical model, adaptResource, down, direct | `models/model-history-adapts-down.ts` |

## react

| Keywords                                                     | File                                        |
| ------------------------------------------------------------ | ------------------------------------------- |
| stageCommand, local staging, optimistic UI, no pending state | `react/no-pending-ui-for-local-staging.tsx` |

## error

| Keywords                      | File                                        |
| ----------------------------- | ------------------------------------------- |
| yield ZerospinError           | `error/yield-zerospin-error-directly.ts`    |
| catchAll yieldable            | `error/catch-all-return-yieldable-error.ts` |
| one-step Effect.gen wrapper   | `error/no-one-step-effect-gen-wrapper.ts`   |
| Either.left yieldable         | `error/either-left-is-yieldable.ts`         |
| deploy-invalid-config         | `error/deploy-config-load-errors.ts`        |
| seeds module path             | `error/seeds-path-not-import.ts`            |
| AsyncLive runPromise boundary | `error/async-live-at-run-promise.ts`        |

## schemas

| Keywords                               | File                                             |
| -------------------------------------- | ------------------------------------------------ |
| onExcessProperty ignore, inline Struct | `schemas/rpc-boundary-validate.ts`               |
| validate in Api method                 | `schemas/rpc-prop-validation-in-api-method.ts`   |
| validate unknown request without cast  | `schemas/validate-unknown-without-cast.ts`       |
| ParseError stable message prefix       | `schemas/parse-error-on-message-not-cause.ts`    |
| mapParseError                          | `schemas/map-parse-error-for-schema-failures.ts` |

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
| rebuild worker dist                                        | `typescript/rebuild-worker-declarations-before-patch.ts`     |
| stale dist exports                                         | `typescript/dont-match-stale-dist.ts`                        |
| paths vs references                                        | `typescript/paths-with-project-references.ts`                |
| project reference flags                                    | `typescript/project-reference-performance-flags.ts`          |
| IConfig satisfies                                          | `typescript/fixing-vs-coercing-config.ts`                    |
| redundant export annotation                                | `typescript/redundant-annotations-on-inferred-exports.ts`    |
| encodeShape, table-bound ref metadata, no decodeShape      | `typescript/encode-shape-wire-format.ts`                     |
| IShape satisfies, IAnyTables, as const satisfies           | `typescript/shape-table-satisfies-without-as-const.ts`       |
| table ref, opaque ID, Model.primaryKey, payload key        | `typescript/table-ref-opaque-id-and-payload-primary-key.ts`  |
| makeSystem id inference                                    | `typescript/makesystem-system-entry-exports.ts`              |
| owner authenticate, userId, IUserRef                       | `typescript/owner-authentication-returns-user-id.ts`         |
| intersection factory return                                | `typescript/intersection-return-types-on-factories.ts`       |
| frontend binding source model, aggregate model consistency | `typescript/aggregate-frontend-binding-model-consistency.ts` |
| unprompted type JSDoc                                      | `typescript/unrequested-annotations-on-types.ts`             |
| tautological typecheck                                     | `typescript/tautological-typecheck-assertions.ts`            |
| Equals inline expected                                     | `typescript/equals-expectations-in-typecheck.ts`             |
| Equals not extends ternary                                 | `typescript/use-equals-not-ternary-assignability.ts`         |
| single-consumer type shapes                                | `typescript/single-consumer-types.ts`                        |

## cases

See `cases/index.md` for smell → case → pattern links.
