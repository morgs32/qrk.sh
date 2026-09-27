# Actor staging and gated listener execution

**Date:** 2026-09-25
**Status:** Superseded in its listener-specific sections by [Spec 012](../specs/012-spec-aggregate-state-machines.md). Actor staging and caller admission remain in use.
**Source:** [Spec 011](../archived/011-spec-actor-staging-and-gated-listener-execution.md).

## Outcome and boundaries

1. AAVR owns durable actor command staging and optimism. Contract and actor guards run before a candidate's optimistic mutations. AC performs admission checks without calling AAVR for stateful validation. AVR runs aggregate guards with authoritative mutations in one savepoint.
2. Each confirmed occurrence has one actor-scoped listener group and gate. Matching listeners run concurrently against identical isolated state. Later confirmed occurrences cannot advance past that gate until every output has a durable staging result.
3. Listener invocation is at most once per occurrence. Persisted success, explicit `null`, failure, and interruption survive recovery. Submission retries only saved commands; they never invoke listener programs.
4. AAVR persists authoritative resource rows through its own confirmed checkpoint plus durable pending commands and prepared replay operations. Optimistic resource rows are derived. Reconciliation applies authoritative results, removes resolved pending contributions, and rebuilds optimism. Confirmed publications and browser snapshots read the authoritative rows.
5. Replace superseded paths outright. Do not add compatibility decoders, parallel implementations, a generic scheduler framework, another confirmed-command index, framework listener timeouts, or automatic storage deletion. Fixed-schema changes require empty storage.
6. Fixed-schema changes require empty storage. Existing unrelated working-tree changes remain out of scope.

## AAVR storage — locked

1. Persist authoritative resource rows and their matching `executedIndex` checkpoint. These represent the confirmed state processed by AAVR, which may lag AVR.
2. Persist ordered pending commands, prepared replay operations, successful staging results, submission work, and listener invocation/results and unfinished-group state. Persist prepared IDs, timestamps, and captured service resources needed for reproducible replay; command payloads alone are insufficient.
3. Derive the optimistic database from confirmed rows plus unresolved pending operations. It may be cached in memory, but recovery must work without that cache. Do not persist optimistic resource tables, a second authoritative resource copy, or optimistic undo information.
4. Rebuild by applying saved operations against the current confirmed base. Do not rerun listener programs or contract mutation preparation, refetch service snapshots, regenerate IDs/timestamps, or reinstall stale resulting rows as the new base.
5. A successful staging return means the accepted command, replay material, staging result, and submission work have committed durably. Publish changes to any optimistic cache only after that commit; invalidate or rebuild it after a failed commit or a change to its durable basis.
6. Browser snapshots capture authoritative selected rows and their checkpoint together. Confirmed publication uses the same authoritative base. Neither read needs a temporary rewind of durable resource tables.
7. Atomically apply each confirmed occurrence, remove resolved pending contributions, record confirmed publication/checkpoint and unfinished-group work; then rebuild optimism before staging or capturing the next listener snapshot. Admission rejection removes the rejected pending contribution and rebuilds optimism without changing authoritative resource rows or checkpoints.
8. Preserve relationship-driven selection entry/exit when constructing optimism. Do not assume copying only currently selected rows supplies every resource needed by pending operations. Measure reconstruction CPU/memory cost; optimization must preserve this storage model.
9. The implemented group starts as durable pending work in the projection transaction. Snapshot capture under the actor write permit marks invocations started before running them. Recovery recaptures pending work; started invocations without saved results become interrupted.

## Resolved implementation decisions

1. AAVR stores flat pending command rows, prepared encoded mutations, and admission results. Its resource tables and checkpoint remain authoritative. Derived optimism copies the full resource graph so relationship-driven selection can enter or leave the actor selection.
2. Admission rejection sets the pending command resolved without changing authoritative resources or the confirmed cursor. A caller socket waits for the saved outbox admission result and returns the existing `aggregateCommandAdmission` response; staging success is not presented as AC admission. Secret-key execution and provisioning also stage before requesting direct AC execution.
3. Listener results stay on reaction/output records. Successful server staging is represented by the retained pending command and its prepared operations; a failed listener staging attempt records `stagingFailure` on its reaction without allocating a pending-command position.
4. Projection enrolls pending groups in its confirmed transaction. Under the actor write permit, capture builds the optimistic selection and commits started markers. A crash before capture recaptures the original confirmed frontier plus already durable pending commands during activation recovery; a crash after the markers interrupts unsaved invocations. Later confirmed entries wait behind this group.
5. One actor outbox submits saved commands in `stageIndex` order. It calls AC admission or the saved-output reference capability, and its retry never enters a listener program or prepares mutations.

