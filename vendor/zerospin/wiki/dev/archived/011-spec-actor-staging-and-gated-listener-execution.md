# Actor staging and gated listener execution

**Date:** 2026-09-25
**Status:** Guard ownership and AAVR storage locked; implementation pending. Remaining review items are listed in Further Notes.

## Problem Statement

The current listener implementation combines program execution, saved outputs, submission, and command execution inside retrying per-listener queues. It permits listeners to advance independently and gives them current state that may be ahead of their triggering command.

Actors need explicit command gates, listener programs that are never automatically rerun, and an optimistic database reconstructed from durable authoritative rows and locally staged commands.

## Solution

1. AAVR persists authoritative resource rows and ordered pending commands with prepared replay operations; it derives the actor’s optimistic database from them.
2. Confirmed commands are processed in order. Each command has one listener group and one gate.
3. Matching listeners run concurrently against the same snapshot.
4. Listener results are saved durably. Successful output commands are staged together.
5. The gate opens after staging completes; submission to the AggregateChain proceeds independently.

## User Stories

1. As a listener author, I can inspect state corresponding to the triggering command, including pending optimistic effects.
2. As a listener author, I control retries inside my program; the framework never automatically invokes that program again for the same occurrence.
3. As an actor author, I can register multiple listeners on one command and run them concurrently without allowing later command groups to overtake them.
4. As a caller, I can push a command and observe its optimistic effects after durable local staging.
5. As an operator, I can distinguish listener failures, staging rejections, and submission failures.
6. As a user, I retain successfully saved outputs across interruptions without repeating listener side effects.

## Implementation Decisions

### Ownership

1. Reshape `makeActorListeners` into one actor-scoped scheduler.
2. Give actor command staging and reconciliation ownership of durable pending commands, prepared replay operations, and the derived optimistic view. Resource tables remain authoritative.
3. Reuse `makeOutboxQueue` for saved-command submission. Its retry callback must never invoke listener programs.
4. Name the submission queue for its destination and purpose. Do not introduce another generic queue abstraction.

### AAVR storage — locked

1. Persist authoritative resource rows through AAVR's own confirmed `executedIndex`, alongside the matching checkpoint. AAVR may lag AVR; its resource rows and checkpoint must describe the same confirmed state.
2. Durably retain pending commands in staging order, prepared replay operations and captured inputs, staging results, submission work, and listener invocation/results and unfinished-group state. Include IDs, timestamps, and captured service resources required for reproducible replay.
3. Derive optimistic resource rows from that authoritative base and unresolved pending operations. An in-memory materialization is optional and disposable. Do not persist optimistic resource tables, a duplicate authoritative resource copy, or optimistic undo information.
4. Reconstruction applies saved operations to the current base without rerunning listener programs or contract mutation preparation, refetching service snapshots, regenerating IDs/timestamps, or blindly restoring old resulting rows. Preserve relationship-driven selection entry/exit.
5. Staging succeeds only after the command, replay material, staging result, and submission work commit durably. Any optimistic cache must reflect that committed state and be discarded or rebuilt when its basis changes or a commit fails.
6. Confirmed publications and browser snapshots read authoritative resource rows with their matching checkpoint. Admission rejection removes the rejected pending contribution and rebuilds optimism without changing authoritative resource rows or advancing their checkpoint.
7. This replaces the supplied optimistic-row/undo design. Group snapshot recovery and caller/lifecycle protocol questions remain separately reviewable.

### Guard ownership — locked

1. AAVR runs contract and actor guards during local staging against the actor's optimistic state, before applying the candidate command's mutations. Earlier successfully staged commands contribute to the view used by subsequent staging attempts.
2. AC admission checks identity, provenance, supported contracts, input validity, and deduplication. It does not call AAVR for stateful contract or actor guard validation and does not require AAVR to rewind optimism for admission.
3. AVR runs aggregate guards against authoritative state during execution, in the same transaction/savepoint as the command's authoritative mutations. AVR does not rerun contract or actor guards, including for listener outputs.
4. Contract and actor guards decide whether to stage. Aggregate guards decide whether to commit authoritatively. Any rule that must hold at authoritative execution, including state-dependent ownership rules, belongs in an aggregate guard; aggregate guards support actor-specific rules.
5. A successfully staged and admitted command rejected by an aggregate guard retains its successful staging and admission results and records `execution.failed` with the canonical structured failure. Reconciliation removes its optimistic contribution and replays remaining unresolved commands. The rejection is not an admission failure or a delivery failure.
6. Replace AC's stateful AAVR validation call and AVR's listener-specific contract/actor guard reruns outright. Preserve authentication and listener-only provenance checks.
7. Guard ownership applies to the locked authoritative-base storage model above. AC admission requires no stateful AAVR call; AAVR still reconciles confirmed arrivals and rebuilds its derived optimistic view.

### Ordering and snapshots

1. Process confirmed actor commands in their existing execution order; do not introduce another confirmed-command index.
2. For each command, reconcile authoritative changes and replay pending commands before capturing the listener snapshot.
3. Give every matching listener in that group the same isolated snapshot.
4. Hold later confirmed changes until the group finishes and its outputs are durably staged.
5. Preserve existing listener matching, selection filtering, and initial-registration behavior.
6. Optimistic staging and replay must never trigger listeners or publish speculative changes as confirmed actor output.

