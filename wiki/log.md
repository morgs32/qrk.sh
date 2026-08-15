---
title: Log
type: meta
updated: 2026-08-07
---

# Log

Append-only chronological record for the fresh public repository. Every ingest,
lint, and query entry starts with
`## [YYYY-MM-DD HH:MM] <op> | <commit-sha> | <one-line summary>`.

## [2026-07-16 22:41] ingest | working-tree | session signatures, React push ownership, and mock provider

1. Documented session-owned signature generation, provider-owned automatic push, and the narrow DevTools manual-push capability.
2. Documented the local-only React mock provider's typed fixtures, real SQLite initialization, optimistic staging, unsupported remote boundary, and exactly-once cleanup paths.

## [2026-07-17 14:42] ingest | working-tree | generation admission and frontend WebSocket tickets

1. Expanded the durable generation lifecycle with readiness/admission states,
   opening and draining semantics, drain order, retry behavior, and the local
   HTTP readiness distinction.
2. Added the fixed frontend WebSocket ticket lifecycle, hash-only storage,
   one-use redemption, direct hibernating FrontendBlockRepo ownership, browser
   handshake behavior, and external error surface.
3. Updated FrontendApi, Blockchain, overview, index, glossary, and the internal
   repo-prefix pattern for the implemented ownership and routing boundaries.

## [2026-07-22 11:53] ingest | working-tree | self-hosted lifecycle and production Wrangler deployment

1. Renamed the stable lifecycle implementation to `SelfHostedZerospinApis`,
   retained the local-only `DevZerospinApis` export key required by Miniflare
   persistence, and documented the exact local and production identities.
2. Documented project-owned production key validation, the first-production
   Durable Object migration, the explicit self-hosted runtime marker, temporary
   Wrangler secrets, and readiness polling.
3. Documented the production-only one-shot seed command and its single-service,
   submit-all-without-reconciliation boundary.
4. Updated DeploySystem, overview, index, glossary, and agent routing references
   to the self-hosted terminology and source paths.

## [2026-07-27 22:31] ingest | working-tree | service projections, offline replicas, and finite generation drain

1. Documented the distinct account and service frontend capabilities,
   projections, tickets, WebSocket resume protocol, and target-generation
   successor preparation.
2. Documented Config-owned authentication, SharedWorker replica catalog and
   account-command journal recovery, commissioning, repair, worker/direct
   execution modes, and exact lineage transitions.
3. Updated deployment and blockchain architecture for finite write reservation
   drain, immutable ledger/projection bounds, source completion, superseded
   archive rooms, and account plus service ticket cleanup.
4. Audited the corresponding core, frontend-program, React, SharedWorker, and
   system-worker API pages and refreshed wiki navigation and terminology.
5. Clarified that state and account writes stay source-bound while ticket
   authority may follow only an inverse-verified successor chain, and documented
   same-generation `update-required`: old replicas keep reading archives,
   account writes become suspended with unfinished journal rows dormant, and
   service remains read-only.

## [2026-07-28 08:06] ingest | working-tree | plan 033/034 frontend lineage and ownership correction

1. Corrected conditional and atomic projection registration, post-freeze
   snapshot-only segments, full account terminal state, and account replay
   failure behavior.
2. Documented direct and cached-offline transport regain, sibling Provider
   ownership, immediate commission release, durable predecessor discovery, and
   MessagePort-scoped registration release.
3. Refreshed all plan-033/034 architecture and API citations after final implementation.

## [2026-07-28 15:15] ingest | working-tree | plan 033/034 acceptance gap closure

1. Documented fresh one-shot Config authentication for every SharedWorker state,
   ticket, account-push, repair, and commissioning operation, including
   authority revocation that preserves persistent replica and journal bytes.
2. Documented exact-generation transport recovery versus separately acquired
   successor generations, with source retention until account or service target
   activation succeeds.
3. Documented direct-mode staged-command preflight, reverse-overlay removal,
   historical payload adaptation, ordered optimistic replay, and fail-closed
   source preservation.
4. Clarified source ticket authority during finite draining and recorded the
   deferred operator recovery/reset requirement for unique account journal data.
5. Classified signature-schema rejection as an authority failure at initial
   admission, worker callbacks, commissioning, and direct reconnect while
   retaining transport-only and same-principal update-required recovery.

## [2026-07-28 18:59] ingest | working-tree | vendor reconciliation

1. Reconciled the separate local `DevZerospinApis` and production
   `SelfHostedZerospinApis` namespaces with Wrangler deploy, readiness, and
   one-shot production seed triggers.
2. Preserved continuous generation lineage while documenting self-hosted
   inspection-only drains, account plus service-frontend subscriber bounds, and
   the narrow retired actor/frontend inspection seam.
