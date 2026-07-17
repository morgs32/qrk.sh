---
name: annotate
description: >-
  Adds comments that explain code: a numbered step overview above a function
  with matching inline checkpoints, or a file-top block comment for specific
  behavior the user names. Use when the user says annotate, /annotate, say-so,
  /say-so, step annotations, file header explanation, or wants a concise
  walkthrough or behavior note.
---

# Annotate

Add **comments only** — no behavior changes, renames, or refactors. Pick the mode that matches what the user asked for.

## Modes

| Mode                       | Trigger                                                         | Where                         | What                                           |
| -------------------------- | --------------------------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| **Function walkthrough**   | `/annotate`, step annotations, numbered walkthrough of a method | Above a **function** + inline | Numbered phase list and `// N — …` checkpoints |
| **File-top behavior note** | `/say-so`, file header explanation, document specific behavior  | Top of **file**               | Prose about **prompted** behavior only         |

Do **not** mix modes unless the user asks for both. For say-so, do **not** add inline step markers or a function-level numbered overview.

## When to apply

- The user invokes `/annotate` or asks for step-by-step annotation of a specific function or method.
- The user invokes `/say-so` or asks to document **specific behavior** at the top of a file.
- Stay within the **stated file/scope** unless they ask for a broader pass.

## Function walkthrough

1. Read the **full** function, including nested callbacks, transactions, and early returns.
2. Distill into **5–12** ordered steps. One short line each. Name the **phase**, not every statement.
3. Place the numbered list **immediately above** the function in a block comment:

   ```typescript
   /*
    * 1. First phase.
    * 2. Second phase.
    * ...
    */
   async myMethod() { ... }
   ```

4. Mark **checkpoints** inside the body with `// N — …` using the **same numbers** as the overview.
   - Inline text should be **more specific** than the overview line (RPC/table names, branches, what gets written).
   - Format: `// 3 — no rows in batch; skip transaction and cursor write`
   - Place markers at phase starts, early returns, and post-transaction cleanup.
   - Do **not** annotate every line.

### Function walkthrough style

- Overview: one short imperative line per step.
- Inline: same step number plus extra concrete detail — not a bare `// N`.
- Numbers in the overview and inline checkpoints must stay **in sync**.
- Prefer a block comment above the function. Use JSDoc only if the function already uses JSDoc for public API docs.

### Example

Canonical reference: [`ControllerRepo.handleFanout`](../../../packages/system-worker/src/ControllerRepo/ControllerRepo.ts) — concise block-comment overview (steps 1–8) and richer `// N — …` checkpoints at phase boundaries.

### Verification

- Every step in the overview appears at least once as an inline checkpoint.
- No logic changes; comments only.

## File-top behavior note (say-so)

1. Read the **full file** (or the sections needed to explain the prompted behavior accurately).
2. Distill the user's ask into **1–5 short paragraphs or bullets** — only what they asked for; no tour of unrelated code.
3. Insert a block comment **immediately after** any existing file-level directives that must stay first (`'use client'`, `'use server'`, `"use node"`, shebang, `@ts-nocheck`, license header). Otherwise place it at **line 1**.
4. Use a plain block comment, not JSDoc, unless the file already uses JSDoc for module-level docs.

   ```typescript
   /*
    * [Topic the user asked about]
    *
    * - Concrete behavior, invariant, or boundary.
    * - Why it matters or what breaks if ignored.
    * - Optional: pointer to related module/workflow when non-obvious.
    */
   ```

### File-top style

- Write for a maintainer who already reads the code — precise, not tutorial-length.
- Prefer **behavior and constraints** over restating identifiers line by line.
- If the user gave **exact wording**, use it verbatim for that part.
- If behavior is uncertain or WIP, say so in the comment instead of inventing semantics.
- Keep the header **short**; link to playbook or a sibling file only when it clarifies a cross-cutting rule.

### Verification

- Comment sits at the file top (respecting immovable first-line directives).
- Content matches **only** the behavior the user prompted.
- No logic changes; comments only.
