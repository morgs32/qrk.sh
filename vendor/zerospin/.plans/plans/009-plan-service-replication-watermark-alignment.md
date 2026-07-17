# 009 — Service Replication Watermark Alignment Implementation Plan

**Source spec:** `../archived/009-spec-service-replication-watermark-alignment.md`

> Preserve the current repo route components. Full command preservation, replication alignment, and subscription-watermark requirements remain active.

## Summary

1. Remove AccountRepo's duplicate `replicatedResources` registry and use service-owned model-row existence as replication membership.
2. Replace `getServiceResource` with grouped `getReplicatedResources`, returning one coherent resource snapshot and retained ServiceBlock suffix per service.
3. Collect replication refs across every command in one authoritative or pushed finalization batch and query referenced services concurrently.
4. Hold a coarse AccountRepo `blockConcurrencyWhile` gate across preparation and the local transaction, then drain outboxes after releasing the gate.
5. Align existing replicated rows through each snapshot watermark before inserting newly requested snapshots and advancing the one service-subscription watermark.
6. Preserve command atomicity, commandless AccountBlock boundaries, full encoded command shapes, ServiceBlockRepo queue ownership, and browser-visible resource shapes.

## Relationship to Active Plan 008

1. Implement this plan on top of the current table-bound references and repo-releases WIP. Do not restore pre-008 names, primitives, route keys, or table construction.
2. Preserve `serviceSubscriptions.serviceRepoName` as the subscription row identity and preserve the separate `serviceName` column.
3. Preserve current repo routing and every in-progress prefixed repo-name, primary-key, cursor, ref, and merged-table change that is unrelated to replication alignment.
4. Supersede only plan 008's temporary instruction to retain the AccountRepo `replicatedResources` logical identity. Plan 009 removes that table completely.
5. Resolve the current partial `replicatedResources` table edit by deleting the table and its consumers, not by restoring or finishing its old shape.
6. Do not add compatibility state for either the old registry or the pre-008 subscription identity.

## Implementation

1. Remove the AccountRepo replication registry without disturbing subscription identity.
   1. Delete `accountRepoTables.replicatedResources` from `packages/system-worker/src/AccountRepo/AccountRepo.ts`.
   2. Keep `serviceSubscriptions` keyed by the in-progress `serviceRepoName` primary key and retain `serviceName`, `currentServiceCursor`, `currentServiceIndex`, subscription delivery state, and failure state.
   3. Remove every query, insert, update, delete, index, schema reference, and test assertion that targets `accountRepoDrizzleSchemas.replicatedResources`.
   4. Do not add a replacement membership table, queued-block table, per-resource service watermark, hidden resource column, or compatibility schema.
   5. Keep `makeResourceDbConfig` pointed at the account controller's model tables plus the remaining AccountRepo control tables.

2. Replace the single-resource ServiceRepo snapshot RPC.
   1. Delete `packages/system-worker/src/ServiceRepo/getServiceResource/getServiceResource.ts` after migrating its only production caller and tests.
   2. Add the approved public method folder `packages/system-worker/src/ServiceRepo/getReplicatedResources/getReplicatedResources.ts` with the same-named `Effect.fn`.
   3. Replace the `ServiceRepo.ts` import and public `getServiceResource` method with a thin public `getReplicatedResources` method delegating to the new Effect.
   4. Keep request and response shapes inline in the Effect and public RPC signatures. Add no named type alias or interface.
   5. Accept `currentServiceIndex` plus an ordered array of `{ modelName, resourceId }` refs. Derive `serviceName` from the ServiceRepo key at the Durable Object boundary.
   6. Use `currentServiceIndex: null` to represent a first subscription with no existing projection and no intermediate range.
   7. In one `makeTx` transaction, resolve each requested model from the keyed service controller, read the latest service cursor/index `W`, read every requested model row, and read `serviceBlockOutbox` rows in `(C, W]` ordered by `serviceIndex`.
   8. Decode and return each full `IServiceBlock`; do not reconstruct or strip its encoded command arrays.
   9. Return resource results in request order as an inline tagged found/missing union. Use the existing `replicated-service-resource-not-found` error encoding for missing rows without failing the whole grouped RPC.
   10. Treat an invalid model, model-owner mismatch, missing service watermark, block-decode error, or transaction error as a top-level RPC failure.
   11. Return one `lastServiceCursor` and `serviceIndex` for the whole response so every found resource is explicitly tied to the same `W`.
   12. Do not add retry, polling, publication waiting, or a fallback read from ServiceBlockRepo.

