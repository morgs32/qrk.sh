---
name: cleanup
description: >-
  Judge, review, simplify, route, and orchestrate Zerospin cleanup: spot smells,
  produce findings, prune stale structure, tighten imports, or run a full pass
  with case studies and architecture. Use for /cleanup, /cleanup-mode, slop,
  simplify, inline, import cleanup, cleanup pass, or make code concise.
---

# Cleanup

One skill for Zerospin cleanup. **Pattern guidance lives in the `*-llm-wiki` subtrees** — treat them as the canonical good/bad reference, not ad-hoc prose in chat.

| Subtree                                                                                                     | Scope                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`vendor/morgs32/llm-wiki/patterns/`](../../../vendor/morgs32/llm-wiki/patterns/index.md)                               | Repo-agnostic code shape — functions, naming, Effect, RPC, runtime, tooling, Next.js, Cloudflare, durable objects |
| [`llm-wiki/patterns/`](../../../llm-wiki/patterns/index.md)             | Zerospin domain — system-worker, contracts, fanout, schemas, examples, TypeScript workspace wiring                |
| [`llm-wiki/patterns/cases/`](../../../llm-wiki/patterns/cases/index.md) | Session evidence — before/after smells with links to mock `.ts` patterns                                          |

Each pattern is a mock `.ts` file: code shows the **good** shape; **`@bad` JSDoc tags** document anti-patterns. See [`vendor/morgs32/llm-wiki/patterns/README.md`](../../../vendor/morgs32/llm-wiki/patterns/README.md).

## When to invoke

- `/cleanup`, `/cleanup-mode`, "clean up this file", "cleanup pass", "de-bloat", "prune this module"
- "simplify", "inline", "declutter"
- "review this once more", "is this too obtuse?", "make this easier to read"
- "we can inline this, right?", "is this actually needed?", "this is slop"
- "this is unnecessarily obtuse", "would you be proud of this code?"
- `/import-cleanup`, "import cleanup", long relative paths, path alias hygiene
- Before editing when the task could drift into helpers, wrappers, extra files, or scope the user did not ask for
- After a feature land when shape debt is visible in user-named files

Turn vague readability frustration into a concrete mode. Do not jump straight into refactoring.

## Read first

Always:

1. `AGENTS.md`
2. The matching topic in [`vendor/morgs32/llm-wiki/patterns/index.md`](../../../vendor/morgs32/llm-wiki/patterns/index.md) or [`llm-wiki/patterns/index.md`](../../../llm-wiki/patterns/index.md) — read the linked mock `.ts` files for the smell you are judging or fixing
3. When a Zerospin smell matches a [case study](../../../llm-wiki/patterns/cases/index.md), read that case and its linked pattern file fully

Standing defaults (when no tighter match):

- [`vendor/morgs32/llm-wiki/patterns/functions/effect-fn-one-props-object.ts`](../../../vendor/morgs32/llm-wiki/patterns/functions/effect-fn-one-props-object.ts)
- [`vendor/morgs32/llm-wiki/patterns/naming/no-re-exports-outside-barrels.ts`](../../../vendor/morgs32/llm-wiki/patterns/naming/no-re-exports-outside-barrels.ts) — required for **Imports** mode; cross-package imports → [`vendor/morgs32/llm-wiki/patterns/naming/monorepo-cross-package-imports.ts`](../../../vendor/morgs32/llm-wiki/patterns/naming/monorepo-cross-package-imports.ts)

For **Pass** mode, also read:

4. [`llm-wiki/patterns/cases/index.md`](../../../llm-wiki/patterns/cases/index.md) — match smells to case pages before editing
5. Relevant [`wiki/architecture/`](../../../wiki/architecture/) when repo roles, finalize, fanout, batch workflow, or trust boundaries apply

For **Judge**, **Review**, or **Prune** on code that crosses those boundaries, read the matching architecture doc before editing.

