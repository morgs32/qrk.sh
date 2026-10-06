---
title: Aggregate Command Execution
updated: 2026-10-05
sources:
  - path: packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts
    sha: 782f14812aa3f1a2e24f0afc0f67a90a5e258f0e
    lines: 1-112
  - path: packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts
    sha: 90d5041376daf766370b22c8b6079695689fc193
    lines: 1-44
  - path: packages/system-worker/src/AggregateVersionRepo/execute/execute.ts
    sha: 33e25bf73d9440071e723f3e419b9c8ee5fe34d9
    lines: 1-126
  - path: packages/system-worker/src/AggregateChain/AggregateChain.ts
    sha: b8d35d56d7839fc53aa291017b2cce9d247edb27
    lines: 1-237
  - path: packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts
    sha: 96e4e7997222064af1f193d2ba7513e3ede67275
    lines: 1-332
  - path: packages/system-worker/src/AggregateVersionRepo/deleteDeliveredAggregateMaterial.ts
    sha: c9e8a35f787e6a5c2ed611c66764270766c48d27
    lines: 1-31
  - path: packages/system-worker/src/AggregateVersionRepo/flush/flush.ts
    sha: 79fc755e3fb878ad18a743deaf5ac44a1e2a5fec
    lines: 1-58
  - path: packages/core/src/aggregateActor/getAggregateActorVersion.ts
    sha: c5880d423634f9f6718fa1368c04ec2655e6d76f
    lines: 1-44
  - path: packages/core/src/system/make/makeSystem/makeSystem.ts
    sha: ae87e074b9f0ba5a09b39560a98dd9dd0ffb2307
    lines: 1-373
  - path: packages/system-worker/src/asyncOperations/README.md
    sha: 9633ff073d796483dc8f24f0e091bcc6be17d980
    lines: 1-13
  - path: packages/core/src/contracts/prepareContractInput.ts
    sha: 2342b4dd0e075d840522584cd6113f164115fdd3
    lines: 1-78
  - path: packages/core/src/contracts/make/makeOperations.ts
    sha: 71e161056ad3ff1614f996247d0c157b88578644
    lines: 1-189
  - path: packages/system-worker/src/asyncOperations/readOperationOutput.ts
    sha: 66902d47e9a088fe453c821ead06c00557495489
    lines: 1-157
  - path: packages/system-worker/src/asyncOperations/makeAsyncOperations.ts
    sha: f5c7cd069676dcda0aba4fd008f0a8ad324db977
    lines: 1-299
  - path: packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommands.ts
    sha: 7872e8e4490919ccc57d09c549274e012f094209
    lines: 1-378
---

# Aggregate Command Execution

Secret-key and provisioning requests stage in the selected AAVR before direct AC execution. Direct requests admit with an explicit aggregate version and return its terminal result. Admission persists that original executor pin; retries preserve it. Session push requests return admission receipts instead. Publication proceeds through the durable topology described in [Command Chains](./admitCommands.md).

## Trigger