## Baseline inspected before implementation

Paths below are relative to the repository root and describe the pre-cutover code inspected for this plan.

| Area                           | Current behavior                                                                                                                                             | Implementation touchpoints                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listener execution             | One retrying queue per listener; program and delivery share a callback. A retry can invoke an unsaved program again.                                         | `packages/system-worker/src/AggregateActorVersionRepo/listeners/makeActorListeners.ts`, `listeners/enqueueListenerReactionsTx.ts`, `listeners/makeListenerCommandId.ts`     |
| Listener persistence           | `listenerState.startIndex`, `listenerReactions.programCompleted`, flat `listenerOutputs`; admission/execution results are stored on reactions.               | `packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.ts`                                                                                 |
| Projection                     | A transaction processes a batch of confirmed entries and enqueues matching reactions. Listeners later read selected live state.                              | `packages/system-worker/src/AggregateActorVersionRepo/applyExecutedCommands/`, `commitActorProjectionTx/`, `commitAggregateActorCommandTx/`, `commitServiceActorCommandTx/` |
| Guard checks                   | AAVR validates on an always-rollback view with an AC-supplied prefix. AC loads retained command history to build that prefix.                                | `packages/system-worker/src/AggregateActorVersionRepo/validateCommands/validateCommands.ts`, `packages/system-worker/src/AggregateChain/admitCommands/admitCommands.ts`     |
| Authoritative execution        | Listener outputs receive additional contract/actor checks before aggregate guards.                                                                           | `packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommands.ts`, `executeCommandsTx.ts`                                                                |
| Caller and listener submission | The live ActorVAC socket calls AC admission directly. Listener queues call `executeListenerCommand` using a saved-output reference.                          | `packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts`, `packages/system-worker/src/AggregateChain/AggregateChain.ts`                               |
| Activation and snapshots       | Activation subscribes before first listener registration. Browser snapshot capture reads the replica's selected resource rows and committed cursor together. | `packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts`, `onDOActivation/`, `getSnapshot/getSnapshot.ts`, `catchup/`                            |

## Implementation sequence

### 1. Close the carried-forward design review

1. Record the answers in this plan and its source spec before implementing dependent storage or public contracts. Do not reopen the locked guard ownership or AAVR storage decisions.
2. Implement the locked storage model above. Specify the prepared-operation schema and the resource coverage needed to reconstruct optimistic selections; these are implementation details within the accepted authoritative-base design.
3. Preserve `getSnapshot` capture of the authoritative selected graph and matching checkpoint in one transaction. Keep the derived optimistic database outside this read path and preserve publication durability before returning.
4. Define durable admission-rejection handling: remove the rejected command's optimistic contribution and replay unresolved commands without inventing an executed position or advancing confirmed checkpoints. Settle how the originating caller learns that terminal admission result after local staging has returned.
5. Reconcile listener invocation and staging-rejection records with [command lifecycle results](../specs/010-spec-command-lifecycle-results.md). Failed staging must remain observable for a listener occurrence without fabricating a successfully staged command or submission position. Decide where successful server-owned staging results live; do not invent browser staging data for server commands or duplicate command payloads across lifecycle records.
6. Fix the recovery boundary between authoritative application and invocation marking. The transaction that advances the confirmed cursor must also leave enough durable group work to recover before processing another occurrence. Define how a group that has not started captures its original snapshot after restart, including the effect of intervening caller staging.
7. Specify the authenticated caller staging request and return contract. The existing socket returns an AC admission result; returning after durable local staging changes that meaning. Inventory its in-scope callers and result schemas, preserve command/node identity, and choose the replacement explicitly before editing the socket path. A staging receipt must not masquerade as admission success.
8. Exit criterion: the locked storage strategy and authoritative snapshot path are carried through the transaction design, and the remaining rejection delivery, lifecycle ownership, crash-safe group transition, and caller return contract are recorded. Unresolved items remain blockers for their dependent steps rather than silent implementation assumptions.