3. Reshape authoritative preparation around the complete finalization batch.
   1. Keep `prepareAccountCommands` as the existing named Effect; do not introduce a replacement preparation service or helper.
   2. Add the existing AccountRepo `db` to its props so it can read current `serviceSubscriptions` before grouped RPCs.
   3. First prepare account-contract mutations for every command and preserve each command-level `Either` result without performing a resource RPC inside the mutation loop.
   4. Walk successful command mutations in original command/mutation order, validate every `replicateResource` model against its owning service controller, and record each ref's original command and mutation position.
   5. Group refs by `serviceName` across the entire finalization batch using first appearance as insertion order.
   6. Preserve duplicate refs when separate mutations request them. Do not add a deduplication pass or compound-key utility.
   7. Compute the in-progress `serviceRepoName` for each service group and read its current AccountRepo subscription watermark by that key.
   8. Start one `getReplicatedResources` RPC per service group concurrently, with no more simultaneous requests than the Cloudflare outbound-connection limit.
   9. Settle all group results before opening the AccountRepo write transaction and retain first-appearance order independently of completion order.
   10. Map each found/missing result back to its owning command and mutation position.
   11. Convert a missing result or top-level group failure into failure for every owning command that requires that result.
   12. When one command has any missing or failed replication result, discard all mutations for that command, including valid non-replication mutations and valid snapshots from other services.
   13. Preserve unrelated successful commands from the same finalization batch.
   14. Return the prepared commands plus inline ordered service-alignment data needed by the transaction. Add no named preparation/group/alignment result type.
   15. Omit a service alignment from transaction work when every command referencing that service failed.

4. Batch pushed-command preparation before grouped resource lookup.
   1. Keep the existing account scope, session, version, frontend payload, adapter, and target-contract validation in `finalizePushedCommands`.
   2. Adapt all valid pushed commands to their full `IAccountCommand` forms before calling `prepareAccountCommands`.
   3. Preserve adapter or validation failures at their original pushed-command positions.
   4. Call `prepareAccountCommands` once with all successfully adapted account commands rather than once per pushed command.
   5. Merge the batched preparation results back into the original pushed-command order without rebuilding or narrowing the pushed command objects.
   6. Fail an owning pushed command atomically when any grouped resource result it requires is missing or failed.
   7. Preserve unrelated pushed commands and the existing immutable pushed-block idempotency lookup.
   8. Do not add a pushed-specific grouping helper or a second ServiceRepo snapshot protocol.

5. Put both finalization paths inside the approved coarse AccountRepo gate.
   1. In the `AccountRepo.finalizeAccountBlock` RPC boundary, run authoritative preparation and the AccountRepo transaction inside `this.ctx.blockConcurrencyWhile`.
   2. In the `AccountRepo.finalizePushedCommands` RPC boundary, run pushed preparation and the AccountRepo transaction inside the same coarse primitive.
   3. Keep non-replication batches inside this simple boundary; they perform no external ServiceRepo snapshot RPC and therefore release quickly.
   4. Keep `drainAccountOutboxes` outside and after the gate for both public methods.
   5. Preserve the existing RPC envelope and encoded `ZerospinError` behavior.
   6. Convert expected Effect failures through the existing handler path so they do not escape `blockConcurrencyWhile` as uncaught callback exceptions.
   7. Do not hold the gate across AccountBlockRepo publication, ServiceBlockRepo subscription, alarms, or ordinary outbox draining.
   8. Do not add a gate wrapper function, private gate map, named lock type, mutex, semaphore, or persisted alignment marker.
   9. Keep the callback narrow enough to remain within Cloudflare's 30-second `blockConcurrencyWhile` timeout and add no retry around a timeout or reset.

