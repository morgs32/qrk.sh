# Plan 065 — Singular command chains

Status: implemented and verified. Phase 0 assumes one deployment into empty
storage and no later code or physical-schema change for that `systemId`.

Date: 2026-08-31

Source spec:
[`065-spec-singular-command-chains.md`](../archived/065-spec-singular-command-chains.md)

## Outcome

Hard-cut every command-bearing server, projection, WebSocket, and browser
boundary from arrays of commands in blocks to one flat command occurrence at a
time. The completed system has five named command chains, four named
materialized Repos, singular command APIs, command-local deltas, pull-based
anti-entropy, one-time authored execution, and finalized-first browser
recovery.

This is a clean-slate system, not an upgradeable deployment. Every production
Repo provisions its current physical schema once. A changed application uses a
new `systemId` and new storage rather than redeploying over existing state.

The implementation is complete only when the six acceptance seams in this
plan pass and no current production surface retains domain `Block`, batch,
plural-command, lifecycle-partition, generic command-cursor, schema-migration,
or redeployment-coordination machinery.

## Starting working-tree state

1. A partial implementation was started before this plan request and remains
   uncommitted. It must be treated as WIP to audit, finish, or replace in place;
   do not reset it.
2. Core currently contains draft singular contracts, delta schemas, session
   tables, and aggregate/service frontend application functions. Core
   typechecking passed, but its test suite still has 12 failures and important
   replacement coverage is missing.
3. System Worker currently contains partial `AggregateCommandChain`,
   `ServiceCommandChain`, and `MaterializedServiceRepo` implementations.
   Several other directories were mechanically renamed while retaining their
   old block and batch behavior. `AggregateFrontendPushedCommandChain` does not
   yet exist.
4. The superseded SharedWorker, frontend, and React contained draft singular
   APIs and replica commands. Recovery still installed snapshots rather than
   rebuilding the authoritative base from finalized history, and one repair
   path replayed pushed commands after local commands.
5. Shopping, migration fixtures, inspection surfaces, architecture pages, and
   most acceptance tests remain on block and plural-command contracts.
6. Unrelated dirty-worktree changes remain user-owned. Every implementation
   phase must inspect its own diff and stage only the coherent Plan 065 slice.

## Phase 0 decision — one immutable deployment from empty storage

For one `systemId`, Zerospin supports exactly one application deployment into
empty storage. That application's code, command contracts, resource models,
and physical Repo schemas are immutable for the lifetime of the system. A
changed application is a new system with a new `systemId` and empty Durable
Object storage; it is not a second deployment of the existing system.

The resulting boundary is:

1. Keep the statically bundled System Worker. Do not restore generation
   Workers, generation manifests, selectors, supervisors, loopbacks,
   version-qualified materializer names, or any substitute deployment-version
   abstraction.
2. SystemRepo owns no command-execution, deployment-coordination, schema-gate,
   drain, fence, selection, promotion, rollback, or old-state recovery state or
   RPCs. Chains do not consult SystemRepo before admission or materialization.
3. Delete `makeVersionedDORepo` and its configuration, migration target,
   manifest, ledger, schema-target verification, bootstrap, and test paths.
   Every production Repo uses the fixed provision-once lifecycle and creates
   its current tables on the first activation of empty storage.
4. Retain the fixed Repo bootstrap marker. Durable Objects may be evicted and
   cold-started repeatedly during the one deployment, so repeated activation
   must skip provisioning while reopening the same unchanged schema. This is
   same-deployment runtime correctness, not deployment compatibility.
5. Delete CLI migration generation and checking, generated migration bridges
   and manifests, checked-in migration histories, deployment migration
   preflight, and package `migrations:check` targets. Do not replace them with
   baseline migrations or schema compatibility checks.
6. Deploy uploads and promotes the static Worker once, then runs the retained
   preview and production health checks. There is no supported second dev run
   or deployment against the same storage, and therefore no close, drain,
   fence, reopen, resume-after-deploy, or compatibility path.
7. Each chain still owns canonical-byte idempotency, ordered durable admission,
   head-at-a-time materializer execution, terminal retention, halt state,
   outboxes, alarms, and subscriber fanout. Command claims, anti-entropy,
   frontend locks, and chain admission semaphores remain because they protect
   concurrent and failure-prone work inside the one deployment.
8. Pushed and service-derived forwarding carries the complete command only.
   The downstream chain acknowledges only after its own durable admission.
9. The user-facing APIs are exactly `finalizeAggregateCommand(command)`,
   `finalizeServiceCommand(command)`, and `pushCommand({ command })`. Caller
   trace context and the RPC argument envelope are injected by the traceable
   RPC adapter.

