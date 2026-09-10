# Shared user-versioned aggregate replicas

**Date:** 2026-09-09
**Status:** Implemented and verified for the cutover scope

## Problem Statement

System-worker still used the removed aggregate frontend registry to execute commands, validate locks, and project resources. Frontend-owned replicas also duplicated the same aggregate replay and user selections for different UIs.

## Solution

Replace FrontendAggregateRepo and FrontendAggregateChain with UserVersionedAggregateRepo (UVAR) and UserVersionedAggregateChain (UVAC). Frontends select exact compatible subsets at the capability and connection boundaries. UVAC retains user history indefinitely; UVAR owns current state and its delivery outbox.

## User Stories

1. Frontend authors can change compatible model and contract subsets without publishing a server frontend registry.
2. Frontends sharing a user and aggregate version share one replica and history while receiving different subsets.
3. Users receive only resources matching aggregate selections in both snapshots and live updates.
4. Reconnecting clients replay retained history with continuous user progress, including empty filtered entries.
5. Snapshot recovery settles outstanding successful or rejected commands without replaying their optimism or downloading every historical command ID.

## Implementation Decisions

1. Both shared objects use `{ systemId, aggregateId, aggregateName, aggregateVersion, userId }`. Worker configuration supplies systemId, authentication supplies userId, and admission validates and authorizes the caller's aggregate fields. Frontend names and locks belong to capabilities and connections.
2. Validate every selected model and contract against the exact selected aggregate version. Allow subsets; reject unknown or changed definitions. Selected contracts require all their declared mutation models, identified by modelName rather than a contract-local model alias.
3. Execute authoritative contracts directly and retain aggregate authorization, contract guards, and aggregate binding guards. Remove server frontend guard databases and frontend binding adapters. Preserve unrelated authored history adaptation.
4. UVAR replicates the aggregate's full model set and computes the user-selected graph after aggregate and pinned service replay. Entry and exit from selections produce visibility deltas.
5. Preserve transactional outbox publication, exact duplicate handling, contiguous history, source cursors, alarms, and cold activation. Snapshots wait for publication through their captured cursor outside execution exclusivity.
6. Use userIndex for aggregate user-output progress throughout storage, sockets, RPCs, and browser consumers. Service frontend indices remain unchanged.
7. Filter snapshot and stream resources using each admitted lock. Empty filtered entries still advance userIndex. Restrict pushes to the exact locked contract version. Preserve complete command occurrences and send resolutions only to their originating frontend.
8. Snapshot requests supply outstanding command IDs. UVAC resolves only those IDs through the captured userIndex, restricted to the requesting frontend, using an indexed lookup. Return complete outcomes. Remove UVAR's accumulating resolved-command-ID table.
9. A changed lock obtains a new capability, snapshot, and connection while retaining existing lock-specific browser backup isolation. Do not migrate optimistic journals between incompatible locks.
10. Hard cutover all in-scope names, bindings, callers, inspection APIs, tests, and documentation. Do not add compatibility aliases or reset shared storage.

## Testing Decisions

1. Use real Worker RPC and WebSocket tests for shared identities, authorization and guards, subset admission and delivery, origin-only resolutions, replay, publication, and cold activation.
2. Use browser session tests for snapshot replacement, duplicate progress, successful and rejected outcomes, and preservation of unresolved optimism. Retain existing lock-specific backup behavior.
3. Run affected Nx library builds, typechecks, and focused test suites. Additional browser UI automation is not required.

## Out of Scope

1. Service frontend ownership redesign.
2. Bounded replay retention or history compaction.
3. Server-authored frontend versions or allowlists.
4. Cross-lock journal migration and unrelated workspace changes.

## Further Notes

The earlier bounded-window proposal and FAC deletion were superseded by retained UVAC history. Snapshot reconciliation therefore reads UVAC, not a second authoritative execution history.

## Implementation Verification

1. Shared UVAR/UVAC identities, Worker exports and bindings, inspection APIs, frontend consumers, and current architecture documentation use the new names and userIndex. Removed aggregate frontend registry access, projection adapters, frontend guard databases, and accumulating resolved-command-ID storage.
2. Passed 46 focused tests: 22 server Node tests, 15 client/session tests, 8 Worker integration tests, and the frontend e2e fixture. Coverage includes user selections, concurrent frontend locks, empty filtered progress, authoritative guards, publication recovery, pinned-service updates and tombstones, cold activation, and successful/rejected outcomes after lost acknowledgements.
3. Passed affected library builds, system-worker/frontend/React/e2e typechecks, a focused Core session typecheck, lint, formatting, and diff checks. The full Core test typecheck still has unrelated failures in older aggregate/model/system fixtures using superseded model APIs.
4. No deployment or storage reset was performed. Changed immutable physical schemas and browser journal columns require fresh disposable state; compatibility migrations are intentionally absent.
