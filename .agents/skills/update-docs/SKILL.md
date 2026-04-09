---
name: update-docs
description: After a code change, add or extend docs under docs/ with good vs bad examples so similar work is done correctly next time.
---

# update-docs

Use this skill **together with** the change you are making (or right after it). The goal is durable guidance in `docs/`, not a one-off comment in the PR.

## When to use

- The user asked you to record how to handle this kind of change, pattern, or pitfall in the docs.
- You fixed a bug or anti-pattern and want to **preempt** the same mistake.
- The change encodes a convention that is not already obvious from existing docs.

Skip it when the user only wants code with no doc update, or when `docs/` already states the same rule clearly.

## Instructions

1. **Extract the lesson**  
   In one sentence: what should someone do (or avoid) next time? Tie it to a concrete situation (e.g. Drizzle adapters, Effect error handling, test DB setup), not generic advice.

2. **Pick the right doc home**  
   Search `docs/` for an existing section that already covers the topic. Prefer **appending** a short subsection with a stable heading (e.g. `### Good vs bad: …`) over inventing a new top-level doc.  
   Use `./docs/styleguide/README.md` and `./docs/README.md` to route: style and repo conventions → `docs/styleguide/*` or `docs/tooling/*`; Effect/RPC → `docs/effect/*`; Cloudflare → `docs/cloudflare/*`; testing/storage patterns → `docs/styleguide/testing-and-storage.md` when applicable.  
   Only add a new file if no reasonable anchor exists.

3. **Write good vs bad examples**  
   This is the highest-value part.
   - **Bad**: shows the incorrect or fragile approach (the thing that caused confusion, bugs, or review churn).
   - **Good**: shows the preferred approach that matches this repo’s conventions.

   Use minimal, copy-pastable snippets or tight pseudo-diffs. If the real change is in-repo, you may cite paths and describe the before/after instead of pasting huge blocks.

4. **Map examples to the current task**  
   If the user gave **explicit** instructions for the fix:
   - Treat the **state before** the requested change as the **bad** example (or summarize it accurately).
   - Treat the **requested remedy** as the **good** example.

   If you are introducing a new feature without a prior “wrong” version, still give **bad** as a plausible misuse or common mistake and **good** as the intended pattern.

5. **Keep scope tight**  
   One subsection per lesson. No unrelated edits elsewhere in `docs/`. Do not duplicate long content that already lives in the same file; link or cross-reference if needed.

6. **Match repo doc tone**  
   Imperative, specific, and scannable. Prefer “Do X / Don’t Y” over narrative. Follow the tone and linking style of the file you are editing.
