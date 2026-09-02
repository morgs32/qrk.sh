---
name: rfc
description: >-
  Create or revise Zerospin architecture Requests for Comments under
  wiki/dev/rfcs/. Use when the user says RFC, Request for Comments, architecture
  proposal, proposed architecture, design RFC, or asks for a proposal with
  Drizzle schema tables, Mermaid workflows, sequence diagrams, and annotated
  steps.
---

# RFC

Write one focused Request for Comments that makes a proposed architecture easy
to inspect before implementation. RFCs describe the target design; they are not
generated documentation of behavior at HEAD and do not authorize code changes.

## Workflow

1. Read the relevant `wiki/architecture/` pages, `wiki/glossary.md`, and source
   needed to understand the constraint. Use that research to avoid impossible
   proposals, not to turn the RFC into a current-state audit.
2. Resolve material design ambiguity with the user before presenting one option
   as the proposal. Ask before canonizing a new named type, helper, public RPC,
   or runtime-boundary move as required by `AGENTS.md`.
3. Create or update exactly one Markdown file under `wiki/dev/rfcs/`. Use a
   concise, descriptive filename and update an existing RFC for the same
   proposal rather than creating a serial copy.
4. State the problem and goal concisely, then show the proposed architecture.
   Keep current implementation detail out of the main design. Include a current
   constraint only when the problem cannot be understood without it, and label
   it as context rather than part of the proposal.
5. Represent proposed persistence with Markdown schema tables whenever database
   state is architecturally relevant. Add a Mermaid ER diagram when table
   relationships are easier to understand visually.
6. Add a Mermaid sequence diagram or workflow when ordering, ownership,
   concurrency, retries, or state transitions matter. Put `autonumber N`
   immediately before every sequence message, with contiguous numbers starting
   at 1. Label invocation arrows (`->>`) as `{receiverBinding}.{method}()` or `{receiverBinding}.{method}(...)`; keep
   return payloads on `-->>`; keep user/process steps and unnamed inline checks
   as short predicates.
7. Put `## Annotated workflow steps` immediately after the workflow diagram.
   Include exactly one ordered item per numbered message or workflow step, in
   the same order, and explain the relevant call, transaction, persistence, or
   instrumentation shape with short snippets where useful.
8. End with the invariants the proposal must preserve and a short
   `Comments requested` section containing only genuinely open decisions.
9. Format the RFC with `./node_modules/.bin/oxfmt`, run `oxfmt --check`, verify
   local links, verify diagram/annotation numbering, and run `git diff --check`.

## RFC shape

Use only sections that add value, normally in this order:

1. Title and `Draft` status.
2. `Problem and goal`: one compact explanation of what is wrong or missing and
   what outcome the proposal must achieve.
3. `Proposed architecture`: ownership, boundaries, and lifecycle.
4. `Proposed Drizzle schemas`: schema tables and, when useful, an ER diagram.
5. `Workflow`: a sequence diagram, flowchart, or state diagram when necessary.
6. `Annotated workflow steps`: exact ordered annotations for that diagram.
7. `Implementation sketches`: only decision-rich calls, transactions, table
   definitions, and instrumentation; do not write a partial implementation.
8. `Invariants`.
9. `Comments requested`.

## Drizzle schema tables

Prefer one table per proposed Drizzle table:

| Column | Proposed Drizzle shape       | Constraints | Purpose              |
| ------ | ---------------------------- | ----------- | -------------------- |
| `id`   | `primitives.primaryKey(...)` | primary key | Stable row identity. |

For every schema table:

1. Name the owning Durable Object or database.
2. Show every architecture-bearing column, including state discriminants,
   cursors, foreign identifiers, timestamps, and stored payloads.
3. State primary keys, unique constraints, nullability, and important indexes.
4. Distinguish ledger ordering fields from causal or correlation fields.
5. Mark intentionally omitted operational columns instead of implying the
   sketch is an exhaustive generated schema.
6. Do not include compatibility columns or migration paths for superseded
   pre-release state unless the user explicitly approves an exception.

## Diagram rules

1. Use a state diagram for lifecycle transitions, a sequence diagram for
   cross-owner calls, a flowchart for decisions/fixed points, and an ER diagram
   for table relationships.
2. Keep each diagram focused; split persistence, lifecycle, and request flow
   rather than producing one unreadable graph.
3. Use exact owner names such as SystemRepo, MaterializedServiceRepo, and
   AggregateCommandChain.
4. For every message, enumerate the exact target fields at first use and state
   which boundary supplies them.
5. Do not mix superseded and proposed architecture in the same diagram.

## Boundaries

1. Do not implement the RFC unless the user separately asks for implementation.
2. Do not present speculative table, method, type, or error names as settled.
3. Do not add alternate designs merely to appear comprehensive; record only
   alternatives the discussion actually needs.
4. Do not put RFCs under `wiki/dev/plans/`, `wiki/architecture/`, or
   `wiki/dev/diagrams/`.

## Done when

1. One RFC exists under `wiki/dev/rfcs/`.
2. Its problem and goal are concise.
3. Architecturally relevant Drizzle state is represented with schema tables.
4. Ordering-sensitive behavior has a focused diagram with matching annotations.
5. The document shows proposed architecture without presenting it as behavior
   at HEAD.
6. Formatting, links, numbering, and diff checks pass.
