# Service replication watermark alignment design

**Date:** 2026-07-13
**Status:** Approved for implementation planning

## Problem Statement

AccountRepo currently records every replicated service resource in a separate `replicatedResources` table. Each registry row duplicates the resource identity and carries a per-resource service watermark. The actual service-owned model row is already stored beside the account-owned model rows, and account contracts may only write a service-owned model through `replicateResource`. The duplicate registry therefore represents membership that the model row already represents.

Removing the registry also removes the per-resource service watermark. A single AccountRepo service-subscription watermark can replace it, but only if adding a later resource first aligns every existing replicated row from the current watermark `C` through the new snapshot watermark `W`. Otherwise the AccountRepo either skips required updates for existing rows or replays old updates onto the newly fetched snapshot.

The alignment must also close the race created by awaiting the ServiceRepo snapshot RPC. A Durable Object may process another incoming event while awaiting non-storage I/O, so `handleServiceBlocks` could otherwise advance the local service projection beyond the snapshot being fetched.

## Solution

Use the service-owned model row itself as replication membership and retain one service subscription row per AccountRepo and service. Replace the single-resource ServiceRepo RPC with `getReplicatedResources`, which captures every requested resource for one service at one watermark `W` and returns the retained ServiceBlocks in `(C, W]` from the same ServiceRepo transaction.

AccountRepo collects every `replicateResource` mutation across all commands in one finalization batch, groups the refs by service, and queries all ServiceRepos concurrently. The AccountRepo performs the queries and the following local transaction inside a coarse `blockConcurrencyWhile` gate. The transaction applies the intermediate ServiceBlocks only to model rows that already exist, creates the usual commandless AccountBlocks, inserts the requested snapshots, creates the final command AccountBlock, and advances each service subscription to `W`.

ServiceBlockRepo remains the sole durable delivery queue. Deliveries attempted during the AccountRepo gate remain unacknowledged. After the gate commits and releases, ordinary delivery resumes, skips blocks already covered through `W`, and applies blocks after `W`.

## Goals

1. Remove the AccountRepo `replicatedResources` table and every per-resource service watermark.
2. Treat existence of a service-owned model row in AccountRepo as replication membership.
3. Retain one service subscription and one service watermark per AccountRepo and service.
4. Capture every requested resource for one service at one common watermark per finalization batch.
5. Align existing replicated rows before inserting later resource snapshots.
6. Preserve the current commandless AccountBlock behavior for relevant ServiceBlocks.
7. Preserve atomic command failure when any resource requested by that command is missing.
8. Cover both authoritative account-command finalization and pushed-command finalization.
9. Keep service indexes and alignment metadata private to the system-worker.
10. Make the concurrency and ordering invariants conspicuous in the implementation through numbered walkthrough annotations.

## Non-Goals

1. Do not add `serviceIndex` to `makeServiceModel`, any service resource schema, or any browser-visible resource.
2. Do not add `accountIndex` to `makeModel` or account resource rows.
3. Do not add a `queuedServiceBlocks` table or duplicate ServiceBlock payloads or references in AccountRepo.
4. Do not unsubscribe and resubscribe AccountRepo around resource snapshots.
5. Do not add snapshot, range-query, or command retries.
6. Do not add a per-service in-memory lock, mutex, semaphore, gate map, or other custom concurrency abstraction.
7. Do not add named request, response, grouping, or alignment type aliases. Keep single-use RPC shapes inline.
8. Do not add a shared finalization helper unless it is separately proposed with its exact name and call sites and approved by the user.
9. Do not add compatibility behavior for deprecated `replicatedResources` rows or other stale database state.
10. Do not change resource identity semantics. Service resource ids are monotonic and are never reused after deletion.

## Data Model

1. Delete the AccountRepo `replicatedResources` table.
2. Keep `serviceSubscriptions` as the only AccountRepo replication-control table.
3. Store one `serviceSubscriptions` row per `serviceRepoName` inside an AccountRepo, retaining the separate `serviceName` column established by the in-progress repo-name work.
4. Keep the subscription's current service cursor and service index as the watermark for the complete local projection of that service.
5. Keep the existing subscription delivery fields needed by ServiceBlockRepo subscription and outbox draining.
6. Treat a service-owned model row as subscribed if and only if that row exists in AccountRepo.
7. A ServiceBlock delete removes the model row and therefore ends membership for that resource identity.
8. Do not define recreation semantics for a deleted identity. Resource ids are monotonic, so the same `(serviceName, modelName, resourceId)` must never be created again.
9. Do not persist a watermark on an individual resource row.
10. Do not expose the service subscription watermark through model encoding, AccountBlocks, ActorBlocks, FrontendBlocks, or browser state.

