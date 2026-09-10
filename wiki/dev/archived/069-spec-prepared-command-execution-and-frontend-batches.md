# Prepared command execution and frontend batches

> Implementation decisions were revised in [Plan 069](./069-plan-prepared-command-execution-and-frontend-batches.md): VMAR owns preparation, VAFC owns versioned terminal history, VMARR owns per-command projection, and VFFC owns published browser output. Parallel VMAR flushes compare cutover checkpoints; direct retries select the current base. The plan supersedes conflicting topology and admission language below.

**Date:** 2026-09-06
**Status:** Approved design; implementation tracked in
[Plan 069](./069-plan-prepared-command-execution-and-frontend-batches.md).

## Problem Statement

Aggregate command preparation, execution, frontend guards, and frontend
projection currently cross several overlapping ownership boundaries. ACC
constructs mutations but retains only captured replication mutations; VMAR
constructs mutations again. Execution-local clocks and runtime dependencies
prevent identical replay inputs from guaranteeing identical results.

Frontend guards need the selected frontend database, but making VMAR ask another
Durable Object to run a guard would split authoritative execution around an RPC.
The completed workerd spike establishes a local alternative: real in-memory
sql.js SQLite with Drizzle, initialized before execution, supports synchronous
snapshot installation and guard queries.

Frontend projection also needs the full aggregate source state to discover
resources entering a selection through relationships. Sending one full selected
snapshot per command unnecessarily multiplies graph copies. Browsers need net
view changes, their own command resolutions, and progress—not every unrelated
aggregate command.

## Solution

ACC prepares each command once and stores its immutable mutations and inputs in
one `commands` table. VMAR runs both guards locally, applies those mutations,
and reports every command's result to ACC through a bounded delivery outbox.

Each user/frontend view has its own FrontendBatchChain (FBC),
VersionedMaterializedAggregateReplicaRepo (VMARR), and MaterializedFrontendRepo (MFR). FBC is an ACC
fanout subscriber and owns two single-destination outboxes plus a browser replay
log. VMARR maintains a full aggregate replica and produces selected snapshots. MFR maintains only the
committed selected graph and produces frontend deltas. Browsers own optimism.

```text
Browser -- AggregateFrontendApi --> ACC.commands
                                      |
                               admitted occurrences
                                      v
                                     VMAR
                                      |
                                 result outbox
                                      v
                                 ACC.commands
                                      |
                              finalized occurrences
                                      v
                                  FBC.batches
                                      |
                                outbox to VMARR
                                      v
                                     VMARR
                                      |
                                snapshot outbox
                                      v
                                 FBC.snapshots
                                      |
                                outbox to MFR
                                      v
                                     MFR
                                      |
                                 delta outbox
                                      v
                                  FBC.deltas
                                      |
                           PartyServer / WebSocket replay
                                      v
                                   Browser
```

FBC inserts rows and kicks off the corresponding `drain()`. It does not execute
commands, compute selections, or schedule a batch through the entire pipeline.
Each materializer owns its local transaction, cursor, and output outbox.

## User Stories

1. As a frontend caller, I receive a durable admission receipt without waiting
   for command execution or frontend projection.
2. As a command author, I can generate mutations, resource IDs, dates, and
   external resource inputs once; subsequent execution uses those exact values.
3. As an aggregate author, my aggregate guard and the originating frontend's
   guard decide a command against the preceding committed aggregate state.
4. As a frontend guard author, I query a real selected Drizzle database without
   needing a remote materialized view or a simulated query implementation.
5. As an operator, I can retry or resume delivery after a crash without
   re-executing committed commands or keeping an infinite result journal in VMAR.
6. As a user of one frontend view, my projection work is handled by its own
   replica instead of making VMAR compute every view's updates.
7. As a browser client, I receive the net change for a projection batch and the
   resolutions of commands originating from my user/frontend view.
8. As a disconnected browser, I can resume from a durable frontend cursor and
   learn aggregate progress without receiving unrelated command payloads.
