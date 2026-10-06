---
title: Versioned Service Execution and Delivery
updated: 2026-10-05
sources:
  - path: packages/core/src/contracts/make/makeOperations.ts
    sha: 71e161056ad3ff1614f996247d0c157b88578644
    lines: 1-189
  - path: packages/core/src/drizzle/make/makeTx.ts
    sha: 8c2efa8f1180de92bf6d3fb7c3531eae7bd5cfbc
    lines: 1-120
  - path: packages/system-worker/src/ServiceActorVersionChain/ServiceActorVersionChain.ts
    sha: a6a5bfad0a1544dd8007fd1258449b49fcce2522
    lines: 1-202
  - path: packages/system-worker/src/ServiceActorVersionChain/receiveBrowserCommands/receiveBrowserCommands.ts
    sha: b140fd343dc4f11bcc6d6c83d5cb642193581302
    lines: 1-87
  - path: packages/system-worker/src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts
    sha: f1e273526cbf9c3a3e4148f82654eff1194987b0
    lines: 1-182
  - path: packages/system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts
    sha: b68b2797d7c4cf8a91c9e896ff1a7ebe5bd51913
    lines: 1-268
  - path: packages/system-worker/src/ServiceActorVersionRepo/getSnapshot/getSnapshot.ts
    sha: af54f2239b738315a669aac8996b89e8d2e1cedc
    lines: 1-167
  - path: packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts
    sha: 47b90ab629ffdce8c2901d1a52a0e0458c4046c1
    lines: 1-94
  - path: packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts
    sha: da0b3ce608f365ed0c7e50c4688f8b1271f895f2
    lines: 1-233
  - path: packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts
    sha: 8299a996955406af4bee21feddbb1d75a80fa2ea
    lines: 1-389
  - path: packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommands.ts
    sha: 16ad9ebb93241020f412a764ca9bd049d661ff2b
    lines: 1-281
  - path: packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts
    sha: 8dc2706bd3e76f24600307162a41b5551a077a6d
    lines: 1-341
  - path: packages/system-worker/src/ServiceVersionRepo/readExecutedCommandsPage.ts
    sha: d3466785a17b1dea99747ba8be0def3d24a1f42a
    lines: 1-68
  - path: packages/system-worker/src/SystemApi/executeServiceCommand/executeServiceCommand.ts
    sha: 9bc884b585bc936af726913a4f89cc43103ae83a
    lines: 1-104
  - path: packages/system-worker/src/asyncOperations/README.md
    sha: 9633ff073d796483dc8f24f0e091bcc6be17d980
    lines: 1-13
  - path: packages/system-worker/src/asyncOperations/makeAsyncOperations.ts
    sha: f5c7cd069676dcda0aba4fd008f0a8ad324db977
    lines: 1-299
  - path: packages/system-worker/src/asyncOperations/readOperationOutput.ts
    sha: 66902d47e9a088fe453c821ead06c00557495489
    lines: 1-157
  - path: packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts
    sha: c28a7981bb0d84acc7f956c9305a07804216808c
    lines: 1-251
  - path: packages/system-worker/src/makeOutboxSubscriber/makeOutboxSubscriber.ts
    sha: 0287c9a3015ce642ba31f178ea68024eeb4c8fbd
    lines: 1-70
  - path: packages/core/src/contracts/prepareContractInput.ts
    sha: 2342b4dd0e075d840522584cd6113f164115fdd3
    lines: 1-78
---

# Versioned Service Execution and Delivery

A service owns its models and admitted commands. Its materializer runs synchronous contract programs, applies only owned operations, and retains terminal outcomes, ordered operations, publication intent, and head progress together. `serviceIndex` identifies admission order; `executedIndex` identifies retained execution order. Services declare no subscriptions, inbound contracts, outbound model emissions, or observed models.

## Trigger

