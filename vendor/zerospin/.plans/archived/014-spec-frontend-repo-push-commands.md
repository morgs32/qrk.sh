# FrontendRepo-owned pushCommands design

**Date:** 2026-07-11
**Status:** Approved for planning

## Problem Statement

The browser currently pushes one staged batch through two public RPCs. `pushActorCommands` performs the real command admission and account finalization work in ActorRepo, while `pushFrontendCommands` repeats an idempotent pending-row insert in FrontendRepo. This splits one lifecycle across two client-visible operations, gives ActorRepo optimistic command ownership that belongs to the per-frontend projection, and leaves retry, ordering, and browser reconciliation without one durable block identity.

The intended topology is one `FrontendApi.pushCommands` boundary. FrontendRepo admits and sequences frontend commands against its optimistic projection, AccountRepo finalizes each accepted pushed block authoritatively, and the existing AccountBlock -> ActorBlock -> FrontendBlock chain returns terminal outcomes.

## Solution

FrontendRepo becomes the sole owner of pending pushed commands, their optimistic applied mutations, session cursor watermarks, and immutable pushed-block outbox records. One push request can recover already-pending commands, newly accept later commands, and fail rejected commands without aborting successful siblings.

AccountRepo receives one stable pushed block, deduplicates by its block id, recomputes the frontend-to-account command adaptation and authoritative mutations, and records every accepted command as executed or failed in one account block. ActorRepo no longer owns any push-specific state; it only applies account blocks and publishes actor projections.

FrontendRepo stores its current optimistic projection. Frontend state and actor-originated convergence blocks carry a pushed-cursor watermark so sessions know which pending commands are already represented in server rows and replay only newer local overlays.

## User Stories

1. As a browser session, I want to submit one ordered staged batch through one RPC so that accepted, already-pending, and rejected commands reconcile atomically.
2. As a browser session, I want a rejected command to rewind its local optimism and become failed without disturbing accepted siblings.
3. As a browser session, I want commands staged while a push is in flight to remain staged and be replayed after the response.
4. As a second browser session, I want the next actor-originated frontend block to converge me to FrontendRepo's complete optimistic projection.
5. As FrontendRepo, I want guards and optimistic mutations to run against all previously accepted optimism so that later commands observe the correct projected state.
6. As FrontendRepo, I want retries of a session cursor to recover an open pending command or return a deterministic failure instead of creating a duplicate transaction.
7. As FrontendRepo, I want each successful request subset stored as an immutable pushed block so that AccountRepo delivery has stable ordering and identity.
8. As AccountRepo, I want pushed-block retries to return the original account block so that an ambiguous RPC response cannot execute commands twice.
9. As AccountRepo, I want every accepted pushed command to occupy an executed or failed position in the account block so that failures remain part of the immutable ledger.
10. As ActorRepo, I want no push-specific tables or RPCs so that I remain the authoritative account-to-actor projection stage.
11. As an operator, I want a failed pushed-block delivery retained with its failure and retried by later FrontendRepo activity without an infinite alarm loop.

## Implementation Decisions

