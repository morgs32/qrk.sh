# Plan 064: Make Obvious Complexity Hotspots

Status: active; re-audited on 2026-09-01; first slice implemented and verified.

> **Current-source disposition:** Plan 065 and the later main-thread/OPFS
> cutover removed the original SharedWorker replica, acquisition, and block-era
> hotspots ranked 1, 2, 4, 5, 6, 7, 11, and 12. Those targets are superseded,
> not completed. The linked authored-execution fence removal then deleted a
> separate SystemRepo, command-chain, deployment, migration, and documentation
> slice. None of those deletions implements the remaining Plan 064 work. This
> revision replaces the original `5949678eb` ranking with the current working
> tree: `HEAD` `3538c2249`, the uncommitted fence cutover and unrelated
> user-owned WIP, and the verified first Plan 064 slice described below.

## Objective

Reduce the amount of state and policy a maintainer must hold in working memory
when reading Zerospin's largest production TypeScript files. Work one
invariant-sized slice at a time, preserve every observable lifecycle and
failure boundary, and stop before an unapproved public surface, ownership, or
runtime-boundary change.

This plan is active. Each remaining new helper or moved public module still
requires the repository's explicit approval before implementation.

## Measurement method

1. SCC 3.7.0 measured 607 existing production `*.ts` and `*.tsx` files under
   `packages/**/src` and `examples/**/src` after the first Plan 064 slice.
2. Specs, tests, typecheck fixtures, mocks, fixtures, declarations, generated
   output, caches, vendored code, and tracked paths deleted from the working
   tree were excluded.
3. The current baseline contains 60,006 code lines and an SCC complexity
   estimate of 5,024. The first six files contain 6,298 code lines, or 10.5% of
   the baseline, and complexity 918, or 18.3% of the baseline.
4. The original baseline contained 619 files, 73,093 code lines, and complexity
   6,879. The current tree is smaller by 12 files, 13,087 code lines, and 1,855
   complexity points. That delta spans multiple completed and user-owned
   changes and must not be attributed solely to the linked fence removal.
5. SCC complexity is a branch-token estimate, not a proof that a file should
   be split. Each candidate below was also inspected by workflow, caller,
   executable coverage, persistence boundary, and resource lifetime.

## Production ranking

| Rank | SCC complexity | Code lines | Complexity per 1,000 code lines | File                                                                                                                                       |
| ---: | -------------: | ---------: | ------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
|    1 |            277 |      1,616 |                             171 | [`makeSystem.ts`](../../../packages/core/src/system/makeSystem.ts)                                                                         |
|    2 |            160 |      1,204 |                             133 | [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts)                              |
|    3 |            135 |        915 |                             148 | [`MaterializedAggregateFrontendRepo/catchup.ts`](../../../packages/system-worker/src/MaterializedAggregateFrontendRepo/catchup/catchup.ts) |
|    4 |            125 |        545 |                             229 | [`primitiveMaps.ts`](../../../packages/schema/src/primitiveMaps.ts)                                                                        |
|    5 |            111 |      1,209 |                              92 | [`makeModel.ts`](../../../packages/core/src/models/makeModel.ts)                                                                           |
|    6 |            110 |        809 |                             136 | [`MaterializedAggregateRepo/execute.ts`](../../../packages/system-worker/src/MaterializedAggregateRepo/execute/execute.ts)                 |
|    7 |            106 |        424 |                             250 | [`prepareReplayAppliedMutation.ts`](../../../packages/core/src/contracts/prepareReplayAppliedMutation.ts)                                  |
|    8 |            103 |        838 |                             123 | [`bootstrapServiceFrontendSession.ts`](../../../packages/frontend/src/bootstrapServiceFrontendSession.ts)                                  |
|    9 |             93 |        367 |                             253 | [`makeDrizzleRelations.ts`](../../../packages/core/src/drizzle/makeDrizzleRelations.ts)                                                    |
|   10 |             92 |        691 |                             133 | [`encodeAppliedMutation.ts`](../../../packages/core/src/contracts/encodeAppliedMutation.ts)                                                |
|   11 |             88 |        544 |                             162 | [`applyAggregateFrontendCommand.ts`](../../../packages/core/src/session/applyAggregateFrontendCommand.ts)                                  |
|   12 |             86 |        330 |                             261 | [`makeLiveQuery.ts`](../../../packages/live-query/src/makeLiveQuery.ts)                                                                    |
|   13 |             84 |        754 |                             111 | [`SessionsLogsRoute.tsx`](../../../packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.tsx)                           |
|   14 |             76 |        508 |                             150 | [`makeContract.ts`](../../../packages/core/src/contracts/makeContract.ts)                                                                  |
|   15 |             72 |        683 |                             105 | [`ZerospinDevtools.tsx`](../../../packages/devtools/src/ZerospinDevtools.tsx)                                                              |

