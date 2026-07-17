---
name: spec
description: >-
  Grill a fuzzy plan one question at a time (chat only), then synthesize a
  numbered design spec under .plans/specs/. Use when the user says /spec, wants
  a design spec, or wants grill + to-spec before implementation.
disable-model-invocation: true
---

# Spec (grill → design doc)

Two phases in one skill: **grill in chat**, then **write a spec file**. Do not write glossary files, ADRs, or other markdown during the grill. The only file you create is the final design spec.

## Phase 1 — Grill (chat only)

Interview relentlessly until you and the user share an understanding.

1. Ask **one question at a time**. Wait for the answer. Never dump a questionnaire.
2. Walk the design tree depth-first: resolve dependencies before downstream choices.
3. For every question, offer a **recommended answer** (brief, opinionated).
4. If a _fact_ is in the codebase or wiki, **look it up** — do not ask. Decisions belong to the user; put each one to them and wait.
5. Sharpen fuzzy language in chat: propose a canonical term when something is overloaded. Challenge contradictions with existing `wiki/glossary.md` terms or code. Keep vocabulary alignment in the conversation only — do not write `CONTEXT.md` or ADRs.
6. Do **not** write code or the spec file until the user confirms shared understanding (or explicitly says "write the spec").

### Docs to read before / while grilling

Read these **before** inventing topology, trust boundaries, or domain names. Prefer wiki and patterns over stale WIP code.

| Priority | Path                                                                                            | Use for                                                                   |
| -------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1        | [`wiki/architecture/`](../../../wiki/architecture/)                                             | Intended subsystem topology, `*Api` gateways, finalize/ledger/block flows |
| 2        | [`wiki/glossary.md`](../../../wiki/glossary.md)                                                 | Canonical domain terms                                                    |
| 3        | [`wiki/index.md`](../../../wiki/index.md)                                                       | Catalog of wiki pages                                                     |
| 4        | [`AGENTS.md` Docs lookup](../../../AGENTS.md)                                                   | Keyword → pattern / architecture routing                                  |
| 5        | [`vendor/morgs32/llm-wiki/patterns/`](../../../vendor/morgs32/llm-wiki/patterns/index.md)                   | Generic code-shape patterns                                               |
| 6        | [`llm-wiki/patterns/`](../../../llm-wiki/patterns/index.md) | Zerospin-specific patterns and case studies                               |
| 7        | [`llm-wiki.md`](../../../llm-wiki.md)                                                           | How this repo's LLM wiki idea works (meta)                                |
| 8        | [`TODOS.md`](../../../TODOS.md)                                                                 | Target-vs-current naming / topology audit                                 |

Also read the relevant source under `packages/` / `apps/` when the wiki is thin or the question is about current behavior.

**Rule:** docs describe intended topology; code may lag. Do not treat stale `*Repo` method names as the design target when architecture pages disagree.

## Phase 2 — Spec (one file)

After the user confirms alignment:

1. Sketch the **test seams** for the change. Prefer existing seams; prefer the highest seam; aim for as few as possible (ideally one). Confirm seams with the user before writing the file.
2. Determine the new spec/plan pair's shared three-digit `XXX` prefix before writing:

   1. Inspect filenames recursively under `.plans/` for names beginning with three digits.
   2. Use one more than the highest prefix found anywhere under `.plans/`.
   3. Ignore legacy filenames without a three-digit prefix when calculating the next number.
   4. Reuse this number if the spec is later turned into an implementation plan.

3. Write **one** design spec:

```text
.plans/specs/XXX-spec-<topic>.md
```

Use the allocated zero-padded prefix and a kebab-case topic. Number every list (no unordered `-` bullets in plan/spec docs).

4. Do **not** publish to an issue tracker. Do **not** create implementation plans under `.plans/plans/` unless the user asks.
5. When the user asks for an implementation plan from the spec:

   1. Read the completed spec as the source of truth.
   2. Create `.plans/plans/XXX-plan-<topic>.md` using the spec's exact `XXX` and topic.
   3. Do not allocate a second number for the implementation plan.
   4. Move the source spec to `.plans/archived/` without changing its filename after the implementation plan exists.

### Spec template

```markdown
# <Topic> design

**Date:** YYYY-MM-DD
**Status:** Draft | Approved for planning

## Problem Statement

What is broken or missing, and why it matters, in this project's vocabulary.

## Solution

High-level shape of the fix — not implementation detail.

## User Stories

Numbered, extensive, independently checkable:

1. As a <actor>, I want <capability>, so that <benefit>

## Implementation Decisions

Settled choices from the grill (modules/interfaces at a conceptual level, contracts, schema/API shape, trade-offs). Prefer project glossary terms.

Do not include brittle file paths or large code dumps. Exception: a short prototype snippet that encodes a decision more precisely than prose (state machine, schema, type shape) — trim to the decision-rich bits.

## Testing Decisions

1. What "done" looks like at the chosen seams
2. Which modules/behaviors are tested
3. Prior art (similar specs/tests in the repo)

## Out of Scope

What this change deliberately does not cover.

## Further Notes

Anything else worth carrying forward (open questions only if the user deferred them).
```

## Done when

1. Grill asked one question at a time and waited.
2. Codebase/wiki answered factual questions without bothering the user.
3. User confirmed shared understanding.
4. Seams were checked with the user.
5. Exactly one new file exists at `.plans/specs/XXX-spec-<topic>.md` with numbered lists and project vocabulary, or at the same-named archived path after its same-numbered implementation plan is written.

## Anti-patterns

1. Writing `CONTEXT.md`, `docs/adr/`, or any mid-grill markdown.
2. Re-interviewing during Phase 2 — synthesize what was already decided.
3. Inferring architecture from WIP repo glue when `wiki/architecture/` says otherwise.
4. Dumping a questionnaire or writing the spec before the user confirms.
5. Creating `.plans/plans/*` or tickets unless asked.
6. Giving a derived implementation plan a different numeric prefix or topic from its source spec.
