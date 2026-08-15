# Active SharedWorker replica persistence handoff

**Captured:** 2026-08-13
**Status:** Archived; reconciled by
[`Spec 056`](./056-spec-shared-worker-port-authentication-and-exact-repo-authority.md).

Continue the SharedWorker persistence design with the `$spec` workflow. Treat
the settled decisions below as fixed, resolve the listed open questions one at
a time, and do not begin implementation from this handoff.

## Inputs merged

1. The current conversation about why the proposed checkpoint table exists,
   whether its fields belong in the user-root replica catalogs, and how broadly
   to scope the development spec.
2. [`ActiveSharedWorkerCommandJournal.md`](./ActiveSharedWorkerCommandJournal.md),
   including its active-journal, canonical-accounting, persistence-cutover, and
   failure-boundary decisions.

## Objective

Specify a development-ready hard cutover that gives each SharedWorker replica
fact one durable owner. The aggregate design must reduce its persisted state to
resource tables, active unaccounted local intent, and exact-database ordering
metadata. The expanded spec must also cover the read-only service replica's
persistence without inventing a service command journal.

## Consolidated decisions

1. **Settled — current conversation:** Retain the user-root
   `aggregateFrontendReplicas` and `serviceFrontendReplicas` tables as immutable
   locator catalogs. They own exact replica location and acquisition inputs,
   not mutable replica progress.
2. **Rejected — current conversation:** Do not put `frontendIndex`,
   `replicaIndex`, or other mutable ordering state in either user-root catalog.
   The catalog database cannot atomically commit those fields with resource and
   journal changes in the separate exact-replica database.
3. **Settled — current conversation, supersedes the RFC checkpoint table:** Do
   not introduce `aggregateFrontendReplicaCheckpoint`. Retain the existing
   exact-database `aggregateFrontendReplicaMetadata` table and hard-cut its
   durable shape to exactly `{ id, systemVersion, frontendIndex, replicaIndex
}`.
4. **Settled — current conversation:** `frontendIndex` is the durable canonical
   frontend-block frontier and WebSocket resume cursor. Resource rows cannot
   supply it, including when the projection is empty.
5. **Settled — current conversation:** `replicaIndex` remains the durable order
   of exact-replica commits because SharedWorker-to-page replica delivery still
   requires one contiguous sequence. Removing it would require a separately
   approved replacement-delivery protocol.
6. **Settled — current conversation:** `systemVersion` is replica metadata used
   to reconstruct acquired state. It is not a checkpoint or a substitute for
   runtime capability identity.
7. **Settled — current conversation:** The exact SQLite transaction proves that
   metadata, resource, and journal changes committed atomically. The metadata
   row records the resulting frontiers; it does not independently prove a
   journal deletion or resource change.
8. **Settled — carried from the RFC:** Generated resource tables are the only
   persisted materialized projection. They contain the current canonical
   resources plus every currently applied optimistic aggregate-journal
   mutation. No complete replica-state JSON projection is persisted.
9. **Settled — carried from the RFC:** The aggregate command journal contains
   only unaccounted local intent. Row presence means that the canonical
   aggregate frontend stream has not accounted for the command. Each row keeps
   the complete staged or pushed command, immutable encoded mutations, and the
   currently applied inverses needed to rewind the visible projection.
10. **Settled — carried from the RFC:** The aggregate journal uses `commandId`
    as its primary key, preserves unique `{ sessionId, sessionIndex }` handoff
    identity, and uses a unique indexed `replicaIndex` for replay order. It has
    no generated journal ID, lifecycle enum, `pushProvenance`,
    `terminalOutcome`, `updatedAt`, or state-discriminant index. The complete
    command's existing status distinguishes staged from pushed.
11. **Settled — carried from the RFC:** A durable aggregate handoff inserts the
    complete staged command and mutations, applies optimism, stores the applied
    inverses, and advances exact-replica metadata in one transaction. Only a
    committed handoff is resumable after the originating page disappears.
12. **Settled — carried from the RFC:** Automatic retry, manual push, reconnect,
    and restart may resend every staged-form journal command in `replicaIndex`
    order. Server idempotency by command ID or exact session cursor identity
    resolves identical retries and rejects conflicting bytes. Pushed-form rows
    remain active but are not resent.
13. **Settled — carried from the RFC:** The browser-facing
    `AggregateFrontendApi.pushCommands` success is exactly an inline
    `{ failedStagedCommands }` result containing complete failed commands. The
    server may retain its complete five-way settlement internally, but the
    browser receives no parallel admitted-command convergence result.
