# Executed mutation retention

**Date:** 2026-09-26
**Status:** Implemented and verified

## Outcome

1. Retain every committed aggregate and service mutation as a row, including its forward operation and inverse operation, in the owning AggregateVersionChain (AVC) or ServiceVersionChain (SVC).
2. Programs return readonly arrays or tuples of mutations. An empty array is valid. The returned sequence is the execution order, including replica mutations.
3. Existing model definitions supply operation schemas. Do not restore a contract-level `mutations` declaration or introduce a second model/operation allowlist.
4. This delivery establishes retention. Replay, undo execution, public history APIs, and history pruning are subsequent work.

## Current behavior

1. `makeContractVersion` and `makeMutations` accept single mutations, records, and arrays. The default no-op program returns an empty object.
2. `applyMutationTx` and `applyAggregateMutationTx` return applied mutations with inverse data. Authoritative executors currently discard those returns and retain resource deltas in command execution results.
3. Browser optimistic history already stores encoded applied mutations. Actor staging retains proposed mutations. Neither is the canonical history of authoritative committed changes.
4. AVR and SVR execution-result outboxes deliver command occurrences to their chains. Chain retention currently stores command results without applied mutation rows.
5. Contract specs already capture model specs. Spec validation detects incompatible changes; it does not automatically increment authored versions. Decoding an old operation requires its exact model version, not the latest model with the same name.

## Retained rows and ownership

1. Add a `mutations` table to each executor and chain database: AVR, AVC, SVR, and SVC. Executor rows are delivery copies; chain rows are the durable history.
2. Use the existing encoded applied-mutation fields: `commandId`, `mutationIndex`, `modelName`, `modelVersion`, `resourceId`, `operationName`, `operation`, `appliedAt`, `previousUpdatedAt`, and `inverseOperation`.
3. Associate rows with a local execution occurrence. Aggregate tables use `(executedIndex, mutationIndex)` as their key; service tables use `(serviceIndex, mutationIndex)`. Command IDs alone do not identify an occurrence. Existing command rows provide contract and execution-version provenance.
4. Preserve the original program-array index for authored mutations. Skipped replica writes leave gaps; do not renumber the mutations that actually committed. Incoming service replication uses the existing deterministic traversal order of the received resource delta as its local mutation index.
5. Persist operations in the encoded representation already defined by `encodeAppliedMutation`. Reuse the model-specific forward and inverse schemas, and avoid adding parallel codecs.
6. The AVC also retains local replica mutations applied while receiving service commands. The SVC retains the original service operations. These describe distinct writes in distinct databases. Already-current or unenrolled resources produce no local applied-mutation row.
7. A failed command retains no applied mutations. Successful empty programs and commands whose replica writes are all skipped likewise retain zero rows.
8. Preserve the current resource deltas used by downstream replication and fanout. Mutation history does not replace that delivery contract in this change.

## Implementation sequence

1. **Program result shape.** Narrow `IMutations` and result inference to readonly arrays/tuples; simplify `MutationValues` and `makeMutations`; make the internal no-op return `[]`. Update in-scope example programs, fixtures, and tests that return records or single mutations. Keep model ownership and operation validation. Optional programs remain optional unless an existing API already requires one.
2. **Program order — completed.** AVR now applies each prepared mutation in sequence, preserving replica validation and stale-copy skipping. A dependent write before a missing replica fails referential integrity and rolls back the command. No sorting or dependency planner is introduced.
3. **Storage definitions.** Add the four mutation tables with occurrence keys and encoded applied-mutation fields. Follow existing fixed-schema and row-codec conventions. Changed fixed schemas require empty storage; add no migration or fallback path.
4. **Executor capture.** Collect the actual return values from mutation application, encode them, and insert their rows inside the same transaction/savepoint as the resource writes and successful command occurrence. Apply this to aggregate execution, service execution, and aggregate intake of service results. Encoding or row insertion failure must roll back resource changes as well. Preserve the current failed-command recording behavior outside the rolled-back work.
5. **Delivery.** Extend each internal execution-result delivery item to contain its command row and complete ordered applied-mutation rows. An explicit empty array accompanies occurrences with no mutations. Build the payload from durable executor tables so retries survive restarts. Do not duplicate the array inside persisted execution-result JSON.
6. **Chain retention.** Validate occurrence ownership, command identity, unique ordered mutation indexes, and encoded row shape. Reject mutation rows attached to a failed occurrence. Insert each command and its complete mutation collection atomically, preserving the existing contiguous-history and disposition-hash checks. Copy encoded operations without lossy re-encoding. Existing disposition hashes remain disposition hashes; this change does not claim they authenticate mutation contents.
7. **Idempotency.** A retry succeeds only when the retained command occurrence and the entire mutation collection match, including an empty collection. Reject conflicting command or mutation contents without overwriting history. Extend the SVC's current existing-index short circuit to perform this comparison; reuse AVC's existing command equality behavior.
8. **Acknowledgement and cleanup.** A chain acknowledges only after command and mutation retention commits. Executor acknowledgement atomically removes the corresponding mutation delivery copies and performs the existing command-row acknowledgement/deletion policy. A lost acknowledgement causes an identical retry. A failed delivery preserves all delivery rows. Chain mutation rows have no eviction policy in this first implementation.
9. **Documentation.** Update affected contract-return examples and server execution/retention documentation. Explain proposed actor mutations, browser optimistic history, executor delivery copies, and canonical chain history at their existing use sites. Keep the plan active until the implementation and scoped verification below are complete.