9. As a projection subscriber, I can retry a suffix containing old and new
   commands without changing previously admitted batch boundaries.
10. As an operator, I do not retain one complete selected graph per historical
    batch after MFR has durably consumed it.

## Implementation Decisions

### Ownership and identity

1. ACC remains keyed by `{ systemId, aggregateId, aggregateName }`. VMAR adds
   `aggregateVersion`. ACC's version registration and execution selection supply
   that version; it is not an authenticated identity field.
2. FBC, VMARR, and MFR each use the view fields `{ systemId, aggregateId,
aggregateName, userId, frontendName }`, with separate Repo kinds. There is one
   VMARR and one MFR per FBC/view. In the frontend API path, Worker configuration
   supplies `systemId`, authentication supplies `userId`, and the caller-selected
   aggregate/frontend target is authorized and bound by AggregateFrontendApi.
   Internal subscriptions propagate those bound fields rather than accepting a
   different viewing identity from a delivered command.
3. The originating command's user/frontend identifies which frontend guard VMAR
   runs. Other views affected by that command do not get to approve it. VMARR's
   viewing user/frontend instead identifies the projection it produces.
4. Replace MaterializedAggregateFrontendRepo's combined responsibilities with
   VMARR and MFR. VMARR holds full aggregate source state; MFR holds selected,
   projected frontend model rows. Both remain Durable Object Repos.
5. Rename the existing AggregateFrontendFinalizedCommandChain role to
   `FrontendBatchChain`. The intermediate proposed name `FrontendCommandChain`
   is superseded. Retain its PartyServer, authenticated connection, and browser
   replay responsibilities while changing the wire unit to a frontend batch
   result.
6. Remove AggregateFrontendPushedCommandChain from this aggregate submission
   path. AggregateFrontendApi submits directly to ACC. There is no server-side
   optimistic execution or pushed-chain receipt stage.

### ACC preparation and admission

1. Use one `commands` table for admitted and finalized occurrences. The admitted
   command, ordered prepared mutations, preparation version, and execution
   inputs are immutable. Finalization adds the canonical result to that same
   occurrence; it does not replace or regenerate its prepared inputs.
2. ACC resolves the contract and applicable frontend-to-aggregate payload
   adaptation and runs contract mutation construction once. It resolves
   replication resource captures and persists the complete encoded mutation
   instructions, including generated resource IDs and dates.
3. ACC chooses and persists the command's execution timestamp. Mutation
   `appliedAt` and generated resource timestamps use that value. Dates embedded
   in authored mutation attributes are also fixed during preparation. Captured
   resource values retain their source timestamps. Freezing inputs does not lock
   the external service resource against later changes.
4. Preparation uses the base aggregate version selected for that admission
   attempt and records it with the mutations. A subsequent base cutover does
   not rerun the contract or reinterpret those mutations by reconstructing them.
5. Definitive payload, contract, or preparation failures reject before durable
   admission and consume no aggregate index. The browser resolves optimism from
   that definitive response. Transient preparation or transport failures remain
   retryable; an uncertain response is not proof that admission failed.
6. Admission atomically allocates the next aggregate index and persists the
   complete occurrence. The frontend submission RPC returns its receipt and
   aggregate index after this commit. Repeating the same command identity and
   content returns the same admission; conflicting content is rejected. A
   concurrent retry must not overwrite the winning attempt's prepared values.
7. Preserve full command occurrences and their provenance throughout admission,
   internal fanout, and output outboxes. Filtering whole irrelevant occurrences
   at the browser boundary does not authorize stripping fields from retained or
   delivered occurrences.
8. ACC's VMAR fanout can deliver admitted occurrences. Its FBC fanout delivers
   only the contiguous finalized prefix, stopping at the first unresolved
   occurrence even if later rows exist in the same table. Finalization must
   wake that fanout even when the table's highest aggregate index did not change.

### VMAR execution order

