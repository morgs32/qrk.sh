# Handoff: actor-bound async contracts

**Date:** 2026-10-02  
**Status:** Superseded and reconciled into [plan 027](../plans/027-plan-actor-bound-async-contracts.md). Archived after the receiving design discussion completed; runtime implementation remains pending in that plan.
**Focus:** Historical handover from the side discussion to the main design thread.

## Goal

Carry actor-bound external work into the main design discussion and an actionable implementation plan.

## Done

1. The main discussion retained server-only actor registration, same-owner continuation authority, concurrent provider work outside execution gates, immutable provider identity, and durable recovery requirements.
2. The main discussion replaced the earlier executed-command performer input and separately authored completion contract. Plan 027 now uses the retained authoritative source result as payload, freezes the producer's `external` observation, and supplies both to the async definition's synchronous program.
3. Pending work stays outside admission. Prepared commands use `asyncCommandOutbox` and `outboxIndex`; successful durable admission deletes outgoing rows, so this queue has no `acknowledgedAt` column. The normal admission chain supplies command order.
4. Plan 026 implemented operation emission and independently retained results. Plan 027 records current source seams, transaction boundaries, private dispatch, replay, recovery, and verification requirements without changing the adjacent plan 025 work.

## Remaining

1. All implementation, runtime verification, and post-implementation documentation live in plan 027's Remaining work section. This archived handoff is not a governing interface or an implementation-completion claim.

## Suggested skills

1. `$implement`: execute the agreed plan through required verification.
2. `$use-morgs32-wiki-patterns`: consult current local patterns and relevant shared guidance.
3. `$spec`: resolve a material new decision only if implementation exposes one; keep agreed decisions settled.

## Pointers

1. [Actor-bound async contracts plan](../plans/027-plan-actor-bound-async-contracts.md).
2. [Captured operations and resource subscriptions plan](../plans/025-plan-captured-operations-and-resource-subscriptions.md).
3. [Implemented operation emission and retained results](../plans/026-plan-contract-operation-emission-and-results.md).
