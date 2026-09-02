# Singular command chains

**Date:** 2026-08-31
**Status:** Approved for implementation

## Problem Statement

Zerospin currently represents command execution and projection delivery as
blocks containing command arrays. The same command is then copied through
staged, pushed, executed, and failed lifecycle shapes and tables. That model
mixes three independent concerns:

1. The durable order in which commands enter a domain.
2. The one-time materialization of one command against state.
3. The projection delta produced by that one command.

It also makes fanout acknowledgements look like execution retries, requires
batch reconciliation at every boundary, and obscures which ordered history
owns each index.

## Solution

Hard-cut every command and projection ledger to a singular command chain. One
chain occurrence contains one complete command, its chain-owned index, its
append timestamp, and its pending or terminal result. Arrays remain only as
bounded archive pages returned by `getCommands()` during catch-up.

The resulting topology is:

```text
AggregateCommandChain -> MaterializedAggregateRepo
ServiceCommandChain -> MaterializedServiceRepo

AggregateFrontendPushedCommandChain -> MaterializedAggregateFrontendRepo
AggregateCommandChain -> MaterializedAggregateFrontendRepo
MaterializedAggregateFrontendRepo -> AggregateFrontendFinalizedCommandChain

ServiceCommandChain -> MaterializedServiceFrontendRepo
MaterializedServiceFrontendRepo -> ServiceFrontendFinalizedCommandChain
```

The names `Block`, `Blockchain`, batch, and plural command methods no longer
describe a domain persistence or delivery boundary.

## Chained Command Contract

`IChainedCommand<COMMAND, DELTA>` is a flat intersection of the complete
command and these chain fields:

```ts
type IChainedCommand<COMMAND, DELTA> = COMMAND & {
  readonly chainedAt: Date
  readonly delta: DELTA | null
  readonly failedAt: Date | null
  readonly failure: string | null
}
```

The concrete occurrence also carries exactly one index owned and named by its
chain. There is no generic `chainIndex`:

| Chain or replica history | Ordered index |
| --- | --- |
| `AggregateCommandChain` | `aggregateIndex` |
| `ServiceCommandChain` | `serviceIndex` |
| `AggregateFrontendPushedCommandChain` | `pushIndex` |
| `AggregateFrontendFinalizedCommandChain` | `frontendIndex` |
| `ServiceFrontendFinalizedCommandChain` | `serviceFrontendIndex` |
| SharedWorker replica commits | `replicaIndex` |
| Browser session commits | `sessionIndex` |

The three valid occurrence states are structural:

1. Pending: `delta`, `failedAt`, and `failure` are null.
2. Successful: `delta` is non-null and contains only changes caused by this
   command; `failedAt` and `failure` are null.
3. Failed: `delta` is the target-specific empty delta; `failedAt` and
   `failure` are non-null.

There is no `status`, `mode`, `commandType`, staged timestamp, pushed
timestamp, executed timestamp, cursor, or lifecycle wrapper. The complete
encoded command remains flat at every ledger, RPC, outbox, WebSocket, and
replica boundary.

Frontend-originated aggregate commands retain the flat provenance
`{ sessionId, userId, frontendName, pushIndex }`. Direct aggregate commands
carry null for those four fields. A service-derived aggregate occurrence
retains the complete source service command and flat `serviceIndex`
provenance; it does not nest another `IChainedCommand`.

## Delta Contract

`IResourceDelta` and `IFrontendDelta` each contain:

1. `inserted`, `updated`, and `deleted` changes for the target projection.
2. `mutations: readonly IEncodedAppliedMutation[]` for the exact command-local
   mutation journal.

The projection changes remain because a frontend may not yet contain every
aggregate resource. A command can introduce a newly selected resource, which
cannot be reconstructed from a mutation-only delta. The mutation journal
remains because active optimistic overlays must be reversed and replayed.

A failed occurrence has empty `inserted`, `updated`, `deleted`, and
`mutations` arrays. A successful no-op has the same empty delta but no failure
metadata.

## Public APIs

The public command surface is singular:

```ts
systemApi.finalizeAggregateCommand({ command })
systemApi.finalizeServiceCommand({ command })
aggregateFrontendApi.pushCommand({ command })
```

Each call returns the corresponding terminal `IChainedCommand` as its ordinary
result. Authored command failure is therefore data, not an RPC failure.
Authentication, argument decoding, transport failure, and unresolved
infrastructure failure remain RPC errors.

Materializers expose singular `execute(command)`. Their internal `catchup()`
pulls archive pages from the source chain. Each chain exposes `getCommands()`
with its chain-specific `after*Index` argument and returns:

1. At most 64 contiguous terminal commands after that index.
2. The chain tip observed for the page.