## Exact target vocabulary

1. The aggregate browser-session target is
   `{ systemId, aggregateId, aggregateName, userId, frontendName, aggregateFrontendLockKey, sessionId }`.
   Online authentication supplies `systemId` and `userId`; a transient offline
   start may recover only those two fields from the exact persisted
   authentication locator. The Provider supplies `aggregateId` and the Core
   `sessionId`; the selected controller supplies `aggregateName` and
   `frontendName`; its validated lock bytes derive
   `aggregateFrontendLockKey`.
2. The service browser-session target is
   `{ systemId, serviceName, userId, frontendName, serviceFrontendLockKey, sessionId }`.
   `systemId`, `userId`, and `sessionId` have the same sources as above. The
   selected controller supplies `serviceName` and `frontendName`; its validated
   lock bytes derive `serviceFrontendLockKey`.
3. The MaterializedAggregateFrontendRepo projection target is
   `{ systemId, aggregateId, aggregateName, userId, frontendName }`. Repo
   construction supplies that persisted key. It does not include the browser
   `sessionId` or frontend lock key.
4. The MaterializedAggregateRepo target is
   `{ systemId, aggregateId, aggregateName }`. Its bound Repo key supplies all
   three fields; a command's matching target fields are still validated
   independently.
5. None of these tuples should be called authenticated as a whole. Only online
   `systemId` and `userId` originate in authentication; controller, caller,
   session, capability, and persisted-Repo fields retain their own trust
   boundaries.

## Findings and smallest worthwhile moves