## Decoding and inverse semantics

1. Database row decoding validates the retained envelope. Model-specific decoding additionally resolves the exact historical model and operation schema; do not silently decode with another version.
2. Reuse the existing `encodeAppliedMutation` schemas and applied-mutation decoding logic when a retained operation needs domain decoding. Do not add a new public decoder or relocate browser code solely for this retention delivery.
3. Retain the inverse values produced by actual application, including replica previous-resource data and previous timestamps. No promise of a general undo engine is made. For example, the current move inverse uses the supplied `prevId`; implementing undo later must verify that producer's preconditions and correctness.
4. Canonical rows retain execution order for inspection and possible later replay. An eventual undo implementation would need to define reverse application and dependency handling separately.

## Verification

1. At the contract seam, verify tuple inference, heterogeneous arrays, empty results, and rejection of single/record results. Exercise existing ownership checks after normalization is removed. Use the migrated callers and scoped TypeScript checks to expose remaining assumptions.
2. At executor transaction seams, verify that forward/inverse rows match actual applied changes, including replica overwrites; skipped operations produce no rows; and a later mutation failure rolls back both earlier resource writes and earlier captured rows.
3. Cover both aggregate and service execution, plus incoming service replication into an aggregate. Verify occurrence association and original indexes when skipped replicas leave gaps.
4. At the existing AVC/SVC receiver seams, verify atomic command-plus-mutation retention, identical retries, conflicting retries, empty collections, invalid associations, and gaps in command history. A failed retain must not acknowledge delivery.
5. At the outbox acknowledgement seam, verify that delivery survives a failed call or lost acknowledgement, and that successful acknowledgement releases only the matching executor copies while chain rows remain.
6. Run focused affected Nx tests and TypeScript targets. Run `git diff --check`. Broaden checks only for changed callers or a concrete remaining risk.
7. Already verified for the ordering correction: all three `executeCommandsTx.node.spec.ts` tests and `system-worker:ts` pass. These checks do not establish that retention has been implemented.

## Completion criteria

1. All authored program returns in scope use arrays/tuples, with no compatibility normalization remaining.
2. Every committed operation has a durable forward/inverse row in its chain after delivery; failed or skipped operations do not.
3. Capture, retention, retry, and acknowledgement boundaries satisfy the transaction tests above.
4. No contract-level mutation constraint is added, and no unrelated machine-state work is pulled into this worktree.
5. Affected docs and focused checks are complete before this plan is archived.

## Implementation and verification record

1. The contract factory accepts array/tuple program results, the internal no-op returns `[]`, and `makeMutations` rejects other result shapes. Existing fixtures and example programs were migrated.
2. AVR, SVR, and aggregate service intake write applied forward/inverse rows in the resource transaction. Their outboxes deliver the rows to AVC/SVC, which retain each collection with its command occurrence and compare the entire collection on retry. Executor delivery copies are deleted on acknowledgement.
3. Focused worker tests cover ordered application, rollback, both chain receivers, service execution capture, and local service replication inverse capture. The full worker suite passed: 14 files, 30 tests. Core and browser suites passed; Shopping's two tests passed. Tic-tac-toe has no test files, so its test target reports failure for that reason.
4. Fresh TypeScript checks passed for all 21 projects. Affected-project lint passed with pre-existing warnings outside the changed code. `git diff --check` passed.