## Locked command and delta contracts

1. Define `IChainedCommand<COMMAND, DELTA>` as the complete command intersected
   with `chainedAt` and one of three structural states:
   1. Pending has `delta: null`, `failedAt: null`, and `failure: null`.
   2. Success has a non-null command-local `delta`, `failedAt: null`, and
      `failure: null`.
   3. Failure has the target-specific empty non-null `delta`, a non-null
      `failedAt`, and a non-null encoded Zerospin failure.
2. Use the existing encoded Zerospin error shape for `failure`; do not collapse
   authored failures to an unstructured string.
3. Keep chain indices outside the generic type. Concrete occurrences use only
   the index owned by their history: `aggregateIndex`, `serviceIndex`,
   `pushIndex`, `frontendIndex`, `serviceFrontendIndex`, `replicaIndex`, or
   `sessionIndex`.
4. A direct aggregate occurrence is the full aggregate command plus
   `aggregateIndex`. A service-derived aggregate occurrence is the full service
   command plus `serviceIndex` and the assigned `aggregateIndex`. Do not add a
   null `serviceIndex` to direct aggregate commands merely to create a common
   shape.
5. Frontend-originated aggregate commands retain flat
   `{ sessionId, userId, frontendName, pushIndex }` provenance. Direct aggregate
   commands retain null for those four existing aggregate-command fields. Do
   not nest a pushed or service chained command inside another command.
6. `IResourceDelta` contains target resource `inserted`, `updated`, and deleted
   tombstone changes plus `mutations: readonly IEncodedAppliedMutation[]`.
   `IFrontendDelta` contains target frontend `inserted`, `updated`, and deleted
   references plus the same mutation journal.
7. A successful no-op and an authored failure both carry empty change arrays;
   only `failedAt` and `failure` distinguish failure.
8. Schemas must structurally reject legacy `status`, `mode`, `commandType`,
   lifecycle timestamps, cursors, generic `chainIndex`, command arrays, and
   block envelopes.
9. Persist full encoded command bytes at every chain, outbox, WebSocket,
   browser journal, and replica boundary. Do not reconstruct a reduced command
   payload.

## Phase 1 — finish Core contracts and local persistence

1. Audit the partial Core diff against the locked contracts above before
   extending it. Correct direct-versus-derived aggregate shapes and encoded
   failure metadata first so downstream packages compile against one contract.
2. Finish authoritative schemas for aggregate, service, pushed, aggregate
   finalized, service finalized, aggregate replica, service replica, and local
   session occurrences. Export symbols only from their defining modules and
   the package barrel.
3. Replace lifecycle-partitioned session persistence with one full-command
   journal, durable `sessionIndex` and `replicaIndex` frontiers, resolved
   `pushIndex` membership, forward mutations, and current inverse operations.
   Use a normalized resolved-push table or another bounded queryable shape; do
   not grow an unbounded JSON array in one metadata row.
4. Persist the next `sessionIndex`; reconstruction must not restart at one.
   Every locally terminal command, including a locally authored failure, gets
   a retained session occurrence and participates in replica ordering.
5. Make aggregate and service frontend application accept one singular command
   and enforce exact-byte equal-index idempotency, changed-byte conflict, and
   gap rejection.
6. Replace deleted block-era tests with focused command tests rather than
   weakening coverage. Fix the Core test TypeScript configuration so spec and
   typecheck files are actually included.
7. Run Core gates before server implementation continues:
   1. `nx run @zerospin/core:tsc:typecheck`
   2. `nx run @zerospin/core:ts`
   3. `nx run @zerospin/core:test`
   4. `nx run @zerospin/core:lint`

## Phase 2 — source chains and authoritative materializers

1. Implement these as fixed provision-once Durable Object Repos with their own
   database configs, bindings, exports, getters, registration, inspection, and
   focused tests. They have no schema target, migration history, or versioned
   admission path:
   1. `AggregateCommandChain`
   2. `ServiceCommandChain`
   3. `AggregateFrontendPushedCommandChain`
   4. `AggregateFrontendFinalizedCommandChain`
   5. `ServiceFrontendFinalizedCommandChain`
2. Implement these as the only materialized domain Repos:
   1. `MaterializedAggregateRepo`
   2. `MaterializedServiceRepo`
   3. `MaterializedAggregateFrontendRepo`
   4. `MaterializedServiceFrontendRepo`
3. Admit multiple complete commands durably, assigning the next chain-owned
   index and one persisted `chainedAt` in the admission transaction. Preserve
   canonical encoded bytes separately from decoded query fields.
