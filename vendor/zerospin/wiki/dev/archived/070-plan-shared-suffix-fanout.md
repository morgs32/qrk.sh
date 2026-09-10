# Shared-suffix fanout implementation plan

**Date:** 2026-09-06
**Status:** Archived; original scheduling policy superseded by the verified continuous fanout refactor on 2026-09-07.
**Source:** [Spec 070](./070-spec-shared-suffix-fanout.md)

> Historical design: the one-suffix, one-attempt, retryable-failure policy below was replaced. Current behavior is documented in [fanout scheduling and terminal failures](../../architecture/server/admitCommands.md#fanout-scheduling-and-terminal-failures).

## Queue implementation

1. Replace source-table querying with owner `getSuffix(afterIndex)` and
   `getIndex(row)`, inferring the row through delivery and subscriber typing.
   Remove fanout `hasPending`. Validate optional `concurrency`, default 100.
2. Serialize drains and enrollment. Fetch one suffix per drain, from the oldest
   subscriber cursor, and reuse it across SQL subscriber pages ordered by
   normalized cursor and primary key.
3. Keep the original page boundary and exclude attempted identities before SQL
   LIMIT using one JSON-array parameter, avoiding an expanding bind-parameter list.
   Deliver each subscriber's slice once per drain and persist only advancing cursors.
4. Capture typed failures and thrown defects at each subscriber attempt; persist
   lastDeliveryFailure in the queue and continue other subscribers. Preserve
   cancellation. Clear diagnostics on acknowledged progress. If diagnostic storage
   fails, return both the original diagnostic and persistence failure in the error.
5. Hold the alarm on nonempty drains and failures. Only empty subscribers or an
   empty owner suffix release it; later alarms resume work.

## Callers and documentation

1. Adapt all five existing owner callbacks to return bounded contiguous suffixes
   using their 64-command constants. Preserve full rows and owner wakeups.
2. Remove duplicate subscriber failure writes from owners and propagate their
   errors to the queue, preserving domain handling such as ACC's halt decision.
3. Update fanout guidance and architecture citations. Keep the ongoing Plan 069
   schema and frontend migration outside this change.

## Verification and completion

1. Run SQLite-backed queue and subscriber tests covering shared reads, sorted
   paging, SQL exclusion, concurrency, failure/defect persistence and clearing,
   partial/no progress, cursor resets, serialization, alarms, and prefix wakeups.
2. Run existing ACC and SCC tests, plus system-worker typechecking through Nx.
   Do not repair unrelated concurrent Plan 069 work to force these checks green.
3. Verification was explicitly deferred by the user when archiving this plan.
   Those deferred checks were subsequently covered by the replacement refactor below.
4. Last observed results: 23 isolated queue/subscriber tests passed. Broader chain
   tests failed amid concurrent Plan 069 changes (cutover expectations, command
   schemas, and a WASM import). Full typechecking was blocked by Core frontend-command
   errors; the temporary focused typecheck did not pass because its type libraries
   could not resolve. These results do not establish full integration verification.

## Replacement verification — 2026-09-07

1. Continuous `drain(lastIndex)` replaces mutable subscriber page boundaries and attempted IDs with oldest eligible queries and pending IDs. Partial progress continues in the same drain; persisted `failure` is terminal, including after cold activation and re-enrollment attempts.
2. Passed 48 Node tests across queue/subscriber and affected chain suites, plus three aggregate/service workerd tests. New queue coverage includes individual slot refill, backward suffix refetch, concurrent index extension, cold subscription alarms, terminal failure persistence, acknowledgement storage failure, and scoped interruption.
3. Passed `nx run system-worker:tsc:typecheck` and `nx run system-worker:ts`, including test typechecking. `nx run system-worker:lint` passes with one unrelated existing `Rpc` no-undef warning in `makeDORepo.ts`; changed fanout files have no warnings. Fanout formatting and `git diff --check` pass. A subsequent concurrent queue rename left an unformatted declaration in `AggregateChain.ts`; that WIP was preserved.
4. Local/test system IDs now use `sys_local_20260907_fanout` and `sys_shopping_20260907_fanout`. No existing storage was deleted. Subscriber schemas cut over directly to `failure`; outbox schemas and retries remain separate.
