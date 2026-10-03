# Async replay retains output without production

**Date:** 2026-10-02
**Status:** Accepted
**Implementation:** [Plan 027](../archive/plans/027-plan-actor-bound-async-contracts.md).

## Context

Mapped command programs can change async emissions across owner versions. Replaying external effects would duplicate business actions; matching changed emission indexes to original children would also invent associations between different programs. Original continuation inputs must remain valid after source command publication material is deleted.

## Decision

Store immutable async emission and original producer lifecycle together in the producing VersionRepo's `asyncOperations` table, keyed by `(commandId, operationIndex)`. Original execution alone allocates child identity and retains authority and eligibility. Replay runs the entire mapped program and records its complete version-specific output, then applies only model operations. Replay async rows have null lifecycle. An admitted continuation replays independently from its own frozen payload and external observation.

## Alternatives

Automatic production during replay risks repeated remote effects. Associating replay emissions with original children requires a matching policy that becomes ambiguous when contracts, arguments, count or ordering change. A separate work table duplicates frozen emission identity and arguments and requires another retention boundary.

## Consequences

New async emissions introduced by a replaying version remain historical output and do not backfill external work. A fresh original command under that version can run them. Observation recording and child enqueue are atomic; recorded evidence remains immutable through continuation rejection. Async rows and original authority survive source cleanup, so recovery requires no source command lookup. Pruning remains deferred. This persistence contract requires empty storage for the fixed-schema cutover and cannot be reversed by reinterpreting retained replay rows as production work.