4. Enforce identity and canonical-byte idempotency:
   1. Identical terminal duplicate returns the retained terminal bytes.
   2. Identical pending duplicate observes the retained occurrence and attaches
      to the same durable work; the public API still returns only a terminal
      occurrence or an infrastructure RPC error.
   3. Changed bytes for an existing command identity conflict.
5. Dispatch only the lowest pending index. Scheduled work must resume pending
   execution independently of the original request and must not begin a later
   command while the head is unresolved.
6. Persist an execution claim in the materializer before authored code runs.
   A retained terminal result returns byte-for-byte; a retained claim without a
   result halts the source chain for repair; authored code is never rerun.
7. Convert authored command failure to a terminal failed occurrence with an
   empty delta. Keep authentication, decoding, transport, and unresolved
   infrastructure failure in the RPC error channel.
8. Implement materializer `catchup()` as source-history anti-entropy. Subscribe
   before constructor catch-up, pull terminal pages through the index before a
   notified gap, validate every contiguous index and tip, then execute or apply
   the current occurrence once.
9. Implement `getCommands()` with the chain-specific `after*Index`, filtering
   terminal rows before limiting to 64, returning contiguous occurrences and
   the observed terminal tip. Pending rows never appear.
10. Coalesce subscriber state to one latest queued tip. The subscriber pulls
    missing intermediate occurrences and acknowledges only after its local
    state and durable output outbox commit atomically.
11. Use the retained materialized Repo name for dispatch. It identifies the
    immutable logical Durable Object target for the system's lifetime; there is
    no deployment-version pinning or later code version to select.

## Phase 3 — service-to-aggregate ordering

1. Move service subscription ownership to `AggregateCommandChain`. Remove
   service-block handling and subscription state from
   `MaterializedAggregateRepo`.
2. For each consecutive terminal service occurrence, atomically advance the
   aggregate chain's retained `serviceIndex` before admitting later direct
   aggregate work.
3. If the service occurrence is irrelevant to every currently replicated
   aggregate resource, consume no `aggregateIndex`.
4. If it is relevant, append one full service-derived aggregate occurrence at
   the next `aggregateIndex` and execute it before later direct aggregate work.
5. When a direct aggregate command first creates a replicated service
   resource, capture and materialize through the current service frontier
   before committing that command. Begin the subscription at the captured
   frontier; do not replay older service commands into the new resource.
6. Characterize direct-versus-derived races, sparse irrelevant runs, duplicate
   service fanout, and gaps over more than one 64-command page.

## Phase 4 — pushed and finalized frontend chains

1. `AggregateFrontendPushedCommandChain.pushCommand({ command })` assigns one
   `pushIndex`, executes one optimistic server-side occurrence through
   `MaterializedAggregateFrontendRepo`, and returns its terminal pushed
   occurrence.
2. A successful pushed occurrence atomically creates a durable aggregate
   forwarding outbox. Forward the complete command and flat
   `{ sessionId, userId, frontendName, pushIndex }` provenance, and mark the
   outbox complete only after AggregateCommandChain acknowledges durable
   admission.
3. `MaterializedAggregateFrontendRepo` consumes aggregate terminal history by
   rewinding active optimism, applying the authoritative command-local delta,
   resolving the exact originating `pushIndex`, and replaying all unresolved
   optimism in `pushIndex` order.
4. Atomically commit authoritative base resources, aggregate and push source
   frontiers, resolved push membership, active forward/inverse journals, and a
   finalized-command outbox. The outbox stores the authoritative base delta,
   never the visible post-rebase net delta.
5. Emit a finalized occurrence for every originating `pushIndex`, including
   empty-delta success and failure. Keep unrelated frontends sparse.
6. `MaterializedServiceFrontendRepo` advances `serviceIndex` for every source
   occurrence, emits only relevant changes, and atomically commits its state
   plus finalized-command outbox. Irrelevant service commands consume no
   `serviceFrontendIndex`.
7. Publish output outboxes asynchronously through the aggregate/service
   finalized chains. Retain exact duplicate bytes and reject changed duplicate
   publications.
8. Replace archive/block WebSocket behavior with one singular finalized
   command per message on `/ws-aggregate-frontend-commands` and
   `/ws-service-frontend-commands`, using `aggregateFrontendCommand` and
   `serviceFrontendCommand` discriminants.

## Phase 5 — browser reconstruction and live delivery

1. Keep `AggregateFrontendReplicaRepo` and `ServiceFrontendReplicaRepo` as the
   existing exact browser persistence owners. Add no second frontend chain or
   generic browser coordinator.