### 2. Establish durable state and recovery transitions

1. Replace `programCompleted` and per-listener delivery ownership with the chosen group and invocation records. Key confirmed groups by the existing `executedIndex`; keep stable listener occurrence identities from `makeListenerCommandId` and preserve `listenerState.startIndex` semantics.
2. Represent invocation states explicitly: not started, started without result, successful command, successful `null`, failed, and interrupted. Persist structured failure information separately from command staging, admission, execution, and delivery failures.
3. Persist successful output fields once and retain the selected sibling staging order before attempting the batch. Store references where records only need command identity. Do not serialize a second command envelope or store canonical bytes.
4. Add durable pending-command state, prepared replay operations with their captured inputs, and saved submission work. Keep resource tables authoritative; do not add durable optimistic rows or undo records. Give submissions an actor-local order distinct from the existing confirmed `executedIndex`; this orders staged commands and is not a second confirmed stream.
5. Make duplicate staging of a stable command return its retained result without adding mutations or submission work. Preserve the existing identity/provenance collision checks rather than treating arbitrary same-ID payloads as equivalent.
6. Ensure atomic boundaries cover projection plus unfinished-group enrollment, start markers, each independent result save, batch staging completion, and submission-result reconciliation. Use synchronous SQL transactions for persistence; listener programs and network waits stay outside them.
7. Exit criterion: every crash boundary has a durable next action and no recovery action requires invoking a previously started listener.

### 3. Implement actor staging and separate guard ownership

1. Replace the admission-oriented `validateCommands` implementation with actor-owned durable staging. Reuse existing payload codecs, actor selection, mutation preparation, structured failures, and transaction/savepoint primitives where they fit. Remove the AC-prefix overlay and always-rollback validation route when its callers are replaced.
2. Serialize staging with actor reconciliation and other actor database writes. If mutation preparation awaits work outside SQL, validate its basis before committing so it cannot apply against a stale actor view.
3. For each candidate in retained batch order, run contract and actor guards against the current optimistic state before applying that candidate's mutations. Earlier accepted siblings contribute to later checks. A recognized guard rejection rolls back only that candidate and records its staging outcome; infrastructure failures roll back the affected transaction and leave recovery work pending.
4. Atomically retain valid pending commands, prepared replay operations and captured inputs, successful staging outcomes, and submission work. Apply optimistic effects only to the derived view. Do not acknowledge local staging or expose a changed optimistic cache before that durable commit; discard tentative cache changes on failure.
5. Route listener output batches and the agreed authenticated caller path through this staging operation. Keep listener-only output contracts inaccessible to ordinary callers. Preserve ownership checks and full identity/provenance fields at the boundary.
6. In `AggregateChain/admitCommands/admitCommands.ts`, remove the AAVR validation RPC, retained-history prefix scan, and overlay construction. Retain authentication, target identity, supported-contract and payload checks, listener provenance, stable-ID deduplication, and durable admission outcomes.
7. In `AggregateVersionRepo/executeCommands/executeCommands.ts`, remove listener-specific contract and actor guard reruns. Keep aggregate guards, including actor-specific aggregate rules, inside the authoritative savepoint in `executeCommandsTx.ts`.
8. Exit criterion: tests distinguish a local staging rejection from an admission rejection and an aggregate execution rejection; guard call counts and observed state prove the locked ownership decision.

### 4. Process confirmed entries through one actor scheduler

