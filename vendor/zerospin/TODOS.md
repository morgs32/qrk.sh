# Todos

- Decide whether aggregate-version invalidation should also prevent pull-based catch-up. Explicit VAR execution can pull retained history while AC excludes invalidated destinations from pushes. VAR alarms no longer subscribe to AC.
- Audit the other fanout owners and subscribers for correct delivery, durable acknowledgement, and failure/resume logic; verify queue/subscriber `RpcTarget` getters, `.receive(rows)` delivery, and matching `IFanoutRepo<NAME, SUBSCRIBER>` / `IFanoutSubscriberRepo<QUEUE>` implementations.
- Consider giving every guard its own failure props on the command, and possibly its own result props, for visibility into each guard's outcome.
- Enable `admissionGuard` and `executionGuard` on contracts. Admission guards use runtime-provided Effect dependencies and freeze decisions in AC/SAC; execution guards evaluate version-local database state in VAR/VSR.
- Add explicit operator export, recovery, and reset tooling for a corrupt aggregate active-command journal that may contain the only durable copy of unpushed commands.
- Implement and verify the exact-lock database initialization crash protocol:
  1. Serialize first acquisition by exact identity inside the user-bound root and durably insert the immutable catalog locator before creating mutable replica state.
  2. Derive or allocate the physical database location before that insert without opening a second candidate database. Every retry that observes the locator must reopen exactly that location and must never allocate a replacement.
  3. Bootstrap the exact database idempotently in one transaction that writes its schema receipt, exact identity, canonical lock/spec bytes, and initial ready snapshot together.
  4. Resume an empty or wholly uninitialized located database after interruption. Preserve bytes and fail manual-clear-required for a non-empty database whose receipt or identity does not match; never infer, overwrite, or automatically delete it.
  5. Test restart after the locator commit but before database creation, after opening but before the bootstrap transaction commits, after bootstrap commits but before acquisition returns, and during concurrent same-identity acquisition. Every case must retain one locator, one physical database, and one initialized exact Repo.
- Add focused model-replica coverage:
  1. Add typechecks proving exact current and historical version-to-attribute inference for both authoritative models and replicas.
  2. Test distinct source/replica identity, source rows without `deletedAt`, replica rows with nullable `deletedAt`, immutable `sourceModel` and literal `serviceName`, historical deletion-state preservation, and replication from a live authoritative resource with `deletedAt: null` initialization.
  3. Test rejection of replicas in service registries, service-owned source objects directly in aggregate registries, one source object owned by multiple services, mismatched replica service/source bindings, service replication contracts, and ordinary aggregate mutations against replicas.
  4. Test exact nested replication resource identity, compatible-version normalization, and renamed service-model adapters that cannot be preempted by an unrelated same-name aggregate model.
  5. Test two related authoritative service models whose replica refs resolve by exact source-table alias across schema, relation, and selection construction, while unrelated and name-only table matches still fail.
  6. Test historical frontend selection so service frontend models remain authoritative under `Model.isReplica` and omit replica metadata from own keys/spread/JSON, while aggregate replicas retain direct `serviceName`, retain canonical direct `sourceModel` provenance while selecting the explicit replica model version, and include `deletedAt`.
  7. Preserve end-to-end deletion lifecycle coverage for physical service deletion, aggregate replica tombstone retention, same-ID recreation, and ledger-owned retry/resume behavior.
- Add deferred authored-definition verification:
  1. Verify caller-input snapshot isolation and canonical or opaque leaf identity for authored factories.
  2. Test replica direct getters, non-enumerability, assignment resistance, one-shot branding, canonical discrimination, spread and JSON omission, and the enumerable structural aggregate-source exception used by system-worker.
  3. Add readonly typechecks while preserving current literal, generic, and version inference.
- Add deferred frontend-controller and singular-guard verification without adding production test seams:
  1. Add typechecks for inline `Effect.fn` guard inference across payload, the owner's complete `db.query` surface, frontend versus aggregate `userId`, and exact Context requirements propagated through `makeZerospinApp()` and `makeSystem()`.
  2. Test canonical `{ contract, guard? }` bindings, command-name/key equality, defensive snapshotting, singular optional guards, and rejection of the removed array and parallel-registry forms.
  3. Test direct frontend controller selection, exact bound contract/model versions, aggregate and service version requirements, model graphs including self refs, and exact authored controller identity retention.
  4. Test local bound-version validation and guard rejection before command-id allocation, timestamping, session indexing, journaling, optimism, or push; include synchronous read-only Context services and `guard-must-be-synchronous` suspension rejection.
  5. Test authoritative frontend rejection after successful local guarding, pushed and direct aggregate rejection, independent service delivery without aggregate guard execution, exact preservation of already-local failures, and terminal empty deltas without active optimism or aggregate-forward outbox work.
  6. Test server-side adaptation from the bound frontend contract version to the aggregate contract version while retained command bytes and provenance remain unchanged.
  7. Run Core, React, frontend, SDK, system-worker, frontend-adapter, and Shopping Nx typechecks/tests; include system-worker and Shopping Workerd tests, focused browser session tests, and `git diff --check`.
