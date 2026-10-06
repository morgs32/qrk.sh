---
title: Aggregate Command Admission and Result Delivery
updated: 2026-10-05
sources:
  - path: packages/core/src/contracts/ExecutedCommandSchema.ts
    sha: 5db6f7161c0a7bcc9e6b18974f340312fe819dd2
    lines: 1-100
  - path: packages/core/src/drizzle/make/makeTx.ts
    sha: 8c2efa8f1180de92bf6d3fb7c3531eae7bd5cfbc
    lines: 1-120
  - path: packages/core/src/serviceSession/filterServiceBrowserCommand.ts
    sha: f54a782416bba4c9b978369a5217eddf692121e5
    lines: 1-40
  - path: packages/system-worker/scripts/checkActorStaging.mjs
    sha: 786b302cdbae3b1404b3e9b49b6a7c892932a106
    lines: 1-276
  - path: packages/system-worker/src/AggregateActorVersionChain/aggregateActorVersionChainDbConfig.ts
    sha: 97b461f1a9bfe571444b2b777a129565bfc6500e
    lines: 1-25
  - path: packages/system-worker/src/AggregateActorVersionChain/getBrowserCommands/getBrowserCommands.ts
    sha: 7d310c965b0c0b38a692e95a917029c777bedd3c
    lines: 1-235
  - path: packages/system-worker/src/AggregateActorVersionChain/getResolvedThrough.ts
    sha: 333c1695fb2dbb1d1839e3db631546587cdce167
    lines: 1-60
  - path: packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts
    sha: 81eacb88d0b747a664800db61d29841a8d6aef82
    lines: 1-459
  - path: packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts
    sha: 08d4f75e5bdb508a9cf0e9a0aebc745bce8436d9
    lines: 1-274
  - path: packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.ts
    sha: 865d675fcd3866f5c9c89068ab1db83c64c33133
    lines: 1-145
  - path: packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoFixedDORepoConfig.ts
    sha: 4c9c05cb5ccd305341db6c04d48ffb9b40669dea
    lines: 1-111
  - path: packages/system-worker/src/AggregateActorVersionRepo/getSnapshot/getSnapshot.ts
    sha: 32eaf1360bb1edf5af4fd2e8a20e2828c5263e58
    lines: 1-179
  - path: packages/system-worker/src/AggregateActorVersionRepo/onDOActivation/onDOActivation.ts
    sha: b851d43a6ec46e3b40077dd933b59784de38bbcc
    lines: 1-19
  - path: packages/system-worker/src/AggregateActorVersionRepo/optimistic/makeOptimisticActorDb.ts
    sha: 3580fc6056651a988b27d014d95739f955851979
    lines: 1-77
  - path: packages/system-worker/src/AggregateActorVersionRepo/optimistic/makeStagedAggregateCommandOutbox.ts
    sha: 9884386d290b146b951f2253ba9d5745e8e1ad64
    lines: 1-179
  - path: packages/system-worker/src/AggregateActorVersionRepo/optimistic/stageActorCommands.ts
    sha: 6020f28297c3d79ec03ad85011543b8a46debadb
    lines: 1-346
  - path: packages/system-worker/src/AggregateChain/AggregateChain.ts
    sha: b8d35d56d7839fc53aa291017b2cce9d247edb27
    lines: 1-237
  - path: packages/system-worker/src/AggregateChain/admitCommands/admitCommandsTx.ts
    sha: 0e8c88299028317e1ee89a392a7861dbc291711d
    lines: 1-169
  - path: packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts
    sha: 90d5041376daf766370b22c8b6079695689fc193
    lines: 1-44
  - path: packages/system-worker/src/AggregateChain/onDOActivation/onDOActivation.ts
    sha: eefc32cfcc78df16c4a9e67acfd075daf931b88c
    lines: 1-61
  - path: packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts
    sha: 20010c40406aeaba09895217a5d04cc4310db8d7
    lines: 1-83
  - path: packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts
    sha: a44888c5d092d50901f8716a519fc2b38bf22535
    lines: 1-547
  - path: packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts
    sha: 4fbff1507a4dca84b426f85ab1383da543d25dc0
    lines: 1-89
  - path: packages/system-worker/src/AggregateVersionRepo/deleteDeliveredAggregateMaterial.ts
    sha: c9e8a35f787e6a5c2ed611c66764270766c48d27
    lines: 1-31
  - path: packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommands.ts
    sha: 2c354449c668ead70ca2ef227b0c16275bbe79ca
    lines: 1-396
  - path: packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts
    sha: 96e4e7997222064af1f193d2ba7513e3ede67275
    lines: 1-332
  - path: packages/system-worker/src/ServiceChain/onDOActivation/onDOActivation.ts
    sha: b993cb096c76a3516d02c953c8db05c4921ad663
    lines: 1-61
  - path: packages/system-worker/src/filterAggregateBrowserCommand/filterAggregateBrowserCommand.ts
    sha: bc10325b220472df944da0fcf660f8a5c4ef71d4
    lines: 1-31
  - path: packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts
    sha: 1fca471b0bb790a5e172af4c59faba872aca0ccd
    lines: 1-779
  - path: packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts
    sha: 857440d27169fb4bfade867c3d0c105b5883302b
    lines: 1-202
  - path: packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts
    sha: c28a7981bb0d84acc7f956c9305a07804216808c
    lines: 1-251
