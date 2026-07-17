---
name: update-llm-wiki
description: >-
  After a code change, when the user names a pattern, or when invoked with no
  prompt (review the current chat for pattern conclusions), find a useful repo
  example and codify it as a mock TypeScript pattern under
  vendor/morgs32/llm-wiki/patterns/ or llm-wiki/patterns/ with @bad
  JSDoc tags.
---

# update-llm-wiki

Use this skill **together with** the change you are making (or right after it). The goal is durable guidance in the `*-llm-wiki` pattern subtrees, grounded in real code shape from this repo.

## When to use

- The user invoked the skill **without a prompt** — review the current chat for pattern conclusions (see [When run without a prompt](#when-run-without-a-prompt)).
- The user asked you to record how to handle this kind of change, pattern, idiom, syntax, or best practice in the docs.
- You fixed a bug or anti-pattern and want to **preempt** the same mistake.
- The change encodes a convention that is not already obvious from existing patterns.
- A `/cleanup` **Pass** surfaced a repeatable smell worth a [case page](../../../llm-wiki/patterns/cases/index.md).

Skip it when the user only wants code with no doc update, or when the pattern subtrees already state the same rule clearly.

## When run without a prompt

If the user invokes this skill with **no additional prompt** (e.g. `/update-llm-wiki` alone):

1. **Review the current chat** for discussion, decisions, or conclusions about patterns, idioms, syntax, or stylistic preferences that should outlive the session.
2. **Extract codifiable lessons** — only what was actually agreed, demonstrated in code, or explicitly requested; not speculative suggestions or unresolved debate.
3. **Check existing patterns** in `vendor/morgs32/llm-wiki/patterns/` and `llm-wiki/patterns/` — skip anything already stated clearly.
4. For each remaining lesson, follow **Instructions** below (one pattern file per lesson).
5. If the chat has nothing worth codifying, say so briefly; do not invent patterns.

## Instructions

1. **Extract the lesson**  
   In one sentence: what should someone do (or avoid) next time? Tie it to a concrete situation (e.g. Drizzle adapters, Effect error handling, test DB setup), not generic advice.

2. **Find a useful code example in the repo**  
   Before writing a mock pattern from scratch, search the worktree for a **real example** that already demonstrates the preferred shape — or the anti-pattern the user just removed.
   - Prefer the file/symbol the user named or you just edited.
   - Use `rg`, semantic search, or case-study cross-links to find a second corroborating example when the fix is narrow.
   - Generalize names and strip repo-specific paths from the pattern file; keep the **structure** faithful to the example you found.
   - If no good example exists yet, write a minimal mock that still shows only the preferred approach.

3. **Pick the right pattern home**
   Search [`vendor/morgs32/llm-wiki/patterns/`](../../../vendor/morgs32/llm-wiki/patterns/index.md) and [`llm-wiki/patterns/`](../../../llm-wiki/patterns/index.md) for an existing pattern on the topic. Prefer **adding a new mock `.ts` file** in the matching topic folder over inventing prose docs.
   For **concrete session evidence**, add or extend a page under [`llm-wiki/patterns/cases/`](../../../llm-wiki/patterns/cases/index.md).
   For routing, use **repository root `AGENTS.md`** [Docs lookup](#docs-lookup). Map topics: repo-agnostic conventions → `vendor/morgs32/llm-wiki/patterns/{functions,naming,runtime,tooling,...}`; Effect/RPC → `vendor/morgs32/llm-wiki/patterns/effect/` or `rpc/`; Zerospin domain → `llm-wiki/patterns/{system-worker,contracts,typescript,error,...}`.
   **Package-specific lessons** belong in first-party `llm-wiki/`, not generic `vendor/morgs32/llm-wiki`.  
   Update **Docs lookup** in `AGENTS.md` when adding patterns that need keyword routing.

4. **Keep `AGENTS.md` indexes in sync**  
   When you add or materially change patterns, update **repository root `AGENTS.md`** in the same pass: add or adjust a row in the **Docs lookup** table (`#docs-lookup`) with Doc path, section link, and keywords.

5. **Write mock TypeScript patterns from the example**  
   This is the highest-value part. See [`vendor/morgs32/llm-wiki/patterns/README.md`](../../../vendor/morgs32/llm-wiki/patterns/README.md).
   - **Code**: distilled from the repo example; shows only the preferred approach.
   - **Leading JSDoc**: one short sentence stating the rule.
   - **`@bad` JSDoc tags**: one anti-pattern per tag — the thing that caused confusion, bugs, or review churn (often the **before** state from the example you found).
   - No repo-specific file paths in shared `llm-wiki` patterns; case pages may cite `path:start-end` when session evidence helps.

6. **Map examples to the current task**  
   If the user gave **explicit** instructions for the fix:
   - Treat the **state before** the requested change as **`@bad`** annotations.
   - Treat the **requested remedy** (or the good example you found after the fix) as the code body.

7. **Update subtree indexes**  
   Add or extend the row in the matching [`vendor/morgs32/llm-wiki/patterns/index.md`](../../../vendor/morgs32/llm-wiki/patterns/index.md) or [`llm-wiki/patterns/index.md`](../../../llm-wiki/patterns/index.md) entry so keyword routing finds the new file.

8. **Keep scope tight**  
   One pattern file per lesson. No unrelated edits elsewhere in the subtrees.

9. **Match repo doc tone**  
   Imperative, specific, and scannable. Prefer “Do X / Don’t Y” in `@bad` tags over narrative.
