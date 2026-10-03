---
title: Versioned Service Execution and Delivery
updated: 2026-10-02
---

# Versioned Service Execution and Delivery

A service owns its models and admitted commands. Its materializer runs synchronous contract programs, applies only owned operations, and retains terminal outcomes, ordered operations, publication intent, and head progress together. `serviceIndex` identifies admission order; `executedIndex` identifies retained execution order. Services declare no subscriptions, inbound contracts, outbound model emissions, or observed models.

## Trigger

The trusted service command boundary validates the command and resolves its registered service version. `ServiceChain` retains admission; the configured `ServiceVersionRepo` catches up through that position and returns the terminal result. Durable fanout also feeds materializers and actor projections.

- [`executeServiceCommand.ts`](../../../packages/system-worker/src/SystemApi/executeServiceCommand/executeServiceCommand.ts) — validates and admits the request, then awaits execution.

```mermaid
sequenceDiagram
  participant SC as ServiceChain
  participant VSR as ServiceVersionRepo
  participant VSC as ServiceVersionChain
  participant Actor as ServiceActorVersionRepo
  participant Session as Service session
  SC->>VSR: subscriber.receive(...)
  VSR->>VSR: executeCommandsTx(...)
  VSR->>VSC: receiver.receive(...)
  VSC->>Actor: subscriber.receive(...)
  Actor->>Actor: executeTx(...)
  Actor->>Session: receiver.receive(...)
```

## Annotated workflow steps

1. The materializer prepares admitted commands in service order.
   - [`executeCommands.ts:80-103`](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommands.ts#L80-L103) — begins per-command preparation after resolving the canonical service. (`packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommands.ts:80-103`)
2. The synchronous transaction applies owned operations under a savepoint and retains the terminal outcome and publication.
   - [`executeCommandsTx.ts:157-210`](../../../packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts#L157-L210) — validates exact owned model membership and applies ordered operations. (`packages/system-worker/src/ServiceVersionRepo/executeCommands/executeCommandsTx.ts:157-210`)
3. Publication delivers retained commands and operation bodies to the version chain.
   - [`ServiceVersionRepo.ts:221-240`](../../../packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts#L221-L240) — calls the version-chain receiver and decodes its durable receipt. (`packages/system-worker/src/ServiceVersionRepo/ServiceVersionRepo.ts:221-240`)
4. The version chain fans retained result history out to actor projections.
   - [`ServiceVersionChain.ts:47-60`](../../../packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts#L47-L60) — binds actor result fanout to command history. (`packages/system-worker/src/ServiceVersionChain/ServiceVersionChain.ts:47-60`)
5. Actor projection commits resources, selected output, and checkpoint in one transaction.
   - [`executeTx.ts:248-268`](../../../packages/system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts#L248-L268) — inserts the browser outbox entry and advances actor state inside executeTx. (`packages/system-worker/src/ServiceActorVersionRepo/execute/executeTx.ts:248-268`)
6. Actor output publication reaches the actor chain for session delivery.
   - [`ServiceActorVersionRepo.ts:45-67`](../../../packages/system-worker/src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts#L45-L67) — publishes a filtered actor command through the bound chain receiver. (`packages/system-worker/src/ServiceActorVersionRepo/ServiceActorVersionRepo.ts:45-67`)

Each remote acknowledgement follows a local commit. No database transaction spans a remote delivery call. `makeTx` rejects asynchronous suspension and rolls back failed execution.

- [`makeTx.ts`](../../../packages/core/src/drizzle/make/makeTx.ts) — enforces synchronous transaction completion.

## Session snapshots and recovery

Snapshots catch up actor history, capture selected resources and actor checkpoint together in a synchronous transaction, then await output publication through that position. Reconnect validates `executedIndex` and `serviceHash`. Shared fanout preserves durable subscriber progress and failures for actor projections and sessions.

- [`getSnapshot.ts:88-128`](../../../packages/system-worker/src/ServiceActorVersionRepo/getSnapshot/getSnapshot.ts#L88-L128) — captures resources and checkpoint, then publishes after transaction completion.

## Contract return values

Programs yield model operations into a fresh execution-owned collector and return a value checked by their optional result codec. Successful history retains the encoded result and executing contract version atomically with owned writes. Omitted result codecs require void and store null. Failed application retains no successful result. Programs and result codecs complete synchronously.

## Verification and storage

`contract-programs:check` exercises synchronous collectors, result codecs, rejection and delivery. `node-outcomes:check` covers session correlation and optimistic replay. `command-history:restart:check` verifies pending publication and both aggregate acknowledgement orders across disposable SQLite process restarts. Changed fixed schemas require empty storage; no translations or fallback decoders exist.

## Mapped output and async lifecycle

Server execution runs the ordinary program, validates its original result, then runs the mapper with immutable base output and declared read-only model access. Mapper emissions append in order and its required result codec owns authoritative output. Both programs see pre-application state. Browser staging and locks continue to use the original declaration.

Successful application commits model changes, complete output and eligible async lifecycle with terminal history. `modelOperations` and `asyncOperations` share `(commandId, operationIndex)` identity; readers merge immutable output by that index. Original execution alone allocates child IDs and retains actor authority. Replay runs the full mapped program but applies only model operations and retains async emissions with null lifecycle. Actor projections skip async entries without renumbering model operations.

Producer execution starts after commit. Observation recording, deadline clearing and minimal child-command delivery enqueue share one synchronous transaction. Retained async rows survive source publication cleanup. Child reconstruction uses frozen payload, observation, exact actor/contract pins and Repo identity; it does not require a source command row. Continuation rejection preserves recorded evidence. See [async operation lifecycle](../../../packages/system-worker/src/asyncOperations/README.md).

- [`makeOperations.ts`](../../../packages/core/src/contracts/make/makeOperations.ts) — base validation, immutable mapper input and authoritative result validation.
- [`readOperationOutput.ts`](../../../packages/system-worker/src/asyncOperations/readOperationOutput.ts) — ordered complete output across physical tables.
- [`makeAsyncOperations.ts`](../../../packages/system-worker/src/asyncOperations/makeAsyncOperations.ts) — concurrent production, atomic observation retention and recovery.
