# VAR owns service replication and ordered aggregate output

## Summary

Make VAR the single owner that merges aggregate execution with service replication:

```text
AC ── aggregate commands ──┐
                          VAR → VAC → selected replica → selected chain → client
VSC ── service results ────┘
```

AC retains aggregate commands only. VAR fetches external resources, runs execution guards, and publishes one immutable output sequence. Every consumed service occurrence participates in that sequence.

The current checkout calls the selected owners `AggregateActorVersionRepo` and `AggregateActorVersionChain`; these are the roles previously discussed as SVAR/SVAC.

## Execution and authoring

1. Remove asynchronous admission guards from aggregate and service contracts, including their persisted admission-failure path. Preserve API authentication, authorization, payload validation, and duplicate-command checks.
2. Define optional synchronous `guard` callbacks on versioned aggregate/service contract bindings. Guards receive the decoded payload, authentication, proposed mutations, and captured replica resources; local database access comes through the owner’s execution services.
3. Keep contract programs versioned and synchronous. Move database-dependent checks out of programs into binding guards. Preserve payload up/down adaptation and each owner’s version-specific program; do not capture mutation intents in AC.
4. For aggregate execution, hold VAR’s existing execution permit across program evaluation, resource preparation, and commit. Fetch replicas from the aggregate version’s pinned VSR, retaining the snapshot’s executed service position—not the resource’s last modification position.
5. Run the state guard before applying mutations, inside the same command transaction. Business rejection commits the normal failed outcome without applying mutations. Infrastructure failure preserves earlier committed commands and leaves unfinished work retryable.
6. Apply the same program/guard separation to VSR. Remove frontend admission-guard preflight APIs and their callers; retain synchronous optimistic staging and authoritative rejection reconciliation.

## Ordered materialization and delivery

1. Introduce `materializationIndex` for VAR’s combined output. Allocate it atomically with resource changes, source progress, and the outbox row.
2. Retain AC’s `aggregateIndex` separately as its command position and consumed watermark. Service applications do not advance it.
3. Distinguish aggregate-result and service-application entries. Preserve original command identity and provenance; service entries retain service name, version, and position.
4. Emit one entry for every newly consumed service occurrence, including failed, unrelated, and already-covered updates. Its effective delta describes only changes actually applied to VAR’s enrolled replicas; otherwise it is empty.
5. Keep per-service cursors and per-resource positions on VAR. Reject source gaps, skip committed duplicates, preserve newer copies and tombstones, and finish initial-resource catch-up before committing enrollment.
6. Use the existing outbox and `drainAfter(...)` for both output kinds. VAC retains and fans out entries by contiguous `materializationIndex`, accepting identical retries and rejecting conflicting ones.
7. Preserve aggregate-only disposition hashing for aggregate execution. Service applications must not change aggregate command completion or impersonate an originating frontend command.
8. Add exact aggregate-result lookup independent of VAC pagination. Update `execute` and `flush` to locate the requested aggregate result and its materialization position instead of treating `aggregateIndex` as the output queue position.

## Projection, snapshots, and recovery

1. Remove the selected replica’s direct VSC subscriptions, service cursors, remote late-enrollment preparation, and the VSC fanout dedicated to those subscribers.
2. Apply both kinds of VAC entries through one local projection transaction, checkpointed by `materializationIndex`. Remove the semaphore whose purpose was protecting asynchronous projection preparation.
3. Preserve the single immutable selected-command stream, its `selectionIndex`, graph deltas, private aggregate completion behavior, and browser optimistic reconciliation. Service-derived selected commands have no aggregate completion owner.
4. Route service freshness checks through VAR. A snapshot request catches VAR up through bounded source positions, captures its materialization checkpoint, ensures publication through it, and catches the selected replica up to that checkpoint.
5. Keep resource graphs and their checkpoints transactionally consistent. Recovery uses retained source cursors, immutable VAC entries, exact outbox acknowledgements, and the existing alarm registry.
6. Preserve version-specific service pins on aggregate definitions. Do not introduce shared AC pins, dynamic pin switching, mutable service suffixes, projection revisions, or reset snapshots.

