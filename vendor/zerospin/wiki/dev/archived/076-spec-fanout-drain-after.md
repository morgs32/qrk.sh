# Fanout drainAfter design

**Date:** 2026-09-08
**Status:** Approved for planning

## Problem Statement

AAC admission should schedule durable fanout without owning alarm names or starting immediate delivery. Atomic writes alone do not protect termination after commit and before scheduling delivery.

## Solution

1. Add local `drainAfter(() => effect)`: await alarm scheduling, execute the callback synchronously, and return its result. Delivery proceeds through the registered alarm.
2. Migrate only AAC admission; preserve its atomic batch transaction and RPC contract.

## User Stories

1. Admission callers receive committed receipts without waiting for materialization.
2. Producers schedule recovery without registry plumbing.
3. Restart recovers committed history without an immediate drain call.

## Implementation Decisions

1. Reject Async callback requirements and Promise-like results; reject runtime suspension and cancel the suspended fiber.
2. Preserve callback result, failure, and other services. Scheduling failure prevents invocation. Callback failure leaves a harmless wakeup.
3. Protect alarm clearing with queue-local active-producer count and revision. An overlapping drain cannot clear newer recovery.
4. Keep transaction rollback owned by makeTx; add no callback alarm release or immediate-drain finalizer.
5. Update the queue README and affected admission documentation after implementation.

## Testing Decisions

1. Use existing fanout queue and AAC admission seams, as confirmed by the user.
2. Cover scheduling failure, callback outcomes, suspension cancellation, overlapping drain completion, reconstructed recovery, and atomic admission receipts/rollback.

## Out of Scope

1. Other producers, outboxes, direct execution, schemas, public RPC changes, resets, commits, and pushes.