## ServiceRepo `getReplicatedResources`

1. Replace the public `getServiceResource` RPC and same-named `Effect.fn` folder with `getReplicatedResources`.
2. Keep the public Durable Object method as a thin boundary delegating to a same-named `Effect.fn` in `ServiceRepo/getReplicatedResources/getReplicatedResources.ts`.
3. Identify the service through the ServiceRepo Durable Object key. Do not repeat `serviceName` on every resource ref.
4. Accept an inline request containing the AccountRepo's `currentServiceIndex` and an ordered array of `{ modelName, resourceId }` refs.
5. Use `currentServiceIndex: null` for the first subscription. This means there is no existing projection to align and the intermediate block range is empty.
6. In one ServiceRepo SQLite transaction, read the latest service cursor and service index `W`, every requested canonical resource, and every full retained `IServiceBlock` whose index lies in `(C, W]`.
7. Read the intermediate blocks from ServiceRepo's durable `serviceBlockOutbox`, which is committed with canonical service state. Do not depend on asynchronous publication to ServiceBlockRepo for this snapshot transaction.
8. Preserve the complete encoded ServiceBlock shape. Do not rebuild or strip command objects when returning the range.
9. Return resource results in request order so AccountRepo can map each result back to the original command and mutation position without a new exported mapping type.
10. Return a found or missing result for each requested ref rather than failing the entire grouped RPC because one resource is absent.
11. Return one `lastServiceCursor` and `serviceIndex` for the entire result, proving that all found resources were captured at the same `W`.
12. Return the ordered intermediate ServiceBlocks separately from the resource results.
13. Keep unexpected RPC or decoding errors as ordinary preparation failures under the existing error path. Do not add retry classification or retry schedules.

The conceptual request is:

```ts
serviceRepo.getReplicatedResources({
  currentServiceIndex,
  resources: [
    { modelName, resourceId },
    { modelName, resourceId },
  ],
});
```

The conceptual response is:

```ts
{
  resources: [
    { modelName, resourceId, resource },
    { modelName, resourceId, missing },
  ],
  serviceBlocks,
  lastServiceCursor,
  serviceIndex,
}
```

The concrete inline missing-result shape must use existing error encoding conventions. This spec does not approve a new named result type.

## AccountRepo Preparation

1. Preserve the existing command and mutation order produced by the account contracts.
2. Walk the mutations for every command in the finalization batch and identify every `replicateResource` mutation.
3. Record the original command and mutation position for each replication ref so results can be returned to the owning command.
4. Group the refs by `serviceName` across the entire finalization batch, not separately per command.
5. Preserve service-group insertion order according to the first `replicateResource` mutation for that service in command and mutation order.
6. Do not deduplicate mutations merely because multiple commands request the same ref. Preserve positional correspondence and keep the implementation explicit.
7. Read the current AccountRepo subscription watermark `C` for every service group after entering the concurrency gate.
8. Use `null` when the service has no subscription row yet.
9. Issue one `getReplicatedResources` RPC per service group.
10. Start all service-group RPCs concurrently inside the same `blockConcurrencyWhile` callback, subject to the Cloudflare platform's simultaneous outgoing-connection limit.
11. Wait for all service-group results before opening the AccountRepo write transaction.
12. Ignore RPC completion order. Apply successful service-group results later in preserved first-appearance order.
13. Map every found or missing resource result back to its original command and mutation position.
14. If any ref owned by one command is missing, mark that entire command preparation as failed and discard every mutation and snapshot belonging to that command.
15. Preserve other commands in the same finalization batch. A missing resource for command A must not fail unrelated command B.
16. If one command references multiple services and any required service result fails or is missing, fail that entire command.
17. Do not apply or subscribe a service group when every command that references that group has failed.
18. If at least one command referencing a service group remains successful, use that group's intermediate range and snapshots during the transaction.

## AccountRepo Concurrency Gate

