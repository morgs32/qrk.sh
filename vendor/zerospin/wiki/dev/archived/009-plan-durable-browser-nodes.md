# Durable nodes for synchronized browser sessions

## Implementation status — complete

Completed on `main` on 2026-09-25.

- Aggregate and service sessions now attach to durable SharedWorker nodes backed by asynchronous SQLite on IndexedDB. Stable node identity, flat command retention, atomic acceptance, shared pause, single-command manual push, snapshot-first subscriptions, and paginated history are wired through the browser API and DevTools.
- Server admission enforces contiguous node positions and retains original duplicate admissions. Snapshots provide a resolved-through watermark; authenticated subscriptions recover node outcomes before continuing resource execution updates. Replacement resources, outcomes, and checkpoints commit together.
- Tabs preserve synchronous optimism and retry uncertain handoffs by stable command ID. Authentication uses bounded concurrent signature responders. The persistent catalog supports transient-outage reopening, explicit sign-out without deleting work, and discovery of older definitions under their original identity.
- Synchronized backup and tab-superseding paths have been removed. Standalone storage and backup behavior are preserved. Examples and browser architecture documentation use the new protocol.
- Changed fixed schemas require empty storage. There are no compatibility decoders, translation migrations, or automatic storage resets. The local durable-machines backend was explicitly started with clean development storage for integration verification.

### Verification

- Browser: 32 unit tests; core: 15 unit tests; system-worker: 19 unit tests and 4 workerd tests. All passed through scoped Nx targets, along with their TypeScript checks.
- Three Chromium integration tests passed against durable-machines: concurrent tabs and shared pause; worker shutdown/reconnection, manual push and sign-out; and full browser restart with offline reopening followed by online recovery.
- React, DevTools, Shopping, and tic-tac-toe TypeScript checks passed. Durable-machines typecheck, production build, and tests passed. Shopping was not opened in a browser.
- Changed TypeScript files passed scoped lint with no warnings or errors; formatting and `git diff --check` passed. DevTools has no unit test files, so its existing test target is not counted as a passing suite.
- Nx Cloud remote caching reported an access error; the local checks completed successfully.

## Accepted plan

## Summary

Replace the aggregate/service backup mechanism with a **Node** that owns durable command storage, server synchronization, and recovery. **`BrowserNode`** is its browser RPC interface; **`SharedWorker.ts`** hosts it.

Tabs retain synchronous contract execution and optimistic SQLite views. Multiple tabs may use the same node concurrently. Standalone sessions retain their existing behavior outside this overhaul.

## Ownership, storage, and command ordering

1. Each node represents one authenticated target and session definition. Its database key includes the backend/system, authenticated identity, target, and complete definition-lock hash. Changing which tabs are connected does not change that key.

2. Persist a random `nodeId` with the database. Restarting preserves it; recreating the database creates a new identity. Use `nodeIndex` for this node’s command order, replacing durable session-origin numbering.

3. Construct structured resource tables from the definition’s serialized model descriptions and indexes. Use Drizzle with the worker’s asynchronous SQLite storage. Executable contracts and application services remain in tabs.

4. Store confirmed resources, synchronization metadata, and one flat `commands` table. Retain complete command rows and their resolved outcomes indefinitely. Do not introduce separate pending/history copies or another outbox position.

5. `stageCommand` keeps its synchronous optimistic result. The tab then hands the complete occurrence to the node using its stable command ID. In one transaction, the node deduplicates that ID, allocates the next `nodeIndex`, and stores the command. Durable acceptance is reported separately; only committed commands can be pushed.

6. Retrying an existing ID returns the retained command, including its assigned index and any outcome. Preserve uncertain handoffs for retry. The accepted crash gap remains between the synchronous tab result and the node’s durable commit.

7. Serialize database operations inside the worker. Network requests and tab callbacks must never hold that serialization boundary. Publish changes only after commit.

8. Persist “pause push” per node and share its state across tabs. “push now” attempts the next queued command without clearing the pause.

## Server protocol and recovery

1. Carry `nodeId` and `nodeIndex` through admission, execution, and retained actor outcomes. Server-originated commands have no node provenance. Bind node-originated traffic to the authenticated target and session.

2. Enforce contiguous admission atomically:
   - An existing command ID returns its stored command.
   - A new command must have the next index for its node.
   - A mismatch returns the expected index. Reconcile missing work; never silently renumber a conflicting command.

3. Successful execution and terminal business failure both resolve a node position. Admission alone does not resolve it.

4. Server snapshots contain confirmed resources, the existing execution checkpoint, and the requesting node’s resolved-through position captured at that checkpoint. **Do not bundle command outcomes or require pending-command-ID lists.**

