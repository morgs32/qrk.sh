# Remove replicas and service subscriptions

Status: Complete, 2026-10-02. Approved destructive cut implemented and scoped verification completed.

## Scope

1. Delete replica declarations, metadata, operations, capture/enrollment persistence and source ingestion/recovery.
2. Delete service subscriptions, inbound/emissions, observed models, imported history and delivery routes.
3. Preserve owned command execution, synchronous transactions, actor projections, sessions and optimistic replay. Preserve unrelated command-history and async-contract WIP.
4. Leave dependent application callers unresolved. Changed fixed schemas require empty storage; no compatibility or replacement reads.

## Execution and outcome

1. Snapshotted the initial dirty source and patch outside the checkout, then edited the existing command-history and async-contract work in place without resetting unrelated changes.
2. Removed `makeReplica`, `.replicate()`, source metadata, replica validation, inferred aggregate service pins, codecs/replay branches and SDK exports. Removed replica-only tombstone fields and table-reference aliases.
3. Removed aggregate resource reads/captures, resource enrollment and source input paths; removed observed models, source progress, imported commands/operations, source-delivery queues and recovery RPCs. Services now contain only owned models, contracts, queries and actors. Their serialized specifications contain no subscriptions, inbound or emissions.
4. Removed source-only tables and the redundant mixed-input index tables. Owned command rows supply admission and execution paging. Retained shared history, actor/session fanout and independent aggregate publication/original-result outboxes. Remaining resource application and replay use synchronous `makeTx`/savepoint boundaries.
5. Removed the capture-specific fixture/check. Retained generic admission, forwarding, actor delivery and restart checks independently, including owned actor projection retry and page rollback assertions.
6. Updated current architecture, glossary, patterns and source READMEs. [Plan 025](025-plan-captured-operations-and-resource-subscriptions.md) is superseded. [Plan 011](011-plan-actor-staging-and-gated-listener-execution.md) now records user-approved retirement of the obsolete listener lifecycle and completed verification of surviving actor staging; the earlier carry-forward statement was stale. [Plan 027](027-plan-actor-bound-async-contracts.md) completed and verified the explicit mapped async redesign; async external observations are independent of deleted replica captures. [Plan 028](028-plan-studio-agent-query-preview.md) is completed and archived.

## Removal audit and intentional breakage

- Authored core, worker, SDK and browser implementation contains no `makeReplica`, `replicate`, replica/source metadata, capture/enrollment tables, observed-model tables, imported histories, service subscription declarations, inbound/emissions declarations, or removed source recovery RPCs.
- Shopping still calls `sdk.makeReplica` in `aggregates/shopper/models/productReplica/ProductReplicaV1.ts` and `.replicate()` in AddToCart V1/V2/V3. Shopper aggregate/actor/session registrations and cart-item references still depend on that declaration. These callers are intentionally unresolved and require later application redesign. No replacements or compatibility exports were added; Shopping/Tic Tac Toe checks were not run, retaining the maintainer's earlier prohibition recorded in plan 025.
- Historical references under `wiki/archive/`, plan 025, and the explicitly superseded `wiki/research/aggregate-service-replication-indexes.md` document removed behavior. Active plan reconciliation references describe superseded work, not implementation. Plan 027's planned async emissions are a separate unfinished feature.
- Shared fanout subscribers, actor projections, session snapshots, browser synchronization and rollback-state capture remain. Generated Cloudflare declaration references to D1 replicas and the Replicate AI provider are unrelated platform types.
- Changed fixed schemas require empty storage. No storage was automatically deleted, translated or decoded through fallbacks.

## Verification

- `pnpm nx run-many -t ts lint -p @zerospin/core system-worker @zerospin/browser`: passed. Worker/browser lint has no errors or warnings; core lint has no errors and 18 existing warnings in ongoing async/contracts/authoring work.
- `pnpm nx run @zerospin/sdk:lib`: passed. SDK exposes no separate `ts` or `lint` task.
- `pnpm nx run-many -t contract-programs:check command-history:restart:check async-contracts:check -p system-worker`: passed. Covers owned execution/results, savepoint rollback, owned actor projection and retry/page rollback, terminal admission, independent delivery deletion, retained optimism and both aggregate acknowledgement orders across disposable Workerd SQLite restarts. Existing async recording/recovery checks pass without implementing plan 027's redesign.
- `pnpm nx run-many -t node-outcomes:check agent-preview:check -p @zerospin/core @zerospin/browser`: passed. Covers session ID correlation, outcomes, replay, rollback/restart, snapshot gating, checkpoint conflicts and browser preview synchronization.
- Nx Cloud reports access code 401; local checks pass. Whole-workspace success is not required. At this cutover, the intentionally broken applications and broader listener/async matrices were outside its acceptance scope. The listener matrix is now retired under plan 011; async verification completed under plan 027, and Shopping completed under plan 031.

## Remaining work

None within this removal. Application redesign is deferred; unrelated unfinished work remains in plans 011, 027 and 028.