1. Reshape `makeActorListeners` into the actor-scoped scheduler. Replace the independent `listenerCommands:<listenerName>` queues and `withPending` nesting; do not keep their retry callbacks as an alternative execution route.
2. Change `applyExecutedCommands` and its transaction integration so a delivered page cannot project all later entries before running the first group. Process each occurrence in existing execution order; reconcile it, prepare its confirmed publication, replay pending optimism, and establish its group/snapshot boundary before advancing.
3. Preserve the existing matching rules: supported trigger contract versions, successful aggregate occurrences with selected changes, selection filtering, and the initial registration position after activation catch-up. Commands without matching listeners pass the gate immediately after their durable reconciliation work.
4. Give every sibling an isolated view of the same captured state. Keep it immutable for the duration of their programs even if caller staging proceeds. A listener must not query a later live actor view.
5. Commit invocation start markers before entering any program. Launch matching siblings concurrently; save each result independently, including explicit `null` and structured failure. Catch a sibling's failure without cancelling successful siblings. A running sibling holds the gate until it finishes; authors own timeouts and in-program retries.
6. After all invocations have a durable terminal result, stage the saved successful outputs as one batch using step 3. Keep valid siblings when another command is rejected. Open the gate only after every output has a durable staging result.
7. Keep the gate closed on persistence or staging infrastructure failure. Retry saving or staging already computed work without re-entering listener programs. On restart, started invocations without a durable result become interrupted; successful saved outputs survive.
8. Exit criterion: command 11's listeners cannot run before command 10's group finishes staging, and see command 10's accepted optimistic output even while its submission is unavailable.

### 5. Submit saved commands and reconcile all terminal outcomes

1. Bind one actor-owned `makeOutboxQueue` for saved commands destined for AC. Use a destination-and-purpose name such as `aggregateCommandsOutbox`; keep it distinct from the existing `actorCommandsOutbox`, which publishes confirmed actor output to ActorVAC.
2. Preserve staged order across groups and ordinary caller staging. Retry uncertain delivery with stable command identities. Its callback must contain no listener invocation or staging preparation.
3. Preserve the saved-output reference/provenance restriction of `executeListenerCommand`, adapting it to the staged command owner. Ordinary admission must still reject forged listener provenance. Gate release must not await this RPC's admission or execution result.
4. Treat durable business rejection as successful delivery of a result. Record admission failure and skipped execution, or successful admission and aggregate execution failure, in their owning lifecycle fields. Do not overwrite successful staging or admission with a later failure.
5. For confirmed arrivals, atomically apply authoritative changes, remove resolved pending contributions, compute confirmed selected deltas/publication checkpoints, and retain unfinished-group work. Then rebuild the derived optimistic view by replaying remaining pending operations in retained order before further staging or listener snapshot capture. Recovery repeats reconstruction from durable state; no durable resource rewind is needed.
6. A command that cannot currently replay stays unresolved but contributes no optimistic changes. Replay uses saved prepared operations; it must not invoke listeners or contract mutation preparation, enqueue another submission, or change the original successful staging result. Do not restore stale post-staging resource rows over newer confirmed state.
7. Implement admission-rejection reconciliation from step 1 without moving authoritative cursors. Ensure a terminal result racing with fanout cannot resolve or apply a command twice.
8. Keep browser snapshot capture on authoritative durable resource rows, excluding the derived optimistic view. Preserve graph/cursor consistency, requested-node result ownership, and publication durability before returning a snapshot.
9. Exit criterion: confirmed publications contain only authoritative changes; both admission and execution rejection remove optimism correctly; uncertain retries create one admitted command and one authoritative effect.

### 6. Wire activation, catch-up, and alarms

1. Recover unfinished group work before processing newer confirmed entries. Preserve first-registration behavior for a newly activated actor, while restart of an already registered actor resumes its persisted gate rather than resetting the listener start position.
2. Reconstruct optimism from authoritative rows and durable pending operations before serving staging or listener reads; never depend on a surviving in-memory cache. Register durable recovery work before writes can create pending groups or submissions. Reuse the existing alarm registry and queue leases; do not introduce a second general retry framework.
3. Audit `executionResultsFanoutSubscriber`, catch-up, and snapshot call paths for reentrancy and partial-page acknowledgement. The subscriber's cursor may only claim reconciled entries; an unfinished group must still prevent the next entry after restart.
4. Keep the gate, submission queue, and confirmed-publication queue from waiting on each other cyclically. In particular, a listener gate never waits for its output to execute, and submission must be able to obtain a saved command while the gate is closed.
5. Exit criterion: live fanout, duplicate delivery, catch-up, and restart enforce the same ordering and at-most-once invocation rules.

## Verification