Pending occurrences are never returned as catch-up history.

## Chain Admission and Execution

Each source chain durably admits multiple pending commands but selects only its
head for dispatch. It assigns the next chain-owned index and `chainedAt` in the
same transaction that retains the complete canonical command bytes.

Admission is strictly idempotent by command identity and canonical bytes:

1. An identical terminal duplicate returns the retained terminal bytes.
2. An identical pending duplicate reports the retained pending occurrence and
   does not enqueue or execute it again.
3. The same command identity with changed bytes is a conflict.

Before dispatch, the chain durably pins the selected materializer generation
for that occurrence. Later generation changes cannot redirect an admitted
command.

The materializer persists an execution claim before authored code runs. The
claim and terminal result obey these rules:

1. No claim: persist the claim, then run authored code once.
2. Retained terminal result: return the retained bytes without running authored
   code.
3. Retained in-progress claim with no terminal result: halt the chain for
   explicit repair. Do not infer that authored code is safe to rerun.

After the materializer returns a terminal result, the chain atomically retains
that result, advances its terminal frontier, and selects the next pending head.
Delivery redrives may recover retained results; they never retry authored
execution.

## Catch-up and Fanout

Every materializer subscribes before its initial catch-up. A notification
carries one singular occurrence and the latest source tip. The materializer
handles it as follows:

1. Ignore an exact retained duplicate.
2. If the occurrence index is the next expected index, apply it once.
3. If the occurrence index has a gap, call `catchup()` repeatedly in pages of
   at most 64 through the immediately preceding index, then apply the notified
   occurrence.
4. Halt on a missing archive entry, conflicting duplicate, non-contiguous page,
   or source-tip contradiction.

This is anti-entropy, not retry: catch-up reconstructs missing terminal source
history; it does not rerun a command program.

Source fanout has at most one pending notification per subscriber. Additional
terminal commits coalesce that notification to the newest tip. Subscribers
pull every intermediate occurrence themselves. A subscriber acknowledges a
source occurrence only after atomically committing its local materialized
state and any durable finalized-command outbox created by that occurrence.
Publication from that outbox into an output chain continues asynchronously.

## Aggregate and Service Ordering

`ServiceCommandChain` terminalizes service commands in `serviceIndex` order.
`AggregateCommandChain`, not `MaterializedAggregateRepo`, owns subscriptions to
that chain. This gives direct aggregate commands and service-derived aggregate
work one serialized aggregate admission lane.

For every consecutive service occurrence:

1. Advance the aggregate chain's retained `serviceIndex`, even when the
   service resource is irrelevant to that aggregate.
2. If no existing replicated aggregate resource is affected, append no
   aggregate occurrence and consume no `aggregateIndex`.
3. If an existing replicated resource is affected, append one derived
   aggregate occurrence at the next `aggregateIndex` before later direct
   aggregate work continues.

When a direct aggregate command first adds a replicated service resource, the
materializer catches existing replicas up through a captured service frontier
before applying that direct command. The new subscription starts at that
frontier; historical service commands are not replayed into the newly added
resource.

## Aggregate Frontend Push and Finalization

`AggregateFrontendPushedCommandChain` admits one complete frontend command,
assigns `pushIndex`, and delegates its optimistic server-side materialization
to `MaterializedAggregateFrontendRepo`. `pushCommand()` waits for and returns
the terminal pushed occurrence.

A successful pushed occurrence creates a durable outbox entry addressed to
`AggregateCommandChain`. Forwarding continues asynchronously and preserves the
full command plus `{ sessionId, userId, frontendName, pushIndex }` provenance.

`MaterializedAggregateFrontendRepo` also consumes aggregate terminal history.
For every aggregate occurrence relevant to its projection it:

1. Rewinds active optimistic overlays.
2. Applies the authoritative aggregate command-local delta.
3. Resolves the exact originating `pushIndex` when present.
4. Replays all unresolved optimistic overlays in `pushIndex` order.
5. Atomically commits the authoritative base, active mutation/inverse journal,
   source frontiers, and a finalized-command outbox.

The outbox stores the authoritative base delta, never the net visible delta
after optimistic replay. The originating `pushIndex` always produces a
finalized occurrence, including a successful empty delta or a failed
aggregate command. Frontends unrelated to an aggregate occurrence remain
sparse and emit nothing.

`AggregateFrontendFinalizedCommandChain` publishes those authoritative
frontend occurrences in `frontendIndex` order. The frontend WebSocket streams
one singular finalized occurrence per message.

## Service Frontend Finalization