## Validation and delivery

1. Test a replica snapshot that already includes a queued service update: enrollment precedes the output for that update, and the resource is not regressed.
2. Test a service update arriving during resource fetching: it cannot overtake enrollment; publication follows VAR’s committed order.
3. Test every-occurrence output, including failures, empty deltas, duplicates, gaps, tombstones, and retained newer copies.
4. Test crash recovery after local commit but before publication or acknowledgement; retries must neither lose nor duplicate materialization entries.
5. Test execution-guard rejection and rollback, database-independent programs, and version-specific programs that produce different local models.
6. Test aggregate result recovery and bounded flush with interleaved service entries, then snapshot/reconnect and optimistic reconciliation through the single selected stream.
7. Update architecture diagrams, affected module documentation, authoring examples, and the matching spec/implementation plan under `wiki/dev/`.
8. Use a hard schema cutover with empty affected storage. Preserve unrelated WIP. Run focused Nx checks first; report existing unrelated build failures separately.

The completed outbox API update is reused. No generic mutation-intent migration system or model-conversion framework is added by this plan.

## Original implementation status — 2026-09-22

Implemented the combined VAR/VAC materialization stream, exact aggregate-result recovery and bounded flush, VAR-owned service replication, VAC-only selected projection, and bounded snapshot catch-up. Replaced admission guards with version-owned synchronous binding guards and removed frontend preflight. Updated authoring fixtures, architecture workflows, and the VAR module README. Changed fixed schemas require empty storage; this change does not erase storage automatically.

Validation:

- Full system-worker Node suite: 223 passed, 35 failed. An isolated starting-commit checkout had 220 passed, 38 failed; comparison found no new failing tests.
- Focused cutover suite: 22 passed across five files. Added coverage for fetch/delivery ordering, snapshot frontiers, every-occurrence output, rollback and publication retry, immutable duplicates, service completion ownership, version-owned guard rejection, exact aggregate recovery, and flush using materialization position.
- Focused core authoring tests: 28 passed, two existing owner-layer failures. Those failures also reproduce in the starting-commit checkout.
- Scoped lint and formatting completed; no new core type-error file/code pairs versus baseline. Native system-worker test typecheck passes. Its production typecheck remains blocked by the existing aggregate-registry type mismatch in getSystemSpec.
- Nx system-worker:ts is blocked by five existing core:lib type errors in fixtures/system.ts, frontendController/initializeExecution.ts, and system/makeSystem.ts.
- Workerd validation remains blocked before test execution by Vitest internal-state initialization in workerd-utils/acceptSystemSpec.ts.

Remaining verification: rerun Nx and Workerd checks after those baseline blockers are repaired. Reconnect and browser reconciliation Workerd coverage has not been verified by this change.

## Verification follow-up — 2026-09-22

Focused verification is complete. Full-suite verification remains incomplete; do not interpret the green focused checks as a clean repository-wide result.

### Repairs and added coverage

- Preserved concrete actor registry types, prevented enclosing registries from widening omitted actor layer requirements, and corrected the frontend execution implementation overload. Updated fixture authorization IDs and stale authoring type assertions. No compatibility paths or casts were added.
- Moved the config example's contract guard onto its aggregate binding.
- Updated Workerd fixtures to include actor identity, distinguish service entries from aggregate results, and retain the materialization position in exact result recovery assertions.
- Added `selectedReconciliation.workerd.spec.ts`: four real Workerd-to-frontend scenarios covering successful/rejected optimism through live delivery/cold reconnect. Each interleaves a service update, checks that it does not complete the pending aggregate command, exercises duplicate delivery, and reinstalls the terminal snapshot without resurrecting optimism. Uses the existing delivery adapter to preserve private failure views.
- Supplied the frontend capability layer explicitly in the existing manual session tests, matching real session initialization.

