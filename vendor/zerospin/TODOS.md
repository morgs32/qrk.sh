# Todos

- Verify that transport preserves decoded application values across every supported RPC boundary, including signatures and authentication claims. Application-facing APIs should use decoded types; test round trips for supported non-JSON values and explicitly identify unsupported values. Check persistence and hashing separately from transport.
- Decide whether aggregate-version invalidation should also prevent pull-based catch-up. Explicit VAR execution can pull retained history while AC excludes invalidated destinations from pushes. VAR alarms no longer subscribe to AC.
- Audit the other fanout owners and subscribers for correct delivery, durable acknowledgement, and failure/resume logic; verify queue/subscriber `RpcTarget` getters, `.receive(rows)` delivery, and matching `IFanoutRepo<NAME, SUBSCRIBER>` / `IFanoutSubscriberRepo<QUEUE>` implementations.
- Distinguish non-retryable authentication and authorization admission failures from retryable transport failures. Surface explicit denials to the session and stop automatic retries under unchanged credentials/access until reauthentication, an access change, or explicit recovery; preserve the pending command journal. Business admission-guard refusals are durable command outcomes and settle through normal reconciliation.
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
  6. Test historical session selection so service session models remain authoritative under `Model.isReplica` and omit replica metadata from own keys/spread/JSON, while aggregate replicas retain direct `serviceName`, retain canonical direct `sourceModel` provenance while selecting the explicit replica model version, and include `deletedAt`.
  7. Preserve end-to-end deletion lifecycle coverage for physical service deletion, aggregate replica tombstone retention, same-ID recreation, and ledger-owned retry/resume behavior.
- Add deferred authored-definition verification:
  1. Verify caller-input snapshot isolation and canonical or opaque leaf identity for authored factories.
  2. Test replica direct getters, non-enumerability, assignment resistance, one-shot branding, canonical discrimination, spread and JSON omission, and the enumerable structural aggregate-source exception used by system-worker.
  3. Add readonly typechecks while preserving current literal, generic, and version inference.
- Add deferred authored-session and singular-guard verification without adding production test seams:
  1. Add typechecks for inline `Effect.fn` guard inference across payload, the owner's complete `db.query` surface, definition versus aggregate `userId`, and exact Context requirements propagated through `makeZerospinApp()` and `makeSystem()`.
  2. Test canonical `{ contract, guard? }` bindings, command-name/key equality, defensive snapshotting, singular optional guards, and rejection of the removed array and parallel-registry forms.
  3. Test direct authored-session selection, exact bound contract/model versions, aggregate and service version requirements, model graphs including self refs, and exact authored definition identity retention.
  4. Test local bound-version validation and guard rejection before command-id allocation, timestamping, session indexing, journaling, optimism, or push; include synchronous read-only Context services and `guard-must-be-synchronous` suspension rejection.
  5. Test authoritative session rejection after successful local guarding, pushed and direct aggregate rejection, independent service delivery without aggregate guard execution, exact preservation of already-local failures, and terminal empty deltas without active optimism or aggregate-forward outbox work.
  6. Test server-side adaptation from the bound session contract version to the aggregate contract version while retained command bytes and provenance remain unchanged.
  7. Run Core, React, session, SDK, system-worker, session-adapter, and Shopping Nx typechecks/tests; include system-worker and Shopping Workerd tests, focused browser session tests, and `git diff --check`.
- Enforce deterministic `makeContractVersion()` programs:
  1. Prohibit direct ambient nondeterminism such as `Date`, `Date.now()`, `Math.random()`, `crypto.randomUUID()`, and equivalent wall-clock or random global reads inside contract programs.
  2. Require every durable identity and business timestamp to be carried in the validated command payload or deterministically derived from it; framework-owned execution/application time remains injected by the executor.
  3. Investigate enforcement at the contract authoring/build boundary, such as static analysis or a focused lint rule around programs passed to `makeContractVersion()`; its current Effect service type alone cannot prevent direct JavaScript global access.
  4. Add negative fixtures proving prohibited programs fail the chosen enforcement gate and semantic re-execution fixtures proving the same retained payload reproduces durable identities.
- When documenting CommandChain reconciliation, use the term **“anti-entropy, not retry”** for forward and back catch-up of resolved `IChainedCommand`s. Preserve the distinction that convergence learns an already-resolved command rather than re-executing it. Design context: Codex thread `01a058c0-d43e-71b3-ab7e-bf2597c06c26`.
- Add some abstractions so that the Worker files in all the examples are simpler.
- When Node is upgraded from 24, check whether the `tslib` dependency can be removed.