1. Extend existing `AggregateActorVersionRepo/listeners/listeners.node.spec.ts` for deterministic transaction, state, and interruption cases; extend `listeners.workerd.spec.ts` for real Durable Object activation, fanout, submission, and recovery. Reuse fixtures and public actor seams rather than creating a generic queue test suite.
2. Prove concurrent siblings, identical snapshot contents, snapshot isolation from later writes, registration filtering, zero-listener progress, explicit `null`, one failing sibling, and individual output staging rejection.
3. Inject interruption after start persistence but before invocation, during invocation, after one sibling result save, after all result saves but before staging, after staging but before gate completion is observed, and after uncertain submission. Assert invocation counts, retained successful outputs, gate progress, and no duplicate pending/submitted commands.
4. Add a recovery case for the authoritative-application/group-enrollment boundary. Restart must neither skip the triggering group nor project the next occurrence early.
5. Verify the complete spec scenario: command 10 has two listeners; one fails and one emits a command; that output reaches command 11's snapshot optimistically, survives restart, and reconciles with authoritative execution.
6. Extend `AggregateChain/admitCommands/nodeAdmission.node.spec.ts` and `AggregateVersionRepo/executeCommands/executeCommandsTx.node.spec.ts` as applicable: AC performs no stateful AAVR validation; contract/actor guards see preceding staged effects; AVR calls aggregate guards only; aggregate rejection preserves staging/admission success and records the canonical `execution.failed` failure.
7. Verify authoritative browser snapshots and publications while pending optimism exists, admission rejection without resource/checkpoint changes, replay refusal without resubmission, relationship-driven selection entry/exit, and duplicate terminal delivery. Discard all in-memory optimism and prove reconstruction preserves captured IDs, timestamps, and service resources without rerunning listener programs or contract mutation preparation. Inject a staging commit failure and assert that no speculative cache changes become visible. Rebase on changed confirmed rows and assert replay applies operations rather than overwriting them with stale staged rows. Extend the existing browser/session integration seam only where the chosen caller protocol changes it.
8. The inspected `system-worker` Nx project exposes `ts`, `test`, `test:workerd`, and `lint`. Start with `pnpm nx run system-worker:ts`, `pnpm nx run system-worker:test -- listeners.node.spec.ts`, and `pnpm nx run system-worker:test:workerd -- listeners.workerd.spec.ts`; run the affected admission/execution tests and `pnpm nx run system-worker:lint` before completion. Preserve configured dependency builds and caching. Inspect additional consumer targets only if shared schemas or the socket contract change.
9. No runtime checks were run for this documentation-only plan. During implementation, report scoped results and unrelated blockers separately; do not claim whole-repository validation.

## Documentation and completion

1. Update `packages/system-worker/src/AggregateActorVersionRepo/listeners/README.md`, affected Repo JSDoc, and `packages/system-worker/src/AggregateVersionRepo/README.md` alongside the code they describe.
2. Update affected workflows in `wiki/architecture/server/admitCommands.md`, `server/executeAggregateCommand.md`, `browser/PushSequence.md`, `browser/SessionWebSocket.md`, and `browser/bootstrapBrowserSession.md`. Keep diagrams and annotated source references consistent with implemented ownership and caller results.
3. Replace the superseded rules in `wiki/patterns/system-worker/aggregate-session-admission.ts` and `versioned-aggregate-replica-owned-projection.ts`; update index routing if needed. Explain the authoritative-publication boundary while allowing AAVR-owned optimism.
4. Reconcile active specs 008 and 010 where their per-listener queue and lifecycle descriptions conflict with this cutover. Preserve historical intent with explicit supersession references; do not present planned behavior as already implemented.
5. Remove obsolete listener retry paths, unused validation callers, and compatibility-only tests within this scope. Keep relevant comments and unrelated WIP. Document the empty-storage requirement without deleting storage automatically.
6. Complete only when step 1 is resolved, all accepted behaviors and recovery paths are implemented, scoped checks pass or remaining blockers are explicitly reported, and affected docs match the code. Archive this plan only after full implementation and verification.

## Scoped implementation verification

As of 2026-09-25, `pnpm nx run system-worker:ts`, `system-worker:test`, and
`system-worker:test:workerd` pass after the actor staging and listener changes.
The lint target passes with pre-existing warnings outside this change. The broader
interruption matrix and browser integration scenarios in the verification section
remain follow-up checks before archiving this plan.