1. Use the AccountRepo Durable Object's existing `ctx.blockConcurrencyWhile` primitive rather than adding a custom gate abstraction.
2. Wrap authoritative and pushed finalization preparation plus their AccountRepo transactions in this coarse gate. Batches without `replicateResource` perform no external ServiceRepo snapshot call but remain inside the same simple boundary.
3. Enter the gate before reading any affected AccountRepo service-subscription watermark.
4. Keep the gate held while all `getReplicatedResources` RPCs are in flight.
5. Keep the gate held through the complete AccountRepo alignment and finalization transaction.
6. Release the gate only after the transaction has committed the intermediate AccountBlocks, successful resource snapshots, final command AccountBlock, and service watermarks.
7. Run `drainAccountOutboxes` after the gate releases. Do not hold the gate across ordinary outbox publication or subscription draining.
8. Let incoming `handleServiceBlocks` requests remain blocked and unacknowledged during the gate. Do not copy their blocks into AccountRepo storage.
9. If the AccountRepo is reset while the gate is held, rely only on ServiceBlockRepo's existing unacknowledged-delivery behavior. Do not add a new recovery queue or retry policy.
10. Keep expected preparation and command failures inside the existing encoded failure path so they do not escape the callback as uncaught exceptions.
11. Keep the gated section narrow because `blockConcurrencyWhile` blocks every incoming event for the AccountRepo and has a 30-second callback timeout.
12. Apply the same gate semantics to `finalizeAccountBlock` and `finalizePushedCommands`.

Cloudflare documents `blockConcurrencyWhile` as blocking other events while an async callback performs external I/O and warns that the callback should remain narrow: <https://developers.cloudflare.com/durable-objects/api/state/>.

## AccountRepo Alignment Transaction

1. Begin from the AccountRepo service watermark `C` read inside the gate.
2. Process successful service groups in first-appearance order, regardless of RPC completion order.
3. Process each group's returned ServiceBlocks by ascending `serviceIndex`.
4. Skip any returned block whose index is already at or below the transaction's current service index.
5. For every non-`replicateResource` mutation in an intermediate block, resolve the account controller's model and verify that the model is owned by the delivering `serviceName`.
6. Check the target model table for the mutation's `resourceId` before applying the mutation.
7. Apply the mutation only when the service-owned model row already exists. That row existence is the complete replication-membership test.
8. Do not apply an intermediate create for an absent row. A newly requested resource is inserted later from its canonical snapshot at `W`.
9. Apply an intermediate delete when the row exists. The delete removes both the resource and its replication membership.
10. Collect relevant applied mutations separately for each source ServiceBlock.
11. Advance the transaction's service watermark for every processed source ServiceBlock, even when that block contains no relevant mutations.
12. Create one commandless AccountBlock for each source ServiceBlock containing at least one relevant mutation, preserving the current `handleServiceBlocks` behavior.
13. Do not create a commandless AccountBlock for an intermediate source block with no relevant mutations.
14. After all required intermediate blocks for a service reach `W`, apply canonical `replicateResource` snapshots only for commands whose complete preparation succeeded.
15. Preserve the original encoded `replicateResource` mutation in the successful command's final applied-mutation list. Do not strip the mutation down to a resource write.
16. Insert a first service-subscription row at `W` when no subscription existed.
17. Advance an existing service-subscription row to `W` after its projection and successful snapshots are aligned.
18. Finalize every command outcome using the existing per-command account cursor and account index rules.
19. Create the one final AccountBlock for the finalized authoritative command batch or pushed block after every intermediate commandless AccountBlock.
20. Commit the intermediate AccountBlock outbox rows, final AccountBlock outbox row, resource mutations, and service-subscription watermarks in the same AccountRepo transaction.
21. Do not commit any intermediate AccountBlock, snapshot, subscription change, or watermark advancement if the AccountRepo transaction fails.

## AccountBlock Ordering

1. ServiceBlock boundaries remain visible as commandless AccountBlocks when they contain relevant replicated-resource mutations.
2. Intermediate AccountBlocks precede the final command AccountBlock because the existing projection must reach `W` before snapshots at `W` join it.
3. Within one service, commandless AccountBlocks follow ascending `serviceIndex`.
4. Across services, commandless AccountBlocks follow service-group first-appearance order from the original command and mutation sequence.
5. There is no cross-service cursor or timestamp ordering. Do not invent one.
6. The final AccountBlock retains the existing collection of executed and failed command outcomes for that finalization batch.
7. The final AccountBlock's applied mutations contain only mutations from successful commands.