## Primary rule

Make code simpler by **removing structure**, not by replacing it with a prettier abstraction.

Bias, in order:

1. Delete.
2. Inline.
3. Colocate.
4. Rename for clarity.
5. Ask before introducing a new abstraction.

Before editing, confirm the smell is still present in the current worktree. If the simplification already happened, do not re-edit just to satisfy a plan.

## Pick a mode

Choose one mode for the turn. Combine only when the user clearly wants judgment **and** a microscopic fix in the same pass.

| Mode        | Use when                                                                                      | Output                                                                 |
| ----------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Judge**   | Deciding whether a smell is real before editing; checking scope drift or false positives      | Direct answer: keep, delete, inline, colocate, rename, or stop-and-ask |
| **Review**  | User wants judgment, not implementation; "review once more", "would you interview with this?" | Numbered findings with `path:line`, problem, smallest fix direction    |
| **Prune**   | User named the simplification or smell is already clear; delete, inline, shorten control flow | Smallest direct diff in user-named files                               |
| **Imports** | Import paths only — aliases, long `../` chains, consistent package imports                    | Rewritten imports in user-named scope                                  |
| **Pass**    | Full orchestrated cleanup — case studies, architecture check, execute, codify lessons         | Smells found, changes made, deferred items                             |

### Decision rules

1. `/cleanup-mode`, "cleanup pass", or user wants case-study-guided work with codify → **Pass**.
2. Import paths only → **Imports**. Do not mix code-shape pruning in the same pass unless the user asked.
3. Question about shape first → **Review** or **Judge** before editing.
4. User already named the simplification → **Prune** directly.
5. Unsure whether a smell is real → **Judge** first.
6. Vague frustration ("slop", "obtuse") with no named fix → **Review** or **Judge** first; name the smallest mode after reading the code.
7. "Is this wrong?" plus "fix it" → **Judge**, then **Prune** only if the answer is clear and the fix is microscopic, local, and non-architectural.
8. Long but phase-annotated code → prefer findings about duplicated setup or stale indirection over generic "too long" criticism.
9. Batch methods → check inconsistent failure semantics inside one loop before complaining about length.

### Secondary workflows

Add one only if needed beyond the modes above:

- [`step-by-step`](../step-by-step/SKILL.md) — structural delete with fallout handled in sequence
- [`update-llm-wiki`](../update-llm-wiki/SKILL.md) — codify a repeatable lesson from a repo example (also step 6 of **Pass**)
- [`update-architecture`](../update-architecture/SKILL.md) — simplification changes documented topology or flow

## Pass mode (orchestrated workflow)

Use **Pass** for intentional cleanup with patterns, architecture, and optional codify. Inside **Pass**, pick **Judge**, **Review**, **Prune**, or **Imports** for the actual edit work.

