---
title: Index
type: meta
updated: 2026-08-15
---

# Index

Master catalog of every wiki page. The ingest hook updates this file on every commit.

Organised by category. Pages are `[[wiki-links]]` without the `.md` extension.

## Getting oriented

- [[overview|Distributed Architecture Overview]] — how authoring, browser replicas, stable ingress, SystemRepo generations, and durable block/projection flows interact
- [[glossary]] — domain terms discovered from the code
- [[log]] — chronological record of every ingest, lint, and query

## Agent pattern libraries (not auto-ingested)

- [llm-wiki patterns](../vendor/morgs32/llm-wiki/patterns/index.md) — generic code-shape guidance
- [llm-wiki patterns](../llm-wiki/patterns/index.md) — zerospin-specific patterns and case studies

## Architecture

- [[architecture/Authentication|Universal Authentication]] — GatewayApi user admission, per-port SharedWorker authentication, exact resolver/authentication tuples, and owner-local authorization
- [[architecture/Blockchain]] — aggregate and service authority, immutable block archives, direct frontend fanout, projection, and exact-lock delivery
- [[architecture/DevLifecycle|Development Lifecycle]] — direct DevWorker-to-SystemRepo routing, explicit deploy-status polling, `{ workerVersionId, clean }` lifecycle identity, and browser refresh
- [[architecture/AggregateFrontendApi]] — state, command, query, and ticket capability bound to `{ aggregateName, aggregateId, userId, frontendName }` plus one complete aggregate lock
- [[architecture/FrontendWebSocket]] — fixed socket routes, opaque one-use tickets, index-only resume, full-state repair, and terminal lock failure
- [[architecture/RpcErrorBoundaries]] — encoded ZerospinError preservation, one-time boundary conversion, and failure-target replay
- [[architecture/ServiceFrontendApi]] — read-only state and ticket capability bound to `{ serviceName, userId, frontendName }` plus one complete service lock
- [[architecture/ServiceFrontendProjection]] — user-scoped service source replica, canonical projection, archive, and generation continuity
- [[architecture/SourceSelectedFrontends]] — source-selected exact definitions, exhaustive static admission, and selection identity
- [[architecture/StaticSystemWorker]] — direct authored System Effects, owner-local database/query boundaries, and retained command revisions
- [[architecture/SystemApi]] — generation-specific reads, current-write mutations, telemetry, and repository inspection
- [[architecture/SystemLifecycle|System Lifecycle]] — singleton SystemRepo deployment coordination, write reservation, freeze/drain, replay, and atomic promotion
- [[architecture/bootstrapBrowserSession]] — one signature-callback ZerospinApp.Provider scope, one identity-neutral SharedWorker port with a worker-bound UserPartitionRepo root, atomic sessions, and teardown
- [[dev/diagrams/BrowserFrontendLifecycle|Browser frontend lifecycle]] — online/offline startup, independent authorization, SharedWorker acquisition, replacement, and teardown

## API

- [[api/CoreFrontendReplicas]] — aggregate/service wire schemas and replica-application Effects
- [[api/CoreServiceControllers]] — universal authentication, System authoring, owner authorization, controllers, and frontend locks
- [[api/FrontendPrograms]] — aggregate/service admission, state, command, query, and ticket Effects
- [[api/ReactFrontends]] — makeZerospinApp root, source-selected controllers, one Provider with no page-owned `userId` or `AuthenticatedApi`, and atomic session ownership
- [[api/SharedWorkerSession]] — identity-neutral host, per-port authentication, native `zerospin/056/` locator/VFS persistence, in-place existing-only promotion, and one exact Repo-owned `{ registrationId, ownerToken, authenticatedApi, frontendApi }`
- [[api/SystemWorkerServiceFrontends]] — generation-qualified service projection, direct SystemRepo mutation routing, and read-only frontend bindings

## Decisions

_No pages yet._

## Concepts

_No pages yet._

## Sources

_No pages yet. One page is created per significant source file or module as the codebase grows._
