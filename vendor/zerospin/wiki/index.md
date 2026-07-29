---
title: Index
type: meta
updated: 2026-07-28
---

# Index

Master catalog of every wiki page. The ingest hook updates this file on every commit.

Organised by category. Pages are `[[wiki-links]]` without the `.md` extension.

## Getting oriented

- [[overview]] — big-picture synthesis of this codebase
- [[glossary]] — domain terms discovered from the code
- [[log]] — chronological record of every ingest, lint, and query

## Agent pattern libraries (not auto-ingested)

- [llm-wiki patterns](../vendor/morgs32/llm-wiki/patterns/index.md) — generic code-shape guidance
- [llm-wiki patterns](../llm-wiki/patterns/index.md) — zerospin-specific patterns and case studies

## Architecture

- [[architecture/FrontendApi]] — account-bound state/write authority, successor-resolving tickets, and seven leaves
- [[architecture/ServiceFrontendApi]] — read-only service state authority and successor-resolving ticket capability
- [[architecture/FrontendWebSocket]] — exact resume, lineage transitions, same-generation update-required, and repair
- [[architecture/SystemApi]] — concrete secret-key linked gateway, twenty-nine leaves, and RepoExplorer/service routing
- [[architecture/Blockchain]] — authoritative ledgers plus account and service browser lineage archives
- [[architecture/ServiceFrontendProjection]] — actor-scoped read-only service materialization and migration lineage
- [[architecture/bootstrapBrowserSession]] — pre-Provider auth, lazy DevTools, direct/SharedWorker replicas, and commissioning
- [[architecture/DeploySystem]] — distinct local/production control, Wrangler deploy/seed, finite freeze, and completion

## API

- [[api/CoreFrontendReplicas]] — account/service wire schemas and replica-application Effects
- [[api/CoreServiceControllers]] — authored service actor/frontend graph and authentication callback surface
- [[api/FrontendPrograms]] — one-shot auth plus account/service admission, state, command, and ticket Effects
- [[api/ReactFrontends]] — account pre-auth, lazy DevTools, Config authenticators, Providers, and commissioning
- [[api/SharedWorkerSession]] — partition capability, replica catalogs, command journal, migration, and repair
- [[api/SystemWorkerServiceFrontends]] — service projection Durable Object and SystemWorker RPC bindings

## Decisions

_No pages yet._

## Concepts

_No pages yet._

## Sources

_No pages yet. One page is created per significant source file or module as the codebase grows._
