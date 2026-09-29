---
name: Actor command names
overview: 'Split AVR and AVC commands into aggregateCommands and serviceCommands sharing one executedIndex. Delete selectionIndex. Empty storage: no compatibility names.'
todos:
  - id: agents-rule
    content: Add the Working rules bullet in AGENTS.md that deletes cruft in the area being worked instead of renaming it.
    status: completed
  - id: split-executed-tables
    content: Replace AVR and AVC commands with aggregateCommands and serviceCommands. One head.executedIndex sequence. Fanout and the AVR outbox merge both tables by that index.
    status: completed
  - id: one-actor-position
    content: Rename selectionIndex and selectionHash to executedIndex and executedHash on the actor command, actorState, snapshot, session, and browser resume. Delete the duplicate checkpoint column.
    status: completed
  - id: split-commit
    content: Replace applyExecutedAggregateCommands and commitActorCommandTx with applyExecutedCommandsTx, commitAggregateActorCommandTx, and commitServiceActorCommandTx.
    status: completed
  - id: rename-fanout
    content: Rename projectionState to actorState and replicaFanoutQueue to executedCommandsFanoutQueue, including the service actor path's single-table queue.
    status: completed
  - id: docs
    content: Update glossary and architecture docs to the new names, and describe delivery as a page of fanout rows.
    status: completed
isProject: false
---

# Executed command tables