1. A secret-key caller submits one full aggregate command.
   - [`executeAggregateCommand.ts:34-44`](../../../packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts#L34-L44) — Validates the command envelope and obtains the capability-bound systemId.

```mermaid
sequenceDiagram
  participant Caller
  participant SystemApi
  participant AggregateChain
  participant AggregateVersionRepo
  autonumber 1
  Caller->>SystemApi: systemApi.executeAggregateCommand(...)
  autonumber 2
  SystemApi->>AggregateChain: chain.executeAggregateCommand(...)
  autonumber 3
  AggregateChain->>AggregateVersionRepo: repo.execute(...)
  autonumber 4
  AggregateVersionRepo-->>AggregateChain: terminal command
  autonumber 5
  AggregateChain-->>SystemApi: terminal command
  autonumber 6
  SystemApi-->>Caller: linked RPC result
```

## Annotated workflow steps

1. SystemApi validates the complete request and uses its bound system capability.
   - [`executeAggregateCommand.ts:43-56`](../../../packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts#L43-L56) — decodes the explicit version/command tuple and obtains authenticated system context. (`packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts:43-56`)
2. SystemApi stages the command, then calls its aggregate chain.
   - [`executeAggregateCommand.ts:93-105`](../../../packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts#L93-L105) — stages against the selected actor before decoding the direct chain result. (`packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts:93-105`)
3. AC admits once and executes through the saved occurrence on its original executor.
   - [`executeAggregateCommand.ts:28-43`](../../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts#L28-L43) — uses the admission receipt's retained index and originalExecutionVersion. (`packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts:28-43`)
4. VAR returns the retained terminal occurrence after local commit or recovery from AVC.
   - [`execute.ts:87-100`](../../../packages/system-worker/src/AggregateVersionRepo/execute/execute.ts#L87-L100) — returns pending durable output or queries finalized result history when already acknowledged. (`packages/system-worker/src/AggregateVersionRepo/execute/execute.ts:87-100`)
5. AC encodes the version-owned result for its caller.
   - [`AggregateChain.ts:221-235`](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L221-L235) — runs the bound direct operation through makeRpcEnvelope. (`packages/system-worker/src/AggregateChain/AggregateChain.ts:221-235`)
6. SystemApi returns the decoded linked RPC result.
   - [`executeAggregateCommand.ts:100-110`](../../../packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts#L100-L110) — wraps the chain result with the system span and granted capability. (`packages/system-worker/src/SystemApi/executeAggregateCommand/executeAggregateCommand.ts:100-110`)

## Publication and recovery

VAR retains owned outputs, terminal disposition and local head atomically with resource state. The business savepoint rolls back owned writes on rejection; infrastructure failures abort the enclosing transaction. Independent original-result and version-history outboxes recover after interruption. Their acknowledgements delete pending delivery rows independently, retaining model publication material until neither destination needs it. Producer-owned async rows survive both acknowledgements. Post-commit retries recover the saved result. No SQL transaction spans delivery RPCs.

- [`executeCommandsTx.ts`](../../../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts) — commits owned state, disposition and pending delivery together.
- [`deleteDeliveredAggregateMaterial.ts`](../../../packages/system-worker/src/AggregateVersionRepo/deleteDeliveredAggregateMaterial.ts) — retains model material until both destinations acknowledge, preserving async lifecycle.
- [`flush.ts`](../../../packages/system-worker/src/AggregateVersionRepo/flush/flush.ts) — awaits execution and AVC publication through a fixed command checkpoint.

## Recorded selection provenance

- [`getAggregateActorVersion.ts`](../../../packages/core/src/aggregateActor/getAggregateActorVersion.ts) — rejects unsupported or conflicting actor versions.
- [`makeSystem.ts`](../../../packages/core/src/system/make/makeSystem/makeSystem.ts) — supplies shared runtime capabilities across invocations.
- [Implementation verification](../../archive/plans/030-plan-remove-replicas-and-service-subscriptions.md) — records scoped gates and outstanding runtime checks.

## Operation results

The returned command has completed `admission` and `execution` results. Admission
rejection retains its failure and skips execution with reason `admission-failed`.
A declared execution rejection lives in `execution.failure`. Infrastructure failures
abort the attempt and remain RPC failures. Resource timestamps use execution's
`startedAt`; `completedAt` records completion of that operation. Delivery retries
return the retained result without changing either timestamp.

## Contract return values

Execution decodes the wire payload and authenticated claims, then prepares the contract input once. The guard and program receive the same payload defaults and domain values. Before applying operations, the transaction reruns actor authorization and the contract guard against its database using that prepared input.

- [`executeCommands.ts:203-255`](../../../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommands.ts#L203-L255) — decodes input, prepares it once, and runs authorization and the contract program.
- [`executeCommands.ts:279-302`](../../../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommands.ts#L279-L302) — retains a guard recheck with the prepared input.
- [`executeCommandsTx.ts:118-130`](../../../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts#L118-L130) — runs that recheck inside the business savepoint before applying operations.

The runner collects typed operation emissions independently of the program return value. It validates and encodes the optional result codec before resource application. Successful terminal history retains the encoded result and actual executing contract version atomically with owned operations; failed application retains no successful result. Same-command retries reuse that retained outcome.

## Mapped output and async lifecycle

Server execution runs the ordinary program, validates its original result, then runs the mapper with immutable base output and declared read-only model access. Mapper emissions append in order and its required result codec owns authoritative output. Both programs see pre-application state. Browser staging and locks continue to use the original declaration.

Successful application commits model changes, complete output and eligible async lifecycle with terminal history. `modelOperations` and `asyncOperations` share `(commandId, operationIndex)` identity; readers merge immutable output by that index. Original execution alone allocates child IDs and retains actor authority. Replay runs the full mapped program but applies only model operations and retains async emissions with null lifecycle. Actor projections skip async entries without renumbering model operations.

The external contract's `external.request({ payload })` starts after commit and returns a value validated by `external.response`. Recording `response` and `responseRecordedAt`, clearing the deadline, and enqueuing minimal child-command delivery share one synchronous transaction. Retained async rows survive source publication cleanup. Child reconstruction uses frozen payload, response, exact actor/contract pins and Repo identity; it does not require a source command row. The synchronous continuation receives `{ payload, response }`; rejection preserves that recorded response. See [async operation lifecycle](../../../packages/system-worker/src/asyncOperations/README.md).

- [`makeExternalContract.ts`](../../../packages/core/src/contracts/make/makeExternalContract.ts) — declares the external request, response codec, and synchronous continuation.
- [`prepareContractInput.ts`](../../../packages/core/src/contracts/prepareContractInput.ts) — prepares payload defaults, contract claims, and recorded response once; transaction guard rechecks reuse those values.
- [`makeOperations.ts`](../../../packages/core/src/contracts/make/makeOperations.ts) — runs prepared guard and program input, collects operations, and validates base and mapped results.
- [`readOperationOutput.ts`](../../../packages/system-worker/src/asyncOperations/readOperationOutput.ts) — ordered complete output across physical tables.
- [`makeAsyncOperations.ts`](../../../packages/system-worker/src/asyncOperations/makeAsyncOperations.ts) — concurrent production, atomic response retention and recovery.
