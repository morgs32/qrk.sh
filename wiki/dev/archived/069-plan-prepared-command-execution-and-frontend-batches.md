# Plan 069 — Prepared execution and per-command frontend deltas

**Status:** Implemented and verified.

**Source:** [Spec 069](../archived/069-spec-prepared-command-execution-and-frontend-batches.md). The decisions below supersede the earlier ACC/FCC topology and preparation-before-admission design.

## Final decisions

1. AggregateChain (AC), keyed by `{ systemId, aggregateId, aggregateName }`, owns immutable complete admission bytes, aggregate positions, version registration, and the mutable base pointer. It owns neither prepared inputs nor terminal execution history.
2. Every VersionedMaterializedAggregateRepo (VMAR), keyed by those fields plus `aggregateVersion`, prepares its own admitted inputs before opening the execution transaction. It adapts payloads, generates ordered mutations, captures replication resources and an execution timestamp, then runs the aggregate guard and originating frontend guard locally before applying mutations.
3. Preparation/domain rejection records a terminal failure at the admitted position and rolls back only that command. Infrastructure failure aborts the page. State, execution head, rolling disposition hash, and complete output entries commit atomically. Committed positions never rerun preparation or guards.
4. VMAR results are a delete-mode outbox to VersionedAggregateChain (VAC). VAC retains immutable terminal execution entries per aggregate version. Entries preserve complete admitted source bytes, terminal occurrence, prepared mutations, guard inputs, preparation version, and execution timestamp. A direct retry recovers the exact committed result from pending VMAR output or VAC.
5. Direct requests select the **current base** on every invocation. A retry after cutover returns the new base VMAR's committed result, even when the original call returned the old base result. There is no persisted original-version request ownership.
6. Each VMAR exposes `flush(aggregateIndex)`. It executes and durably publishes through that exact index and returns `{ aggregateIndex, commandId, dispositionHash }`; zero returns the genesis checkpoint. AC samples its last admitted index and awaits base/candidate flushes in parallel. Equal checkpoint identities and disposition hashes permit a compare-and-set of the base pointer; divergence invalidates the candidate.
7. AC remains available for VMAR history callbacks while cutover waits. No transaction or whole-DO RPC gate spans flushing. Admissions may continue: the sampled index is a comparison checkpoint, not an admission routing boundary.
8. VAC fans terminal entries to VersionedMaterializedAggregateReplicaRepo (VMARR), whose identity adds `{ userId, frontendName }`. VMARR owns aggregate replica state, selected/projected view state, resolved command IDs, and one frontend output per aggregate position.
9. VMARR never reruns programs or guards. It replays successful prepared mutations, preserves failed positions, compares the retained preceding view with the resulting view, and emits relationship-driven entries/exits, changed values, empty progress, and complete same-user/same-frontend origin resolutions. Delivery pages do not merge command semantics.
10. VMARR's delete-mode delta outbox feeds FrontendAggregateChain (FAC). FAC durably retains contiguous, exact-byte-checked output before acknowledgement and broadcasts from that history through PartyServer. Reconnect replay uses the same retained outputs. There is no downstream MFR.
11. AggregateFrontendApi submits complete local occurrences directly to AC and returns `{ aggregateIndex, commandId }` admission receipts. Admission stops resubmission but leaves browser optimism pending. Terminal outputs and published snapshots resolve optimism by command ID. The pushed-command chain and server optimism are deleted.
12. VMARR captures its projected snapshot, resolved command IDs, and cursor `n` consistently, then awaits FAC publication through `n` outside its execution semaphore. The snapshot supplies `aggregateVersion`. The browser pins that version in the ticket and replays strictly after `n`, preventing cutover from mixing snapshot and stream histories.
13. Worker configuration supplies `systemId`. Command input or admitted frontend capability supplies aggregate fields; authentication supplies `userId`; the admitted frontend capability supplies `frontendName`. Version registration/current-base selection supplies VMAR/VAC versions, and the captured snapshot supplies the browser's version. These are distinct provenance boundaries.
14. Service frontend delivery is outside this redesign. ServiceAdmittedChain continues delivering complete terminal service occurrences into AC; aggregate admission preserves their source bytes and contiguous service frontier.
15. Changed fixed schemas require a new `systemId` and empty storage. Local/example bindings use fresh Plan 069 IDs. No shared/remote storage reset or deployment is authorized or performed.

## Implemented topology

```text
AC → fanout → VMAR per aggregate version
VMAR → delete outbox → VAC per aggregate version
VAC → fanout → VMARR per aggregate version, user, and frontend
VMARR → delete outbox → FAC with the same versioned view identity
FAC → PartyServer broadcast / retained replay → browser replica
```

## Completed implementation

1. Retained the table-driven outbox/subscriber primitive and shared-suffix fanout. Outboxes use ordered SQL pages, exact-page acknowledgement, retain/delete policy, serialized drains, readiness, retries, and queue-specific alarm leases. Added bounded `drain(throughIndex)` for publication checkpoints.
2. Replaced AggregateCommandChain with AC, removed its preparation and canonical-result paths, and preserved source occurrences during admission and service delivery.
3. Moved preparation and both local guards into VMAR, added exact-result recovery and `flush`, and replaced candidate result acceptance with parallel checkpoint comparison.
4. Added VAC with version-owned retained output and VMARR fanout. Removed the old pushed-command owner and combined frontend-chain protocol.
5. Replaced the combined aggregate frontend materializer with VMARR and moved authoritative graph/delta calculation there. Added FAC durable output, outbox receiver, and PartyServer replay.
6. Updated API, browser submission, snapshot, version-pinned tickets, WebSocket routing, optimistic reconciliation, Worker exports, bindings, Repo registration/inspection, examples, and focused fixtures.
7. Removed obsolete pushed-history RPCs, schemas, and resolved-push persistence. Updated architecture pages, glossary, overview, and repository guidance to the new owners and method paths.

## Verification

1. System-worker Node tests cover idempotent admission, preserved source bytes, changed-byte conflicts, current-base direct retries, parallel cutover flushes with concurrent admission, candidate mismatch, 130-command bounded execution, retry after outbox deletion, preparation rejection, whole-page infrastructure rollback, graph membership changes across delivery page sizes, browser optimism resolution, and outbox retry/acknowledgement behavior.
2. Real workerd tests cover AggregateFrontendApi admission-only receipts, both VMAR guards, VMAR→VAC→VMARR→FAC publication, published snapshot/cursor consistency, exact result recovery after cold activation, FAC WebSocket replay from a nonzero cursor, duplicate delivery, gaps, and the outbox/fanout transport fixtures.
3. Core command/session tests verify the execution-entry and per-command output schemas, published-state installation, and local session journaling. Frontend tests and source/test TypeScript validate the updated browser/API contracts.
4. Passed: 85 system-worker Node tests, 27 workerd tests, system-worker source and full test TypeScript, fixture no-emit TypeScript, 27 focused Core command/session tests, 4 frontend tests, frontend source/test TypeScript, scoped formatting, no lint errors, static-cutover check, and documentation links/ranges/sequence counts. Broader lint retains unrelated warnings.
5. Broader checks are recorded separately: the full Core runtime suite currently has two factory-freezing failures in `makeModel.node.spec.ts` and `system/tests/schema-validated.node.spec.ts`. Core's full test-typecheck has factory/fixture generic errors. The frontend dependency build also encounters the existing OPFS router `backupClientId` type errors. These unrelated paths are not redesigned by Plan 069.