---

# Aggregate Command Admission and Result Delivery

AggregateChain owns the admitted aggregate command order. Admission is synchronous and local. Each VAR executes its own version's program against owned state and atomically commits a terminal result and ordered outputs. Original execution independently publishes to AVC and returns the original evidence to AC. Actors project committed outputs; sessions synchronize selected rows and replay unresolved optimistic operations.

## Trigger

1. A live aggregate session sends `pushAggregateCommand` through its admitted connection. The server checks the aggregate identity, actor, claims, session, node, and selected contract against that connection.
   - [`onMessage.ts`](../../../packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts) — validates the message and its definition lock before staging.
2. The bound AggregateActorVersionRepo prepares the command against its optimistic view and retains pending work for its `stagedAggregateCommandOutbox`.
   - [`AggregateActorVersionRepo.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/AggregateActorVersionRepo.ts) — schedules durable staging and delivery.
3. The outbox submits the saved command to AggregateChain. Direct trusted execution uses `executeAggregateCommand` with an explicit aggregate version and recovers that version's terminal result.
   - [`makeStagedAggregateCommandOutbox.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/optimistic/makeStagedAggregateCommandOutbox.ts) — submits staged commands in `stageIndex` order.
   - [`executeAggregateCommand.ts`](../../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts) — admits once, then calls the explicitly selected materializer.

```mermaid
sequenceDiagram
  participant AggregateActorVersionRepo
  participant AggregateChain
  participant AggregateVersionRepo
  participant AggregateVersionChain
  AggregateActorVersionRepo->>AggregateChain: chain.admitCommands(...)
  AggregateChain->>AggregateVersionRepo: receiver.receive(...)
  AggregateVersionRepo->>AggregateVersionChain: subscriber.receive(...)
  AggregateVersionRepo->>AggregateChain: subscriber.receive(...)
```

## Annotated workflow steps