1. Initialize the in-memory SQLite engine before entering synchronous command
   execution. Use the real sql.js/Drizzle approach proved in workerd, with a
   bundled WASM module. Do not emulate Drizzle queries or fetch WASM during an
   execution transaction.
2. Serialize mutation of each VMAR locally. Concurrent admissions and duplicate
   delivery requests are supported; aggregate state cannot advance through two
   overlapping executions concurrently.
3. For command N, start from that VMAR's committed preceding state. Run the
   aggregate guard first. If it passes and the command has an originating
   frontend, derive that frontend's selected/projected graph and populate the
   in-memory frontend database. Run the frontend guard against that database.
4. Both guards and the frontend selection come from the executing VMAR's
   aggregate version. The preparation version records how mutations were made;
   the execution version determines their checks and application semantics.
5. Guards use committed aggregate state, the persisted command inputs, and
   deterministic code. They cannot observe frontend optimism, a fresh clock,
   fresh random IDs, live external fetches, or mutable runtime capabilities that
   change the decision between attempts. Any required nondeterministic value
   must have been frozen during preparation.
6. Only after both applicable guards pass does VMAR apply the prepared mutations.
   A domain guard/application rejection rolls back that command's resource
   changes, records failure, and advances past the occurrence. It does not stop
   later commands in the batch. Storage/runtime failures abort the transaction
   and retry rather than becoming authored command rejections.
7. Execute a contiguous batch in one local transaction, with command-local
   rollback boundaries. Atomically commit aggregate state, the execution cursor,
   and an outbox containing every command's ordered terminal occurrence. There
   is no MFR RPC inside execution and no durable pending-guard barrier.
8. Terminal occurrences include their prepared mutations, success/failure
   disposition, failure information when applicable, execution version, and
   existing disposition-hash information. Do not compute aggregate resource
   deltas for delivery along this path. MFR produces the frontend delta later.
9. As in the existing version model, disposition hashes compare execution
   outcomes; they are not proof of identical resulting resource state. Candidate
   versions may differ in their guard/application outcomes without regenerating
   mutations. VMARR is a replay replica, not another candidate executor.

### VMAR result delivery and bounded retention

1. VMAR independently drains its terminal-result outbox to ACC after committing.
   ACC durably accepts results idempotently before acknowledging. Base results
   finalize the corresponding command rows; candidate results remain subject to
   version validation and cannot overwrite canonical base results.
2. VMAR deletes acknowledged outbox rows. A lost acknowledgement causes
   redelivery, not re-execution. ACC must not hold a blocking critical section
   while awaiting an execution response that depends on its result receiver.
3. Permit at most one undelivered execution batch per VMAR. Until its outbox is
   drained, VMAR pauses new execution while ACC can continue admitting commands.
   Retained output is bounded by the delivery batch, not total command history.
4. Remove the proposed `ackThrough`, implicit next-batch acknowledgement, and
   retained-result-array protocols. `execute()` does not need to reconstruct
   historical results for a late retry after outbox deletion; ACC owns them.
5. Already-executed overlap is not applied again. Future gaps are rejected.
   Cursor advancement and outbox persistence must make a retry after a lost RPC
   response indistinguishable from normal redelivery of committed work.

### Prerequisite: table-driven outbox factories

1. Phase 1 of the implementation plan refactors `makeOutboxQueue` in the mold of
   `makeFanoutQueue`: pass a Drizzle table, infer its row type, and let the
   factory own ordered bounded reads, pending checks, retries, acknowledgement,
   failure recording, and alarm/readiness integration.
2. Pair it with `makeOutboxSubscriber`, which exposes a typed `receive(rows)`
   RpcTarget and acknowledges only after the receiver's durable work. Sender and
   receiver Repos use `IOutboxRepo<'queueName'>` and
   `IOutboxSubscriberRepo<Sender['queueName']>` with the existing queue-getter
   conventions.
3. Bind exactly one destination at queue construction. Do not introduce an
   outbox subscriber table, a `subscribe()` RPC, or row-dependent target routing.
