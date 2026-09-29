# Contract program database reads implementation plan

**Date:** 2026-09-28
**Status:** Implemented and verified
**Source:** [Approved spec 018](./018-spec-contract-program-database-reads.md)

## Outcome and constraints

1. Aggregate and service contract programs receive `db.query`, typed from their
   declared models, and continue returning mutation arrays. Guards use the same
   argument name, `db`, throughout contract, actor, and aggregate guard callbacks.
2. Recalculate against each invocation's database during validation, staging,
   authoritative execution, and pending replay. Use an existing active transaction
   when present. Preserve decoded synchronous queries, model visibility, execution
   ordering, failure handling, mutation application, and durable formats.
3. Hard-cut the argument rename without a `queryDb` alias. Do not add write methods,
   another database handle, model-read declarations, persistence tables, migrations,
   or asynchronous program work. The restricted type is not a runtime sandbox.
4. Keep automations operational by updating their contract-evaluation calls only.
   Machine actors, automation removal, and a production coupon feature remain
   outside this plan. Preserve unrelated work and relevant comments.

## 1. Extend the contract interface and forwarding

1. In `packages/core/src/contracts/make/makeContractVersion.ts`, add `db` to the
   internal `InferContractProgram`, authored `IContractProgramFn`, and
   `ContractProgramSchema` callback shapes. Thread declared models through the
   program type so concrete contracts retain exact query keys and decoded row
   inference; preserve the existing erased-registry typing where appropriate.
2. Update the authored-program binding in that file to forward `db` alongside
   payload and claims. Retain model mutation helpers and failure constructors.
   Omitted programs must still return an empty mutation array without special
   database creation or fallback behavior.
3. Cover every make/upgrade overload, including model patches and inherited models.
   Reuse the guard's existing query-only type expression. Preserve payload, claims,
   failure, mutation-result, and Effect-requirement inference; do not widen known
   models to arbitrary table names to satisfy an assignment.
4. Update `packages/core/src/contracts/types.ts` so `IContract.program` carries
   the model-aware database argument. Rename the guard argument in that interface
   and all corresponding definition schemas and overloads to `db`.
5. Require the invocation database in every overload and implementation of
   `packages/core/src/contracts/make/makeMutations.ts`, and forward it into
   `contract.program`. Do not make it optional or synthesize an empty database.
6. Rename `queryDb` in `runContractGuard.ts`, `validateAggregateCommand.ts`, and
   `ownerGuards.ts`, including callback invocations. Preserve each owner's existing
   model scope. The separate `guards/make/makeGuard.ts` interface already uses
   `db`; keep that interface consistent rather than introducing an adapter.

## 2. Wire each execution context

1. In `aggregateSession/stageCommand/stageCommand.ts` and
   `aggregateSession/validateSessionCommand.ts`, pass `state.db` to both the
   renamed guard call and `makeMutations`. Keep validation non-mutating and keep
   staging's existing application transaction.
2. In `aggregateSession/replayPendingCommandsTx.ts`, pass `replayTx` to both
   callbacks. Never substitute the outer session database: reads must use the
   current savepoint and see preceding replayed writes. Rename the guard call in
   `aggregateSession/checkGuards.ts` as well.
3. In `AggregateVersionRepo/executeCommands/executeCommands.ts`, pass the existing
   materializer `db` to `makeMutations`. Retain the execution permit, one-command
   preparation and commit sequence, replica handling, and version selection.
   Rename the database argument of the prepared guard closure and its transaction
   helper declaration without moving guard execution.
4. In `ServiceVersionRepo/executeCommands/executeCommands.ts`, pass its existing
   `db` to `makeMutations`. Keep sequential preparation and commit; the next
   command must read the previous command's applied state. Rename the guard
   argument in `executeCommandsTx.ts` while continuing to supply its active `tx`.
