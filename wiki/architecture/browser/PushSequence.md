---
title: Aggregate Frontend Submission
updated: 2026-09-20
---

# Aggregate Frontend Submission

Server execution starts in VAR after AC admission. The browser owns optimism; SelectionVAR computes authoritative per-command view changes. A `stageCommand` result describes only the synchronous main-thread SQLite transaction. Backup persistence and backend admission continue asynchronously and are never part of staging success.

## Trigger

1. Local staging returns `Success` only after committing the complete occurrence, optimistic mutations, and inverse journal. A mutation-generation failure commits a failed occurrence and returns `Failure` with that occurrence in `command`; a failure before commit returns `Failure` without `command`. Both committed outcomes retain the asynchronous delivery handoff. Neither outcome waits for backup persistence or backend admission.
   - [`stageCommand.ts:159-214`](../../../packages/core/src/session/stageCommand.ts#L159-L214) — runs the local command transaction synchronously, then forks backend delivery independently after the encoded result exists. (`packages/core/src/session/stageCommand.ts:159-214`)

```mermaid
sequenceDiagram
  participant Browser
  participant AggregateSession
  participant AggregateChain
  participant SelectionVersionedAggregateChain
  autonumber 1
  Browser->>AggregateSession: stageCommand(...)
  Note over Browser,AggregateSession: Result reports the local SQLite commit only; backup and backend work remain asynchronous
  autonumber 2
  AggregateSession->>SelectionVersionedAggregateChain: socket.send(pushAggregateCommand)
  autonumber 3
  SelectionVersionedAggregateChain->>AggregateChain: chain.admitCommands(...)
  autonumber 4
  AggregateChain-->>SelectionVersionedAggregateChain: admission receipt
  autonumber 5
  SelectionVersionedAggregateChain-->>Browser: aggregateCommandAdmission
  autonumber 6
  SelectionVersionedAggregateChain-->>Browser: aggregateSelectedCommand
  autonumber 7
  Browser->>Browser: applyAggregateSelectedCommand(...)
```

## Annotated workflow steps

1. Local staging returns `Success` only after committing the complete occurrence, optimistic mutations, and inverse journal. A mutation-generation failure commits a failed occurrence and returns `Failure` with that occurrence in `command`; a failure before commit returns `Failure` without `command`. Both committed outcomes retain the asynchronous delivery handoff. Neither outcome promises that backup persistence or backend admission has completed.
   - [`stageCommand.ts:159-214`](../../../packages/core/src/session/stageCommand.ts#L159-L214) — completes and encodes the synchronous local transaction before launching the optional delivery Effect with `runtime.runFork`. (`packages/core/src/session/stageCommand.ts:159-214`)
2. The browser submits that complete occurrence over its retained live socket, after exact checkpoint validation and replay completion.
   - [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — Sends the full encoded session command.
3. SelectionVAC checks the retained connection, configured aggregate version, complete authentication, frontend name, system name, and selected contract before admitting the unchanged input.
   - [`onMessage.ts`](../../../packages/system-worker/src/SelectionVersionedAggregateChain/onMessage/onMessage.ts) — Returns only the assigned aggregate index and command ID.
4. AggregateChain returns its durable `{ aggregateIndex, commandId }` receipt.
   - [`admitCommands.ts`](../../../packages/system-worker/src/AggregateChain/admitCommands/admitCommands.ts) — retains the complete occurrence and recovers identical retries.
5. SelectionVAC returns the encoded domain result and optional telemetry link on the same socket. A matching admission receipt stops resubmission; it does not resolve optimism.
   - [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — Stores receipt progress in the journal while retaining optimistic mutation rows.
6. SelectionVAC retains and broadcasts a minimal selected command: opaque command ID, selection and aggregate positions, selected resource delta, private failure when this capability exactly owns completion, and `selectionHash`.
   - [`receiveSelectedCommands.ts`](../../../packages/system-worker/src/SelectionVersionedAggregateChain/receiveSelectedCommands/receiveSelectedCommands.ts) — validates the selected occurrence and its private owner metadata before retaining it and broadcasting the committed value.
7. The session rewinds optimism, applies `delta.upserted` and `delta.deleted`, completes the matching command ID, records its failure, and replays the remaining optimism in one transaction.
   - [`applyAggregateSelectedCommandTx.ts`](../../../packages/core/src/session/applyAggregateSelectedCommandTx.ts) — rejects gaps, ignores committed duplicates, and advances the aggregate and selection cursors after application.

## Synchronous staging and backup durability

`stageCommand` stays synchronous. Its return value reports the local SQLite
transaction; it is not an awaitable backup flush or a backend acknowledgement.
The optional delivery callback runs in a separate fiber after that local result
has been produced.

- [`stageCommand.ts:178-214`](../../../packages/core/src/session/stageCommand.ts#L178-L214) — obtains the encoded local result with `runtime.runSync`, then schedules optional delivery with `runtime.runFork`. (`packages/core/src/session/stageCommand.ts:178-214`)

Committed transactions enqueue their SQL statements for asynchronous backup and
set `backupState.status` to `pending`. After successful delivery, the backup lane
publishes `ready` only when its transaction queue is empty. A staging success
therefore does not by itself promise that an immediate refresh will restore the
change. Backup progress is observed separately through `backupState`.

- [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — installs the committed-transaction callback that marks backup work pending and enqueues statements.
- [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — drains statements asynchronously, repairs uncertain writes, and publishes readiness after the queue empties.

A later backup failure is reported through `backupState`; it does not change the
already returned staging result or undo the local commit.

- [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — handles revocation separately and records other backup failures on the session store.

## Ownership and execution identity

Local staging captures `sessionId` from the current session state and uses
that same ID for the occurrence and durable command position. Reacquisition
publishes a fresh execution ID, while retained journal occurrences keep their
original session ID, positions, and payload bytes. A superseded frontend rejects
new staging and submission; DevTools push controls resolve the current
ownership period each time they run.

- [`stageCommand.ts`](../../../packages/core/src/session/stageCommand.ts) — captures execution identity only after checking current session status.
- [`executeCommandTx.ts`](../../../packages/core/src/session/executeCommandTx.ts) — reads the durable next position for that captured ID in the command transaction.
- [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — fences push work by ownership period and returns controls that consult the current lane.
- [`makeSession.ts`](../../../packages/react/src/makeSession/makeSession.ts) — retains bootstrap control callbacks while moving DevTools registration between current execution IDs.
- [`makeAggregateSession.node.spec.ts`](../../../packages/core/src/session/makeAggregateSession.node.spec.ts) — verifies fresh session indexing, rejection while superseded, and unchanged original journal rows.

Unadmitted optimism replays in durable journal insertion order across execution
periods. Admitted occurrences retain `pushIndex` order. `sessionIndex` orders
commands within their original execution identity and does not reorder pending
commands from older periods.

- [`applyAggregateFrontendSnapshotTx.ts`](../../../packages/core/src/session/applyAggregateFrontendSnapshotTx.ts) — sorts admitted commands before unadmitted commands and uses SQLite row identity to retain cross-period insertion order.
- [`applyAggregateSelectedCommandTx.ts`](../../../packages/core/src/session/applyAggregateSelectedCommandTx.ts) — uses the same ordering before rewinding active optimism.
- [`applyAggregateSelectedCommandTx.ts`](../../../packages/core/src/session/applyAggregateSelectedCommandTx.ts) — reapplies surviving commands in admitted/insertion order after authoritative changes.
- [`makeAggregateSession.node.spec.ts`](../../../packages/core/src/session/makeAggregateSession.node.spec.ts) — preserves the latest optimistic update through snapshot and selected-command replay after execution indices restart.

## Reconnect

A published SelectionVAR snapshot carries `aggregateVersion`, selection cursor
`n`, and exact-owner `selectedCommands` for requested `pendingCommandIds`
through `n`. The browser installs `snapshot.resources` first, uses those
selected commands only to reconcile journal rows, retains unmatched optimism,
and then applies `bufferedSelectedCommands` strictly after `n`.

- [`getSnapshot.ts`](../../../packages/system-worker/src/SelectionVersionedAggregateRepo/getSnapshot/getSnapshot.ts) — captures resources and cursors together, awaits publication outside the execution semaphore, and reconciles `pendingCommandIds` through the captured selection position.
- [`applyAggregateFrontendSnapshotTx.ts`](../../../packages/core/src/session/applyAggregateFrontendSnapshotTx.ts) — records matching selected-command outcomes without reapplying their already-incorporated deltas, then replays surviving local optimism.
- [`frontendReplica.node.spec.ts`](../../../packages/system-worker/src/frontendReplica.node.spec.ts) — verifies private failure completion, surviving optimism, duplicate delivery, empty progress, and gap rejection.

## Receipt recovery

The browser sends the oldest journal row with `pushIndex IS NULL` and waits for
its matching receipt before sending another. Manual pause stops new sends while
selected output and the current receipt continue. Typed transient failures use
the existing retry schedule; terminal failures remain observable in `pushNow`.
A malformed or mismatched receipt closes the socket. Close or ownership release
fails the pending wait and interrupts automatic submission.

- [`bootstrapAggregateFrontendSession.ts`](../../../packages/frontend/src/bootstrapAggregateFrontendSession.ts) — owns the single pending Deferred, receipt validation, journal update, pause, and reconnect lifecycle.

If admission commits before the socket loses its receipt, the journal remains
unacknowledged. A newly history-validated socket resends the identical encoded
occurrence; AggregateChain returns the original receipt. A conflicting retry
fails. This recovery cannot roll back an already committed admission.

- [`admitCommandsTx.ts`](../../../packages/system-worker/src/AggregateChain/admitCommands/admitCommandsTx.ts) — compares retained bytes and recovers the assigned index for identical input.