- Enforce deterministic `contracts.makeVersion()` programs:
  1. Prohibit direct ambient nondeterminism such as `Date`, `Date.now()`, `Math.random()`, `crypto.randomUUID()`, and equivalent wall-clock or random global reads inside contract programs.
  2. Require every durable identity and business timestamp to be carried in the validated command payload or deterministically derived from it; framework-owned execution/application time remains injected by the executor.
  3. Investigate enforcement at the contract authoring/build boundary, such as static analysis or a focused lint rule around programs passed to `contracts.makeVersion()`; its current Effect service type alone cannot prevent direct JavaScript global access.
  4. Add negative fixtures proving prohibited programs fail the chosen enforcement gate and semantic re-execution fixtures proving the same retained payload reproduces durable identities.
- When documenting CommandChain reconciliation, use the term **“anti-entropy, not retry”** for forward and back catch-up of resolved `IChainedCommand`s. Preserve the distinction that convergence learns an already-resolved command rather than re-executing it. Design context: Codex thread `01a058c0-d43e-71b3-ab7e-bf2597c06c26`.
- Look for **“obvious old residue”** related to fanout and catch-up paths, including the unused `makeFanoutQueue` subscriber-key/boolean-result protocol, the catch-up test that does not exercise catch-up, and decoded-but-discarded catch-up results. Preserve live durable subscriber fanout and initial archive catch-up behavior. Design context: [Codex thread](https://chatgpt.com/s/cx_6a95c076d44481918d3249351e3c8a8f).
- Add some abstractions so that the Worker files in all the examples are simpler.
- When Node is upgraded from 24, check whether the `tslib` dependency can be removed.

## Annotated complexity hotspots after `makeSystem`

SCC 3.7.0 complexity measured from the current source files on 2026-09-01:

The transaction formerly inside `applyAggregateFrontendCommand.ts` now lives in
[`applyAggregateFrontendCommandTx.ts`](./packages/core/src/session/applyAggregateFrontendCommandTx.ts);
the measurements below predate that extraction.

| Complexity | File                                                                                                                  |
| ---------: | --------------------------------------------------------------------------------------------------------------------- |
|        160 | [`bootstrapAggregateFrontendSession.ts`](./packages/frontend/src/bootstrapAggregateFrontendSession.ts)                |
|        135 | [`UserVersionedAggregateRepo/catchup.ts`](./packages/system-worker/src/UserVersionedAggregateRepo/catchup/catchup.ts) |
|        125 | [`primitiveMaps.ts`](./packages/schema/src/primitiveMaps.ts)                                                          |
|        112 | [`makeModel.ts`](./packages/core/src/models/makeModel.ts)                                                             |
|        110 | [`VersionedAggregateRepo/execute.ts`](./packages/system-worker/src/VersionedAggregateRepo/execute/execute.ts)         |
|        106 | [`prepareReplayAppliedMutation.ts`](./packages/core/src/contracts/prepareReplayAppliedMutation.ts)                    |
|        103 | [`bootstrapServiceFrontendSession.ts`](./packages/frontend/src/bootstrapServiceFrontendSession.ts)                    |
|         93 | [`makeDrizzleRelations.ts`](./packages/core/src/drizzle/makeDrizzleRelations.ts)                                      |
|         92 | [`encodeAppliedMutation.ts`](./packages/core/src/contracts/encodeAppliedMutation.ts)                                  |
|         89 | [`makeVersion.ts`](./packages/core/src/contracts/makeVersion.ts)                                                      |
|         88 | [`applyAggregateFrontendCommand.ts`](./packages/core/src/session/applyAggregateFrontendCommand.ts)                    |
|         86 | [`makeLiveQuery.ts`](./packages/live-query/src/makeLiveQuery.ts)                                                      |
|         84 | [`SessionsLogsRoute.tsx`](./packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.tsx)             |
|         72 | [`ZerospinDevtools.tsx`](./packages/devtools/src/ZerospinDevtools.tsx)                                                |