5. In `AggregateActorVersionRepo/optimistic/stageActorCommands.ts`, pass
   `scratch.db` to program evaluation and rename both contract and actor guard
   arguments. In `validateCommands/validateCommands.ts`, keep guard-only validation
   guard-only and rename its arguments while preserving `optimistic.db`.
6. In `ServiceActorVersionRepo/automations/makeServiceAutomations.ts`, supply
   `scratch.db` when evaluating output contracts and rename the adjacent guard
   argument. Keep preview mutations in their existing scratch transaction and
   leave automation invocation and output lifecycle unchanged.
7. Re-scan `makeMutations(`, direct contract `.program(` calls, and guard callback
   invocations across source and tests before finishing. Update direct unit callers
   in contract claims and shopping fixtures to supply their invocation database;
   use a real model database for any state-dependent behavior.
8. Do not promise a new transaction snapshot spanning program preparation and
   mutation application. Authoritative programs currently prepare before the
   mutation transaction; this plan preserves that placement. Queries inside a
   program do not observe mutations that it has merely constructed or returned.

## 3. Complete the rename in consumers and documentation

1. Update affected callbacks and helpers in purchase, fulfillment, browser, and
   system-worker fixtures, including callbacks that forward the database to
   domain helpers. Keep domain behavior and selected models unchanged.
2. Update affected shopping, tic-tac-toe, and domain-modules examples and their
   tests. Rename helper parameters when they carry the same guard database so
   the old name is not preserved as a second concept.
3. Update current guidance in `wiki/glossary.md`,
   `wiki/architecture/AuthoredSystem.md`, `packages/core/src/drizzle/README.md`,
   and affected local patterns. Explain program reads, returned mutations,
   client/server state differences, replay recalculation, and the query-only type.
   Preserve the documented preparation/guard/application ordering.
4. Search `packages`, `examples`, and current wiki documents for remaining
   `queryDb` references. Inspect hits rather than blindly renaming historical
   text; preserve archived documents, including the prior decoded-query spec.
   Do not add compatibility tests, aliases, or broad unrelated documentation edits.

## 4. Verify behavior through existing seams

1. Extend `packages/browser/src/makeMockSession/sessionExecution.node.spec.ts`
   with a small declared model and a state-dependent contract. Establish that
   guards and programs can query it, validation leaves state unchanged, staging
   applies the computed result, and a later staged command sees preceding
   optimistic changes.
2. In the same session suite, reconcile or restore a different base through the
   existing fixture workflow and replay pending commands. Assert recalculated
   values rather than reused client allocations, including visibility of earlier
   commands in the replay transaction. Verify constructing a mutation does not
   itself change subsequent queries inside a program.
3. Add program-read cases through the aggregate and service `executeCommands`
   entry points, using existing real database factories and local system fixtures.
   The service `unsupportedVersion.node.spec.ts` supplies prior art for invoking
   the complete preparation path. Put new cases beside the relevant execution
   suites; do not rely solely on `executeCommandsTx` tests with fabricated mutations.
4. Execute consecutive state-dependent commands and assert resource rows, applied
   mutation history, and terminal results. Include client/server inputs with
   different starting state to establish authoritative recalculation. Reject a
   calculated command through an existing failure path and verify no partial
   resource writes, retaining existing rollback semantics.
5. Extend the existing actor staging and service automation preview tests with a
   query-dependent output contract where needed to prove scratch databases are
   supplied. These tests must distinguish scratch state from authoritative rows;
   they should not re-test unrelated automation lifecycle behavior.
6. Extend contract authoring assertions near `contracts/claims.node.spec.ts` to
   cover inferred query keys and decoded results, absent write methods and
   internal tables, and inherited/patched model declarations. Keep assertions
   inside existing typechecked test/consumer files. Check both guards and programs;
   preserve inference for the other callback arguments.
7. Reuse existing fixtures, failure constructors, database adapters, and scoped
   test suites. No new test framework, broad coupon subsystem, or redundant
   mutation application implementation is needed.

