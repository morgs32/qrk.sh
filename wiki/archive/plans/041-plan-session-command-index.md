# Use sessionIndex for every retained session command

**Date:** 2026-10-05
**Status:** Completed and verified on 2026-10-05.
**Discussion:** [Start explorer](codex://threads/01a10dac-dc21-76d2-b0f9-b8480ba87bb4).
**Existing architecture:** [ADR 002](../../adrs/002-concrete-browser-node-journals-and-worker-routing.md) and [completed plan 040](040-plan-live-command-synchronization.md).

## Problem and recovered decisions

1. Before this cutover, aggregate session storage had two local sequences: `journalIndex` identifies every retained row, while nullable `sessionIndex` orders locally staged submissions. Received commands already belong to the session's observed history; their arrival does not justify a second row counter.
2. The discussion proposed assigning `sessionIndex` to every newly retained session command and removing session-side `journalIndex`. Keep the row position stable through admission, execution, replay, and retained-history restoration.
3. The prerequisite one-stream change is implemented: synchronized sessions initialize once, then consume command data through the ordered Node subscription. Acceptance acknowledges retention with `{ id }`; retries republish retained command data through that subscription. This plan preserves that behavior.
4. Node journals still require an independent occurrence identity and submission sequence. This work consolidates session bookkeeping; it does not replace Node `journalIndex`, `nodeIndex`, or `changeIndex`.
5. Before this cutover, standalone restore kept command rows but reset `nextSessionIndex` when it mints a new live `sessionId`. Once `sessionIndex` is the row key, that reset would collide with retained history. Restore must preserve the allocator with the retained database.

## Terminology and behavior

| Coordinate                    | Meaning after this change                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session `sessionIndex`        | Positive, stable primary key and first-retention order of a row in one session database. Every retained row has one, including received staged input and terminal-only history. |
| Session `nextSessionIndex`    | Next available row position in that retained database; starts at one for empty history and advances only when a new row commits.                                                |
| Aggregate command `sessionId` | Existing nullable originating-session provenance. Locally authored input keeps its original value; assigning an index to received history does not manufacture provenance.      |
| Node `journalIndex`           | Existing stable primary key of a retained Node command occurrence.                                                                                                              |
| `nodeId` and `nodeIndex`      | Existing durable Node submission identity, shared by attached tabs.                                                                                                             |
| `executedIndex`               | Existing terminal execution position used for occurrence matching and deduplication.                                                                                            |
| `changeIndex`                 | Existing Node mutation order and committed session subscription cursor.                                                                                                         |

1. Apply the same retained-row meaning to aggregate and service session databases. Service storage gains `sessionIndex` and `nextSessionIndex` in place of its journal key and allocator; it gains no originating-session field or new public staging contract.
2. Allocate a session position locally on first retention. The same Node command can have different positions in two tabs because their observation histories differ. Never derive it from Node `journalIndex`, `nodeIndex`, `changeIndex`, or execution position.
3. A locally staged command uses the same `sessionIndex` in its returned command, retained row, and optimistic operation bookkeeping. Received input, admission updates, first terminal settlement, and duplicate delivery preserve that position.
4. A distinct execution occurrence of a repeated command ID gets a distinct session row and index. Preserve the originating submission's first terminal result. Command ID alone is neither a row key nor an update predicate for a selected occurrence.
5. `sessionIndex` says where a row was retained, not who authored it or whether it can be submitted. Preserve existing complete-input decoding, nullable provenance, local-origin notification tracking, and uncertainty bookkeeping.
6. Replay accepted pending commands in Node order, followed by uncertain local submissions in session order. Retention order must not replace authoritative execution order or Node submission order.
7. Commit the allocator, command row, optimism, resources, settlement, and checkpoint changes together through existing synchronous transaction boundaries. Publish live-query changes and terminal notifications after commit. Rollback advances no index or cursor.
8. Fresh empty session history starts at one. Reconnect and standalone restore preserve retained keys and `nextSessionIndex`, even when the current live `sessionId` changes. Only an explicitly fresh database/history may restart the sequence.

## Scope and alternatives

1. Update aggregate/service session schemas, every writer and reader of those schemas, standalone/mock/transient agent initialization, optimistic replay, occurrence-aware UI, fixtures, and affected documentation.
2. Preserve concrete Node schemas, Node history RPC pagination with `afterJournalIndex`, server admission/execution coordinates, the one-stream protocol, and the separate transient Studio agent runtime. Do not add a service local-staging mechanism or extend private input disclosure.
3. Keep Node and session indexes separate in source, tests, and Explorer schema capture. An exhaustive search must leave the intentional Node uses intact rather than perform a repository-wide text replacement.
4. Keeping both session counters duplicates the identity and ordering of the same retained rows. Keeping `journalIndex` alone discards the session-specific name selected in the discussion. Using command ID collapses repeated executions; using Node positions cannot identify uncertain local submissions or every foreign terminal occurrence.
5. Changed fixed schemas require empty storage. Implement a hard cutover with no compatibility aliases, legacy fields, fallback decoders, translated backups, migration paths, or automatic storage deletion. Restore tests use backups created under the new schema.
6. Preserve unrelated work, including current Explorer layout changes and independent server/staging refactors. Reuse their resulting entrypoints; do not repeat those refactors or revert them to older shapes.

## Implementation steps

1. **Replace the session schema coordinates.** In [`sessionRepoDbConfig.ts`](../../../packages/core/src/aggregateSession/sessionRepoDbConfig.ts), make `commands.sessionIndex` the non-null integer primary key, remove `commands.journalIndex`, remove the redundant unique index on `sessionId`/`sessionIndex`, replace the optimistic operations key with `sessionIndex`, and remove metadata `nextJournalIndex`. Keep nullable command `sessionId` as existing origin provenance. In [`serviceSessionRepoTables.ts`](../../../packages/core/src/serviceSession/serviceSessionRepoTables.ts), replace both journal keys with `sessionIndex` and metadata `nextJournalIndex` with `nextSessionIndex`. Update inferred row types and schema fixtures outright.
2. **Use one allocator for local staging.** Update [`applySessionCommandTx.ts`](../../../packages/core/src/aggregateSession/stageCommand/applySessionCommandTx/applySessionCommandTx.ts), pending staging, and local execution transactions to allocate only `nextSessionIndex`. Insert the command and its inverse operations with the same key. Preserve synchronous typed results, encoded persistence, and the transaction's existing failure boundaries. Reject invalid/exhausted positive safe-integer allocation before committing writes.
3. **Allocate positions for received rows.** In [`importAggregateNodeCommands.ts`](../../../packages/core/src/aggregateSession/importAggregateNodeCommands.ts) and [`importServiceNodeCommands.ts`](../../../packages/core/src/serviceSession/importServiceNodeCommands.ts), reuse the matched row's `sessionIndex`, otherwise allocate metadata `nextSessionIndex`. Cover both staged and terminal commands, including safe-integer/overflow validation. Advance the allocator exactly once per newly retained occurrence, rereading transactional metadata between new rows in a page. Duplicate deliveries and admission-only updates consume no position. Use `sessionIndex` for upserts, selected-row updates, and inverse lookup; preserve existing input/conflict validation, execution deduplication, covered historical settlement, resource application, and commit-before-cursor advancement.
4. **Preserve replay and initialization semantics.** Update both replay procedures' inverse keys and final ordering coordinate to `sessionIndex`, retaining Node order first. Remove comments claiming session positions restart on acquisition. Update aggregate/service snapshot application and Node-projection initialization to populate the sole allocator and preserve it whenever they retain history. In [`applyAggregateSessionSnapshotTx.ts`](../../../packages/core/src/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshotTx/applyAggregateSessionSnapshotTx.ts), update the selected recovery row by `sessionIndex` rather than mutating every row sharing `id`. Keep admission and checkpoint validation intact.
5. **Restore retained history without restarting its sequence.** In [`makeStandaloneSession.ts`](../../../packages/browser/src/makeStandaloneSession/makeStandaloneSession.ts), retain the restored `nextSessionIndex` when assigning the current metadata `sessionId`; retain command indexes and original row `sessionId` values. Preserve this on ownership reacquisition as well as initial restore. Explicit reset replaces history with a fresh seed and may start at one; restoring subsequently backed-up history preserves its counter again. Keep the existing exact-schema gate rejecting old backups with `standalone-backup-unreadable` and requiring explicit reset. Do not reconstruct deprecated backups or silently renumber rows. The backup worker's raw SQLite snapshot/SQL-batch protocol needs no change.
6. **Update browser and transient callers.** Update standalone/mock initializers, retained-command decoding, and [`makeAgentSession.ts`](../../../packages/browser/src/makeAgentSession.ts) push/admission row mutations to use `sessionIndex`. Agent initialization remains a fresh transient database; reconnect retains its current history. Keep Node submission schemas omitting session-local coordinates, and preserve existing command origin and failure-notification behavior. Received history with an index still requires complete original local input before it is eligible for submission.
7. **Update occurrence views and consumer queries.** Use session `sessionIndex` for aggregate and service Commands row keys and ordering, Studio agent occurrence keys, and Shopping queries over session tables. Keep absent-input cells empty, repeated-ID rows distinct, and remount/reconnect history stable. Expose the session coordinate for both domain views in the DevTools column definitions. Update Node history consumers separately only where they also read session tables; their `journalIndex` remains valid.
8. **Update fixtures and schema capture.** Replace session-schema assertions and inserts in core, browser, React, Studio, Shopping, and the static cutover check. In the SharedWorker fixture, serialize non-null `sessionIndex`, remove the session `journalIndex`, and replace `optimisticJournalIndexes` with `optimisticSessionIndexes`. Preserve Node `journalIndex` assertions. Regenerate Explorer's schema data through its existing capture command without reverting unrelated canvas work, and update schema-sensitive tests only for the actual session column changes.
9. **Reconcile documentation after implementation.** Add the implemented retained-row definition of `sessionIndex` to [`wiki/glossary.md`](../../glossary.md), narrow its `journalIndex` definition to Node storage, and update the command-preservation pattern and affected browser bootstrap/push/replay workflows with accurate diagrams, annotations, and citations. Document preserved keys and allocation in [IndexedDbBackupCoordination](../../architecture/browser/IndexedDbBackupCoordination.md). Amend ADR 002's journal wording to distinguish Node and session coordinates while retaining its governing routing/recovery decisions; create a successor only if the actual implementation replaces a qualifying decision. Leave archived plan 040 as the historical implementation record.
10. **Verify and complete the plan.** Run the regressions and scoped checks below, review the diff for intentional remaining Node uses and removed session legacy fields, record results, and archive this file with repaired links only when implementation, verification, and documentation are complete.

## Verification

1. **Aggregate and service row retention:** receive staged input and terminal-only history, then local/received updates. Assert every row has a non-null unique positive `sessionIndex`, first-retention order is stable, and the sole allocator advances only for new rows. Include multiple new rows in one subscription page and different observation orders in two tabs.
2. **Repeated command IDs and retries:** retain the originating first terminal result and a later distinct execution as different rows. Redelivery, admission updates, and acceptance retries preserve existing indexes. Exercise snapshot recovery so it changes the selected occurrence only.
3. **Atomic failure:** force failure after allocating a position and writing part of a staged/imported page. Resources, command rows, inverse operations, allocator, and subscription cursor must roll back together with no live-query publication. A successful retry uses the unconsumed next position. Invalid or exhausted allocators reject new retention without mutation.
4. **Optimistic replay:** verify undo/reapply references the correct indexed occurrence. Accepted pending work remains in Node order; uncertain local work follows in retained session order, including local work staged after received rows.
5. **Standalone retention:** create a new-schema backup with command history and a next position greater than one, restore into a new live session identity, then stage another command. Assert old keys/provenance and resource state remain, new allocation continues above retained history, and ownership reacquisition does not restart the counter. Standalone local execution remains completed locally and retains no pending inverse rows. Explicit reset replaces history and restarts allocation; a later restore of newly backed-up history continues its allocator. Existing mounted standalone tests cover local rows but not real backup restoration. Extend the browser's existing SharedWorker Playwright fixture with the production `backupWorkerPlugin()` from `@zerospin/backup-worker/vite` and exercise the actual standalone backup/acquisition lifecycle. A metadata-only unit test does not establish restoration behavior.
6. **Wire and origin boundaries:** keep Node command input free of session coordinates; preserve Node journal keys and `afterJournalIndex` pagination. Received rows with an index and absent origin/input remain history, not resubmittable local commands. Originating failure callbacks still fire once after committed stream settlement.
7. **Mounted UI and transient agent:** retain distinct rows for repeated IDs, stable keys through updates and remounts, service visibility of `sessionIndex`, absent-input rendering, and cleanup. Exercise transient agent push/admission updates and reconnect without acquiring durable Node/backup infrastructure.
8. **Scoped checks:** extend the existing core Node outcome, browser SharedWorker, React mounted SQLite, transient agent, Studio fixture, and Explorer schema seams. Add standalone backup lifecycle coverage to the SharedWorker fixture as specified above. Refresh captured schema data first; capture has no configured Nx task:

   ```sh
   node explorer/scripts/capture-schema.mjs
   ```

   Run one graph with explicit projects so shared library prerequisites execute once:

   ```sh
   pnpm nx run-many \
     --projects=@zerospin/core,@zerospin/browser,@zerospin/react,@zerospin/devtools,@zerospin/studio,shopping,system-worker,explorer \
     --targets=lint,ts,typecheck,test,node-outcomes:check,agent-preview:check,shared-worker:check,preview:build,static-cutover:check
   ```

   These project definitions and check names were inspected while planning; completed checks are recorded below. Shopping `ts` runs the same three TypeScript configurations as its `tsc:typecheck` alias, so the graph covers that check without a duplicate invocation. Use Explorer's real `typecheck` task; its inferred `tsc:typecheck` task is disabled. The static cutover task belongs to `system-worker`. Keep unrelated failures and existing dependency-pattern warnings outside scope unless they block a required check; record a bounded diagnosis and next action.

9. **Mounted Studio fixture:** run `pnpm nx run @zerospin/studio:agent-fixture:serve`, open `/src/fixtures/agentPreview.html` at its reported server origin, and inspect the self-running result after updating occurrence assertions. Verify the separate transient session runtime stays transient. Follow Shopping's `AGENTS.md`: no application browser verification; its session-query changes use scoped typechecks and permitted fixture seams.
10. **Completion evidence:** record the actual command results and mounted fixture outcome here. Check formatting and local documentation links, review the scoped diff, and confirm no session-schema use of `journalIndex`/`nextJournalIndex` remains while intentional Node uses survive.

## Outcome and verification evidence

1. Aggregate and service retained command rows now use a non-null primary `sessionIndex`, with one `nextSessionIndex` allocator. Optimism, replay, selected-occurrence snapshot recovery, DevTools, Studio, Shopping queries, fixtures, and Explorer schema capture use that coordinate. Node `journalIndex`, `nodeIndex`, and history pagination retain their domain meanings. Nullable aggregate command origin is preserved independently of the retained row key.
2. Standalone restore and ownership reacquisition preserve row positions, originating session values, resources, and the allocator while minting a new current session identity. Explicit reset starts empty history; later restore continues that new history. Existing fixed-schema backups require explicit reset; no compatibility path or automatic deletion was added.
3. Verification exposed and resolved an unsafe-integer allocation bug: wa-sqlite reads oversized SQLite integers as bigint. All three allocators now validate before arithmetic and serialize invalid diagnostics as strings. Matched imports retain their allocator without computing a successor. Tests preserve exact failure codes and assert atomic rollback of resources, rows, inverses, metadata/cursor, and publication. The approved unrelated service-staging blocker was already repaired by concurrent committed work; its definition-only helper input and validated failure codec compiled successfully.
4. Scoped verification passed core/browser/React/DevTools/Studio/Shopping/system-worker TypeScript checks and their library prerequisites, core Node durable outcome and agent declaration fixtures, browser transient agent fixture, Shopping fulfillment fixture, and Studio production preview build. Explorer lint, its real typecheck, and all 11 tests passed. The final graph used:

   ```sh
   pnpm nx run-many \
     --projects=@zerospin/core,@zerospin/browser,@zerospin/react,@zerospin/devtools,@zerospin/studio,shopping,system-worker \
     --targets=ts,test,agent-preview:check,shared-worker:check,preview:build
   ```

5. React passed all 99 tests across five files, including interleaved received/local retention, differing tab observation orders, repeated-ID snapshot isolation, malformed/exhausted/occupied allocation rollback, replay ownership, mounted row stability, and service visibility. The final browser task was interrupted after 33 tests by the tooling restart; its independent rerun completed successfully:

   ```sh
   pnpm nx run @zerospin/browser:shared-worker:check
   ```

   All 34 tests passed, including the production IndexedDB backup restore, ownership takeover/reacquisition, explicit reset, and restore of newly reset history. This is actual backup-worker lifecycle coverage, not metadata simulation.

6. Ran `pnpm nx run @zerospin/studio:agent-fixture:serve` and inspected its self-running mounted fixture at `/src/fixtures/agentPreview.html`. All 36 assertions passed, including shared received/local positions, preserved admission/reconnect keys and allocator, repeated-ID row isolation, and zero Worker/SharedWorker acquisitions. Recovery fixtures now use encoded ISO phase timestamps consistently with bootstrap input. Temporary fixture browser tabs and the Studio server were released.
7. Scoped lints and `system-worker:static-cutover:check` passed; final lints were rerun for core, DevTools, React, and Studio after fixes. Existing lint warnings and Nx Cloud access code 401 remain outside scope; they did not prevent successful local checks. Scoped formatting and diff checks passed. Source-document maintenance verified 62 source entries, 138 source-range links, 146 local links, and four matching sequence/step pairs. Exhaustive review found only intentional Node/history uses and explicit absence assertions for session-side legacy fields.
8. Explorer schema data was regenerated with `node explorer/scripts/capture-schema.mjs`: 65 tables and 644 columns. Glossary, governing ADR 002, the command-preservation pattern, and the four affected browser workflows describe the implemented boundaries. Unrelated Explorer and server work was preserved.

## Remaining work

None.
