---
name: research
description: >-
  Read substantial repository code and primary outside documentation in the
  current session, then emit one numbered research document under
  .plans/research/. Use when the user says research, /research, investigate,
  study the codebase, compare best practices, or asks for an architecture or
  implementation research report before making a decision.
---

# Research

This task is about using the current session for deep reading while its context
window is in the smart zone, then turning that accumulated understanding into a
durable research document.

## Role

- Read a large amount of relevant repository code, outside documentation, best
  practices, architecture patterns, specifications, and first-party APIs in
  this session.
- Keep the investigation bounded to the user's question, but follow the
  evidence far enough to understand the surrounding design constraints.
- Prefer primary sources. Every factual claim about an external system must
  trace back to the source that owns it.
- Distinguish observed repository behavior, sourced external facts, and your
  own conclusions.

## Workflow

1. State the research question and the boundaries of the investigation.
2. Read the relevant repository code directly, including callers, tests,
   configuration, and existing architecture or planning documents.
3. Read the relevant primary outside documentation, specifications, source
   code, best-practice guidance, and architecture patterns.
4. Reconcile the repository's actual constraints with the external evidence.
5. Emit one Markdown research document. Do not finish with only a chat summary.

## Research document

Determine the document's three-digit `XXX` prefix before writing:

1. Inspect filenames recursively under `.plans/` for names beginning with three
   digits.
2. Use one more than the highest prefix found anywhere under `.plans/`.
3. Ignore legacy filenames without a three-digit prefix when calculating the
   next number.

Write exactly one document at:

```text
.plans/research/XXX-research-<topic>.md
```

Use the allocated zero-padded prefix and a kebab-case topic, matching the naming
convention used by `.plans/specs/XXX-spec-<topic>.md` and
`.plans/plans/XXX-plan-<topic>.md`.

The document must include:

1. The research question and scope.
2. The repository evidence, with concrete file and symbol references.
3. The external evidence, with source links beside the claims they support.
4. The relevant best practices and architecture patterns.
5. Findings, tensions, and unresolved questions.
6. A concise conclusion that answers the research question without pretending
   unresolved choices are settled.

## Boundaries

- Do not implement the researched change unless the user separately asks.
- Do not replace direct reading with a shallow summary or a list of search
  results.
- Do not delegate the core reading away from the current session.
- Do not invent evidence, certainty, or consensus.
- Do not create a spec or implementation plan unless the user separately asks.

## Not this

- Not a **spike**: no mandate for stubs or pseudocode as the main deliverable.
- Not a formal **PR / code review**: no severity buckets or merge-gate framing
  unless the user asks.
