---
title: Index
type: meta
updated: 2026-07-15
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

- [[architecture/FrontendApi]] — per-frontend linked RPCs, persisted server roots, and actor query routing
- [[architecture/SystemApi]] — concrete secret-key linked gateway, twenty-nine leaves, and RepoExplorer/service routing
- [[architecture/Blockchain]] — account and service block chains converging on frontend projections
- [[architecture/bootstrapBrowserSession]] — browser bootstrap, session telemetry, Logs, SharedWorker
- [[architecture/DeploySystem]] — local CLI lifecycle, generation preparation, activation, and readiness

## API

_No pages yet. Gateway `*Api` docs will appear here or under Architecture as ingest runs._

## Decisions

_No pages yet._

## Concepts

_No pages yet._

## Sources

_No pages yet. One page is created per significant source file or module as the codebase grows._
