# VAR-owned replication, execution guards, and ordered output

**Date:** 2026-09-22
**Status:** Archived on 2026-09-23; implemented or superseded, remaining verification deferred.

## Archive checkpoint — 2026-09-23

The replication/materialization implementation is present. Later actor ownership and scoped-validation work supersedes the binding-guard API and the prohibition on retained admission verdicts described below; see [Plan 003](./003-plan-actor-contracts-selections-and-guards.md) and [Plan 005](./005-plan-scoped-command-validation-and-yieldable-errors.md). Preserve applicable ordering, replication, and recovery invariants. Remaining verification is recorded in [TODOS.md](../../../TODOS.md#specs-001002004--deferred-verification).

Archived under the maintainer’s verification-only closeout instruction. No tests or builds were rerun for this archival; historical passing or failing results are not claims about the current checkout.

## Ownership

1. AC retains original aggregate commands and owns `aggregateIndex`. It validates authentication, authorization, submitted payloads, and duplicate identity. It stores no admission guard verdict or mutation intents.
2. VAR owns version-specific aggregate execution, pinned service replication, and one immutable combined output stream. VAC retains that stream by contiguous `materializationIndex`.
3. ActorVAR consumes only VAC and emits the existing selected stream. ActorVAC and browsers retain `selectionIndex`, private aggregate completion, and optimistic reconciliation.
4. Each aggregate version retains its own service pins. No shared AC pins, dynamic switching, mutable suffixes, projection revisions, or reset snapshots are introduced.

## Programs and binding guards

1. Portable contract versions own synchronous database-independent programs, payload up/down adaptation, and failure codecs. Aggregate and service definitions bind them through `{ contract, guard? }`.
2. The optional synchronous guard receives decoded payload, authentication, proposed mutations, and captured replica resources. Owner execution services provide query-only local database access inside the command transaction, before applying mutations.
3. VAR holds its execution permit across program evaluation, resource preparation, and commit. VSR uses the same program/guard separation. Each command commits before preparation of the next.
4. Business rejection emits the normal terminal failed result with no mutations. Infrastructure failures preserve earlier committed commands and leave unfinished input retryable. Typed failures retain the executing contract version and codec described by Spec 002.
5. Session asynchronous admission preflight is removed. Synchronous optimistic staging and authoritative failed-result reconciliation remain.

## Materialization and replication

1. Each aggregate result and each newly consumed service occurrence allocates one `materializationIndex`, atomically with effective resource changes, source progress, and its outbox row.
2. Aggregate results retain their AC position and command provenance. Service entries retain original command identity, payload, service name, service version, and service position. Their delta includes only changes actually applied to enrolled replicas.
3. Failed, unrelated, and already-covered service occurrences still emit entries, with empty effective deltas. Committed source duplicates emit nothing; source gaps fail. Service entries never advance aggregate progress or aggregate disposition hashing.
4. Resource snapshots retain the VSR executed service position, not the resource’s last modification position. If a new snapshot precedes VAR’s retained source cursor, replay its missing bounded suffix before enrollment. If the snapshot is ahead, consume intervening occurrences normally while preserving the newer copy and tombstones.
5. Both entry kinds use the existing outbox and `drainAfter`. VAC accepts identical retries and rejects conflicts or materialization gaps. Aggregate-result lookup is independent of VAC pagination; execute and flush locate the exact aggregate result and its materialization position.

## Projection and recovery

1. ActorVAR owns no VSC subscriptions, service cursors, remote enrollment preparation, or preparation semaphore. It applies both entry kinds locally and checkpoints `materializationIndex` with the selected graph and output.
2. Service-derived actor commands have no aggregate completion owner.
3. Snapshot requests catch VAR up through bounded source positions, capture its materialization checkpoint, ensure publication through it, and catch ActorVAR up through that checkpoint. Selected resources and their cursor are captured transactionally before selected-output publication is awaited.
4. Recovery uses durable source cursors, immutable VAC history, exact outbox acknowledgements, and existing alarm leases. A crash after local commit retries the same materialization entry.
5. This is a hard fixed-schema cutover requiring empty affected storage. No compatibility aliases, translation migrations, or fallback decoders are permitted.

## Verification

1. Test snapshot-ahead enrollment, source delivery during fetching, late catch-up, newer copies, tombstones, empty deltas, duplicates, and gaps.
2. Test publication failure and identical retry without lost or duplicated output.
3. Test version-owned guards, rejection without mutations, committed-prefix reads, and database-independent programs.
4. Test aggregate recovery and bounded publication with interleaved service entries; preserve snapshot/reconnect and optimistic reconciliation through one selected stream.
5. Keep pre-existing build and test failures separate from failures introduced by this cutover.