`MaterializedServiceFrontendRepo` subscribes to `ServiceCommandChain`, catches
up gaps by `serviceIndex`, and atomically commits its projection plus a durable
finalized-command outbox. Irrelevant service commands advance its source
frontier without consuming `serviceFrontendIndex`. Relevant commands publish
through `ServiceFrontendFinalizedCommandChain` in
`serviceFrontendIndex` order.

Service frontends have no pushed chain or optimistic overlay.

## Browser Replicas and Recovery

Aggregate and service browser commits are singular replica-indexed
`IChainedCommand` values. The existing AggregateFrontendReplicaRepo and
ServiceFrontendReplicaRepo remain the browser persistence owners; no new
coordination Durable Object or transport is introduced.

An aggregate frontend subscribes before recovery and buffers live
notifications. It then reconstructs state in this order:

1. Apply `AggregateFrontendFinalizedCommandChain` through its retained tip to
   rebuild the authoritative base and resolved `pushIndex` set.
2. Apply successful occurrences from
   `AggregateFrontendPushedCommandChain` whose `pushIndex` is unresolved,
   rebuilding their mutation inverses.
3. Replay unresolved local commands in `replicaIndex` order.
4. Persist both source frontiers, the replica frontier, materialized resources,
   full active commands, forward mutations, and current inverses before opening
   admission and fanout.
5. Start pushing unresolved local commands only after reconstruction commits.

`sessionIndex` remains the per-session idempotency key; `replicaIndex` orders
SharedWorker materialization. Equal-index duplicate delivery requires identical
canonical occurrence bytes. A changed duplicate or index gap enters repair.

Existing transport roles remain unchanged:

1. `pushCommand()` returns the terminal pushed occurrence.
2. Bootstrap and repair pull pushed history.
3. The frontend WebSocket streams singular finalized occurrences.
4. There is no pushed WebSocket or multiplexed replacement transport.

## Persistence Cutover

Delete domain block tables, block messages, block archive rows, and
lifecycle-partitioned staged, pushed, executed, and failed command tables.
Persist instead:

1. Full encoded singular source and finalized commands.
2. Chain-specific pending, execution-claim, terminal, source-frontier,
   subscriber-tip, and outbox state.
3. Active browser and projection mutation/inverse journals.

This is a clean-state pre-release cutover. Disposable local and test state must
be reset. Add no aliases, fallback decoders, dual reads or writes, legacy
columns or tables, compatibility migrations, or lifecycle translation layers.
Do not reset shared, remote, or production-like state without explicit human
approval.

## Reused Primitives

Reuse the existing archive paging, durable outbox, delivery queue, and fanout
queue primitives after changing their delivered unit from a block to a
singular command. Do not add a generic chain coordinator, a second transport,
or a routing layer between a named chain and its named materializer.

## Acceptance Seams

1. `IChainedCommand` schemas accept pending, successful, and failed singular
   occurrences, preserve mutation journals, and reject legacy status, block,
   cursor, timestamp, and array shapes.
2. Chain tests prove consecutive indexing, head-at-a-time queueing, canonical
   byte idempotency and conflicts, execution claims, retained results,
   in-doubt halting, multi-page catch-up, and coalesced fanout.
3. Aggregate frontend tests prove singular push and finalization, exact origin
   resolution, finalized-first recovery, A/B/C rollback and replay, successful
   empty finalization, failure finalization, and resources newly entering a
   projection.
4. Service tests prove sparse aggregate propagation, irrelevant source-frontier
   advancement, relevant derived aggregate ordering, and sparse service
   frontend finalization.
5. SharedWorker tests prove finalized-then-pushed-then-local reconstruction,
   exact duplicate handling, singular live delivery, pushed history repair,
   and no replay of resolved optimism.
6. Shopping tests prove direct aggregate finalization, direct service
   finalization, and optimistic-to-authoritative aggregate frontend behavior
   end to end.

All package scripts and validation run through Nx targets.

## Documentation Cutover

1. Rename `wiki/architecture/Blockchain.md` to CommandChain terminology and
   update every inbound link.
2. Replace block and plural-command workflows in SystemApi, push/finalization,
   frontend WebSocket, overview, glossary, and inspection documentation.
3. Rewrite `wiki/dev/diagrams/KappaArchitecture.md` around the approved
   CommandChain/materialized-Repo topology.
4. Delete obsolete aggregate/service block sequence pages rather than retaining
   historical terminology as current architecture.

## Out of Scope

1. A generic event-sourcing framework or coordination service.
2. A new frontend transport, pushed-command WebSocket, or multiplexed stream.
3. Rerunning authored code after an in-doubt execution claim.
4. Compatibility with command blocks, batch APIs, lifecycle-partitioned
   persistence, or existing disposable databases.
5. Resetting shared, remote, or production-like state.