1. [`executeServiceCommand`](../../../packages/system-worker/src/SystemApi/executeServiceCommand/executeServiceCommand.ts#L40-L97) validates the complete command and registered service/contract versions, admits it through `chain.admitServiceCommand(...)`, and calls `repo.execute(...)` through the returned `serviceIndex`. Remote calls use `makeAsync` and `readRpcEnvelope`.
2. [`ServiceVersionRepo.admittedCommandsFanoutSubscriber`](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L266-L290) receives admitted commands from `ServiceChain`. Its receive callback serializes execution and uses `executedCommandOutbox.drainAfter(...)` to arm publication recovery before execution.
   1. [`executeCommands`](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommands.ts#L81-L130) validates each next admission in service order, then [prepares one contract input](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommands.ts#L194-L220) for its guard and program.
   2. [`executeCommandsTx`](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts#L149-L226) applies owned operations under a savepoint; the same synchronous transaction [retains the outcome, executed-command publication, and head](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts#L269-L338).
3. [`readExecutedCommandsPage`](../../../packages/system-worker/src/ServiceVersionRepo/readExecutedCommandsPage.ts#L25-L66) pairs each pending `executedCommandOutbox` entry with its canonical command and ordered model/async operations. The outbox delivers these `IExecutedCommandDelivery` values to `ServiceVersionChain.executedCommandSubscriber.receive(...)`.

```mermaid
sequenceDiagram
  participant ServiceChain
  participant ServiceVersionRepo
  participant ServiceVersionChain
  participant executedCommandSubscriber as executedCommandSubscriber: OutboxSubscriber
  participant receiveExecutedCommands
  participant ServiceActorVersionRepo
  participant browserCommandSubscriber as ServiceActorVersionChain.browserCommandSubscriber
  participant ServiceSession
  ServiceChain->>ServiceVersionRepo: receiver.receive(...)
  ServiceVersionRepo->>ServiceVersionRepo: executeCommandsTx(...)
  ServiceVersionRepo->>ServiceVersionChain: makeAsync(...)
  ServiceVersionChain-->>ServiceVersionRepo: receiver: executedCommandSubscriber
  ServiceVersionRepo->>executedCommandSubscriber: receiver.receive(...)
  executedCommandSubscriber->>receiveExecutedCommands: receiveExecutedCommands(...)
  alt new valid command
    Note over receiveExecutedCommands: Require contiguous indexes and disposition hash; commit command and operations together
  else identical redelivery
    Note over receiveExecutedCommands: Accept the already committed command and operations
  else invalid or conflicting delivery
    Note over receiveExecutedCommands: Reject; earlier committed commands in the page remain
  end
  receiveExecutedCommands-->>executedCommandSubscriber: durable acceptance or failure
  par Acknowledge producer
    executedCommandSubscriber-->>ServiceVersionRepo: RPC envelope, decoded with readRpcEnvelope
  and Deliver actor projection
    ServiceVersionChain->>ServiceActorVersionRepo: receiver.receive(...)
    ServiceActorVersionRepo->>ServiceActorVersionRepo: executeTx(...)
    ServiceActorVersionRepo->>browserCommandSubscriber: receiver.receive(...)
    browserCommandSubscriber->>ServiceSession: connection.send(...)
  end
```

## Annotated workflow steps

1. Service admission fanout delivers commands to the versioned materializer in service order.
   - [`ServiceVersionRepo.ts:266-290`](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L266-L290) — binds the admission subscriber to the service chain, serializes its receive callback, and delegates rows to `executeCommands`. (`packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts:266-290`)
2. Synchronous execution applies owned operations and retains the outcome, publication intent, and head together.
   - [`executeCommands.ts:194-227`](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommands.ts#L194-L227) — calls `prepareContractInput` once, runs actor authorization and `makeOperations`, and carries the same input into execution. (`packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommands.ts:194-227`)
   - [`executeCommandsTx.ts:84-125`](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts#L84-L125) — rechecks actor authorization and the contract guard against the transaction database using the prepared input. (`packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts:84-125`)
   - [`executeCommandsTx.ts:149-226`](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts#L149-L226) — applies model operations under a savepoint and retains ordered model/async operation rows. (`packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts:149-226`)
   - [`executeCommandsTx.ts:269-338`](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts#L269-L338) — builds the terminal outcome, inserts the command and `executedCommandOutbox` entry, and advances the head inside that transaction. (`packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts:269-338`)
3. The executed-command outbox resolves its bound version chain and acquires the subscriber capability through `makeAsync`.
   - [`ServiceVersionRepo.ts:229-233`](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L229-L233) — resolves `ServiceVersionChain` with the materializer key and acquires `chain.executedCommandSubscriber`. (`packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts:229-233`)
4. The version chain returns its already bound executed-command subscriber as the delivery receiver.
   - [`ServiceVersionChain.ts:90-92`](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L90-L92) — returns the private `executedCommandSubscriber` capability. (`packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts:90-92`)
5. Publication sends the command-and-operations page to the subscriber's RPC `receive` method.
   - [`ServiceVersionRepo.ts:234-235`](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L234-L235) — invokes `receiver.receive(deliveries)` inside `makeAsync`. (`packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts:234-235`)
6. The subscriber's owner-supplied receive Effect delegates delivery validation and acceptance to `receiveExecutedCommands`.
   - [`ServiceVersionChain.ts:71-76`](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L71-L76) — holds the `executionResultsFanout` alarm lease before invoking `receiveExecutedCommands` with the bound database and service/version key. (`packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts:71-76`)
7. Acceptance commits each new command and its operations synchronously, accepts identical repeats, or returns a validation/commit failure.
   - [`receiveExecutedCommands.ts:150-220`](../../../packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts#L150-L220) — checks command/operation schemas, command association and operation order, service/execution-version ownership, and successful execution for nonempty output. (`packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts:150-220`)
   - [`receiveExecutedCommands.ts:44-107`](../../../packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts#L44-L107) — compares repeated commands and operations, requires contiguous `serviceIndex`/`executedIndex`, and verifies disposition-hash extension inside `retainResult`. (`packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts:44-107`)
   - [`receiveExecutedCommands.ts:108-138`](../../../packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts#L108-L138) — inserts the command and model/async operation rows in that same transaction. (`packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts:108-138`)
   - [`receiveExecutedCommands.ts:221-232`](../../../packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts#L221-L232) — completes one `retainResult` call per delivery and maps unexpected transaction failure to `finalized-command-commit-failed`. (`packages/system-worker/src/ServiceVersionChain/receiveExecutedCommands/receiveExecutedCommands.ts:221-232`)
8. The subscriber returns an RPC envelope after acceptance; the producer decodes it before permitting source cleanup.
   - [`makeOutboxSubscriber.ts:44-51`](../../../packages/system-worker/src/makeOutboxSubscriber/makeOutboxSubscriber.ts#L44-L51) — runs the Effect through the managed runtime and `makeRpcEnvelope`. (`packages/system-worker/src/makeOutboxSubscriber/makeOutboxSubscriber.ts:44-51`)
   - [`ServiceVersionRepo.ts:235-238`](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L235-L238) — decodes the remote envelope and disposes the acquired subscriber after delivery. (`packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts:235-238`)
   - [`makeOutboxQueue.ts:198-240`](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts#L198-L240) — retries the complete selected page, retains a delivery failure, and acknowledges exact page indices only after success. (`packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts:198-240`)

9. Independently of producer acknowledgement, actor fanout delivers committed version-chain history to actor projections.
   - [`ServiceVersionChain.ts:77-83`](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L77-L83) — schedules `executionResultsFanout.drain()` through `Effect.ensuring`, including when a later delivery fails after committing a prefix. (`packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts:77-83`)
   - [`ServiceVersionChain.ts:47-60`](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L47-L60) — binds actor fanout to retained commands and their ordered operation bodies. (`packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts:47-60`)
10. Actor projection commits resources, selected output, and checkpoint in one transaction.
    - [`executeTx.ts:248-268`](../../../packages/system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts#L248-L268) — inserts the browser outbox entry and advances actor state inside `executeTx`. (`packages/system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts:248-268`)
11. Browser command publication reaches the actor chain's browser-command subscriber.
    - [`ServiceActorVersionRepo.ts:45-67`](../../../packages/system-worker/src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts#L45-L67) — acquires `chain.browserCommandSubscriber`, sends selected browser command to `receiver.receive(...)`, and decodes its durable receipt. (`packages/system-worker/src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts:45-67`)
12. The actor chain retains the terminal command before broadcasting the allowed view to live sessions.
    - [`receiveBrowserCommands.ts:64-86`](../../../packages/system-worker/src/ServiceActorVersionChain/receiveBrowserCommands/receiveBrowserCommands.ts#L64-L86) — commits each actor output before calling its supplied broadcast callback. (`packages/system-worker/src/ServiceActorVersionChain/receiveBrowserCommands/receiveBrowserCommands.ts:64-86`)
    - [`ServiceActorVersionChain.ts:60-95`](../../../packages/system-worker/src/ServiceActorVersionChain/ServiceActorVersionChain.ts#L60-L95) — binds the subscriber to `receiveBrowserCommands` and sends filtered output only to live session connections. (`packages/system-worker/src/ServiceActorVersionChain/ServiceActorVersionChain.ts:60-95`)

Each remote acknowledgement follows a local commit. No database transaction spans a remote delivery call. `makeTx` rejects asynchronous suspension and rolls back failed execution.

- [`makeTx.ts`](../../../packages/core/src/drizzle/make/makeTx.ts) — enforces synchronous transaction completion.

## Session snapshots and recovery

Snapshots catch up actor history, capture selected resources and actor checkpoint together in a synchronous transaction, then await output publication through that position. An initialized service Node resumes its committed `executedIndex`/`serviceHash` and contiguous own outcome cursor; it retains numeric `serviceIndex` beside those execution checkpoints. Server authentication snapshots prove the bound identity without replacing initialized Node resources. Terminal commands and replay arrays are delivered directly. Shared fanout preserves durable subscriber progress and failures for actor projections and sessions.

- [`getSnapshot.ts:88-128`](../../../packages/system-worker/src/ServiceActorVersionRepo/getSnapshot/getSnapshot.ts#L88-L128) — captures resources and checkpoint, then publishes after transaction completion.

## Contract return values

Programs yield model operations into a fresh execution-owned collector and return a value checked by their optional result codec. Successful history retains the encoded result and executing contract version atomically with owned writes. Omitted result codecs require void and store null. Failed application retains no successful result. Programs and result codecs complete synchronously.

## Verification and storage

`contract-programs:check` exercises shared prepared input, transaction guard rechecks, synchronous collectors, result codecs, rejection and delivery. `node-outcomes:check` covers both concrete Nodes, repeated-ID occurrences, historical settlement, rollback, reopen, and checkpoint conflicts. `command-history:restart:check` verifies pending publication and both aggregate acknowledgement orders across disposable SQLite process restarts. Changed fixed schemas require empty storage; no translations or fallback decoders exist.

## Mapped output and async lifecycle

Server execution runs the ordinary program, validates its original result, then runs the mapper with immutable base output and declared read-only model access. Mapper emissions append in order and its required result codec owns authoritative output. Both programs see pre-application state. Browser staging and locks continue to use the original declaration.

Successful application commits model changes, complete output and eligible async lifecycle with terminal history. `modelOperations` and `asyncOperations` share `(commandId, operationIndex)` identity; readers merge immutable output by that index. Original execution alone allocates child IDs and retains actor authority. Replay runs the full mapped program but applies only model operations and retains async emissions with null lifecycle. Actor projections skip async entries without renumbering model operations.

The external contract's `external.request({ payload })` starts after commit and returns a value validated by `external.response`. Recording `response` and `responseRecordedAt`, clearing the deadline, and enqueuing minimal child-command delivery share one synchronous transaction. Retained async rows survive source publication cleanup. Child reconstruction uses frozen payload, response, exact actor/contract pins and Repo identity; it does not require a source command row. The synchronous continuation receives `{ payload, response }`; rejection preserves that recorded response. See [async operation lifecycle](../../../packages/system-worker/src/asyncOperations/README.md).

- [`makeExternalContract.ts`](../../../packages/core/src/contracts/make/makeExternalContract.ts) — declares the external request, response codec, and synchronous continuation.
- [`prepareContractInput.ts`](../../../packages/core/src/contracts/prepareContractInput.ts) — prepares payload defaults, contract claims, and recorded response once; transaction guard rechecks reuse those values.
- [`makeOperations.ts`](../../../packages/core/src/contracts/make/makeOperations.ts) — runs prepared guard and program input, collects operations, and validates base and mapped results.
- [`readOperationOutput.ts`](../../../packages/system-worker/src/asyncOperations/readOperationOutput.ts) — ordered complete output across physical tables.
- [`makeAsyncOperations.ts`](../../../packages/system-worker/src/asyncOperations/makeAsyncOperations.ts) — concurrent production, atomic response retention and recovery.