## 5. Run scoped verification and finish

1. Recheck worktree status and resolved targets when implementing. The inspected
   Nx graph uses `ts`, not `typecheck`, for the relevant authored package checks.
   Keep configured dependencies and caches enabled; schedule a single graph per
   verification phase to avoid overlapping declaration builds.
2. Build affected package declarations with
   `pnpm nx run-many -t lib --projects=@zerospin/core,@zerospin/browser,system-worker,@zerospin/purchase,@zerospin/fulfillment`.
   This follows the configured fixture configuration dependency of system-worker.
3. Run
   `pnpm nx run-many -t ts lint --projects=@zerospin/core,@zerospin/browser,system-worker,@zerospin/purchase,@zerospin/fulfillment,shopping,tic-tac-toe,domain-modules-fixture`.
   For changed fixtures, use their actual `ts:node` and `ts:workerd` targets and
   `lint`; do not request a nonexistent fixture `ts` target. Add a consumer only
   when the final change or a concrete type failure shows it is affected.
4. Run
   `CI=true pnpm nx run-many -t test --projects=@zerospin/core,@zerospin/browser,system-worker,@zerospin/purchase,@zerospin/fulfillment,shopping,tic-tac-toe`.
   Start with focused file filters if useful after checking target forwarding;
   the completion gate is the affected suites. `CI=true` keeps shopping's Vitest
   command from entering watch mode.
5. Run `CI=true pnpm nx run system-worker:test:workerd` for the affected durable
   execution and automation consumers. Use the existing adapter setup; do not
   replace durable execution coverage with transaction-only tests.
6. Format/check only edited files with the repository's formatter, inspect
   `git diff --check`, and review the final diff for omitted forwarding, widened
   query types, compatibility remnants, schema changes, and unrelated edits.
   Report any unrelated verification blocker explicitly rather than expanding
   this task to repair it.
7. Update this plan with implementation and verification outcomes. Archive it
   only after implementation and required verification are complete. No tests
   were run while preparing this plan; implementation verification is recorded below.

## Completion criteria

1. All program evaluation paths supply the correct invocation database; programs
   and all affected guards expose only the approved `db` query interface.
2. State-dependent staging, validation, replay, server execution, and scratch
   previews pass behavioral coverage, and author-facing type restrictions compile.
3. Existing mutation persistence, rollback, terminal command behavior, and fixed
   schemas remain intact. Current consumers and documentation use the new name.
4. Affected verification passes or any remaining blocker is reported as incomplete;
   no machine-actor or automation-removal work has entered this change.

## Implementation and verification outcome

1. Implemented query-only `db` in aggregate and service programs, renamed guard
   arguments and forwarding throughout callers, and updated current examples,
   fixtures, patterns, and documentation. Programs retain mutation-array results;
   no fixed schema or durable representation changed.
2. Added state-dependent client validation, staging, and pending replay coverage,
   aggregate and service execution tests, scratch-state program observations, and
   declaration inference assertions for original, inherited, and patched models.
   The normalized program callback uses the same bivariant declaration-composition
   convention as existing guards; concrete program calls retain their model-aware
   argument type.
3. Declaration builds passed for core, browser, system-worker, purchase, and
   fulfillment with configured dependencies. All eight planned `ts` and `lint`
   project checks passed. Fixture `ts:node`, `ts:workerd`, and `lint` passed.
4. All 230 tests passed: core 72, browser 45, system-worker Node 63, purchase 9,
   fulfillment 6, shopping 9, tic-tac-toe 2, and system-worker workerd 24.
5. Scoped formatting and `git diff --check` passed. Unrelated existing lint
   warnings remain. Nx Cloud reported remote-cache authorization failures (401);
   local task results passed. A worker lint run that overlapped dependency cleanup
   was rerun after builds and passed.
6. Preserved automation behavior and the separate machine-actor handoff. No
   implementation work remains for this plan. Archived after verification.