1. Completed on 2026-09-01: the replay workflow's two already-named Effect
   boundaries now define themselves in separate modules.
   1. [`prepareReplayAppliedMutation.ts:24-467`](../../../packages/core/src/contracts/prepareReplayAppliedMutation.ts#L24-L467)
      owns persisted-operation parsing, compatible-version promotion, direct
      adapter selection, historical decoding, adaptation, and destination
      validation. Comment phases 1 through 4 moved with it.
   2. [`replayAppliedMutationTx.ts:21-62`](../../../packages/core/src/contracts/replayAppliedMutationTx.ts#L21-L62)
      now owns only phase 5: prepare, honor a discard result, apply at the
      retained timestamp, and encode the recomputed result.
   3. The transaction module imports the preparation boundary directly from
      its defining module. The approved hard cut removed the old named export
      from `replayAppliedMutationTx.ts`; no compatibility re-export was added.
   4. Existing replay coverage passed unchanged. Core test, typecheck, and lint
      gates passed, and the source-only SCC rerun reported 607 files, 60,006
      code lines, and complexity 5,024.

2. [`makeSystem.ts:648-1682`](../../../packages/core/src/system/makeSystem.ts#L648-L1682)
   still hides two different construction workflows inside `mapValues`
   callbacks. The public overload and inference machinery at lines 54-591 is
   dense but essential to the public typing contract; it is not the first
   refactor target.
   1. After explicit approval, move the service callback at
      [`648-1104`](../../../packages/core/src/system/makeSystem.ts#L648-L1104)
      unchanged into proposed plain function `resolveSystemService`. It owns
      service model ownership, mutation-adapter validation, query
      normalization, frontend binding, authorization, and `makeCommand`.
   2. Move the aggregate callback at
      [`1106-1682`](../../../packages/core/src/system/makeSystem.ts#L1106-L1682)
      unchanged into proposed plain function `resolveSystemAggregate`. It owns
      source-replica validation, mutation-adapter validation, selection/query
      resolution, frontend binding, authorization, and `makeCommand`.
   3. Keep `makeSystem` as ordered orchestration: validate authentication,
      resolve services, resolve aggregates, and return the authored System.
   4. Add no named context type. Each proposed function uses an inline props
      shape and imports defining types directly.
   5. Reassess duplicated mutation-schema identity parsing only after both
      resolvers exist. Do not begin with a configurable aggregate/service
      validator.

3. [`bootstrapAggregateFrontendSession.ts:72-1225`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts#L72-L1225)
   and
   [`bootstrapServiceFrontendSession.ts:45-855`](../../../packages/frontend/src/bootstrapServiceFrontendSession.ts#L45-L855)
   are now the main-thread owners of database restoration, online/offline
   recovery, WebSocket replay, OPFS backup, reconnect, supersession, and
   release. Most of that complexity is essential lifecycle ownership, not a
   reason to recreate the removed SharedWorker architecture.
   1. The one proven two-caller rule is the authentication-locator boundary at
      [`bootstrapAggregateFrontendSession.ts:193-272`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts#L193-L272)
      and
      [`bootstrapServiceFrontendSession.ts:130-208`](../../../packages/frontend/src/bootstrapServiceFrontendSession.ts#L130-L208).
      After approval, proposed `resolveFrontendAuthenticationIdentity` owns
      online `{ systemId, userId }` persistence, transient-only offline
      fallback, strict locator decoding, and terminal failure propagation. It
      returns `{ online, systemId, userId }` and uses an inline props shape.
   2. Keep aggregate and service `recoverOnline` workflows separate. Aggregate
      recovery also pushes old-session commands and reconciles pushed history;
      service recovery does neither.
   3. Do not extract the duplicated backup apply/repair loops yet. They close
      over mutable admission, queues, database callbacks, session state, and
      reconnect repair. A new mirror owner or runtime-state parameter bag is
      an architecture decision, not this cleanup slice.
   4. Re-measure after the identity rule moves. Stop if further reduction
      requires changing the main-thread, mediator SharedWorker, dedicated
      Worker, Web Lock, or OPFS ownership boundaries.

4. [`MaterializedAggregateFrontendRepo/catchup.ts:49-920`](../../../packages/system-worker/src/MaterializedAggregateFrontendRepo/catchup/catchup.ts#L49-L920)
   is one durable catch-up workflow: resolve projection inputs, page contiguous
   terminal history, enforce one execution claim, project inside one
   transaction, replay optimism, and commit finalized output plus both
   frontiers. The claim-before-projection crash boundary and the final atomic
   commit are essential.
   1. First add a short numbered phase overview above `catchup` with matching
      inline checkpoints. Do not move behavior in that pass.
   2. After characterization coverage and explicit helper approval, judge only
      the proposed `projectAggregateFrontendSourceDeltaTx` boundary at
      [`508-720`](../../../packages/system-worker/src/MaterializedAggregateFrontendRepo/catchup/catchup.ts#L508-L720).
      Its one call site is the existing catch-up transaction. It owns capture
      of selected source state, source-delta application, post-state capture,
      authored projection, and frontend-row writes, and returns the exact
      inserted, updated, or deleted maps or the retained projection failure.
   3. Keep execution-claim admission at
      [`284-390`](../../../packages/system-worker/src/MaterializedAggregateFrontendRepo/catchup/catchup.ts#L284-L390)
      and claim/result/frontier commit at
      [`821-915`](../../../packages/system-worker/src/MaterializedAggregateFrontendRepo/catchup/catchup.ts#L821-L915)
      visible in `catchup` for the first pass.
   4. Do not split rewind from replay, move projection across a Durable Object
      or transaction boundary, or pass a large projection-runtime state bag
      merely to reduce this file's line count.

5. [`MaterializedAggregateRepo/execute.ts:46-821`](../../../packages/system-worker/src/MaterializedAggregateRepo/execute/execute.ts#L46-L821)
   combines two materially different preparation workflows before one shared
   claim-preserving commit.
   1. After approval, proposed `prepareServiceAggregateExecution` owns
      [`205-295`](../../../packages/system-worker/src/MaterializedAggregateRepo/execute/execute.ts#L205-L295):
      pull the exact terminal service occurrence, validate its canonical bytes,
      and produce the changed-resource input.
   2. Proposed `prepareAuthoredAggregateExecution` owns
      [`297-513`](../../../packages/system-worker/src/MaterializedAggregateRepo/execute/execute.ts#L297-L513):
      resolve the aggregate contract, author mutations, capture exact service
      replicas, and subscribe at the first replica frontier.
   3. Keep claim admission and the shared transaction at
      [`516-819`](../../../packages/system-worker/src/MaterializedAggregateRepo/execute/execute.ts#L516-L819)
      in `execute` initially. It atomically applies the prepared kind, computes
      the aggregate delta, stores terminal bytes, and advances the materialized
      frontier.
   4. Add no named prepared-command union. Use inline return shapes and the
      existing `kind` discrimination.

6. The remaining ranked files do not yet justify a Plan 064 move.
   1. `primitiveMaps.ts` is a public conversion module with several direct
      callers. Splitting it mechanically would create broad import churn; it
      needs a separate Imports/Judge pass, not a line-count refactor.
   2. `makeModel.ts` is mostly public overload, inference, and model-construction
      contract. Keep it until a concrete accidental boundary is proven.
   3. `makeDrizzleRelations.ts`, `makeLiveQuery.ts`, and the UI routes have high
      density but smaller cohesive contracts. Re-rank them only after the
      selected slices above finish.

## Coverage map before implementation

1. Replay compatibility, direct adapter, rename, discard, replication rename,
   missing adapter, and invalid input behavior already live in
   [`replayAppliedMutationTx.node.spec.ts`](../../../packages/core/src/contracts/replayAppliedMutationTx.node.spec.ts).
   The module move should require no new behavior test.
2. `makeSystem` normalization and query resolution are covered by
   [`registry-normalization.node.spec.ts`](../../../packages/core/src/system/tests/registry-normalization.node.spec.ts),
   frontend binding and authorization by
   [`frontend-authorization.node.spec.ts`](../../../packages/core/src/system/tests/frontend-authorization.node.spec.ts),
   service ownership by
   [`service-model-ownership.node.spec.ts`](../../../packages/core/src/system/tests/service-model-ownership.node.spec.ts),
   guard identity by
   [`guard-model-identity.node.spec.ts`](../../../packages/core/src/system/tests/guard-model-identity.node.spec.ts),
   and public inference by
   [`makeSystem.typecheck.ts`](../../../packages/core/src/system/makeSystem.typecheck.ts).
   Add focused runtime cases for mutation-adapter schema identity, retired-model
   exhaustiveness, destination ownership, and operation matching before moving
   that validator.
3. Main-thread aggregate and service recovery are exercised by
   [`mainThreadFrontendFlow.playwright.spec.ts`](../../../examples/shopping/tests/browser/mainThreadFrontendFlow.playwright.spec.ts)
   and the adverse OPFS, supersession, authentication-failure, offline-hydration,
   and Worker-restart cases in
   [`mainThreadOpfsAdverse.playwright.spec.ts`](../../../examples/shopping/tests/browser/mainThreadOpfsAdverse.playwright.spec.ts).
   Before extracting the identity rule, add focused unit coverage for online
   success, transient failure with a valid locator, transient failure with a
   missing or invalid locator, and non-transient failure.
4. Aggregate-frontend optimism rewind/replay, projection failure, retained
   failure, and execution-in-doubt behavior are covered in
   [`MaterializedAggregateFrontendRepo/execute.node.spec.ts`](../../../packages/system-worker/src/MaterializedAggregateFrontendRepo/execute/execute.node.spec.ts).
   Add direct catch-up cases for invalid tips, incomplete pages, index gaps,
   retained completed claims, and the before/source/after projection delta
   before moving the proposed transaction sub-boundary.
5. Aggregate execution exact-result reuse, changed-byte conflict,
   execution-in-doubt, authored failure, service snapshot/subscription,
   replication failure, and service-derived deletion are covered in
   [`MaterializedAggregateRepo/execute.node.spec.ts`](../../../packages/system-worker/src/MaterializedAggregateRepo/execute/execute.node.spec.ts).

## Ordered implementation sequence

1. Complete: rechecked the worktree, candidate hashes, SCC baseline, and
   existing replay test baseline while preserving unrelated WIP.
2. Complete: after explicit approval of the Core public-module hard cut, moved
   `prepareReplayAppliedMutation`, added no re-export, and passed Core tests,
   typecheck, lint, and the source-only SCC rerun.
3. Ask for and implement the two `makeSystem` resolver modules. Run Core tests,
   typecheck, lint, and diff checks before continuing.
4. Establish focused authentication-locator tests, ask for the proposed
   `resolveFrontendAuthenticationIdentity` boundary, then update both browser
   bootstrap parents if approved.
5. Add only the numbered `catchup` phase guide. After its characterization
   tests exist, ask separately whether to extract
   `projectAggregateFrontendSourceDeltaTx`.
6. Ask separately for the two MaterializedAggregateRepo preparation functions.
   Keep their shared claim and transaction commit in `execute`.
7. Re-run SCC and a function-level branch scan after every accepted slice.
   Judge browser backup and reconnect ownership only after the identity move.
8. Stop for an explicit architecture decision if meaningful remaining
   reduction requires a mirror owner, connection owner, lifecycle service,
   runtime-state bag, public RPC, package export, or runtime-boundary move.
9. Synchronize every source-link citation made stale by accepted moves,
   especially `bootstrapBrowserSession.md`, `OpfsBackupCoordination.md`,
   `PushSequence.md`, `CommandChains.md`, and `finalizeAggregateCommand.md`.
   Preserve unrelated architecture WIP.
10. Commit each coherent slice directly to `main` under the repository's
    temporary policy only after its focused verification is green.

## Verification matrix

| Scope                                    | Required commands                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core replay and System                   | `nx run @zerospin/core:test --skipNxCache`, `nx run @zerospin/core:ts --skipNxCache`, `nx run @zerospin/core:lint --skipNxCache`                                    |
| Browser frontend programs                | `nx run @zerospin/frontend:test --skipNxCache`, `nx run @zerospin/frontend:ts --skipNxCache`, `nx run @zerospin/frontend:lint --skipNxCache`                        |
| Browser integration                      | `nx run shopping:test:playwright --skipNxCache -- tests/browser/mainThreadFrontendFlow.playwright.spec.ts tests/browser/mainThreadOpfsAdverse.playwright.spec.ts`   |
| Materialized Repos                       | `nx run system-worker:test --skipNxCache`, `nx run system-worker:ts --skipNxCache`, `nx run system-worker:lint --skipNxCache`                                       |
| Materialized Repo persistence boundaries | `nx run system-worker:test:workerd --skipNxCache`, `nx run system-worker:migrations:check --skipNxCache`, `nx run system-worker:static-cutover:check --skipNxCache` |
| Every slice                              | source-only SCC rerun, `git diff --check`, focused staged-diff inspection                                                                                           |

The inferred `system-worker:tsc:typecheck` target is not a substitute for the
explicit `system-worker:ts` gate while the pre-existing Nx project-reference
sync drift remains. Do not run `nx sync` as part of Plan 064 without separate
authorization.

## Acceptance criteria

1. Public APIs, encoded command shapes, exact target fields, error codes,
   failure causes, ordering, cleanup, interruption, retry, and persistence
   semantics remain unchanged except for a specifically approved hard-cut
   source-module path.
2. Complete: `replayAppliedMutationTx.ts` contains only replay application and
   encoding; the preparation boundary defines itself in its own module.
3. `makeSystem.ts` presents public typing followed by short runtime
   orchestration; service and aggregate definition policy remains visible in
   their own deep resolver modules.
4. Both browser bootstrap parents share only the exact authentication-locator
   rule. Aggregate/service recovery, push, backup, reconnect, and release stay
   target-specific until a separate ownership decision is approved.
5. MaterializedAggregateFrontendRepo retains one visible claim-to-commit
   workflow. Any projection helper owns the whole selected-state to frontend
   delta invariant inside the existing transaction.
6. MaterializedAggregateRepo prepares authored aggregate and service-derived
   input through distinct workflows while retaining one shared atomic terminal
   commit.
7. No generic aggregate/service abstraction, mirror owner, lifecycle service,
   new named type, helper bag, compatibility path, re-export, `*Effect` name,
   or `as const` assertion is introduced without explicit approval.
8. Success is judged by reduced decisions in each parent and preserved
   invariant coverage, not by an arbitrary line-count target. A long deep
   module is acceptable when its contract is cohesive.