6. Apply service alignment before authoritative command finalization.
   1. Extend the existing `finalizeCommandsTx` inputs with the account name and ordered service-alignment data required by the already-open AccountRepo transaction.
   2. Resolve the account controller once inside the Effect for model ownership and model-table access.
   3. Start the local account index from the existing last AccountRepo index before creating any intermediate AccountBlocks.
   4. Process active service groups in first-appearance order and their returned ServiceBlocks in ascending `serviceIndex`.
   5. Skip blocks already covered by the transaction's current subscription index.
   6. For each non-`replicateResource` service mutation, resolve the model, verify `model.serviceName` matches the group, and select the mutation's resource id from that model's AccountRepo table.
   7. Apply a service mutation only when the target row already exists. Do not apply an absent-row create while aligning.
   8. Let an applied delete remove the row and therefore end replication membership for that monotonic resource identity.
   9. Advance the local service watermark for every processed ServiceBlock, including blocks with no relevant mutations.
   10. For each ServiceBlock with relevant mutations, allocate the next account cursor/index, create the same commandless AccountBlock shape used by ordinary service delivery, and upsert its outbox row.
   11. After the service group reaches `W`, apply canonical `replicateResource` snapshots only for commands whose complete preparation succeeded.
   12. Insert or update the one `serviceSubscriptions` row at `W` using `serviceRepoName`, retaining `serviceName` for routing and diagnostics.
   13. Finalize executed and failed account commands after every intermediate AccountBlock so the final command AccountBlock receives later account positions.
   14. Preserve each successful command's full encoded `replicateResource` mutation in the final applied-mutation list.
   15. Keep intermediate AccountBlocks, resource writes, subscription watermarks, command outcomes, and the final AccountBlock outbox row in the same `makeTx` transaction.
   16. Do not extract the service-block application loop into a new shared helper without separate approval.

7. Apply the same alignment protocol to pushed finalization.
   1. Add the ordered active service alignments to the existing `finalizePushedCommands` transaction before its per-command savepoint loop.
   2. Repeat the explicit model-owner, row-existence, mutation-application, watermark, and commandless AccountBlock phases from authoritative finalization.
   3. Preserve first-appearance service ordering and ascending `serviceIndex` ordering.
   4. Apply successful pushed-command snapshots only after existing rows reach each service's `W`.
   5. Keep failed pushed commands free of all mutation and snapshot writes while allowing unrelated pushed commands to succeed.
   6. Preserve `pushedBlockId`, full encoded pushed command provenance, per-command account cursors/indexes, and the final flat AccountBlock outbox row.
   7. Insert or advance each active `serviceSubscriptions` row once at `W` after alignment.
   8. Commit all intermediate and final outbox rows in the existing pushed-finalization transaction.
   9. Do not create a shared authoritative/pushed alignment helper merely to remove the intentional explicit duplication.

8. Replace ordinary ServiceBlock registration checks with model-row membership.
   1. Update `packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts` to keep subscription lookup by `serviceRepoName` and retain `serviceName` validation.
   2. Keep incoming block ordering and skip every block at or below the subscription watermark.
   3. Resolve each mutation's model from the account controller and verify that the model belongs to the delivering service.
   4. Query that model's AccountRepo table for the mutation resource id before applying it.
   5. Skip the mutation when the row does not exist; row absence means the account is not replicating that identity.
   6. Apply updates and deletes only to rows that exist at that point in mutation order.
   7. Remove the old registration lookup, per-resource index comparison, and registry delete.
   8. Continue advancing the one service-subscription watermark through every processed block.
   9. Continue creating one commandless AccountBlock only when a source ServiceBlock contains relevant mutations.
   10. Keep `drainAccountOutboxes` after the local delivery transaction and preserve ServiceBlockRepo's current acknowledgment/redelivery behavior.