### Listener execution and recovery

1. Durably mark the group’s listener invocations as started before invoking their programs.
2. Invoke each listener at most once. Authors may implement retries inside that invocation.
3. Save each listener’s successful command, explicit `null` result, or failure independently.
4. After a restart, mark previously started invocations without saved results as interrupted; never rerun them.
5. A crash between the start marker and invocation can therefore produce an interrupted listener that never entered its program. This is the accepted tradeoff for avoiding automatic duplicate execution.
6. Failed and interrupted listeners contribute no command. Preserve successful siblings’ saved outputs and advance once their staging completes.
7. Do not introduce a framework timeout. A still-running listener holds its group’s gate; authors control timeouts and retries.

### Output batches and optimistic staging

1. Collect successful output commands into one batch.
2. Promise no ordering between sibling outputs. Once an order is chosen for staging, retain it for deterministic retries and replay.
3. Serialize staging against other actor database writes. Check contract and actor guards against the current optimistic view.
4. Reject only the command whose guards fail. Record its staging failure and continue with valid siblings.
5. Atomically retain valid pending commands, prepared replay operations and captured inputs, successful staging results, and submission work. Optimistic mutations affect only the derived view after durable acceptance.
6. Open the gate after every output has a durable staging result. Do not wait for chain admission or authoritative execution.
7. Persistence or staging infrastructure failures keep the gate closed. Recovery resumes saved work without rerunning listener programs.

### Submission and reconciliation

1. Submit saved commands with stable identities. Retry uncertain delivery through existing idempotent admission.
2. Preserve staged command order across groups; sibling ordering remains unspecified to authors.
3. Preserve authentication, actor ownership, and listener-only command provenance checks.
4. When authoritative commands arrive, atomically apply authoritative changes, remove resolved pending contributions, commit confirmed publication/checkpoint and unfinished-group work; then reconstruct optimism from remaining pending operations before further staging or listener snapshot capture.
5. Replay uses saved prepared operations; it does not rerun listeners or contract mutation preparation, or create new submissions. A pending command that cannot currently replay contributes no optimistic changes; its authoritative disposition remains unresolved.
6. Compute confirmed actor publications and checkpoints from durable authoritative state. Reconstructing optimism never mutates that authoritative base.

## Testing Decisions

1. Extend existing actor listener and workerd seams rather than testing a new generic queue abstraction.
2. Verify concurrent listeners within one group and a closed gate between consecutive groups.
3. Verify all siblings see the same snapshot and later groups see earlier successfully staged outputs.
4. Verify successful siblings survive listener failure and individual staging rejection.
5. Interrupt before invocation, during computation, after result persistence, after staging, and after uncertain submission; assert no automatic listener reruns and no duplicate commands.
6. Verify authoritative application and reconstruction preserve confirmed publication and never retrigger listeners. Discard in-memory optimism and reconstruct from saved operations with stable IDs, timestamps, and captured service resources, without rerunning contract mutation preparation. Verify failed staging commits expose no tentative optimism and admission rejection leaves authoritative resource rows/checkpoints unchanged.
7. Exercise the complete scenario: command 10 has two listeners; one fails, the other emits a command; its optimistic effect reaches command 11’s listeners, survives restart, and reconciles with authoritative execution.
8. Through the existing staging and admission/execution seams, verify that contract and actor guards see earlier staged effects and run before the candidate's mutations; AC does not invoke stateful AAVR validation; AVR runs aggregate guards without rerunning contract or actor guards, including for listener outputs.
9. Verify that a staged and admitted command rejected by an aggregate guard retains successful staging and admission, records `execution.failed`, and reconciles optimism without turning command rejection into delivery failure.
10. Run scoped typechecks and relevant Node/workerd tests for the affected modules.

## Out of Scope

1. Retrying listener invocations automatically, exactly-once external side effects, historical listener backfills, and guaranteed sibling-output ordering.
2. A repository-wide queue redesign or unrelated timestamp and failure-field cleanup.
3. Compatibility aliases, translation migrations, or automatic storage deletion. Changed fixed schemas require empty storage.

## Further Notes

1. Existing implementation and documentation are evidence of current behavior, not constraints on this replacement.
2. This follows [durable actor listeners](../specs/008-spec-durable-actor-listeners.md) and [command lifecycle results](../specs/010-spec-command-lifecycle-results.md). The guard ownership and AAVR storage sections record the decisions approved in this chat.
3. The storage comparison is settled: persist authoritative resource rows plus durable pending operations and derive optimism. The implementation plan carries this decision through staging, snapshots, reconciliation, and recovery.
4. Remaining review items are caller staging/terminal-result delivery contracts; listener invocation/rejection records versus retained command lifecycle results; and atomic recovery of an unfinished gate and its original snapshot between authoritative application and invocation marking. Authoritative snapshot ownership and removal of rejected pending contributions without advancing confirmed checkpoints are settled above.
5. Implementation must update affected active architecture docs and local patterns that currently prohibit server optimism, and supersede the per-listener submission queue naming for this route. These changes are not implemented by saving this spec.
