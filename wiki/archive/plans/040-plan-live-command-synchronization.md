# Split browser Nodes and restore live command synchronization

## Agreed behavior

1. Implement concrete AggregateNode and ServiceNode runtimes, each owning its schemas, journal, synchronization, authentication integration, and recovery. Share SQLite, hashing, serialization, and RPC primitives only.
2. Keep one application worker entry, `makeSharedWorker({ sqliteWasmUrl })`, and dispatch once using shared RoutePattern construction/parsing for `/zerospin/aggregate/:sharedWorkerVersion/:sessionKey` and `/zerospin/service/:sharedWorkerVersion/:sessionKey`. Validate version/key before ports and bound identity independently during attachment.
3. Replace definitionKey with sessionKey, the hash of bound session definition, owner identity, and claims. Use aggregate name/version/ID or service name/version without an invented service ID.
4. Deliver flat aggregate browser commands with id, commandName, selected delta, nullable public failure, executedIndex, executedHash, aggregateIndex. Service browser commands use executedIndex, serviceHash, serviceIndex. Preserve hash semantics, model filtering, authorized failure visibility, and minimal disclosure.
5. Concrete staged commands contain submitted input/staging, assigned nodeId/nodeIndex, and nullable admissionIndex. Admission updates staged state; terminals settle it. Deliver commands and command arrays directly; retain telemetry envelopes only where required. Public worker RPC errors retain existing public fields/codes and omit stacks/causes.
6. Every journal row has a stable journalIndex primary key separate from command ID. Local submissions receive nodeIndex; foreign and later repeated-ID occurrences allocate no additional submission. A durable changeIndex advances for row changes, allocated transactionally with resources, originating settlement, and checkpoints. Publish after commit.
7. Deduplicate terminals by execution position, retain each distinct occurrence, and preserve the originating submission's first terminal result. Retain numeric aggregateIndex/serviceIndex checkpoints, execution/hash progress, nextNodeIndex, and contiguous outcomeIndex. Admission is a separate coordinate.
8. Fresh Nodes install one authenticated baseline. Reconnect resumes committed execution/outcome cursors without resource replacement. Retry transient failures; preserve data and block on conflicts.
9. Fresh tab capture atomically includes resources/checkpoints, unresolved staged commands, and the starting change cursor. Reconnect uses afterChangeIndex and bounded direct command arrays, replaying known staged input before its terminal. Advance tab delivery progress after application commits; slow subscribers read independent SQLite backlogs.
10. Both tab kinds keep flat journals and optimistic inverse bookkeeping. Transactionally undo optimism, merge commands, apply uncovered authoritative changes, replay unresolved Node order followed by uncertain local submissions, and advance progress. Notify live queries after commit. Covered historical terminals retain history/settlement without stale delta application.
11. Restore useLiveQueryOnDb for aggregate and service Commands views, occurrence-safe keys, empty absent-input cells, and current observation history across navigation/toggles/reconnect. Remove one-shot history branches. Fresh initialization starts a new observation window.

## Verification

1. Extend core node-outcomes:check for both concrete Nodes: filtering, repeated IDs, covered history, failures, empty deltas, rollback, reopen, contiguous replay, and checkpoint conflicts.
2. Add browser shared-worker:check using package-local Vite and Playwright Chromium with the actual built worker/WASM. Verify same-identity sharing, cross-domain isolation, invalid names/identities, public RPC errors, cross-tab order, uncertain acceptance, reconnect/disposal, and slow replay beyond 50 commands.
3. Extend React mounted tests using real SQLite for aggregate/service Commands views: committed updates, rollback silence, occurrence rows, absent input, remount/toggle preservation, and listener cleanup.
4. Run scoped Nx builds, typechecks, lint, relevant actor/Workerd fixtures, and transient Studio regressions. Update Explorer schema capture, concrete pages, and tests.

## Documentation and delivery

[ADR 002: concrete browser Node journals and worker routing](../../adrs/002-concrete-browser-node-journals-and-worker-routing.md) records the implemented storage and orchestration trade-off.

1. Preserve unrelated WIP in an isolated upstream worktree. Fixed schemas require empty storage; no compatibility paths, automatic deletion, or history pruning.
2. Update affected bootstrap, push, WebSocket, admission workflows, telemetry guidance, command-preservation patterns, and glossary. Maintain matching architecture diagrams/annotations/citations/source hashes. ADR only for an implemented decision meeting spec criteria.
3. All Mentor Mailbox work is deferred to [handoff 040](../handoffs/040-handoff-live-command-synchronization.md): vendor sync, planner wiring, live verification, source revision, manifest, current WIP, scoped checks, and remaining consumer decisions. Leave the consumer untouched.
4. Archive this plan after upstream implementation, verification, documentation, and handoff are complete.

## Verification progress

1. Both concrete Node outcome fixtures pass: filtering, repeated IDs, covered historical settlement, failures/empty deltas, transaction rollback, durable reopen, contiguous outcome replay, checkpoint conflicts, and retained slow-subscriber replay.
2. The built SharedWorker/WASM Chromium fixture passes all four scenarios: concrete domain isolation, same-identity sharing, name/identity rejection, public RPC errors, cross-tab order, uncertain admission, reconnect/disposal, and more than 50 retained commands.
3. All 43 React tests pass, including mounted aggregate/service Commands views with real SQLite, rich Date/JSON resources, rollback silence, occurrence keys, missing input, remount preservation, and listener cleanup. Both tab initializers accept child-before-parent baselines within their transaction and roll back invalid references without notifications. The final fixture typecheck passes with concrete model and session types.
4. Core, browser, DevTools, React/SDK, server, and Studio builds pass. Scoped production typechecks/lint pass. Server contract-programs, actor-staging Workerd, command-history restart, async-contract runtime, and Studio agent RPC checks pass.
5. Explorer build, typecheck, lint, and all 15 tests pass with the captured concrete schemas: 65 tables and 638 columns. The browser transient-agent check passes while banning actual Node, backup, and SharedWorker runtime imports.
6. Shopping's scoped build/typecheck/lint, Marketplace fixture, checkout endpoint, and all 14 Workerd tests pass. Required journal callers now observe committed command rows. The static cutover check passes against both concrete schemas and the current retained-replay source.
7. The final coordinated Nx graph passed all 43 tasks. Nx Cloud's existing access error (`401`) did not prevent local execution. Existing React build-script lint warnings and Studio bundle-size warnings remain outside this change.
8. The mounted independent Studio fixture passes all 32 assertions with no Worker/SharedWorker acquisition or browser page errors, including repeated-ID occurrence rendering and preservation of the originating first terminal result.
9. Changed source/configuration/docs pass the scoped formatting check and `git diff --check`. Workflow validation checks 436 links, 176 exact line ranges, 228 source hashes, and 13 diagram/annotation pairs across eight updated architecture documents. Seven unchanged, unrelated AuthoredSystem links remain outside this change.

## Outcome

The upstream implementation, required verification, and affected documentation are complete at `65165fe96d6f4af0603606d1e055e6d7bc0ba4da` on `codex/live-command-synchronization`. Concrete Nodes own synchronization and retained journals; tabs apply command changes transactionally and Commands views observe committed SQLite state. Explorer exposes both concrete schemas. The primary Zerospin checkout and Mentor Mailbox remain unchanged. The [Mentor Mailbox handoff](../handoffs/040-handoff-live-command-synchronization.md) records the verified revision, vendor manifest, retained WIP, scoped checks, and continuing consumer decisions.

## Remaining work

None. The upstream plan is complete; Mentor Mailbox vendor/planner/live work continues in the handoff.