9. Preserve ServiceBlockRepo as the only durable queue.
   1. Do not add AccountRepo queue storage, block references, subscription generations, pause flags, or unsubscribe/resubscribe calls.
   2. Leave ServiceBlockRepo subscriber persistence, retained ServiceBlocks, retry counters, alarms, and delivery ordering unchanged except for request/field changes already owned by plan 008.
   3. While AccountRepo finalization holds `blockConcurrencyWhile`, let ServiceBlockRepo's delivery RPC remain pending and unacknowledged.
   4. After the AccountRepo gate commits and releases, let the waiting delivery re-enter normally.
   5. Prove that blocks at or below the committed `W` are skipped and blocks after `W` are applied.
   6. Add no new retry behavior for replication snapshot or alignment failures.

10. Add the required function-walkthrough annotations while implementing behavior.
   1. Add a numbered overview and matching `// N — ...` checkpoints to `ServiceRepo.getReplicatedResources`.
   2. Annotate `AccountRepo.prepareAccountCommands` with cross-command collection, service grouping, parallel RPC settlement, and per-command failure mapping.
   3. Annotate the public `AccountRepo.finalizeAccountBlock` and `AccountRepo.finalizePushedCommands` boundaries with gate acquisition, gated finalization, gate release, and post-gate drain.
   4. Annotate `finalizeCommandsTx` and the pushed transaction with intermediate ServiceBlock application, existing-row membership, snapshot insertion, AccountBlock ordering, and watermark commit.
   5. Annotate `handleServiceBlocks` with row-existence membership, delete behavior, watermark advancement, and commandless AccountBlock creation.
   6. Explain beside the code that ServiceRepo returns `(C, W]` because waiting ServiceBlockRepo delivery cannot be consumed inside the snapshot transaction.
   7. Explain beside the code that the new snapshots must join only after the old projection reaches `W`.
   8. Explain beside the code why outbox draining occurs after `blockConcurrencyWhile` releases.
   9. Keep annotation numbers synchronized and preserve all still-relevant existing comments.

11. Replace and extend focused workerd coverage.
   1. Update `packages/system-worker/src/ServiceRepo/ServiceRepo.workerd.spec.ts` from `getServiceResource` to `getReplicatedResources`.
   2. Prove multiple refs return in request order at one cursor/index `W`.
   3. Prove `currentServiceIndex: null` returns snapshots without an intermediate range.
   4. Prove a later request returns exactly full retained ServiceBlocks in `(C, W]`.
   5. Prove a missing resource is reported for that ref while other refs in the grouped RPC remain found.
   6. Preserve and extend the existing concurrent service-finalization test so a grouped snapshot is wholly before or wholly after the competing commit.
   7. Update `packages/system-worker/src/AccountRepo/AccountRepo.workerd.spec.ts` with a grouped multi-command case where one command is entirely failed by one missing ref and another command succeeds.
   8. Prove a command containing valid non-replication mutations plus one missing replication ref writes none of that command's mutations.
   9. Prove an existing replicated row receives `(C, W]`, the new snapshot does not receive the suffix twice, and the subscription ends at `W`.
   10. Start finalization and `handleServiceBlocks` concurrently through existing Durable Object RPCs and prove service delivery cannot interleave through the gated snapshot/transaction window.
   11. Assert intermediate commandless AccountBlocks precede the final command AccountBlock and preserve source ServiceBlock boundaries.
   12. Exercise both authoritative and pushed finalization in the existing AccountRepo suite.
   13. Use at least two service groups to prove RPC completion does not alter first-appearance application order when the current fixtures support both services; extend fixture data directly if required, without adding a fixture helper abstraction.
   14. Update `packages/system-worker/src/FrontendRepo/FrontendRepo.workerd.spec.ts` to remove registry-table assertions while preserving the full ServiceRepo to AccountRepo to ActorRepo to FrontendRepo replication path.
   15. Assert membership through service-owned model-row existence and the one service-subscription watermark.
   16. Assert browser-visible replicated resources contain no `serviceIndex`.
   17. Add no new test harness, production delay hook, generic fixture builder, or test helper abstraction.