## Spec 086 — deferred tests and verification

Per the user's 2026-09-20 instruction, leave all further test work in TODO.
Retain completed test changes and the observed results in
[Spec 086](./wiki/dev/archived/086-spec-standalone-sessions-and-test-organization.md#implementation-record).

1. Complete any remaining standalone journal and Chromium acceptance coverage
   listed in the spec, including failure, reset, ownership, and recovery races.
2. Resume the full test-review backlog only when requested: current backup
   lifecycle; SystemApi/GatewayApi/AggregateSessionApi; schema families; Core
   mutation/model contracts; React/mocks/DevTools/Shopping; runtime suffixes;
   session/RPC/delivery scheduling; Studio RepoExplorer and remaining hotspots.
   Preserve the recorded completed dispositions rather than repeating them.
3. Recheck test collection, invariant coverage, relevant Nx tests/typechecks,
   lint, and non-rewriting formatting after subsequent changes.
4. Finish QRK verification once its unrelated blockers are resolved: Library
   typechecks/declaration build (Effect rc.111/rc.112 and generator errors),
   Studio typecheck/lint/build and authenticated user/page isolation (currently
   blocked by removed live-session API imports, including `makeZerospinApp`).
   Preserve Library's no-tests policy; use manual checks there.
5. Verify Studio's production assets after its full build succeeds. Library
   persistence/reset and development/production-preview worker assets, and
   Studio development worker assets, already passed manual checks.

## Spec and plan closeout — deferred work

The 2026-09-20 closeout archives superseded or implemented specs and plans
without claiming all checks passed. Historical results stay in those records;
old failures are not confirmed current failures until rechecked. Product tests
and repairs remain deferred. Later replacement designs supersede their earlier
requirements; unrelated changes alone do not establish completion.

1. Correct obsolete aggregate-base promotion descriptions in
   [aggregate admission](./wiki/architecture/server/admitCommands.md),
   [aggregate execution](./wiki/architecture/server/executeAggregateCommand.md),
   and [AggregateChain comments](./packages/system-worker/src/AggregateChain/AggregateChain.ts).
   [Plan 075](./wiki/dev/archived/075-plan-configured-aggregate-base-versions.md)
   is superseded by explicit aggregate-version selection and deployed-version
   membership. Do not restore desired/applied base promotion or its tests.
2. Check and repair the twelve existing broken documentation links recorded by
   [Plan 085](./wiki/dev/archived/085-plan-single-socket-aggregate-session-admission.md#implementation-and-verification--2026-09-20).
   Recount against current files rather than assuming the historical list is
   unchanged. Repair the Graft installation's missing
   `@nanonets/graft/dist/claude/init.js` module, then refresh its graph. The
   startup failure was reproduced during this closeout review.
3. Within the existing [Spec 086 review backlog](#spec-086--deferred-tests-and-verification),
   reconcile [Plan 072's browser acceptance matrix](./wiki/dev/archived/072-plan-shared-indexeddb-backups-and-session-handoff.md#acceptance-matrix)
   against current runtime/session ownership: takeover and visibility races,
   dispatch/commit/reply uncertainty, backup restoration and journal identity,
   independent keys, and offline/emitted-asset recovery. Preserve recorded
   passing scenarios; verify only remaining applicable gaps rather than
   recreating removed Provider APIs or duplicating the standalone backlog.
4. Use the same Spec 086 verification workstream for applicable broader checks
   carried from Plans 068, 072, 075, and 085 and Specs 074, 077, 079, and 080.
   Recheck Shopping lifecycle-fixture aggregate/service generic assignability
   reported by Plan 085, current Shopping build/browser/preview acceptance,
   and relevant Core/session/React/DevTools/CLI/system-worker checks. Resolve
   current Nx targets when that work resumes. Old OPFS, makeMountedSession,
   configured-base, and app-bound API failures are historical, not instructions
   to restore superseded code. Plan 085's four passing Shopping Workerd tests
   supersede Spec 079's earlier Workerd blocker. Ordered seed submission is
   explicitly superseded and has no follow-up requirement.

## Annotated complexity hotspots after `makeSystem`

SCC 3.7.0 complexity measured from the current source files on 2026-09-01:

The transaction formerly inside `applyAggregateActorCommand.ts` now lives in
[`applyAggregateActorCommandTx.ts`](./packages/core/src/aggregateSession/applyAggregateActorCommand/applyAggregateActorCommandTx/applyAggregateActorCommandTx.ts);
the measurements below predate that extraction.

| Complexity | File                                                                                                                |
| ---------: | ------------------------------------------------------------------------------------------------------------------- |
|        160 | [`bootstrapAggregateSession.ts`](./packages/browser/src/bootstrapAggregateSession.ts)                               |
|        135 | [`AggregateActorVersionRepo/catchup.ts`](./packages/system-worker/src/AggregateActorVersionRepo/catchup/catchup.ts) |
|        125 | [`primitiveMaps.ts`](./packages/schema/src/primitiveMaps.ts)                                                        |
|         53 | [`defineModel.ts`](./packages/core/src/models/defineModel.ts)                                                       |
|        589 | [`makeModelVersion.ts`](./packages/core/src/models/make/makeModelVersion.ts)                                             |
|        110 | [`AggregateVersionRepo/execute.ts`](./packages/system-worker/src/AggregateVersionRepo/execute/execute.ts)           |
|        106 | [`prepareReplayAppliedMutation.ts`](./packages/core/src/contracts/prepareReplayAppliedMutation.ts)                  |
|        103 | [`bootstrapServiceSession.ts`](./packages/browser/src/bootstrapServiceSession.ts)                                   |
|         93 | [`makeDrizzleRelationsFromTables.ts`](./packages/core/src/drizzle/make/makeDbConfig/makeDrizzleRelationsFromTables/makeDrizzleRelationsFromTables.ts)                |
|         92 | [`encodeAppliedMutation.ts`](./packages/core/src/contracts/encodeAppliedMutation.ts)                                |
|        629 | [`makeContractVersion.ts`](./packages/core/src/contracts/make/makeContractVersion.ts)                                    |
|         88 | [`applyAggregateActorCommand.ts`](./packages/core/src/aggregateSession/applyAggregateActorCommand/applyAggregateActorCommand.ts)                        |
|         86 | [`makeLiveQuery.ts`](./packages/live-query/src/makeLiveQuery.ts)                                                    |
|         84 | [`SessionsLogsRoute.tsx`](./packages/devtools/src/sessions/sessions/sessionId/logs/SessionsLogsRoute.tsx)           |
|         72 | [`ZerospinDevtools.tsx`](./packages/devtools/src/ZerospinDevtools.tsx)                                              |

## Versioned actors — deferred verification

Implementation verification is deferred at the maintainer's request because of concurrent WIP. Do not treat this cutover as verified.

- Run scoped Nx typechecks and relevant unit/workerd tests for core, SDK, browser, React, system-worker, CLI consumers, and Shopping after the WIP settles.
- Finish updating assertion expectations and type-error fixture locations for the cutover; do not run them until verification resumes.
- Cover two actors with distinct Clerk identities/accounts and independent authentication shapes, actor-owned capability adapters, explicit refusals, omitted-model visibility, exact model registration, dependency requirements, and session compatibility.
- Cover preflight, synchronous optimism, admission, authoritative execution, pending replay, internal provisioning, and mixed-actor batches without identity leakage.
- Cover exact historical actor resolution, unsupported/tampered provenance, identical selection paths in different named views, and durable refusal reconciliation.
- Inspect changed command/session/replica schemas and perform the documented empty-storage cutover before running against existing state. No storage has been reset by this implementation.

### Actor naming and service actor cutover — 2026-09-22

The subsequent actor naming/service ownership cutover has scoped verification:
core and worker actor tests, SDK exports, actor projection/snapshot isolation,
and service actor admission/replay tests. This does not close the broader actor
or flat-command verification backlogs above and below.

- Reconcile remaining broad-suite failures in owner-layer guards, aggregate
  session renewal, worker authentication/storage/guard fixtures, and the session
  program fixture before claiming repository-wide validation.
- Update the CLI seed consumer to the contract-binding API; it currently blocks
  the larger consumer build graph.
- Existing storage still needs the documented empty-storage cutover; this task
  did not reset it.

## Flat command rows — deferred tests and verification

Deferred at the maintainer's request on 2026-09-21. Implementation and test
changes are retained; the cutover is not fully verified. The combined run was
blocked by concurrent versioned-selection changes, and the isolated validation
run was stopped. Resume against the integrated implementation after that work
settles; do not treat earlier passing subsets as final validation.

- Finish and run the eleven-schema audit: all physical tables named `commands`, direct command fields, `id` uniqueness, domain positions, date columns, encoded payloads, and no whole-command `command`/`output`, admission `canonicalBytes`, or redundant queue-position columns. Keep selected storage restricted to selected fields and private delivery metadata.
- Run admission coverage for identical receipts, conflicting payload/authentication/versions, repeated IDs within a batch, retained admission refusals, and rollback without position gaps. Preserve declared-input comparison reconstructed from columns.
- Exercise aggregate/service execution through publication and selection: success, failure, duplicates, conflicts, gaps, hashes, cold activation, resumed delivery, immutable comparison excluding delivery metadata, and atomic resource/command/projection progress. Verify explicit outbound construction and private failure filtering.
- Run outbox bounds and exact-page acknowledgement tests using domain positions, including concurrent appends and failed delivery. Verify alarm recovery uses the renamed queue identities.
- Exercise browser local success/failure, admission before completion, rollback/replay, renewed sessions, snapshot reconciliation, incompatible-backup reset/restoration, and DevTools queries/display. Assert one authoritative stored `pushIndex`, preserved local provenance, distinct domain positions, and optimism retained until selected completion.
- Run Nx `ts`, `lint`, and `test` for core, system-worker, browser, and DevTools with dependencies; run system-worker Workerd tests and affected consumer typechecks. Finish changed-file formatting and final diff review, preserving unrelated WIP.

Changed server schemas require empty storage at rollout; implementation has not
deleted databases or added conversion migrations. `projectionState` retains
source cursors and the previous selected resource graph, with no command copy or
replacement fingerprint. Its role is diagrammed in
[aggregate admission](./wiki/architecture/server/admitCommands.md#projection-state-and-command-rows).

## Plans 005/007 — deferred acceptance verification

Archived on 2026-09-23 at the maintainer's request after reviewing the current
implementation. Archival does not claim acceptance checks passed. Historical
failures in the plans must be rechecked against current source before treating
them as current blockers. No application storage was reset.

1. [Plan 005](./wiki/dev/archived/005-plan-scoped-command-validation-and-yieldable-errors.md): finish the applicable declaration inference/scope proofs, runtime/JSON boundary audit, snapshot isolation and rollback cases, sequential pending-prefix admission, duplicate/interruption recovery, and ordered authoritative guard/savepoint acceptance checks. Exhaustive aggregate failure implementation coverage remains deferred; Plan 007 supersedes failure adapters.
2. [Plan 007](./wiki/dev/archived/007-plan-failure-recognition.md): complete integrated recognition, serialization, delivery/replay, and persisted recovery checks. Recheck the recorded definition JSON-error assertions, Shopping fixture IDs, SDK export inventory, and worker execution-guard fixture failures without assuming the historical failures persist.
3. Run the applicable scoped Nx typecheck/test/lint/build checks against the integrated checkout, resolve current targets, and record actual results. Preserve unrelated WIP and the existing empty-storage requirements. Repair any implementation defects those checks reveal without restoring superseded APIs or compatibility paths.

## Specs 001/002/004 — deferred verification

Archived on 2026-09-23 after reviewing current implementation and superseding
plans. Preserve historical test records; recheck old failures before treating
them as current. Do not restore superseded guard, error, or selection APIs.

1. [Spec 001](./wiki/dev/archived/001-spec-command-guards-and-execution-services.md): verify applicable version-owned replication, snapshot-ahead enrollment, tombstones, empty deltas, duplicate/gap handling, publication retry, interleaved materialization, and snapshot/reconnect recovery. Use Plan 005's current guard/admission design for its overlapping acceptance checks.
2. [Spec 002](./wiki/dev/archived/002-spec-typed-business-failures-and-rpc-envelopes.md): carry remaining integrated error/RPC/telemetry verification through the Plan 005/007 backlog above; retain provenance and telemetry-failure isolation checks. Plain-object runtime errors and version-adapter acceptance cases are superseded.
3. [Spec 004](./wiki/dev/archived/004-spec-drizzle-actor-selections.md): complete any outstanding browser/DO SQLite selection and handshake-isolation acceptance checks; recheck the historical React mock-session lifecycle failure before claiming broader validation. Respect the current prohibition on Shopping browser verification.