4. Support retaining acknowledged rows when they are history and deleting them
   when they are disposable delivery records. Verify this primitive separately
   before applying it to the domain pipeline.

### FBC's two outboxes and browser replay log

1. `batches` is populated by ACC's finalized-command fanout subscriber. FBC
   atomically removes already-admitted overlap, admits only the new contiguous
   tail as one batch, and advances its source admission cursor before returning
   success. Exact retries with no new tail admit nothing. Its single-destination
   outbox delivers to the paired VMARR and retains acknowledged batch rows as
   input history.
2. Fanout deliveries supply the batch boundaries; FBC has no independent batching
   scheduler. A retry may contain a previously admitted prefix plus newer
   commands. Existing batches retain their boundaries and contents; only the
   new tail receives a new batch identity/index. Gaps and conflicting overlap
   must not be silently accepted.
3. `snapshots` is populated by VMARR's output outbox. Each row identifies one
   admitted FBC batch, its processed-through aggregate index, and the complete
   selected frontend graph at that position. Its outbox delivers to the paired MFR together
   with that batch's complete terminal occurrences from `batches`, so MFR can
   select originating-command resolutions without reconstructing provenance or
   reading a newer source position.
4. `deltas` is populated by MFR's output outbox. Its durable rows contain the net
   frontend delta, relevant originating-command resolutions, and processed
   progress. This is FBC's third delivery stage and the source of browser replay;
   it is not a single-destination outbox whose rows disappear on a browser send.
5. Each incoming publication inserts its row idempotently and kicks off the
   corresponding `drain()`. Duplicate publication cannot allocate another batch
   or frontend position. Changed output for an already accepted batch is a
   conflict, not a replacement.
6. ACC-to-FBC remains `makeFanoutQueue` / `makeFanoutSubscriber`. FBC-to-VMARR,
   VMARR-to-FBC, FBC-to-MFR, and MFR-to-FBC use the table-driven outbox pair from
   Phase 1. Repo-to-Repo acknowledgement follows durable consumer work. The
   browser leg uses PartyServer/WebSocket delivery and cursor replay rather
   than requiring a browser to implement a Repo RPC subscriber.
7. The three stages progress independently. Do not add a FBC-wide “one unfinished
   projection batch” gate or wait for browsers before allowing materializers to
   advance. Bounded fanout and outbox reads limit each delivery's work; they do
   not imply a global bound on durable downstream backlog.

### VMARR replay and selected snapshots

1. VMARR consumes admitted FBC batches in order. Replay each successful occurrence's
   prepared mutations using the finalizing VMAR's execution version. Skip resource
   application for rejected commands while advancing the source cursor.
2. VMARR does not run contracts or guards again, infer a new disposition, fetch
   external input, or materialize from VMAR deltas. A replay failure after VMAR
   succeeded is replica divergence and stops progress at that batch; it cannot
   rewrite the canonical command as rejected.
3. Replay an entire admitted batch and compute one complete selected/projected
   frontend graph from the resulting full aggregate state. Do not generate one
   selected snapshot per command or silently merge already-admitted FBC batches.
4. Atomically commit replica state, the consumed-batch cursor, and the resulting
   snapshot outbox. Drain the outbox to FBC independently. Retrying input cannot
   replay committed mutations or publish a different snapshot for the same batch.
5. VMARR knows its viewing user/frontend and selection definition, but it needs no
   knowledge of MFR's prior selected state. The snapshot includes unchanged
   resources that became reachable through selection relationships.

### MFR projection and browser results

1. MFR consumes full selected snapshots in order. Compare its committed old
   graph with the incoming graph to compute the net inserted, updated, and
   removed frontend resources. Absence from a snapshot removes a resource from
   the view; this is not necessarily deletion from the aggregate.
2. Atomically install the new graph, advance the consumed-batch/source cursors,
   and persist its frontend-result outbox. Acknowledge snapshot consumption only
   after that commit. MFR does not execute aggregate commands or maintain server
   optimistic mutations.