1. Replace `FrontendApi.pushActorCommands` and `FrontendApi.pushFrontendCommands` with `FrontendApi.pushCommands`.
2. `pushCommands` accepts full encoded `IStagedCommand` values and returns encoded `pendingCommands`, `pushedCommands`, and `failedCommands` arrays.
3. `IFailedStagedCommand` preserves the full staged command and adds `failedAt`, serialized `failure`, and failed status.
4. `IPushedCommand` preserves the full frontend staged command, including frontend payload/version, command type, staged cursor, and staged timestamp, then adds pushed cursor, pushed timestamp, and pushed status.
5. `IPushedBlock` contains a FrontendRepo-assigned `pblk_*` id, the originating session id, and full encoded pushed commands.
6. Every request contains one session's commands. Key/scope corruption rejects the RPC; individual cursor, contract, payload, guard, and mutation failures become `failedCommands`.
7. FrontendRepo retains per-session `lastProcessedStagedCursor` and `lastTerminalStagedCursor` values in its SQLite-backed synchronous KV for the lifetime of that FrontendRepo.
8. An exact command still present in an open block returns as pending. A cursor at or below the terminal watermark fails with `frontend-push-command-already-terminal`. Any other cursor at or below the processed watermark fails with `frontend-push-command-already-processed`. Reusing a cursor with conflicting command content fails with `frontend-push-staged-cursor-conflict`.
9. Only commands above the processed watermark undergo admission. FrontendRepo decodes the frontend payload, runs the existing frontend guards against its optimistic database, makes frontend mutations, and applies the command inside an approved `withSavepoint` boundary.
10. Successful new commands receive monotonic global pushed cursors. All successful new commands from one RPC form one immutable pushed block; failed siblings never enter that block.
11. FrontendRepo stores full pushed command rows, one encoded applied mutation per command id and mutation index in `pushedMutations`, and pushed-block outbox rows containing finalization state and failure.
12. FrontendRepo commits command rows, optimistic resources, inverses, the pushed block, and cursor watermarks before returning. Admission is immediately visible only to the origin session and does not publish a FrontendBlock.
13. The origin session rewinds all staged commands and any locally overlaid pushed commands newer than its current server watermark. It applies the response lifecycle transitions, then replays newer pushed commands followed by concurrently staged commands.
14. Pushed-block delivery is strictly ordered. Each block receives three total exponentially delayed attempts. Delivery stops at the first failed block, persists the failure, and resumes only when later `pushCommands`, `getFrontendState`, or actor-block handling starts another drain.
15. A successfully delivered pushed-block row is marked finalized but retained until the actor block carrying the same pushed-block id reaches FrontendRepo.
16. AccountRepo stores a unique nullable `pushedBlockId` on its account-block outbox. Frontend-origin blocks set it; non-frontend account and service blocks explicitly use null.
17. `AccountRepo.finalizePushedCommands` returns the existing block when the pushed-block id already exists. Otherwise it recomputes frontend-to-account adaptation and authoritative mutations from the full pushed commands.
18. AccountRepo uses one savepoint per command. Preparation or application failure becomes a full `IFailedPushedCommand`; success becomes a full `IExecutedPushedCommand`. Both receive account cursor/index positions and appear in the same immutable block.
19. Actor blocks propagate `pushedBlockId` and full pushed outcomes without rebuilding or truncating their command objects.
20. FrontendRepo actor-block handling collects affected resource refs, rewinds all pushed mutations in reverse pushed/mutation order, applies authoritative actor state, removes terminal commands, clears `pushedMutations`, and replays remaining pushed commands in pushed order with fresh inverses.
21. A FrontendRepo optimistic replay failure removes that pushed command locally, records telemetry, and emits no failure outcome. AccountRepo is not cancelled; a later authoritative outcome may still exist.
22. After processing the matching actor block, FrontendRepo deletes the pushed-block outbox row and advances the session terminal watermark. When that session has no open pushed block, terminal advances to processed.
23. FrontendRepo emits an idempotent convergence FrontendBlock containing final optimistic rows/deletes for all affected refs, the complete pending snapshot, terminal outcomes that still match local pending commands, and `lastRebasedPushedCursor`.
24. `getFrontendState` returns FrontendRepo's optimistic resource snapshot, pending commands, and `lastRebasedPushedCursor`. Sessions do not replay pending commands at or below that watermark.
25. FrontendBlock application rewinds staged commands and only pushed overlays newer than the prior watermark, applies the convergence patch, advances the watermark, then replays remaining newer pushed commands and staged commands.
26. A staged replay failure becomes a local failed command. A pushed replay failure remains locally failed; a later authoritative execution is ignored, while a later authoritative failure replaces the stored failure details.
27. `withSavepoint` is the only new helper. Its approved call sites are FrontendRepo admission, FrontendRepo replay, AccountRepo finalization, session push-response replay, and session FrontendBlock replay.
28. ActorRepo loses its push method, pushed-command table, pending-command bootstrap method, and last-finalization test hook.

## Testing Decisions

1. Update the shopping workerd lifecycle test as the highest seam: one public `pushCommands` call must produce optimistic FrontendRepo state, an idempotent account block, account/actor/frontend fanout, websocket convergence, and terminal pushed-block cleanup.
2. Add focused FrontendRepo workerd coverage for cursor classification, both session watermarks, guard failures, savepoint sibling isolation, immutable block creation, strict outbox ordering, three-attempt failure, activity-triggered resume, optimistic rebase, silent replay removal, convergence blocks, and terminal cleanup.
3. Add AccountRepo workerd coverage for mixed executed/failed pushed outcomes, per-command rollback, full command preservation, pushed-block provenance, and duplicate block idempotency.
4. Extend React push tests for pending/pushed/failed response rebasing and commands staged during the network request.
5. Extend core frontend state/block tests for optimistic snapshots, pushed-cursor watermark gating, local overlay rewind/replay, and the selected late authoritative outcome rules.
6. Add focused `withSavepoint` coverage proving failed command writes roll back without rolling back successful siblings.
7. Run verification only through Nx: core and React node tests, system-worker and shopping workerd tests, and the `ts` targets for all four affected projects.

## Out of Scope

1. The paused-only DevTools manual push control and inline push-error UI.
2. Immediate optimistic websocket fanout at push admission; non-origin sessions wait for the next actor-originated convergence block or a state refetch.
3. Cancelling AccountRepo after a FrontendRepo or session optimistic replay failure.
4. Compatibility schemas or runtime fallback paths for existing ActorRepo pushed-command state.
5. Infinite alarm-based retry of failed pushed-block delivery.

## Further Notes

1. Existing local and dev Durable Object state is wiped before verification; no migration is provided.
2. Non-frontend `finalizeAccountBlock` and service-block paths remain supported.
3. Relevant architecture pages and glossary terms must change in the same implementation pass.
4. No additional helper, wrapper, named type, re-export, or `ALLOWED_CAST` marker is authorized by this design.
