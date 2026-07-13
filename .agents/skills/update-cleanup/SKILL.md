---
name: update-cleanup
description: After a code change, add or extend docs under docs/cleanup/ with good vs bad examples or case studies so similar work is done correctly next time.
---

# update-cleanup

Use this skill **together with** the change you are making (or right after it). The goal is durable guidance in `docs/cleanup/`, not a one-off comment in the PR.

## When to use

- The user asked you to record how to handle this kind of change, pattern, or pitfall in the docs.
- You fixed a bug or anti-pattern and want to **preempt** the same mistake.
- The change encodes a convention that is not already obvious from existing docs.
- A `/cleanup` **Pass** surfaced a repeatable smell worth a [case study](../../../docs/cleanup/cases/index.md).

Skip it when the user only wants code with no doc update, or when `docs/cleanup/` already states the same rule clearly.

## Instructions

1. **Extract the lesson**  
   In one sentence: what should someone do (or avoid) next time? Tie it to a concrete situation (e.g. Drizzle adapters, Effect error handling, test DB setup), not generic advice.

2. **Pick the right doc home**  
   Search `docs/cleanup/` for an existing section that already covers the topic. Prefer **appending** a short subsection with a stable heading (e.g. `### Good vs bad: …`) over inventing a new top-level doc.  
   For **concrete before/after examples** with session evidence, add or extend a page under [`docs/cleanup/cases/`](../../../docs/cleanup/cases/index.md) using the template from an existing case file.  
   For routing, use **repository root `AGENTS.md`** [Docs lookup](#docs-lookup) and the topic doc under `docs/cleanup/**`: [Rules — Doc placement](../../AGENTS.md#doc-placement) and **Docs lookup** (`#docs-lookup` — keyword → section index). Map topics: repo conventions → `docs/cleanup/function-shapes.md`, `naming-and-imports.md`, `runtime-boundaries.md`, `testing-and-storage.md`, or `tooling-*.md`; Effect/RPC → `docs/cleanup/effect-rpc.md`, `effect-core.md`, `effect-schemas.md`; Zerospin → `docs/cleanup/zerospin-*.md`; Cloudflare → `docs/cleanup/cloudflare-workers.md`; plans → `docs/cleanup/plans-*.md`; Ink/Prisma → `docs/cleanup/tooling-misc.md`.  
   **No hub `README.md` or `overview.md` in `docs/cleanup/`** — use descriptive topic filenames. Update **Docs lookup** in `AGENTS.md` when adding sections.  
   **Package-specific sections:** when the lesson is mostly about one workspace package, add or extend `docs/cleanup/zerospin-<topic>.md` instead of growing `testing-and-storage.md`.  
   Only add a new file if no reasonable anchor exists.

3. **Keep `AGENTS.md` indexes in sync**  
   When you add or materially change static guidance under `docs/cleanup/**`, update **repository root `AGENTS.md`** in the same pass: add or adjust a row in the **Docs lookup** table (`#docs-lookup`) with Doc path, section link, and keywords. Skip index edits if the section is already covered.

4. **Write good vs bad examples**  
   This is the highest-value part.
   - **Bad**: shows the incorrect or fragile approach (the thing that caused confusion, bugs, or review churn).
   - **Good**: shows the preferred approach that matches this repo’s conventions.

   Use minimal, copy-pastable snippets or tight pseudo-diffs. If the real change is in-repo, you may cite paths and describe the before/after instead of pasting huge blocks.

5. **Map examples to the current task**  
   If the user gave **explicit** instructions for the fix:
   - Treat the **state before** the requested change as the **bad** example (or summarize it accurately).
   - Treat the **requested remedy** as the **good** example.

   If you are introducing a new feature without a prior “wrong” version, still give **bad** as a plausible misuse or common mistake and **good** as the intended pattern.

6. **Keep scope tight**  
   One subsection per lesson. No unrelated edits elsewhere in `docs/cleanup/`. Do not duplicate long content that already lives in the same file; link or cross-reference if needed.

7. **Match repo doc tone**  
   Imperative, specific, and scannable. Prefer “Do X / Don’t Y” over narrative. Follow the tone and linking style of the file you are editing.