2. Subscribe and buffer live finalized notifications before recovery.
3. Rebuild an aggregate replica in this strict order:
   1. Apply finalized pages to an empty authoritative base and rebuild resolved
      `pushIndex` membership.
   2. Apply unresolved successful pushed occurrences by `pushIndex`, rebuilding
      mutation inverses.
   3. Replay unresolved local occurrences by `replicaIndex`.
4. Do not treat `getState().resources` as the recovered authoritative result
   after finalized history exists. Use a snapshot only as an explicitly
   versioned bootstrap baseline, then prove every later occurrence is applied
   contiguously from its retained frontier.
5. Commit frontiers, resources, full active commands, forward mutations, and
   current inverses before opening local admission, fanout, or pushing.
6. Preserve separate aggregate, frontend, push, service, service-frontend,
   replica, and session frontiers. Do not infer one from another.
7. Apply live singular occurrences by `replicaIndex`; exact duplicate bytes are
   idempotent, changed duplicates conflict, and gaps enter repair through
   paginated pulls.
8. Keep the existing transport split: pushed history is pulled for
   bootstrap/repair, finalized commands stream over the WebSocket, and no
   pushed WebSocket or multiplexed replacement transport is added.
9. Settle the finalized-socket-before-push-response race exactly once by source
   identity and retained bytes, not arrival order.

## Phase 6 — APIs, integrations, clean provisioning, and reset

1. Hard-cut SystemApi, failure targets, AggregateFrontendApi, frontend helpers,
   React sessions, main-thread frontend APIs, mocks, CLI seeding, Shopping, and e2e
   callers to the three exact singular signatures.
2. Rename every production RpcTarget method folder with its singular method and
   keep the same-named immediate `Effect.fn` delegation convention.
3. Add all nine Durable Object bindings consistently to System Worker, Dev
   Worker, Production Worker, Shopping, e2e fixtures, generated environment
   declarations, Wrangler test configs, and inspection APIs.
4. Delete the CLI migration commands and their enumeration, bridge,
   manifest-generation, history-checking, configuration, and tests. Delete the
   System Worker migration module, schema targets, migration ledger and gate,
   deployment preflight, runtime aliases, and package migration targets.
5. Delete every checked-in migration history and generated manifest, including
   the System Worker test system, frontend-adapter e2e system, Shopping, and
   any other in-scope consumer. Fixed Repo database configs directly provision
   the current singular tables; do not generate replacement baselines.
6. Delete lifecycle-partitioned staged, pushed, executed, and failed tables,
   block tables, archive rows, block messages, and compatibility fixtures. Do
   not add aliases, fallback decoders, dual tables, legacy fields, or migration
   translations.
7. Reset disposable `.wrangler`, test, and browser fixture state when a
   validation run requires empty storage. Never reset shared, remote, or
   production-like state without separate explicit approval naming the target;
   a changed application instead receives a new `systemId` and new storage.
8. Preserve wa-sqlite's unrelated internal IndexedDB object-store name
   `blocks`; the terminology ban applies to Zerospin's domain command model.

## Phase 7 — acceptance seams

1. Contract seam:
   1. Prove pending, successful, and failed structural schemas.
   2. Prove command-local mutation journals and target-specific deleted shapes.
   3. Reject every legacy lifecycle and block envelope.
2. Chain seam:
   1. Prove consecutive admission, head-at-a-time queueing, exact-byte
      idempotency, changed-byte conflicts, retained terminal bytes, claims,
      in-doubt halting, restart resumption, and complete-command forwarding.
   2. Prove terminal-before-limit paging across multiple pages and coalesced
      latest-tip fanout with subscriber pull.
3. Aggregate frontend seam:
   1. Prove singular push and finalization, exact origin resolution,
      empty-delta success, failure finalization, and newly selected resources.
   2. Prove finalized-first recovery and A/B/C rollback/replay when the middle
      `pushIndex` resolves.
4. Service seam:
   1. Prove irrelevant service commands advance only `serviceIndex`.
   2. Prove relevant service commands create ordered derived aggregate
      occurrences and sparse service-frontend finalized occurrences.
5. Main-thread frontend seam:
   1. Prove finalized then unresolved pushed then local reconstruction.
   2. Prove singular live delivery, gap repair, exact duplicates, pushed
      history repair, restart, and no replay of resolved optimism.
6. Shopping seam:
   1. Prove direct aggregate terminal success/failure.
   2. Prove direct service terminal success/failure and service frontend
      catch-up.
   3. Prove optimistic command to terminal pushed occurrence to authoritative
      finalized occurrence in browser and workerd flows.