3. A result includes full terminal occurrences for commands originating from the
   same user/frontend view, including domain failures and successful no-ops.
   Other commands are represented by their net effect on the selected graph,
   not by unrelated command payloads. The net delta belongs to the batch, not
   artificially to one command within it.
4. Clients observe the net result of a batch. Intermediate graph changes may
   cancel each other—for example, a resource created and deleted in one batch.
   Originating command resolutions are retained even when their net graph
   effect is empty.
5. Keep source and frontend positions distinct. `aggregateIndex` identifies ACC
   occurrences; an FBC batch covers a contiguous source range. Browser replay
   uses a contiguous frontend-output cursor, while
   `processedThroughAggregateIndex` reports how far projection has processed.
   Browser-visible originating occurrences may have gaps in aggregate indexes.
6. Even an empty graph delta with no originating resolutions advances processed
   progress. The third stage can convey that as a watermark without sending the
   irrelevant command payloads. Persist progress before advertising it, and do
   not let a watermark overtake unapplied relevant frontend results.
7. FBC persists each frontend result before live WebSocket delivery. Reconnect
   and replay recover missed frames from the third table. The browser applies
   committed changes and originating resolutions together, then reconciles its
   remaining local optimistic commands; transport delivery alone is not a
   command resolution.

### Snapshot retention and recovery

1. Delete an FBC snapshot after MFR durably acknowledges installation and output
   outbox creation. Keep input batches and frontend delta/progress history for
   replay. Neither FBC nor VMAR keeps an infinite history of full snapshots.
2. Retain the durable consumer cursor when pruning snapshot payloads. Deleting
   acknowledged rows must not reset delivery progress or make old batches look
   unprocessed. A late duplicate snapshot publication must not resurrect a
   consumed graph merely because its payload row has been pruned.
3. Ordinary cold activation resumes VMARR/MFR state, cursors, and outboxes. A lost
   acknowledgement at any hop causes idempotent redelivery. Each owner's local
   commit is atomic; there is no distributed transaction spanning the DOs.
4. Coalescing reduces graph copies to one per batch. It does not establish a hard
   limit on one graph's size or on snapshots waiting for a stalled MFR. Streaming
   large snapshots, global backlog limits, and rebuilding deleted/corrupt Repo
   storage are not provided by this design.

### Hard cutover and scope

1. This is a replacement of the aggregate/frontend path, not a compatibility
   layer. Remove superseded server optimism, pushed-chain plumbing, duplicate
   aggregate delta materialization, and old protocol names in the implementation.
2. Reconcile Plan 068's last-command-only return and singleton retained-result
   assumptions with this spec's per-command terminal results and delivery
   outbox. Preserve the distinction between prepared version, executed version,
   canonical base result, and candidate validation.
3. Existing fixed-schema Repo rules still apply. Selecting an execution version
   does not authorize live physical-schema mutation. Changed physical schemas
   require a new systemId and empty storage; no remote/shared state reset is
   authorized by this spec.
4. Service command chains and service frontend delivery are not redesigned.
   Service-origin occurrences entering the aggregate path retain their existing
   provenance and captured source data. The ban on newly computed aggregate
   deltas does not authorize stripping fields from an upstream service occurrence.
5. Update the affected architecture documentation, glossary, patterns, callers,
   schemas, and tests with the eventual implementation. This document records
   target behavior; it does not claim the new topology exists at HEAD.

## Testing Decisions

1. The primary acceptance seam is submission through AggregateFrontendApi to
   observable FBC WebSocket/replay output, using real Durable Object fixtures in
   workerd. Exercise local browser replica application at the receiving edge so
   optimism resolution is observable. Prefer this seam over a separate mocked
   unit suite for every forwarding method.
2. Verify the admission-only response while execution is delayed; definitive
   pre-admission rejection; uncertain response retries; concurrent admissions;
   and unchanged prepared IDs, times, resource captures, and mutation order.