## Ordinary ServiceBlock Delivery

1. Keep ServiceBlockRepo as the only durable archive and delivery queue for service subscriptions.
2. Keep one ServiceBlockRepo subscriber row per AccountRepo and service.
3. After the AccountRepo gate releases, let any waiting delivery enter `handleServiceBlocks` normally.
4. Read the AccountRepo service-subscription watermark and skip every delivered block at or below it.
5. Apply later blocks using the model-row-existence membership test described above.
6. Advance the service-subscription watermark through irrelevant blocks as well as relevant blocks.
7. Create commandless AccountBlocks only for delivered blocks containing relevant mutations.
8. A delivery containing blocks through `W` after alignment becomes an idempotent skip. A delivery containing blocks after `W` advances the complete projection normally.
9. Preserve ServiceBlockRepo's existing behavior for failed or unacknowledged deliveries. Do not add retry behavior in AccountRepo.

## Failure Semantics

1. A requested resource missing at snapshot `W` is an authoritative domain failure for its owning account command.
2. If one command requests several resources and any one is missing, none of that command's mutations, snapshots, subscription changes, or watermark changes may commit.
3. Other commands in the same finalization batch may still succeed.
4. An RPC, decode, validation, or unexpected snapshot preparation error follows the existing command-preparation failure path.
5. Do not add retries for `getReplicatedResources`, range reads, decoding, alignment, or AccountRepo finalization.
6. Do not add retry classifications or retry schedules as part of this design.
7. Existing ServiceBlockRepo redelivery remains unchanged and is not a new `replicateResource` retry.
8. Do not add fallback behavior for an absent `replicatedResources` table or stale persisted registry rows. Wipe or explicitly migrate stale environments only after separate user approval if implementation is blocked.

## Authoritative and Pushed Finalization

1. Implement the same replication protocol in `finalizeAccountBlock` and `finalizePushedCommands`.
2. Preserve the full authoritative or pushed command object throughout each existing ledger path.
3. Preserve each path's existing final AccountBlock provenance, including `pushedBlockId` for pushed finalization.
4. Preserve existing per-command success and failure isolation within one finalization batch.
5. Do not introduce a shared helper solely to make the two implementations concise. The user has approved the protocol, not a new abstraction.
6. Keep public Durable Object methods as thin runtime boundaries delegating to their same-named domain `Effect.fn` implementations.

## Annotation Requirements

1. Use the repository `annotate` function-walkthrough format for every function that owns a material phase of this protocol.
2. Put a numbered phase overview immediately above each relevant `Effect.fn`.
3. Add matching `// N — ...` inline checkpoints at each phase boundary, early exit, transaction boundary, and post-gate action.
4. Keep overview and inline checkpoint numbers synchronized.
5. Annotate `getReplicatedResources` with the single-transaction snapshot invariant: resource rows, watermark `W`, and `(C, W]` are one coherent ServiceRepo view.
6. Annotate authoritative preparation with the cross-command grouping rule and per-command result mapping.
7. Annotate pushed preparation with the same grouping and atomic-command rules.
8. Annotate the AccountRepo concurrency boundary with why `getReplicatedResources` must execute inside `blockConcurrencyWhile`.
9. Annotate the AccountRepo transaction with why `(C, W]` applies before the new snapshots and why only previously existing rows receive the intermediate mutations.
10. Annotate the watermark write with why later ServiceBlock delivery may safely skip through `W`.
11. Annotate the post-gate outbox drain with why it must occur after releasing `blockConcurrencyWhile`.
12. Annotate `handleServiceBlocks` with the invariant that model-row existence is replication membership.
13. Explain that ServiceBlockRepo, not AccountRepo, remains the durable queue while the gate is held.
14. Keep comments focused on ordering, ownership, and failure invariants. Do not annotate every statement or turn the code into a general tutorial.

## Approved Explicit Iteration

