# Queryable aggregate instance registration

Status: Complete. Approved, implemented, and verified in chat on 2026-10-03.

## Agreed behavior

1. Give SystemRepo a dedicated `aggregates` table with one immutable identity row per `{ aggregateName, aggregateId }`, scoped by the owning `{ systemId }`. Prefer the clearer domain model over adding aggregate-specific columns to the mixed Repo registry.
2. Register the aggregate when its AggregateChain registers after spec acceptance. Commit aggregate identity and Repo metadata together in one synchronous transaction; repeated activation must not duplicate either row.
3. List aggregate IDs and check exact identity membership through SQL against `aggregates`, without scanning Repo registrations or parsing physical names on reads. A registered aggregate is not a successful authorization or initialization receipt.
4. Preserve Studio's current ID picker, local filtering, and public `getAgentAggregateIds({ aggregateName, aggregateVersion })` request/response. Aggregate version remains an authored-definition availability check, not part of aggregate instance identity.

## Implementation

1. Add the aggregate table and a unique index on `(aggregateName, aggregateId)`. Keep `repos` unchanged for generic Repo inspection. Forward the already-parsed activation key; AggregateChain registration explicitly supplies aggregate name and typed ID. Reject an AggregateChain key belonging to a different configured system before registration and decode its physical aggregate ID once without casts.
2. Require aggregate identity on the AggregateChain branch of `IRepoRegistration`. Accept existing spec locks before a synchronous transaction upserts Repo metadata and inserts aggregate identity idempotently. Remove the unused bulk Repo-registration path rather than retain duplicate registration contracts.
3. Add SystemRepo `getAggregateIds({ aggregateName })` with stable aggregate-ID ordering and `hasAggregate({ aggregateName, aggregateId })`. Replace the agent ID list and agent-session existence scan with these direct queries, preserving current capability and actor checks.
4. Extend the existing isolated Workerd Repo lifecycle verification for registration, identity queries, idempotence, restart, spec rejection, and transactional rollback. Keep unrelated work in progress intact.
5. Update lifecycle/Studio/architecture documentation and reconcile the existing glossary with the implemented ownership. No new named concept or ADR is expected; create an ADR only if the implemented result meets the repository's criteria.

## Verification and rollout

1. Run scoped Core and system-worker type, lint, and formatting checks with their required dependencies, then the Workerd Repo lifecycle check. Review only the files changed for this work.
2. Verify non-AggregateChain Repos do not create aggregate rows, queries filter by aggregate name, exact membership rejects wrong names and missing IDs, repeat registration/restart retains a single row, and failed spec acceptance, invalid IDs, wrong-system keys, or a failed second write leave no partial registration.
3. Changed fixed SystemRepo storage requires empty storage before rollout. Do not backfill from Repo names or admission logs, add migrations/fallbacks, or reset existing user storage in this task. Verification uses isolated fresh storage.
4. After implementation and required checks pass, record the outcome and archive this plan with repaired relative links.

## Outcome

1. SystemRepo now owns a dedicated `aggregates` table with unique aggregate name/ID pairs. Accepted AggregateChain registration commits Repo metadata and aggregate identity in one synchronous transaction. Other Repo kinds retain only generic registration metadata.
2. AggregateChain registration and exact membership require `IAggregateId`. Activation decodes the physical aggregate ID once without casts and rejects a different configured system before registration.
3. Agent discovery and session existence checks use direct SQL identity queries. Public requests/responses and Studio's picker behavior remain unchanged; aggregate version remains an authored-definition availability check.
4. Removed the unused bulk-registration API and its stale documentation reference. Updated lifecycle, Studio, architecture, and glossary documentation. No new domain term or qualifying ADR was introduced.

## Verification results

- Passed `CI=true pnpm nx run-many -t ts lint -p @zerospin/core system-worker`, including five dependency tasks.
- Passed explicit changed-file `pnpm exec oxfmt --check` and scoped diff whitespace checks.
- Passed `CI=true pnpm nx run system-worker:repo-lifecycle:check` with fresh isolated Workerd storage. The fixture binds its test SystemRepo and AggregateChain classes, types inspection through a test-only namespace, and awaits activation failures.
- Verified sorted, name-filtered listings and exact membership, including the same ID under different aggregate names; only AggregateChain registration creates identity rows. Repeated registration and cold restart retain one row per identity.
- Verified rejected specs, invalid aggregate IDs, and mismatched system IDs leave both registration tables and child storage unchanged. An injected SQLite failure during the aggregate insert rolls back the preceding Repo metadata write; removing the failure allows retry to commit both rows.
- Verified the actual agent-list API returns empty and sorted registered-ID lists, and preserves authored name/version availability failures.
- Nx Cloud reported a non-blocking remote-cache access failure; all local gates passed. No repository-wide validation is claimed for unrelated concurrent work.
- Existing user databases were preserved. Rollout requires empty SystemRepo storage; no migration, backfill, compatibility path, or reset was added.

## Remaining work

None.