5. Extend the existing authenticated subscription to resume from two positions: the resource `executedIndex`/hash and the last durably recorded outcome `nodeIndex`. Replay missed outcomes for this node through the resource checkpoint, then continue ordinary execution updates over the same connection. Query the existing retained server history; do not create another durable outcome log.

6. Historical outcomes already covered by a snapshot fill in command history without reapplying their resource deltas. Receiving a snapshot watermark does not advance the outcome cursor. Publish the replacement state to tabs only after outcomes through that watermark are recovered.

7. Keep the previous consistent local state usable if recovery is interrupted. Persist recovered state, outcomes, and their applicable checkpoints transactionally so restart cannot mistake incomplete recovery for completion.

8. A definition change opens a fresh node. Older nodes retain their original definitions and continue sending independently. Unsupported definitions or unavailable authentication leave their work visibly blocked, never translated or discarded. There is no ordering guarantee between different nodes beyond server admission order.

## Tab API, authentication, and lifecycle

1. Keep the existing initialization API with `generateSignature`. Each tab exposes it through an RPC target. The node requests signatures only when authentication is needed; no proactive signature publication, application renewal URL, or server renewal hook is required.

2. Initial attachment authenticates the caller’s signature to choose the correct node. Subsequent authentication requests fan out concurrently to eligible registered tab targets. Accept the first server-verified signature matching the node’s existing identity. Failed, frozen, or late responders cannot block others.

3. Share one authentication attempt among concurrent callers and bound its wait. An unbroken RPC connection is not evidence of responsiveness. Retry on relevant attachment/resumption and transient retry signals; avoid accumulating repeated pending calls to an unresponsive target. Never rebind queued commands to a different authenticated identity.

4. Tabs attach through a snapshot-first subscription. Capture the snapshot and register the subscriber together, then deliver ordered committed changes. The snapshot includes confirmed resources and unresolved commands. Reconcile uncertain local handoffs by ID and replay optimism in node order, followed by still-unaccepted local commands in their submission order.

5. Reconnecting tabs obtain another local snapshot. Do not add a durable node-to-tab event log or per-tab resume cursor. Slow subscribers must not block the node or other tabs; they can reconnect and resnapshot.

6. Provide paginated command-history queries for DevTools. Do not copy completed history into every tab on attachment. Expose durable acceptance, local availability, authentication, synchronization, blocked work, and shared push state distinctly.

7. Move offline identity lookup into a persistent worker catalog. On network failure, reopen the last successfully authenticated node for that session and definition. Explicit authentication rejection does not trigger offline fallback.

8. Ordinary network outages permit offline staging. Known local persistence failure or explicit authentication/authorization rejection stops new staging while preserving the current view and pending work. A nonresponding tab alone does not establish an authentication rejection.

9. `dispose()` detaches a tab. Add an explicit authentication-clearing operation for application sign-out: suspend affected nodes, close their authenticated connections, invalidate outstanding authentication attempts, and disable remembered offline reopening. Preserve their databases for a later authenticated login.

10. The catalog makes older pending nodes discoverable after worker restart. Their authentication may use eligible responders from newer definitions of the same logical session, subject to server verification against the original node identity. SharedWorker shutdown does not imply continuous background execution; durable work resumes when a host is available again.

## Cutover and validation

1. Hard-cut synchronized sessions to the new protocol and storage. Update their callers, React integration, DevTools, examples, tests, and architecture documentation together. Remove their SQL-forwarding, whole-database backup copying, and tab-superseding paths. Preserve the separate standalone path.

2. Require empty storage for changed fixed schemas. Do not add compatibility aliases, legacy decoders, translation migrations, or dual synchronized-session implementations.

3. Test primarily through BrowserNode and server admission/subscription boundaries:
   - Concurrent tabs receive unique, ordered indexes and converge after optimistic replay.
   - Crashes before/after local commit, lost acceptance replies, lost admission replies, and worker restart preserve idempotency.
   - Missing or reused indexes produce typed errors without renumbering.
   - Successes and failures resolve contiguous prefixes.
   - Snapshot recovery plus outcome replay restores complete history without double-applying changes or optimism.
   - Attachment and replay/live transitions lose no committed updates.
   - Frozen, rejected, late, and differently authenticated signature responders cannot stall or rebind a node.
   - Offline reopening, explicit sign-out, storage failure, persisted pause, and independent old-definition sending follow the agreed behavior.
   - Completed history is queried on demand, and standalone behavior remains unchanged.

4. Run scoped package checks and browser integration tests for the affected paths. The current implementation status is recorded above.
