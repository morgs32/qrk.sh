---
name: update-llm-wiki
description: >-
  After a code change, when the user names a pattern, or when invoked with no
  prompt, find a useful repo example and codify it in the source for
  $engineering-patterns or Zerospin's first-party pattern profile with @bad
  JSDoc tags.
---

# update-llm-wiki

Use this skill **together with** the change you are making (or right after it).
The goal is durable guidance grounded in real code shape from this repo.

Invoke `$engineering-patterns` for shared guidance. Its
`references/patterns/...` paths are logical paths inside the installed skill.
Zerospin-specific guidance is pinned under `vendor/zerospin/llm-wiki/patterns/`.
Do not edit the installed skill or the pinned subtree directly; author changes
in their source repositories, then refresh the consumer copy.

## When to use

- The user invoked the skill **without a prompt** — review the current chat for pattern conclusions (see [When run without a prompt](#when-run-without-a-prompt)).
- The user asked you to record how to handle this kind of change, pattern, idiom, syntax, or best practice in the docs.
- You fixed a bug or anti-pattern and want to **preempt** the same mistake.
- The change encodes a convention that is not already obvious from existing patterns.
- A `/cleanup` **Pass** surfaced a repeatable Zerospin smell worth a [pinned case page](../../../vendor/zerospin/llm-wiki/patterns/cases/index.md).

Skip it when the user only wants code with no doc update, or when the available guidance already states the same rule clearly.

## When run without a prompt

If the user invokes this skill with **no additional prompt** (e.g. `/update-llm-wiki` alone):

1. **Review the current chat** for discussion, decisions, or conclusions about patterns, idioms, syntax, or stylistic preferences that should outlive the session.
2. **Extract codifiable lessons** — only what was actually agreed, demonstrated in code, or explicitly requested; not speculative suggestions or unresolved debate.
3. **Check existing patterns** by invoking `$engineering-patterns` and searching `references/patterns/index.md`, then searching the pinned [`vendor/zerospin/llm-wiki/patterns/index.md`](../../../vendor/zerospin/llm-wiki/patterns/index.md). Skip anything already stated clearly.
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

3. **Pick the right source**
   - Repo-agnostic conventions belong in the source `morgs32/llm-wiki` repository under `skills/engineering-patterns/references/patterns/{functions,naming,effect,rpc,runtime,tooling,...}`. Invoke `$engineering-patterns` and search its logical `references/patterns/index.md` first.
   - Zerospin domain guidance belongs in the source `morgs32/zerospin` repository under `llm-wiki/patterns/{system-worker,contracts,typescript,error,...}`. Inspect QRK's pinned [`vendor/zerospin/llm-wiki/patterns/`](../../../vendor/zerospin/llm-wiki/patterns/index.md); concrete session evidence belongs under `llm-wiki/patterns/cases/` in the Zerospin source.
   - QRK-only lessons belong in QRK's first-party docs or repo-local guidance.

4. **Keep indexes in sync**

   Update the matching source index: `skills/engineering-patterns/references/patterns/index.md` in `morgs32/llm-wiki`, or `llm-wiki/patterns/index.md` in `morgs32/zerospin`. Update the source repository's `AGENTS.md` routing when the new topic needs an explicit route.

5. **Write mock TypeScript patterns from the example**

   Shared pattern format is documented at the logical `$engineering-patterns` path `references/patterns/README.md`.
   - **Code**: distilled from the repo example; shows only the preferred approach.
   - **Leading JSDoc**: one short sentence stating the rule.
   - **`@bad` JSDoc tags**: one anti-pattern per tag — the thing that caused confusion, bugs, or review churn (often the **before** state from the example you found).
   - No repo-specific file paths in shared patterns; Zerospin case pages may cite `path:start-end` when session evidence helps.

6. **Map examples to the current task**

   If the user gave **explicit** instructions for the fix:
   - Treat the **state before** the requested change as **`@bad`** annotations.
   - Treat the **requested remedy** (or the good example you found after the fix) as the code body.

7. **Refresh the consumer**
   - Shared guidance: validate `skills/engineering-patterns` in the source repo, then reinstall or update `~/.agents/skills/engineering-patterns`.
   - Zerospin guidance: use [`update-vendor`](../update-vendor/SKILL.md) to update the whole `vendor/zerospin` subtree; do not update its nested `llm-wiki` independently.

8. **Keep scope tight**

   One pattern file per lesson. No unrelated edits.

9. **Match repo doc tone**

   Imperative, specific, and scannable. Prefer “Do X / Don’t Y” in `@bad` tags over narrative.
