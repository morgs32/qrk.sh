---
name: spike
description: >-
  Explores ideas with pseudocode, stubs, and comments only—no architecture
  ownership, no compile-fixing, temporary broken state OK. Use when the user
  says spike, /spike, sketch, rough pass, explore options, or wants a first pass
  before they decide design.
---

# Spike mode

The user drives architecture. This pass is for **orientation and options**, not a shippable implementation.

## Defaults (do these unless they say otherwise)

1. **Shells and pseudocode** — Write the obvious shape (function signatures, empty bodies, `// TODO`, placeholder returns). Prefer readable stubs over complete logic.

2. **Minimal surface** — Only what maps directly to the stated problem. No new abstractions, helpers, or “while we’re here” refactors.

3. **Broken is OK** — Do **not** spend effort making the project typecheck or build. No import fixing, no exhaustive types, no wiring every call site, unless the user explicitly asks for a compiling spike.

4. **Reuse via pointers, not copies** — If something already exists almost identically elsewhere, **do not duplicate** a big block. Add a short comment with the repo-relative path (and symbol name if helpful), e.g. `// Same pattern as packages/core/src/session/makeSession.ts (stage + Effect.gen).`

5. **Comments carry the design** — For non-obvious gaps, use block comments: intent, tradeoffs in one line each, and “would pull from X” or “would call Y”. The code is a skeleton; the comments are the spike.

## Optional small step

If—and only if—a pattern is **already established** in this codebase and copying it is a **few lines** with a clear file reference, you may add that tiny slice. Otherwise leave a comment and stop.

## How to finish the turn

After the stubbed code:

1. List **numbered comment anchors** (or map to line ranges) for each place you left a real decision.
2. **Prompt one decision at a time** — e.g. “For (1): option A vs B; which direction?” Wait for an answer before assuming the next.

Do not dump a long questionnaire; one focused question per ambiguous comment unless the user asks for a batch.

## Anti-patterns for spikes

- Choosing frameworks, folder layout, or new types “for cleanliness.”
- Filling in error handling, tests, or production edge cases.
- “Making it compile” across the monorepo when the user wanted exploration only.

If scope is unclear, spike the **smallest** file or function they pointed at and ask one clarifying question.