## Phase 8 — documentation cutover

1. Rename `wiki/architecture/Blockchain.md` to `CommandChains.md` and replace
   all inbound links.
2. Replace plural and block workflows in SystemApi, aggregate finalization,
   push, service propagation, browser bootstrap, Frontend WebSocket, inspection,
   overview, index, and glossary pages.
3. Keep the renamed Kappa diagram aligned with the five-chain/four-materializer
   topology and the strict finalized → pushed → local browser sequence.
4. Delete obsolete aggregate/service block sequence pages rather than
   presenting them as historical current architecture.
5. Delete `wiki/architecture/DurableRepoMigrations.md` and remove migration,
   schema-evolution, redeployment, drain, fence, and version-selection claims
   from current documentation. Document fixed provision-once activation and
   the new-system-for-new-code boundary where those behaviors were described.
6. Update `AGENTS.md`, `TODOS.md`, and `llm-wiki/patterns/**` references whose
   paths or terminology changed. Do not alter unrelated guidance.
7. For every architecture sequence diagram, use one explicit `autonumber N`
   immediately before each message and place an exactly corresponding numbered
   annotated step immediately below the diagram with working source links.
8. Run the Markdown link and formatting gates after source line numbers settle;
   do not cite transient line numbers before implementation is stable.

## Verification matrix

| Scope                  | Required Nx targets                                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core                   | `@zerospin/core:tsc:typecheck`, `@zerospin/core:ts`, `@zerospin/core:test`, `@zerospin/core:lint`                                                                                                                                                                                                 |
| System Worker          | `system-worker:tsc:typecheck`, `system-worker:ts`, `system-worker:lib`, `system-worker:test`, `system-worker:test:workerd`, `system-worker:lint`, `system-worker:types`, `system-worker:static-cutover:check`                                                                                     |
| Browser libraries      | `@zerospin/frontend:tsc:typecheck`, `@zerospin/frontend:test`, `@zerospin/frontend:lint`, `@zerospin/opfs-backup-worker:tsc:typecheck`, `@zerospin/opfs-backup-worker:test`, `@zerospin/opfs-backup-worker:lint`, `@zerospin/react:tsc:typecheck`, `@zerospin/react:test`, `@zerospin/react:lint` |
| Tooling and inspection | `@zerospin/cli:tsc:typecheck`, `@zerospin/cli:test`, `@zerospin/cli:lint`, `@zerospin/devtools:tsc:typecheck`, `@zerospin/devtools:test`, `@zerospin/devtools:lint`, `@zerospin/studio:tsc:typecheck`, `@zerospin/studio:test`, `@zerospin/studio:lint`, `@zerospin/studio:format:check`          |
| Worker entrypoints     | `@zerospin/dev-worker:tsc:typecheck`, `@zerospin/dev-worker:test:workerd`, `@zerospin/dev-worker:lint`, `@zerospin/production-worker:tsc:typecheck`, `@zerospin/production-worker:test:workerd`, `@zerospin/production-worker:lint`                                                               |
| E2E fixtures           | `@zerospin/e2e-frontend-adapters:tsc:typecheck`, `@zerospin/e2e-frontend-adapters:test:workerd`, `@zerospin/e2e-frontend-adapters:lint`                                                                                                                                                           |
| Shopping               | `shopping:types`, `shopping:tsc:typecheck`, `shopping:lint`, `shopping:test`, `shopping:test:workerd`, `shopping:test:vitest:browser`, `shopping:test:e2e`, `shopping:build`                                                                                                                      |

Run uncached acceptance gates where stale cache could conceal the hard cutover.
Run independent targets separately enough to identify the owning failure. End
with repository formatting, `git diff --check`, a forbidden-term scan scoped to
current production/domain documentation, and an inspection of the staged diff.
The scan must also prove that no production `makeVersionedDORepo`, migration
command, migration manifest or ledger, schema target, deploy migration
preflight, `migrations:check` target, or deployment drain/fence path remains.

## Completion and commit boundary

1. Do not call the implementation complete while any of the six acceptance
   seams is missing, any required Nx gate is red, current architecture
   documentation still describes blocks or batches, any production Repo still
   has a versioned/migration lifecycle, or any deployment-evolution path
   remains.
2. Do not archive this plan until every implementation and verification step is
   complete.
3. Commit the coherent hard cut directly to `main` only after all gates pass.
   Stage no unrelated WIP and verify the resulting commit and working-tree
   residue explicitly.
