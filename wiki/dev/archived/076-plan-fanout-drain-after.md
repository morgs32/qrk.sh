# Plan 076 — Fanout drainAfter

**Date:** 2026-09-08
**Status:** Implemented and verified

Source: [Spec 076](./076-spec-fanout-drain-after.md).

## Queue API and execution

1. Add local Effect-returning drainAfter to the existing queue interface/factory; preserve result/error/service inference without new named types or helpers.
2. Reject Async requirements and Promise-like results using makeTx constraints. Capture context and run the callback synchronously; propagate failure and cancel suspended fibers.
3. Await recovery scheduling before invoking the callback. Never start immediate delivery or release the alarm in callback cleanup.

## Overlapping drains

1. Track active producers before scheduling. In interruption-safe cleanup, advance the producer revision and decrement the count.
2. Capture revision with the initial drain tip read. Release only with no active producer and an unchanged revision.
3. Disable scheduler yielding between release eligibility and initiating registry release. Do not change shared registry APIs or hold delivery permits across admission.
4. Preserve existing acknowledgements, terminal failures, and restart behavior; an overlapping producer leaves an extra recovery pass.

## Integration and documentation

1. Replace only AC admission's explicit hold and immediate finalizer with drainAfter around existing admission. Preserve atomic transaction, validation, receipts, complete occurrences, and errors.
2. Update fanout README and directly affected architecture prose/comments. Leave direct execution and other producers unchanged.
3. Work on main, preserving concurrent WIP. No reset, commit, or push.

## Verification

1. Extend existing queue tests for scheduling order/failure, results/failures, suspension cancellation, type constraints, overlapping drains, and reconstructed durable recovery.
2. Extend AC tests for alarm-only delivery, atomic rollback, duplicates, full occurrences, and receipts.
3. Run affected Nx tests, typechecks, lint, and formatting checks; validate documentation links and git diff --check.
4. Archive this plan only after implementation and verification pass; report unrelated failures without changing unrelated WIP.

## Verified results

1. `nx run system-worker:test -- makeFanoutQueue AggregateChain.node admitCommands.node`: 45 tests passed across three files.
2. `nx run system-worker:test:workerd -- systemVersionFanout`: four tests passed.
3. `nx run system-worker:ts`: passed, including its library dependency and compile-time callback constraints.
4. `nx run system-worker:lint`: passed with existing warnings; no new warnings remain in the changed lines.
5. Scoped CLI format checks and `git diff --check`: passed. Added README/planning links and updated queue citation ranges resolve.
6. Two unrelated cutover citation ranges in the admission architecture page exceed the concurrently edited source lengths. They belong to Plan 075 and were left unchanged.
7. No reset, commit, or push performed. The source spec and completed plan are archived under their shared 076 prefix.