14. **Settled — carried from the RFC:** A verified failed-staged result rewinds
    its stored optimism, deletes its journal row, advances `replicaIndex`, and
    publishes the committed local rejection in one serialized transaction.
    Unknown, duplicate, or byte-conflicting failures fail the response commit.
    The failure is delivered live and is not retained as acquisition history.
15. **Settled — carried from the RFC:** Canonical frontend blocks are the sole
    browser authority for pending membership and executed or failed-pushed
    outcomes. A canonical transaction rewinds every active optimistic overlay,
    applies the canonical resource delta, promotes matching pending rows to
    complete pushed commands, deletes matching terminal rows, replays all
    remaining mutations in `replicaIndex` order, replaces their inverses, and
    advances `frontendIndex` and `replicaIndex`.
16. **Settled — carried from the RFC:** A canonical block at or below the
    committed `frontendIndex` is an idempotent no-op; a gap triggers repair.
    The design does not persist `previousBlock` to prove equal-index duplicate
    bytes.
17. **Settled — carried from the RFC:** Repair installs complete canonical
    resources, reconciles active aggregate journal rows using exhaustive
    pending, executed, and failed-pushed identities from the same authoritative
    state, then reapplies only remaining local intent. It does not use
    `lastRebasedPushedCursor` as an implicit accounting watermark.
18. **Settled — carried from the RFC:** Aggregate acquisition derives one
    outbound replacement from a consistent read of its user-root catalog row,
    exact-database metadata, resource tables, and active journal. It includes
    current resources and unaccounted local intent, not historical outcomes,
    and is never persisted as another JSON projection.
19. **Settled — carried from the RFC:** Effect Schema validates complete
    commands, mutation and inverse arrays, failed-staged results, canonical
    blocks, repair states, and derived acquisition values at their trust or
    persistence boundaries. It does not encode live RPC capability identity or
    validate a second persisted projection.
20. **Settled — carried from the RFC:** Push transport selection, registration
    fencing, reauthentication, retries, pause, manual wake, socket state, and
    delivery remain runtime concerns. They cannot account admitted commands or
    alter durable convergence. Fan-out occurs only after commit.
21. **Settled — carried from the RFC:** Existing-only aggregate acquisition
    performs no push. Active journal rows remain durable and resumable until an
    online registration becomes available.
22. **Settled — carried from the RFC:** Hard-cut disposable browser persistence.
    Delete the complete replica snapshot, `previousBlock`,
    `lastRebasedPushedCursor`, terminal browser outcome history, parallel push
    convergence state, and journal lifecycle product state. A non-empty exact
    database using the superseded layout fails with
    `browser-persistence-reset-required` before mutation. Add no compatibility
    columns, fallback decoder, dual read/write path, tagged legacy variant, or
    conversion migration. This does not authorize deleting shared, remote, or
    production-like state.
23. **Settled — current conversation:** Expand the development spec from the
    aggregate command-journal design to persistence for both
    `AggregateFrontendReplicaRepo` and the read-only
    `ServiceFrontendReplicaRepo`. The service replica remains journal-free and
    gains no staging, command-status, pause, or push behavior.

## Unresolved questions

1. Should the expanded spec stay limited to persistence and convergence while
   preserving current registration, authorization, reauthentication, and
   disposal behavior, or redesign those runtime lifecycles in the same work?
2. What is the exact slim metadata table name and shape for the service replica?
3. How should the service replica replace its complete persisted snapshot and
   `previousBlock` while preserving ordered block delivery, repair, offline
   acquisition, and derived replacement state?
4. Can every aggregate canonical live-block and authoritative repair path
   provide exhaustive pending, executed, and failed-pushed identity for every
   local journal row it reconciles? Any path that cannot must be strengthened;
   it must not regain an implicit cursor watermark.
5. Which existing test seam or smallest set of seams should prove aggregate and
   service persistence, restart, repair, block ordering, active-intent replay,
   and hard-cut rejection? The `$spec` testing decision has not occurred.

## Next action

1. Resume `$spec` and ask one decision at a time.
2. Begin with unresolved question 1, recommending a persistence-and-convergence
   scope unless the user explicitly wants registration and authentication
   lifecycle redesign included.
3. Resolve the service persistence shape and aggregate exhaustive-accounting
   premise before discussing test seams.
4. Confirm shared understanding and the selected highest practical test seams
   before writing the numbered design spec.

## Boundary

This handoff records the current decision set only. It does not authorize
implementation, runtime-boundary changes, RFC edits, a compatibility exception,
or plan/spec archival. No development spec or implementation for this expanded
work has been created in this thread.