3. Verify aggregate guard before frontend guard, frontend queries against the
   preceding committed selection, guard/application rejection, mixed-result
   batches, and transaction rollback on infrastructure failure. Distinguish
   preparation and execution versions in the fixture.
4. Verify VMAR's per-command results, one-undelivered-batch bound, independent
   outbox delivery, lost responses/acknowledgements, and duplicate execution
   without repeated mutation application or an unbounded execution journal.
5. Verify finalized-prefix gating from ACC's single table, overlapping fanout
   retries admitting only the new tail, immutable batch boundaries, out-of-order
   rejection, and replay using canonical dispositions without rerunning guards.
6. Verify one selected snapshot per admitted batch, relationship-driven entries
   into a view, MFR's net comparison, changes that cancel within a batch,
   originating failures/no-ops, exclusion of unrelated command payloads, and
   watermark-only progress.
7. Interrupt each outbox boundary before/after commit and acknowledgement. Verify
   snapshot pruning only after MFR durability, no resurrection on late duplicate
   publication, and eventual delivery of a delta even after its snapshot was
   deleted. Verify one slow browser does not gate internal delivery.
8. Verify browser replay cursors, atomic committed-state/resolution application,
   duplicate frame handling, and continued local optimism for unresolved
   commands. A processed-through watermark must not skip relevant output.
9. Retain the completed [in-memory guard workerd spike](../../../packages/system-worker/src/inMemoryFrontendGuard.workerd.spec.ts)
   as the focused runtime seam, together with its
   [TypeScript check configuration](../../../packages/system-worker/tsconfig.inMemoryFrontendGuard.json).
   It proves synchronous snapshot installation, Drizzle filtering/join queries,
   guard success/rejection, timestamp fidelity, and replacement isolation after
   engine initialization. It is not a production performance benchmark.
10. Existing [fanout tests](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.node.spec.ts)
    and the [finalized-chain workerd fixture](../../../packages/system-worker/src/AggregateFrontendFinalizedCommandChain/AggregateFrontendFinalizedCommandChain.workerd.spec.ts)
    provide prior art for cursor/retry and durable publication checks. Update or
    replace superseded expectations; do not preserve the old protocol solely
    for its tests.
11. Phase 1 adds the focused outbox primitive seam: SQL-bounded reads, inferred
    row types, ordering, concurrent drains, retain/delete acknowledgement modes,
    and lost acknowledgements/redelivery across real sender/receiver RpcTargets.

## Out of Scope

1. Implementing this design, creating its implementation plan, or deploying it
   as part of writing this spec.
2. A fake Drizzle database, frontend-guard RPC coordination, or guards against
   optimistic frontend state.
3. Independent guard execution by VMARR, contract regeneration during replay, or
   one full snapshot per aggregate command.
4. An FBC scheduler, global pipeline transaction, explicit `ackThrough` protocol,
   or an infinite VMAR result journal.
5. Service frontend consolidation, protocol compatibility shims, automatic
   physical-schema migration, and destructive shared-state recovery.
6. Large-graph streaming, snapshot compression, throughput tuning, and a general
   retention policy for input batches or browser delta history.

## Further Notes

1. The sql.js spike passed in local workerd using statically imported WASM and
   synchronous execution after initialization; its focused TypeScript check
   passed without casts. Production bundle integration and resource costs still
   require validation during implementation.
2. The spike's ordinary Nx command was blocked by existing Core dependency build
   errors. Its focused workerd run passed with dependency tasks excluded. Do not
   treat that result as a clean whole-workspace build.
3. The earlier proposals for MAFRs independently deciding admitted commands,
   VMAR calling a remote frontend guard, next-request acknowledgements, direct
   VMARR-to-MFR delivery, FBC-wide batch gating, and multi-subscriber queues for
   FBC's paired materializers were superseded during design.
   The table-driven topology and execution order above are the agreed result.