12. Synchronize architecture docs and remove obsolete terminology.
   1. Update `wiki/architecture/Blockchain.md` for grouped snapshots, the coarse AccountRepo gate, `(C, W]` alignment, model-row membership, and ServiceBlockRepo queue ownership.
   2. Update any other affected `wiki/architecture/` workflow page that still cites `getServiceResource`, `replicatedResources`, or per-resource watermarks.
   3. Update `wiki/glossary.md` so AccountRepo service watermark and replicated-resource membership match the new behavior.
   4. Refresh source paths, line citations, source hashes, diagrams, and the wiki log according to the repository wiki rules.
   5. Remove stale test comments and source comments that describe registration rows or per-resource service indexes.
   6. Do not add a static LLM-wiki pattern unless implementation reveals a reusable rule beyond this specific workflow.

## Testing and Verification

1. Run focused system-worker typecheck and lint through Nx.

   ```text
   nx run system-worker:ts
   nx run system-worker:lint
   ```

2. Run system-worker unit and workerd suites through Nx.

   ```text
   nx run system-worker:test
   nx run system-worker:test:workerd
   ```

3. Run focused workerd tests for ServiceRepo, AccountRepo, and FrontendRepo first when the target supports file filtering, then run the complete workerd target.
4. Run affected typecheck, lint, and tests after focused system-worker verification passes.

   ```text
   nx affected -t ts,lint,test
   ```

5. Verify removed production surfaces and stale documentation are gone.

   ```text
   rg -n "replicatedResources|getServiceResource" packages/system-worker/src wiki/architecture wiki/glossary.md
   ```

6. Review every remaining `serviceIndex` occurrence and prove it belongs only to internal ServiceRepo, ServiceBlockRepo, AccountRepo subscription, block, or ledger state—not a model resource or browser payload.
7. Verify no AccountRepo-owned `queuedServiceBlocks`, alignment queue, unsubscribe path, or retry schedule was introduced.

   ```text
   rg -n "queuedServiceBlocks|unsubscribe.*Service|retry.*Replicated|replicated.*retry" packages/system-worker/src
   ```

8. Audit the final diff.

   ```text
   git diff --check
   git status --short
   ```

9. Confirm the diff contains no new `ALLOWED_CAST`, unapproved `as const`, named type assignment, helper/wrapper/service, barrel export, dependency, compatibility field, or deprecated-state branch.
10. Keep this plan active until the full behavior, focused tests, complete system-worker checks, affected checks, and architecture synchronization are implemented and verified.

## Guardrails

1. Preserve all unrelated WIP, especially active plan 008's repo names, releases, table refs, primitives, and subscription identity changes.
2. Do not restore, prettify, or stabilize unrelated changed files while implementing this plan.
3. Do not add `ALLOWED_CAST` comments. Stop for explicit user permission if an unavoidable assertion would require one.
4. Do not add `as const` unless TypeScript demonstrably requires it and the user explicitly approves it.
5. Add no named type alias or interface for RPC results, grouped refs, prepared commands, alignment state, or transaction state.
6. Add no new helper, wrapper, utility, service, shared alignment function, concurrency abstraction, queue table, or barrel export without a separate proposal and explicit approval.
7. Use only the explicit loops approved in the source spec and keep them verbose and annotated.
8. Keep public system-worker Repo methods in same-named method folders and keep async methods as thin runtime boundaries.
9. Preserve full encoded command shapes across ServiceBlocks, AccountBlocks, pushed blocks, and downstream ledger delivery.
10. Do not expose service indexes through models, AccountBlock mutations, ActorRepo projections, FrontendRepo state, or browser resources.
11. Do not add retry behavior, partial command execution, resource-id reuse behavior, persisted-state compatibility, or fallback paths.
12. Ship authoritative, pushed, error, ordering, gate, delivery-resume, and documentation behavior together; do not leave a partial implementation or follow-up stub.