3. Documented public one-shot React frontend authentication and lazy
   `window.zerospin.devtools.open()` without adding a FrontendApi authentication
   RPC.

## [2026-08-07 09:17] ingest | working-tree | owner authentication and static frontend architecture sync

1. Updated the browser execution diagram from the removed account/actor
   identity to aggregate-owned authentication, `IUserRef`, owner-defined
   `userId`, aggregate replicas, and the aggregate command journal.
2. Rebuilt the architecture index around the current static System, exact
   source-selected frontends, direct aggregate fanout, aggregate and service
   browser sessions, and durable generation lifecycle.
3. Removed the stale FrontendProtocolRollout catalog entry, added the current
   development lifecycle and browser execution diagram, and refreshed broken
   architecture source ranges and the WebSocket adaptation participant.

## [2026-08-08 07:22] ingest | working-tree | service replication watermark alignment

1. Documented grouped ServiceRepo snapshots, exact AggregateRepo subscription
   watermark `C`, transactionally captured snapshot watermark `W`, and retained
   ServiceBlocks in `(C.currentServiceIndex, W.serviceIndex]`.
2. Documented first-appearance service ordering, per-command atomic failures,
   row-existence replication membership, pre-snapshot alignment, and ordered
   commandless AggregateBlocks.
3. Made the durable route `ServiceRepo -> ServiceBlockRepo -> AggregateRepo ->
AggregateBlockRepo -> FrontendRepo` explicit while keeping service cursor,
   index, subscription, and membership metadata out of browser state.

## [2026-08-09 13:25] ingest | working-tree | synchronous staging and target-owned command journal

1. Documented synchronous main-thread command persistence, one-attempt
   asynchronous handoff, target-wide `workerIndex`, exact-lock `replicaIndex`,
   canonical `frontendIndex`, and their separate failure scopes.
2. Documented runtime-only SharedWorker pause/manual-push controls, mixed-session
   FrontendRepo self-reconciliation through five lifecycle arrays, strict
   browser/server persistence cutovers, and terminal row retention.
3. Removed active architecture references to application-owned push pause and
   public command-status polling, and updated the no-pending staging and
   FrontendRepo-owned push patterns.

## [2026-08-10 11:12] ingest | working-tree | bound DO Repo lifecycle

1. Distinguished the broad `Repo` architectural role from the narrower
   provision-once `BoundDORepo` Durable Object construction.
2. Documented the preserved `_isBootstrapped` receipt and the registration
   boundary outside the one-time provisioning branch.
3. Refreshed drifted Blockchain, frontend WebSocket, and System lifecycle
   source anchors without changing runtime topology or Mermaid workflows.

## [2026-08-11 00:03] manual | working-tree | Plan 052 architecture cutover

1. Replaced active WorkerRepo and generation-addressed SystemRepo claims with
   direct DevWorker/ProductionWorker routing to one `SystemRepo(systemId)` and
   its persisted deploy, generation, drain, replay, ticket, and write-reservation
   coordination.
2. Separated lifecycle-only deploy/bundle identity from generation-specific
   reads and tickets, including replacement-ticket mint and consumption on a
   retained ready drained generation, and from lifecycle-identity-free ordinary
   mutations that reserve the current ready open generation inside SystemRepo;
   recorded abandoned write reservations as retryable activation failures.
3. Replaced StaticSystemPrograms/StaticSystemDatabase runtime participants with
   direct authored authentication, authorization, guard, payload-adaptation,
   mutation, resource-adapter, and owner-local database Effects.
4. Recorded the exact resolver, capability, authorization, and owner-callback
   tuples, plus retained `commandName@version` adaptation that preserves
   complete original command outcomes.

## [2026-08-11 17:19] manual | working-tree | Worker-hosted Gateway and AggregateFrontend cutover

1. Replaced the generation-addressed root with stable Worker-hosted
   `GatewayApi`, environment-specific deploy children, flat
   `AuthenticatedApi.getAuthentication()` receipts, and separately disposable
   aggregate/service child capabilities with flat admission receipts.
2. Hard-renamed the aggregate-only frontend API, Repo, block Repo, browser
   replica, schema, binding, table, error, and wire surfaces to
   `AggregateFrontend*`, while retaining generic frontend-controller concepts
   and `ServiceFrontend*` names.
3. Restricted Worker HTTP forwarding and `SystemRepo.fetch` to the system-log,
   aggregate-frontend, and service-frontend WebSocket routes. Frontend sockets
   now carry exactly one opaque ticket and no publishable key or target fields.
4. Documented one Provider-owned initial authentication handoff, the
   SharedWorker-owned authentication refresh and child-admission boundary, the
   exact five-code `existing-only` fallback allowlist, and receiver-relative
   `getState`, `createWebSocketTicket`, `handleBlock`, `replaceState`, and
   `handleFailure` leaves.