1. The actor outbox submits its saved command and provenance for local admission.
   - [`makeStagedAggregateCommandOutbox.ts:103-109`](../../../packages/system-worker/src/AggregateActorVersionRepo/optimistic/makeStagedAggregateCommandOutbox.ts#L103-L109) — calls chain admission with the retained command and explicit aggregate version. (`packages/system-worker/src/AggregateActorVersionRepo/optimistic/makeStagedAggregateCommandOutbox.ts:103-109`)
2. AC sends admitted command inputs to each materializer according to original-result readiness.
   - [`AggregateChain.ts:70-87`](../../../packages/system-worker/src/AggregateChain/AggregateChain.ts#L70-L87) — binds command paging and materializer destinations. (`packages/system-worker/src/AggregateChain/AggregateChain.ts:70-87`)
3. VAR publishes complete terminal commands and owned outputs to AVC after commit.
   - [`AggregateVersionRepo.ts:346-355`](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L346-L355) — acquires the version-chain subscriber and delivers the retained version result page. (`packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts:346-355`)
4. Original execution also returns its terminal disposition and outputs to AC.
   - [`AggregateVersionRepo.ts:208-215`](../../../packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L208-L215) — acquires the aggregate-chain subscriber and returns original execution evidence. (`packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts:208-215`)

## Atomic batch admission

Admission preparation checks every input before retention: the command must match the bound aggregate, use a supported recorded actor, and carry structurally valid command fields. Payload/contract admission validation retains success or terminal failure; rejected commands materialize as skipped execution. `claims.aggregateId` must match the command's aggregate ID. State guards run during staging or execution, not in `checkAdmission`.

One synchronous transaction recovers retained commands, allocates shared input positions, validates node progress, and inserts the whole batch. An empty batch returns immediately. A conflicting node identity or node position rolls back every new row in that batch; previously committed history remains intact.

A repeated aggregate command ID returns the original retained command and admission, including its original executor pin and an occurrence inserted earlier in the same batch. The retry must retain its node, session, actor, and claims provenance; it cannot replace the stored command. For a new command with a node ID, `nodeIndex` must be exactly the next retained position, and the node's session, actor, and claims must remain the same.

- [`admitCommandsTx.ts`](../../../packages/system-worker/src/AggregateChain/admitCommands/admitCommandsTx.ts) — performs duplicate provenance checks, contiguous node validation, and aggregate-index allocation in one transaction.
- [`makeTx.ts`](../../../packages/core/src/drizzle/make/makeTx.ts) — runs the transaction Effect synchronously; failure or suspension rolls it back.

## Identity and ownership

| Owner                                                  | Bound identity                                                             | Durable responsibility                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| AggregateChain                                         | `systemId`, `aggregateId`, `aggregateName`                                 | Admitted commands, original results/outputs, and materializer progress |
| AggregateVersionRepo / AggregateVersionChain           | Aggregate identity plus `aggregateVersion`                                 | Version-owned resources, terminal commands and owned outputs           |
| AggregateActorVersionRepo / AggregateActorVersionChain | Versioned aggregate identity plus `actorName`, `actorVersion`, `actorPath` | Selected resources, actor outputs, and output delivery history         |

The actor path is the canonical encoded selection identity. Recorded commands retain the actor name/version and full claims separately. Materialization resolves that actor definition before decoding claims, and verifies that the selected materializer's contract belongs to the same supported contract lineage.

- [`aggregateActorVersionRepoFixedDORepoConfig.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoFixedDORepoConfig.ts) — defines the seven-field owner key and validates the canonical actor path.
- [`executeCommands.ts`](../../../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommands.ts) — resolves recorded actor provenance, contract lineage, and claims before preparing operations.

AAVR resource tables contain confirmed state. Unresolved prepared operations replay into a disposable optimistic database for actor guards. A recognized chain admission refusal resolves the pending command without assigning an aggregate index or advancing the confirmed actor cursor. Snapshots and publications contain confirmed selected resources.

Staging checks candidates in retained order against that derived view. A declared rejection allocates neither a command row nor a staging position; earlier accepted candidates remain available to later guards. Accepted command rows, prepared operations, and submission work commit together only after confirming the preparation basis is still current. Same-command retries reuse retained work, while conflicting input or provenance fails. Reconstruction applies saved operations to the current confirmed graph, preserving captured IDs and timestamps without invoking programs or delivery. An unreplayable command remains pending but contributes no partial changes.

The staged-command outbox can delete after admission acknowledgement while the staging journal remains unresolved. Terminal projection resolves the journal together with confirmed resources, checkpoint, and browser publication. Snapshot capture reads that confirmed base and waits for publication through its captured checkpoint. AAVR no longer runs observation-triggered listeners or gates projection on their outputs; explicit async emissions belong to the authoritative command's VersionRepo.

- [`makeStagedAggregateCommandOutbox.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/optimistic/makeStagedAggregateCommandOutbox.ts) — retains recognized admission failures against the staged command.
- [`stageActorCommands.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/optimistic/stageActorCommands.ts) — commits accepted staging and delivery work after checking the prepared basis.
- [`makeOptimisticActorDb.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/optimistic/makeOptimisticActorDb.ts) — reconstructs optimism from the full confirmed resource graph and saved operations.
- [`checkActorStaging.mjs`](../../../packages/system-worker/scripts/checkActorStaging.mjs) — verifies these production seams with disposable Workerd SQLite, transaction-failure injection, and cold restart; snapshot and admission network receivers are fixture-owned.
- [`aggregateActorVersionRepoDbConfig.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.ts) — separates commands, pending prepared operations, actor outputs, and the projection checkpoint.

## Command outboxes and retained history

| Owner                                     | Pending command outbox           | Command type                                                                | Receiver                          |
| ----------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| AggregateActorVersionRepo                 | `stagedAggregateCommandOutbox`   | `IStagedAggregateCommand`                                                   | AggregateChain                    |
| AggregateVersionRepo / ServiceVersionRepo | `executedCommandOutbox`          | `IExecutedAggregateCommand` or `IExecutedServiceCommand`, by original owner | Corresponding version chain       |
| Original AggregateVersionRepo             | `executedAggregateCommandOutbox` | `IExecutedAggregateCommand`                                                 | AggregateChain                    |
| Both actor version repos                  | `browserCommandOutbox`           | `IAggregateBrowserCommand` / `IServiceBrowserCommand`                       | Corresponding actor version chain |
| Both version repos                        | `asyncCommandOutbox`             | `IAsyncCommand`                                                             | Corresponding admission chain     |

Each pending row stores flat command fields and required occurrence, recipient, and delivery metadata. Associated normalized operations remain available until every delivery requiring them acknowledges. Acknowledgement deletes exactly the delivered page after the receiver commits durable history. Lost acknowledgements retry identical commands; conflicting retries fail without advancing progress. Original aggregate execution enqueues both destinations in one synchronous transaction; replay do not enqueue another original return.

The actor’s `stagedCommands` journal preserves unresolved optimistic operations after admission delivery deletes. Actor-chain `browserCommands` retain outcomes independently of browser delivery. Aggregate snapshots publish through the captured resource checkpoint, then derive the private contiguous outcome prefix from actor-chain history at that checkpoint. Service flush recovers its checkpoint from pending delivery or acknowledged version-chain history.

- [`ExecutedCommandSchema.ts`](../../../packages/core/src/contracts/ExecutedCommandSchema.ts) — validates original-owner provenance and terminal result relationships.
- [`makeOutboxQueue.ts`](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts) — deletes acknowledged delivery pages and retains pending failures for alarm recovery.
- [`deleteDeliveredAggregateMaterial.ts`](../../../packages/system-worker/src/AggregateVersionRepo/deleteDeliveredAggregateMaterial.ts) — protects material required by either pending aggregate delivery.
- [`getResolvedThrough.ts`](../../../packages/system-worker/src/AggregateActorVersionChain/getResolvedThrough.ts) — derives checkpoint-bounded private outcome progress from receiving history.

## Command occurrences and positions

| Storage                                              | Contents and order                                              |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| AggregateChain `commands`                            | Admitted aggregate commands by `aggregateIndex`                 |
| AVR / AVC `aggregateCommands` and `operations`       | Terminal aggregate commands and their ordered owned operations  |
| AVR / AVC merged result feed                         | Complete command occurrences by aggregate-local `executedIndex` |
| AAVR `browserCommandOutbox` / AAVC `browserCommands` | Flat aggregate browser commands by `executedIndex`              |

- [`aggregateVersionRepoDbConfig.ts`](../../../packages/system-worker/src/AggregateVersionRepo/aggregateVersionRepoDbConfig.ts) — defines original command, operation, receiving head, storage.
- [`aggregateVersionChainDbConfig.ts`](../../../packages/system-worker/src/AggregateVersionChain/aggregateVersionChainDbConfig.ts) — defines durable published result history.
- [`aggregateActorVersionChainDbConfig.ts`](../../../packages/system-worker/src/AggregateActorVersionChain/aggregateActorVersionChainDbConfig.ts) — retains actor outputs separately from connection state.

An aggregate command advances `aggregateIndex`, `executedIndex`, and the aggregate `dispositionHash`. Its retained `execution` records success, declared failure, or skipped execution after failed admission. Owned operation rows replace a stored execution delta. Their order, identities, bodies, and timestamps are retained so consumers can apply them without rerunning the producing program.

- [`executeCommandsTx.ts`](../../../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommandsTx.ts) — applies guarded operations under a savepoint and commits the terminal command with the owner head.

Actor staging evaluates contract and actor guards against the derived optimistic database. Authoritative aggregate access guards run before program preparation and again in the command transaction. Contract guards run before the program and are revalidated in that transaction. Portable programs and guards run through the synchronous program boundary; their runtime capabilities come from the configured system runtime. A declared execution rejection rolls back the command's owned mutations and outputs, then retains its failed terminal result . An infrastructure failure rolls back the unfinished command; the caller commits each command before preparing the next, so an earlier committed prefix remains durable.

Contract guards only validate: they fail or return void. Every admitted successful execution runs its program, which can emit zero operations and return its declared result. The command transaction revalidates access and guard before applying outputs. Same-command delivery retries reuse retained outcomes.

- [`stageActorCommands.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/optimistic/stageActorCommands.ts) — evaluates actor and contract guards before retaining prepared optimism.
- [`executeCommands.ts`](../../../packages/system-worker/src/AggregateVersionRepo/executeCommands/executeCommands.ts) — holds the execution permit across preparation and commits each command through `executeCommandsTx`.

## Projection state and browser commands

Actors apply retained owned operations against their pinned model versions. The operation, selection delta, browser output, and checkpoint share one local transaction.

AAVR computes selection through the actor's captured Drizzle query and row mappings against its pinned models. Rows entering the selection produce upserts; rows leaving it produce deletions even if they still exist outside that selection. The previous selection remains in memory within the replay transaction.

```mermaid
flowchart TD
  subgraph AggregateActorVersionRepo
    Before[Read selected resources] --> Replay[Apply owned operations]
    Replay --> After[Read selected resources again]
    Before --> Delta[Compute actorDelta]
    After --> Delta
    Delta --> Output[Insert browser command output]
    Output --> Checkpoint[Advance actorState]
  end
```

Resource writes, `actorDelta`, the output row, and the checkpoint commit together. Each terminal command advances the actor's `executedIndex`, `executedHash`, and aggregate watermark. Service actors retain `executedIndex`, `serviceHash`, and numeric `serviceIndex` checkpoints.

Submitted ownership metadata stays server-side. Aggregate delivery constructs `IAggregateBrowserCommand { id, commandName, delta, admission, execution, executedIndex, executedHash, aggregateIndex }`; service delivery constructs the corresponding command with `executedIndex`, `serviceHash`, and `serviceIndex`. The authenticated model lock filters the delta. The submitting Node/session/claims receives the existing admission and execution status, timing, failure, and result fields; both phase fields are null for other recipients. Private input and claims are absent. Each execution position identifies a distinct occurrence; the originating submission preserves its first terminal outcome even when its ID appears again.

- [`filterAggregateBrowserCommand.ts`](../../../packages/system-worker/src/filterAggregateBrowserCommand/filterAggregateBrowserCommand.ts) — constructs the selected browser aggregate command.
- [`filterServiceBrowserCommand.ts`](../../../packages/core/src/serviceSession/filterServiceBrowserCommand.ts) — filters service deltas and private terminal failure.

## Deployed destination enrollment and explicit versions

AggregateChain and ServiceChain activation reconcile supported versions from the executing bundle. Their local membership transactions preserve retained cursors and failures, mark supported destinations active, and mark missing versions inactive. Admission fanout selects active destinations.

- [`onDOActivation.ts`](../../../packages/system-worker/src/AggregateChain/onDOActivation/onDOActivation.ts) — reconciles materializers for this aggregate instance.
- [`onDOActivation.ts`](../../../packages/system-worker/src/ServiceChain/onDOActivation/onDOActivation.ts) — reconciles service materializer membership.

Direct aggregate admission pins the explicit `aggregateVersion`; retries use that retained original executor. Service execution similarly uses an explicit execution version. Neither path selects a mutable base version.

- [`executeAggregateCommand.ts`](../../../packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts) — validates the requested version and returns that materializer's result through the retained admission index.
- [Service command admission](./admitServiceCommand.md)

## Fanout scheduling and terminal failures

Fanout pages contain at most 64 rows, with an exclusive `afterIndex`, optional inclusive `maxIndex`, and the source's whole committed `lastIndex`. Admission feeds use `aggregateIndex` or `serviceIndex`. Aggregate actor result feeds and service result feeds use `executedIndex`.

`drainAfter` retains an alarm lease before the producer and starts delivery after it settles. Fanout producers run synchronously; outbox producers can perform asynchronous preparation before their local commit. Receivers acknowledge durable receipt, and the source records only the delivered row tail—not a newer envelope tip. There is no transaction spanning the receiver RPC and the source acknowledgement. Lost acknowledgements can therefore cause redelivery of complete committed results.

- [`makeFanoutQueue.ts`](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts) — owns paging, source-bound receiver lookup, acknowledgement, and terminal failure persistence.
- [`makeOutboxQueue.ts`](../../../packages/system-worker/src/makeOutboxQueue/makeOutboxQueue.ts) — owns pending output delivery, exact-page acknowledgement, retry metadata, and alarm leases.

Each delivery resolves the persisted subscriber key and invokes its `${name}Subscriber(sourceKey)` capability. Lookup, delivery, decoding, or acknowledgement-write failure becomes a retained terminal subscriber `failure`. Failed subscribers remain stopped across activation and cannot clear that failure by enrolling again. Interrupted attempts without a retained terminal failure resume from durable progress. Outboxes use their own delivery retry policy.

## Subscription and snapshot recovery

A source-bound subscriber reads its owner's durable cursor. `catchup(index?)` fixes its destination to the supplied index or the first response's `lastIndex`. `subscribe(index?)` completes that catch-up before enrolling the resulting cursor. Pull and push use the same owner receive operation.

```mermaid
sequenceDiagram
  participant Caller
  participant FanoutSubscriber
  participant FanoutQueue
  autonumber
  Caller->>FanoutSubscriber: subscriber.subscribe(...)
  loop Until the fixed destination is committed
    FanoutSubscriber->>FanoutQueue: queue.getPage(...)
    FanoutQueue-->>FanoutSubscriber: encoded rows and source lastIndex
    Note over FanoutSubscriber: Apply owner receive operation and reread durable cursor
  end
  FanoutSubscriber->>FanoutQueue: queue.subscribe(...)
  FanoutQueue-->>FanoutSubscriber: encoded enrollment result
  FanoutSubscriber-->>Caller: encoded completion
  FanoutQueue->>FanoutSubscriber: receiver.receive(...)
  FanoutSubscriber-->>FanoutQueue: encoded durable receipt
```

## Annotated workflow steps

1. Subscription first performs bounded catch-up.
   - [`makeFanoutSubscriber.ts:163-168`](../../../packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts#L163-L168) — invokes `catchup` before rereading the enrollment cursor. (`packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts:163-168`)
2. The subscriber requests pages after durable progress, with a fixed upper bound once known.
   - [`makeFanoutSubscriber.ts:89-101`](../../../packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts#L89-L101) — resolves the bound source queue and passes `afterIndex` and optional `maxIndex`. (`packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts:89-101`)
3. The first response fixes an omitted destination. The subscriber applies rows and rereads progress to account for overlapping push delivery.
   - [`makeFanoutSubscriber.ts:102-135`](../../../packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts#L102-L135) — validates the tip, detects missing history or stalled progress, and stops when the fixed destination is committed. (`packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts:102-135`)
4. Catch-up completes before remote enrollment, without a receiver execution permit spanning the request.
   - [`makeFanoutSubscriber.ts:168-176`](../../../packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts#L168-L176) — submits the receiver key and current durable cursor to `queue.subscribe`. (`packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts:168-176`)
5. The source returns after local enrollment and schedules delivery independently of the drain permit.
   - [`makeFanoutQueue.ts:680-695`](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L680-L695) — holds recovery, commits enrollment, and starts `drain` on success. (`packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts:680-695`)
6. Subscription succeeds only after decoding the enrollment response.
   - [`makeFanoutSubscriber.ts:171-178`](../../../packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts#L171-L178) — decodes the source RPC envelope before encoding completion. (`packages/system-worker/src/makeFanoutSubscriber/makeFanoutSubscriber.ts:171-178`)
7. The source resolves the receiver from the retained subscriber identity and delivers the remaining rows.
   - [`makeFanoutQueue.ts:583-591`](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L583-L591) — binds the queue owner key and calls `receiver.receive(delivery)`. (`packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts:583-591`)
8. Successful receipt advances source acknowledgement to the delivered tail; delivery failure follows the durable failure path.
   - [`makeFanoutQueue.ts:589-629`](../../../packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts#L589-L629) — decodes the receipt, writes the cursor, and retains terminal failure if delivery or acknowledgement fails. (`packages/system-worker/src/makeFanoutQueue/makeFanoutQueue.ts:589-629`)

VAR initializes its owned command head. AAVR subscribes to the finalized aggregate result feed and commits projection progress before acknowledging delivery.

- [`onDOActivation.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/onDOActivation/onDOActivation.ts) — subscribes the actor projection to result history.

An actor snapshot first catches the owner up and replays through its captured execution checkpoint. It then captures selected resources, actor indices/hash, and the requesting node's contiguous `resolvedThrough` completion watermark in one synchronous transaction. Publication is awaited through the captured `executedIndex` after that transaction. The snapshot exposes confirmed resources and the watermark, without returning private source command payloads.

- [`getSnapshot.ts`](../../../packages/system-worker/src/AggregateActorVersionRepo/getSnapshot/getSnapshot.ts) — captures selection and checkpoint together, derives the node watermark from receiving history, and drains `browserCommandOutbox` through the captured position.

## Verification

- [Implementation plan](../../archive/plans/030-plan-remove-replicas-and-service-subscriptions.md) — records the destructive removal and scoped verification.

Changed fixed schemas require empty storage. No compatibility decoder or automatic reset is provided.

## Contract return values

Programs yield model operations into a fresh execution-owned collector and return a value checked by their optional result codec. Successful command history retains the encoded result and actual executing contract version in the existing execution JSON column, atomically with owned resource writes. Omitted result codecs require void and store null. Failed application retains no successful result. Result codecs and programs complete synchronously.

## Browser admission and terminal delivery

The browser socket separates admission controls from terminal commands. An aggregate admission success is `{ type: 'aggregateCommandAdmission', id, nodeIndex, admissionIndex, admission, link }`; admission failure is `{ type: 'aggregateCommandAdmissionFailed', id, failure, link }`. `admissionIndex` is the retained aggregate admission position. The telemetry link is retained independently of the settled domain admission. Neither acknowledgement settles a Node submission or advances terminal execution progress.

```mermaid
sequenceDiagram
  participant Synchronization as AggregateNodeSynchronization
  participant ActorChain as AggregateActorVersionChain
  participant ActorRepo as AggregateActorVersionRepo
  ActorChain->>ActorRepo: repo.stageCommands(...)
  ActorChain-->>Synchronization: aggregate admission control
  ActorChain->>ActorChain: getBrowserCommands(...)
  ActorChain-->>Synchronization: direct browser command array
```

## Annotated workflow steps

1. The actor chain prepares ordinary browser input in its bound actor before resolving saved admission.
   - [`onMessage.ts:228-245`](../../../packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts#L228-L245) — Aggregate staging retains original input before the outbox resolves admission. (`packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts:228-245`)
2. The socket returns an explicit admission control with the original ID and Node position.
   - [`onMessage.ts:305-321`](../../../packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts#L305-L321) — Success discloses id, nodeIndex, admissionIndex, admission, and telemetry link; failure carries public failure and link. (`packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts:305-321`)
3. The actor chain reads retained terminal commands and the authenticated selected view.
   - [`getBrowserCommands.ts:187-195`](../../../packages/system-worker/src/AggregateActorVersionChain/getBrowserCommands/getBrowserCommands.ts#L187-L195) — Retained history explicitly constructs the seven public aggregate command fields and filters failure by completion ownership. (`packages/system-worker/src/AggregateActorVersionChain/getBrowserCommands/getBrowserCommands.ts:187-195`)
4. Replay sends the direct bounded command array.
   - [`onMessage.ts:427-432`](../../../packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts#L427-L432) — Bounded replay sends direct command arrays without terminal wrappers. (`packages/system-worker/src/AggregateActorVersionChain/onMessage/onMessage.ts:427-432`)

Live delivery sends one direct terminal command. Replay sends arrays in retained execution order, including missing originating outcomes covered by a Node's resource checkpoint. See [concrete Node replay](../browser/SessionWebSocket.md) for atomic resource application, historical settlement, independent outcome progress, and conflict behavior.