**Status:** Archived at the maintainer’s request after implementation in [PR #25](https://github.com/morgs32/zerospin/pull/25). Recorded verification results and remaining acceptance limitations are preserved below.

One `executedIndex` counts each executed aggregate command and each executed service command AVR appends. The actor command, snapshot, session, and WebSocket resume use that same number. Delete `selectionIndex`. Do not add `actorIndex`.

`aggregateIndex` stays the aggregate-command watermark. Each pinned service keeps `services.lastIndex`. Service actor commands keep `serviceIndex` and `serviceHash`.

Empty storage. No compatibility aliases, decoders, or dual columns.

## Tables

Replace the wide `commands` table in [aggregateVersionRepoDbConfig.ts](packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts) and [aggregateVersionChainDbConfig.ts](packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts).

- `aggregateCommands` stores an executed aggregate command. Primary key `executedIndex`. `aggregateIndex` stays unique. Drop `kind` and the service columns.
- `serviceCommands` stores an executed service command. Primary key `executedIndex`. Keep `serviceName`, `serviceVersion`, and `serviceIndex`. Drop `kind` and the aggregate identity columns.
- `head.materializationIndex` becomes `head.executedIndex`. It allocates the next value for whichever table the commit writes. `head.aggregateIndex` and `head.dispositionHash` stay.
- AVR's two command tables keep `deliveredAt` and `lastDeliveryFailure`. AVC's copies do not; AVC is retained history, not an outbox.

`decodeMaterialization` goes away. A page row already comes from one of the two tables.

## Fanout and outbox

[makeFanoutQueue.ts](packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts) and [makeOutboxQueue.ts](packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts) stay single-table for every other queue. AVR and AVC pass a page reader that merges these two tables.

The subscriber cursor stays one number, the last acknowledged `executedIndex`. The reader loads both tables where `executedIndex` is greater than that cursor, merges by `executedIndex`, and returns at most 64 rows. `lastIndex` is the greater maximum of the two tables. A subscriber at 1 next receives service command 2, aggregate command 3, and service command 4.

The AVR outbox drain uses the same merge and only includes rows whose `deliveredAt` is null, so aggregate command 3 cannot leave before service command 2. [receiveExecutedCommands.ts](packages/system-worker/src/AggregateVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts) inserts each row into the matching AVC table and treats an existing `executedIndex` in that table as a retry. [notifyServerActors.ts](packages/system-worker/src/ServerActorExecutionRepo/notifyServerActors.ts) wakes with `executedIndex`.

The actor-command outbox stays one table.

## Actor projection

[aggregateActorVersionRepoDbConfig.ts](packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.ts): `projectionState` becomes `actorState` with `aggregateIndex`, `executedIndex`, `executedHash`, and `aggregateVersion`. Delete the second cursor. The `commands` primary key becomes `executedIndex`, and `selectionHash` becomes `executedHash`.

[applyExecutedAggregateCommands.ts](packages/system-worker/src/AggregateActorVersionRepo/applyExecutedAggregateCommands/applyExecutedAggregateCommands.ts) becomes `applyExecutedCommands`. The transaction becomes `applyExecutedCommandsTx`. It calls [commitAggregateActorCommandTx](packages/system-worker/src/AggregateActorVersionRepo/commitActorCommandTx/commitActorCommandTx.ts) for an aggregate row and `commitServiceActorCommandTx` for a service row. An aggregate row with no completion owner still uses the aggregate function. Stored `failure` stays null unless this actor's frontend owns that command. Both functions hash the real disposition through `advanceExecutedHash`.

[selectionDispositionHash.ts](packages/system-worker/src/selectionDispositionHash/selectionDispositionHash.ts) becomes `executedDispositionHash.ts`: `genesisExecutedHash`, `advanceExecutedHash`, preimage `zerospin.executed.disposition.v1`.

Rename the same fields through [types.ts](packages/core/src/aggregateSession/types.ts), [AggregateActorCommandSchema.ts](packages/core/src/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts), session tables, and [bootstrapAggregateFrontendSession.ts](packages/frontend/src/bootstrapAggregateFrontendSession.ts).

## Other names

- `replicaFanoutQueue` becomes `executedCommandsFanoutQueue` on AggregateVersionChain and ServiceVersionChain. The subscriber method becomes `executedCommandsFanoutQueueSubscriber` on both actor repos. `replicaSubscribers` becomes `executedCommandsFanoutSubscribers`. The service chain still pages one `commands` table by `serviceIndex`.
- Service actor `projectionState` becomes `actorState` and still stores `serviceIndex`, `serviceHash`, and `serviceVersion`.

## AGENTS.md

Add this bullet under Working rules in [AGENTS.md](AGENTS.md). It overrides "Stay within the requested scope" for cruft in the work at hand. It does not license an unrelated rewrite.

- Take initiative to make this repo more obvious. In the area you are working, remove redundancy and bloat: duplicates, unused paths, and names that hide what the thing is. Delete that cruft. Do not rename it and keep it, and do not explain it as a second concept.

## Docs and tests

Update [admitCommands.md](wiki/architecture/server/admitCommands.md), [serviceExecution.md](wiki/architecture/server/serviceExecution.md), and the `selectionIndex` / `selectionHash` glossary entries. Call a delivery batch a page of fanout rows.

Extend the existing materialization, actor-repo, and session specs to cover a merged page, an outbox drain that respects interleaving, and browser resume on `executedIndex`. Do not add compatibility tests.

## Patterns review — 2026-09-23

Reviewed with `use-morgs32-wiki-patterns`: scoped execution, module paths matching primary exports, and the local fanout, complete-occurrence retention, actor-projection ownership, and empty-storage rules. This is PR 5, based on `codex/system-owned-runtime` (PR 23).

1. Current source confirms a wide nullable `commands` table in both AVR and AVC, `head.materializationIndex`, and two ActorVAR cursors (`materializationIndex` and `selectionIndex`). This is a storage/protocol cutover across Core, frontend, React, worker, and DevTools, not a mechanical name change. Collapse the two actor cursors into the source `executedIndex`; every source row, including a service row or empty selected delta, produces exactly one actor output at that position.
2. Preserve complete aggregate/service occurrences in their respective source tables. Their row schemas identify which commit path applies; do not retain `kind`, nullable columns belonging to the other command family, an alias table, or `decodeMaterialization`. Actor output remains the existing minimal selected occurrence; do not expose source payloads or private failures through the new table union.
3. Queue factories currently derive row/index types and page/acknowledgement SQL from one table. Add the narrow typed reader/storage hooks needed for AVR/AVC merged pages while keeping existing single-table call sites and their inferred row types. No parallel custom delivery engine. Preserve subscriber acknowledgement, fixed catch-up destinations, alarm ownership, retained failures, semaphore ownership, and outbox retry behavior. Outbox acknowledgement and failure updates must target both source tables for the actual delivered page.
4. The merged reader takes each table's bounded suffix, merges in `executedIndex` order, then limits the result to 64. `lastIndex` is the committed tip across both tables, independently of any requested upper bound. The outbox filters undelivered rows before merging. Verify pages crossing the table boundary and the 64-row boundary, a service/aggregate/service sequence, interrupted delivery, and retry without skipped rows.
5. AVC reception must preserve contiguous global executed positions and aggregate-only disposition history. Check both tables for global index conflicts before appending; an existing row is a retry only when it is the same retained occurrence. Keep per-service `lastIndex` and aggregate `aggregateIndex` semantics separate from the unified executed position.
6. Split aggregate/service actor commits as specified. Hash the actual source disposition even when failure is hidden from this frontend; store failure only for its completion owner. Update snapshot capture, durable output publication, journal/session reconciliation, resume validation, and hash preimage together. Service actor state keeps `serviceIndex`/`serviceHash`.
7. Rename primary module directories, exports, callers, tests, and current docs in the same cutover. Preserve historical archived documents as history. Update applicable local fanout/projection guidance to describe the split source tables and one actor position. Add the requested Working rules bullet exactly; it authorizes cleanup within this work, not unrelated repair.
8. Verify with the affected Nx target graph and focused materialization, queue, actor-output, session, snapshot, and resume cases. The parent has 27 worker Node failures, a Date/string recovery assertion failure, and a production Workerd fixture-import startup failure (documented in PR 23); compare touched failing tests against those known causes rather than labeling new failures pre-existing. No Shopping browser verification.

Implementation order within this PR: source tables and typed merged storage readers; AVR/AVC writes and deliveries; actor state/commit/hash cutover; Core/browser resume and consumer migration; current docs and focused verification. Fixed storage must be empty; no migration or compatibility path is part of this plan.

## Implementation and verification — 2026-09-24

- Replaced AVR/AVC wide rows with complete `aggregateCommands` and `serviceCommands`, sharing `executedIndex`. The merged reader preserves global order and the 64-row bound. Existing queue engines own retry, acknowledgement, and alarms through narrow storage hooks.
- AVC validates row families, contiguous positions, exact retries, cross-table conflicts, and aggregate-only disposition continuity. Actor projection emits one output at the source position, uses separate aggregate/service commit functions, and hashes the real source failure while retaining completion privacy.
- Migrated actor state, snapshots, session journals, WebSocket resume, React mock/standalone genesis hashes, DevTools, and current architecture/pattern/glossary docs. The requested AGENTS.md rule is committed. No compatibility or migration path remains.
- Core session tests: 29 passed. React tests: 18 passed. The frontend independent-position/reconnect/duplicate-delivery test passes. The full frontend suite's 19 failures were reproduced on parent PR 23; pending-command socket scenarios fail in the pre-existing savepoint path, and other failures concern RPC context or old fixture identity fields.
- Worker Node suite: 256 passed, 26 failed. Exact failure-name comparison against PR 23 confirms no new failures and one resolved exact-retry failure. The additional failed-disposition privacy case passes separately. Focused tests cover merged pages across 64 rows, bounded global tip, fanout acknowledgement, interrupted outbox retry, rows appended during delivery, actor projection, and scoped admission.
- Core, Frontend, and System Worker Nx typechecks and lint targets pass (existing lint warnings remain). React, DevTools, and Tic-Tac-Toe typechecks passed in the consumer graph. Shopping typecheck remains blocked by three pre-existing missing test-fixture imports. Nx Cloud reports an authorization warning; local task execution still completes.
- Fixed-schema storage must be empty. No storage was deleted and no Shopping browser verification was performed.

- Workerd verification across actor chain/repo, pinned-service recovery, and selected reconciliation: 11 passing cases and 2 unchanged parent failures. The parent run reproduced both live-admission receipt failures. The migrated zero-cursor genesis and sorted-field fixtures now exercise replay successfully; both pinned-service cold-recovery/enrollment cases pass.
