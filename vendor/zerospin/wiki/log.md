---
title: Log
type: meta
updated: 2026-07-28
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
3. Refreshed all plan-033/034 architecture and API source hashes and citations
   after final implementation.

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
