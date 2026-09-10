---
title: Index
updated: 2026-09-08
---

# Index

Master catalog of every wiki page. The ingest hook updates this file on every commit.

Organised by category. Pages are `[[wiki-links]]` without the `.md` extension.

## Getting oriented

- [[overview|SystemRepo Durable Architecture]] — how authoring, fixed-schema command chains, Repos, and browser replicas interact
- [[glossary]] — domain terms discovered from the code
- [[log]] — chronological record of every ingest, lint, and query

## Agent pattern libraries (not auto-ingested)

- `$engineering-patterns` — globally installed generic code-shape guidance
- [llm-wiki patterns](../llm-wiki/patterns/index.md) — zerospin-specific patterns and case studies

## Architecture

- [[architecture/server/admitCommands]] — aggregate admission, materialization, and durable delivery
- [[architecture/AuthoredSystem]] — static authored-System deployment and provision-once Repo schemas
- [[architecture/SystemApi]] — singular static queries, command admission, health, and Repo inspection

### Browser

- [[architecture/browser/Authentication|Direct Exact Frontend Authentication]] — direct Gateway authentication, owner authorization, and aggregate/service child capability surfaces
- [[architecture/browser/FrontendWebSocket]] — singular finalized-command routes, exact opaque one-use tickets, and contiguous replay
- [[architecture/browser/IndexedDbBackupCoordination]] — stable SharedWorker, revocable per-key capabilities, atomic IndexedDB backup, and in-place frontend handoff
- [[architecture/browser/PushSequence]] — local aggregate occurrence, singular push, authoritative forwarding, and exact-origin finalization
- [[architecture/browser/bootstrapBrowserSession]] — main-thread recovery, shared IndexedDB backup, renewable execution identity, and scoped ownership

### Server

- [[architecture/server/executeAggregateCommand]] — one direct aggregate command through terminal history and singular client delivery

## Decisions

_No pages yet._

## Concepts

_No pages yet._

## Sources

_No pages yet. One page is created per significant source file or module as the codebase grows._

- [[architecture/server/serviceExecution]] — versioned service execution, cutover ranges, replication adaptation, and frontend delivery