1. Walk every prepared command and mutation to collect replication refs and their original positions.
2. Walk service groups to initiate their ServiceRepo RPCs concurrently.
3. Walk the requested refs inside `getReplicatedResources` to read canonical rows.
4. Walk settled service-group results in preserved first-appearance order.
5. Walk each group's ServiceBlocks by ascending service index.
6. Walk each ServiceBlock's mutations to test model-row membership and apply relevant mutations.
7. No other loop, grouping layer, deduplication pass, or mapping abstraction is approved by this spec without a concrete need discovered during implementation.

## Testing Decisions

1. Extend `packages/system-worker/src/ServiceRepo/ServiceRepo.workerd.spec.ts` for `getReplicatedResources`.
2. Prove multiple requested resources are captured at one service cursor and service index.
3. Prove `currentServiceIndex: null` returns a first-subscription snapshot with no intermediate range.
4. Prove a later `currentServiceIndex: C` returns exactly the retained full ServiceBlocks in `(C, W]`.
5. Prove found and missing results preserve request order and do not turn one missing resource into a whole grouped-RPC failure.
6. Prove the snapshot remains coherent when a service finalization competes with the grouped read: the result must be wholly before or wholly after the competing service commit.
7. Extend `packages/system-worker/src/AccountRepo/AccountRepo.workerd.spec.ts` for grouped multi-command preparation and alignment.
8. Prove one missing ref fails every mutation of its owning command while an unrelated command from the same grouped lookup succeeds.
9. Prove a command referencing multiple resources performs no partial writes when one ref is missing.
10. Prove existing replicated rows receive `(C, W]` before requested snapshots at `W` are inserted.
11. Prove the new snapshots do not receive `(C, W]` a second time.
12. Prove intermediate commandless AccountBlocks precede the final command AccountBlock and retain source ServiceBlock boundaries.
13. Prove parallel ServiceRepo RPC completion order does not alter first-appearance application order.
14. Prove incoming `handleServiceBlocks` cannot interleave through the `blockConcurrencyWhile` snapshot and transaction window.
15. Prove queued delivery resumes after the gate, skips through `W`, and applies blocks after `W`.
16. Exercise both `finalizeAccountBlock` and `finalizePushedCommands` without adding a new test harness or helper abstraction.
17. Update the existing replication coverage in `packages/system-worker/src/FrontendRepo/FrontendRepo.workerd.spec.ts`.
18. Replace direct `replicatedResources` table assertions with service-owned model-row existence and the single service-subscription watermark.
19. Preserve end-to-end assertions that later relevant service mutations reach AccountRepo, ActorRepo, and FrontendRepo while irrelevant resources do not.
20. Prove no `serviceIndex` field appears in the browser-visible resource shape.

## Documentation Decisions

1. Update the relevant `wiki/architecture/` block-ledger and replication workflow pages in the implementation pass.
2. Replace descriptions of per-resource registration and per-resource watermarks with model-row membership and one AccountRepo service watermark.
3. Document `getReplicatedResources`, the `(C, W]` alignment transaction, the `blockConcurrencyWhile` boundary, and ServiceBlockRepo's durable-queue ownership.
4. Update glossary terminology if it currently implies per-resource subscription state.
5. Refresh architecture source paths, line citations, hashes, and diagrams according to the repository wiki rules.
6. Do not change static pattern guidance unless implementation discovers a genuinely reusable rule beyond this workflow.

## Completion Criteria

1. AccountRepo has no `replicatedResources` table or registry access.
2. No service-owned model or browser resource carries `serviceIndex`.
3. No account-owned model gains `accountIndex`.
4. ServiceRepo exposes `getReplicatedResources` and no production caller uses `getServiceResource`.
5. Every finalization batch issues at most one grouped replication RPC per referenced service.
6. All referenced services are queried concurrently inside one AccountRepo `blockConcurrencyWhile` window.
7. Existing service projections align through `W` before successful snapshots at `W` are inserted.
8. Intermediate AccountBlocks and final command AccountBlocks commit in the specified deterministic order.
9. Missing resources fail their owning commands without partial command writes or unrelated-command failure.
10. ServiceBlockRepo remains the only durable queue and ordinary delivery resumes correctly after the gate.
11. Authoritative and pushed finalization share the same observable replication semantics.
12. The required numbered walkthrough annotations explain every non-obvious ordering invariant beside the implementation.
13. The confirmed workerd test seams pass through Nx.
14. Affected architecture documentation is synchronized in the same implementation pass.
