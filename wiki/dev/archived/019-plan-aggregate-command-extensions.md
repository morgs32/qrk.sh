# Aggregate command extensions implementation plan

**Date:** 2026-09-28
**Status:** Implemented and verified
**Source:** [Approved spec 019](./019-spec-aggregate-command-extensions.md)

## Outcome

1. Aggregate versions expose one optional `extensions` callback per effective command. The callback receives the active query-only transaction, all aggregate model helpers, the adapted payload, and the command's declared failures.
2. Authoritative execution runs the callback after shared mutations inside the original command savepoint, applies its returned mutations in order, and retains one command history and final delta. Client and actor staging remain shared-program-only.
3. Reuse existing validation, encoding, mutation application, failure, and deduplication paths. Add no persistence format or compatibility path.

## Implementation

1. Extend `makeAggregateVersion` and `IAuthoredAggregate` with inferred extension keys and callback arguments from effective contracts and models. Validate unknown keys at declaration time and retain the callback on the version.
2. Carry the adapted payload and executing contract through command preparation to the transaction. Keep shared program evaluation and guards in their current places.
3. In the per-command savepoint, apply shared mutations, execute the extension synchronously against the updated transaction, validate and encode its mutations, and apply them with indexes after the shared phase. Capture each row's original before-image before its first mutation across both phases.
4. Encode declared extension failures as the original command's terminal rejection; let infrastructure failures abort as they do today. Keep committed-command deduplication at the existing execution frontier.
5. Add declaration and real-database execution assertions for model scope, payload and failure inference, state visibility, ordering, deltas, rollback, empty results, and retries. Run the affected Nx targets and update execution documentation.

## Verification

1. `pnpm nx run-many -t ts -p @zerospin/core system-worker` passed, including declaration and transaction test typechecks.
2. Focused Core declaration and system-worker Node execution tests passed. The execution test covers private policy reads, shared and extension writes, empty results, declared rejection, mutation application rollback, final deltas, indexes, and committed retry deduplication.
3. The browser session execution test passed for optimistic staging, pending replay, selected server state replacement, and rollback after an aggregate-scoped rejection. Its selected result is a focused fixture rather than a live network delivery.
4. A new workerd test passed for shared and extension mutations under one durable SQLite command transaction and final inserted resource state.
5. Affected project lint targets passed. Existing unrelated warnings remain in those projects.