### Verified results

- `pnpm nx run system-worker:ts` and `pnpm nx run @zerospin/core:ts` pass. No `getSystemSpec` workaround was needed after correcting the registry typing.
- `pnpm nx run system-worker:test -- src/executionGuards.node.spec.ts src/VersionedAggregateRepo/materialization.node.spec.ts src/VersionedAggregateRepo/execute/execute.node.spec.ts src/VersionedServiceRepo/getReplicatedResources/getReplicatedResources.node.spec.ts src/ActorVersionedAggregateRepo/getSnapshot/getSnapshot.node.spec.ts`: **18 passed** before the concurrent owner renames. Current directory names are `AggregateVersionRepo`, `ServiceVersionRepo`, and `AggregateActorVersionRepo`.
- `pnpm nx run @zerospin/core:test -- src/guards/ownerLayers.node.spec.ts src/aggregate/makeAggregateVersion.node.spec.ts src/contracts/makeContractVersion.node.spec.ts src/session/applyAggregateSelectedCommand.node.spec.ts src/session/pendingCommandReplay.node.spec.ts`: **31 passed, 2 failed**. The two owner-layer failures reproduce in the isolated starting commit: sibling-local override and partial-acquisition failure assertions.
- Final focused Workerd run: **16 passed across six files** in one Nx invocation. The new reconciliation file passes all four cases in both the shared checkout and the isolated repair snapshot.

Reproduce the current focused Workerd selection with:

```sh
pnpm nx run system-worker:test:workerd -- \
  src/selectedReconciliation.workerd.spec.ts \
  src/preparedExecution.workerd.spec.ts \
  src/pinnedServiceReplicas.workerd.spec.ts \
  src/AggregateActorVersionRepo/AggregateActorVersionRepo.workerd.spec.ts \
  src/serviceExecution.workerd.spec.ts \
  src/AggregateVersionRepo/onDOActivation/onDOActivation.workerd.spec.ts
```

### Baseline and remaining limitations

The preserved pre-repair commit is `3924c76fb9855f3f0474277aec4e6dc6050e76fb`. Concurrent work renamed owners/actor APIs and changed service authoring while this verification ran. To separate those changes, an isolated copy of that commit was compared with a copy containing only this task's repairs. Native package-local Vitest commands were used for those copies; the shared checkout used Nx.

- Isolated full system-worker Node baseline and repaired snapshot: **226 passed, 35 failed** in each, with identical reported failing test identities. Command in each snapshot's `packages/system-worker`: `node node_modules/vitest/vitest.mjs run --config vitest.node.config.ts`.
- Latest shared-checkout `pnpm nx run system-worker:test`: **218 passed, 44 failed** after the concurrent refactor. These results are not interchangeable with the isolated comparison. Remaining failures include storage fixtures, replica/admission fixtures, frontend access, and service actor identity.
- Full isolated Workerd runs were attempted on both baseline and repaired snapshots. Both stalled around WebSocket tests and reported sends after socket closure. Runs using `node node_modules/vitest/vitest.mjs run --config vitest.workerd.config.ts --testTimeout 15000` also stalled and were interrupted. No full Workerd pass is claimed.
- The recorded Vitest initialization problem reproduces when invoking the root Vitest binary against the worker package: root and worker resolve different peer installations. The package-local binary (used by the existing Nx target) initializes successfully. No setup hook or isolation bypass was added.
- The system-worker `ts` target inherits exclusions for runtime spec files. A supplemental isolated check explicitly including the new test reports no diagnostics in that test, but retains fixture-authoring typing failures; this supplemental check is not a clean test-wide typecheck.
- Scoped formatting completed. Scoped lint reported zero errors; six pre-existing warnings remain in touched files. The new integration test has zero lint warnings or errors.

Remaining work: resolve the existing owner-layer/full-suite failures, finish the concurrent refactor, and rerun the full Node and Workerd suites on a stable shared checkout. All storage used for these tests was disposable; user storage was not reset.