1. **Scope** — User-named files/dirs only ([AGENTS.md](../../../AGENTS.md#rules)). Default microscopic; ask before repo-wide sweep.

2. **Read** — [`vendor/morgs32/llm-wiki/patterns/index.md`](../../../vendor/morgs32/llm-wiki/patterns/index.md) and [`llm-wiki/patterns/cases/index.md`](../../../llm-wiki/patterns/cases/index.md); match smells to case pages and read relevant cases fully.

3. **Architecture check** — If repo roles, finalize, fanout, batch workflow, or trust boundaries: read the matching [`wiki/architecture/`](../../../wiki/architecture/) doc **before** editing ([AGENTS.md — consult architecture docs first](../../../AGENTS.md#consult-architecture-docs-first)).

4. **Route** — Pick **Judge**, **Review**, **Prune**, or **Imports** per [decision rules](#decision-rules). Structural delete with fallout → [`step-by-step`](../step-by-step/SKILL.md).

5. **Execute** — Smallest direct diff. No new abstractions without explicit user approval ([AGENTS.md](../../../AGENTS.md#ask-before-abstractions)).

6. **Codify** — Repeatable lesson → [`update-llm-wiki`](../update-llm-wiki/SKILL.md) (find a useful repo example; add a mock `.ts` pattern with `@bad` JSDoc or extend a [case page](../../../llm-wiki/patterns/cases/index.md)).

7. **Verify**
   - `rg` for deleted symbol references
   - Narrow typecheck/test for touched package only

### Pass output

Numbered list:

1. Smells found (link case page if matched)
2. Changes made
3. Deferred items (offer `/ugly` if user wants to defer)

## Quick shape check (Judge, Review, Prune)

Before editing, answer:

1. What is the exact named change the user asked for?
2. Can I do it in the file they named without adding a helper, wrapper, export, or extra type?
3. Is any indirection only making the reader jump files for no reuse?
4. Am I about to broaden scope into unrelated cleanup, runtime moves, or type fallout the user did not request?

If (2) is yes, do that.

The reader should answer quickly:

1. What data comes in?
2. What important branch exists?
3. What gets written, returned, or forwarded?
4. Which module actually owns this symbol?

If they must jump through aliases, tiny helpers, re-exports, or shape files to answer those, prune them.

## What to judge

Judge whether the code reads like direct domain logic or the reader fights avoidable structure.

Focus on:

1. Unnecessary abstractions
2. Bloated method shape
3. Hidden data flow
4. One-consumer types/helpers/files
5. Stale branches or stale names
6. Scope drift and "helpful" structure that was not needed
7. Repeated setup phases across neighboring methods
8. Inconsistent failure semantics within one batch/transaction loop

### Smells to remove or avoid

- Single-call wrapper bindings like `const getX = key => Repo.getRepo({ binding, key })`
- One-consumer helper files, shape files, or tiny sibling `Effect.fn` files
- Re-exports from feature/runtime modules instead of importing from the defining module
- Bolt-on type fixes at the call site instead of fixing the factory/base type
- "Helpful" exports, index files, aliases, or props/types the user did not ask for
- Big method refactors that add indirection without deleting real complexity
- Runtime-boundary moves between CLI, dispatch-worker, shared-worker, or system-worker without approval
- Repo-wide cleanup passes disguised as a local fix

## Simplification order (Prune mode)

Apply in order; stop as soon as the code becomes obvious:

1. Delete stale branches, dead types, old wire shapes, and pass-through values.
2. Inline single-use wrappers, aliases, and one-consumer helpers.
3. Move one-consumer shapes/types back into the owning module.
4. Replace re-export hops with imports from the defining module.
5. Shorten control flow inside the existing method or function.
6. Ask before adding a new helper, type, service, export, or file.

### Safe simplifications

- Delete a file that only exists for one sibling consumer
- Inline a type or props object used once
- Inline a helper called once when it carries no policy
- Rename a local variable to the concrete domain term already used elsewhere
- Collapse `Object.entries` / `Object.fromEntries` noise to an existing repo utility when cleanup docs already prefer it
- Remove extra readonly/assertion soup when it is not required

### If a method feels bloated

Do not jump straight to helper extraction:

1. Remove dead paths, stale types, and no-op wiring.
2. Inline one-off wrappers and aliases.
3. Destructure once at the top and tighten local names.
4. Collapse unnecessary file hops.
5. Stop and ask before extracting helpers, creating services, or adding exports.

Split a method only when the resulting pieces each own a real phase and are not single-use indirection.

## Imports mode

Import-path hygiene only. Stay within the user's **stated file/scope** unless they ask for a broader sweep.

### Spot these patterns

- Multiple `..` segments: e.g. `../../../../../../lib/foo`
- Any import harder to read than an alias for the same file (**3+** `../` is a strong signal; **2** may still be worth fixing in deep trees)

### Prefer an alias when

1. The file's **own package or example project** has a `compilerOptions.paths` entry that maps the prefix (commonly `"@/*": ["./src/*"]`).
2. The resolved target lives **under that same package's root**, not in another workspace package.

### How to pick the import

- Read the **`tsconfig.json` next to the file being edited**. Do not assume every project uses `@/`; only use what that config defines.
- For `"@/*": ["./src/*"]`, `examples/shopping/src/lib/utils.ts` is `@/lib/utils`.
- If there is **no** path alias, shorten with a **shorter** relative path if possible, or leave a note — do not invent a fake alias.

**Examples (shopping example):**

- Bad: `import { cn } from '../../../../lib/utils'` from a nested component
- Good: `import { cn } from '@/lib/utils'` when `examples/shopping/tsconfig.json` maps `@/*` → `./src/*`

### Cross-package imports

- Targets in another `packages/*`, `examples/*`, or `docs/` workspace project use the **package name** or an established subpath from that package's `package.json` exports — **not** the current file's `@/` alias.
- If unsure, check the destination package's `package.json` `name` and `exports`.

### Imports verification

- Mental check: the new specifier resolves the same module as before.
- If the project uses **oxlint**, a quick pass against import rules (e.g. `import/no-useless-path-segments`) is enough; do not add new lint config unless the user asked.

## False-positive checks

Before calling something bloated or indirect:

1. Confirm the code still looks that way in the current worktree.
2. Count call sites — reused lookup helpers across entrypoints may be real shared policy.
3. Check whether the file is an allowed barrel or Worker entrypoint.
4. Check whether a helper hides real naming or binding policy vs forwarding one obvious call.
5. Distinguish essential complexity from gratuitous indirection.
6. Check whether duplicated setup across methods is the better criticism than method size alone.

## Stop and ask

Stop instead of guessing when:

- The simplification would move logic across runtime boundaries
- The only way to shrink a method is to invent a reusable abstraction
- The change would add exports, `index.ts`, or new public API surface
- The simplification changes ownership between repos, workers, or packages

## Findings threshold (Review mode)

Only report a finding when it is specific and actionable.

A good finding names:

- the exact file and lines
- the readability problem
- why it hurts direct understanding
- the smallest likely simplification direction

Do not report style nits, hypothetical abstractions, vague "could be cleaner" remarks, or correctness issues unless tightly tied to code shape/readability.

If there are no findings, say so plainly and state why the complexity appears necessary.

## Output

### Review mode

Numbered findings. For each:

1. `path:line` or `path:start-end`
2. One sentence describing the shape problem
3. One sentence describing the smallest simplification direction

### Judge, Prune, or Imports mode

Be concrete:

1. Name the exact smell, direct edit, or import rewrite.
2. Name the abstraction you are **not** adding (shape modes).
3. Name any worthwhile follow-up you intentionally did **not** bundle.

### Pass mode

See [Pass output](#pass-output).

## Verification (Prune and Pass)

1. `rg` for deleted symbol references
2. Smallest affected typecheck/test target
3. Diff review: fewer jumps, fewer files, no new abstraction layers

## Anti-patterns

- Turning one 40-line method into four 10-line helpers with one caller each
- Adding a generic utility to avoid writing the obvious direct code
- Keeping both old and new structures "for now"
- Smuggling in unrelated cleanup under a simplification request
- Recommending helper extraction just because a method is long
- Calling code "clean" because it uses more abstractions
- "While we're here" refactors
- Routing straight to implementation when the user clearly wanted judgment only
- Mixing **Imports** with code-shape **Prune** when the user only asked for import hygiene
- Inventing path aliases not defined in the local `tsconfig.json`
- Treating every long method as a helper-extraction problem
- Giving vague advice instead of a concrete local move
- Inventing helpers to "clean up" a long method
- Repo-wide refactor when user named one file
- Skipping architecture docs on AccountRepo / fanout / finalize edits
- Running full **Pass** overhead for a microscopic single-file fix the user already named
