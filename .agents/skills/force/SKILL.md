---
name: force
description: >-
  Implements the requested changes directly without chasing type coherence,
  compile fixes, or passing tests. Use when the user says force, /force,
  force mode, just make the change, or wants a fast structural pass and
  expects broken code. Suggest TODOS.md follow-ups only when fallout is
  non-obvious or cross-cutting.
---

# Force mode

Ship the **requested change** as written. Do not spend turns making the repo green.

## Defaults (do these unless they say otherwise)

1. **Implement the ask** — Edit the files and symbols the user named. Make the structural move (rename, move, delete, rewire) even when downstream call sites will break.

2. **No type coherence** — Do **not** chase type errors across the monorepo. No `as` casts to silence mismatches, no bolted-on annotations, no “fix the factory” detours outside the named scope. If a signature change leaves errors elsewhere, leave them.

3. **No test or build hygiene** — Do **not** run tests, fix specs, or run `nx` typecheck/build targets to validate the pass. Do **not** update unrelated call sites “while we’re here.”

4. **Minimal surface** — Only what maps directly to the stated request. No new abstractions, helpers, refactors, or playbook updates unless explicitly asked.

5. **Broken is expected** — Treat a red workspace as success for this mode. The goal is to land the shape of the change, not a merge-ready diff.

## TODOS.md (when warranted)

For narrow edits with obvious fallout (a single import, a rename in one file), **skip** `TODOS.md`. Only suggest or append a note when there are **non-obvious follow-ups** the user is likely to miss — e.g. broken imports across packages, deleted RPC paths, or a migration thread that will need a coordinated fix pass.

When you do add one:

1. Read `TODOS.md` first. Avoid duplicates; extend an existing section when the work is clearly the same migration.
2. List **dependencies** that no longer resolve (missing exports, moved modules, renamed symbols, broken imports).
3. List **important structural broken behavior** — runtime paths, RPC boundaries, trust-boundary validation, cursor/finalize flows, or other behavior that will fail until follow-up work lands.
4. Keep items actionable: file or symbol, what broke, what a fix pass would need to do.
5. Use numbered lists for a single migration thread; plain bullets for one-off items.

Example:

```md
## actor-id migration (force pass)

1. **`makeActorController` call sites** — still pass removed `actor` prop in `packages/core`, `packages/system-worker`, and `examples/shopping`
2. **`SystemRepo.authorizeActor`** — still reads `ACTOR['actor']` after `IActorController` shape change
```

Do **not** use `UGLY.md` for force fallout unless the user also asks for `/ugly`. Structural debt belongs in `TODOS.md` when you record it.

## How to finish the turn

1. State what you changed (files/symbols), briefly.
2. If you added or updated `TODOS.md`, point to that section; otherwise omit.
3. Do **not** offer to fix types, tests, or downstream call sites unless the user asks to leave force mode.

## Anti-patterns for force passes

- “Making it compile” across packages.
- Fixing specs or running `nx test` / `nx ts` to prove the pass.
- Adding helpers or abstractions to paper over breakage (ask first per AGENTS.md).
- Chasing every grep hit when the user named a narrow edit.
- Treating force as a **spike** — spikes explore with stubs; force **applies** the real edit; record debt in `TODOS.md` only when fallout is non-obvious.

## Not this

- Not a **spike** — see `.agents/skills/spike/SKILL.md` for pseudocode and option exploration.
- Not a **todo-only** capture — see `.agents/skills/todo/SKILL.md` when the user only wants a note, no code change.
- Not **step-by-step** — see `.agents/skills/step-by-step/SKILL.md` when the user wants the same structural pass **plus** guided file-by-file fallout fixes.

If scope is unclear, force the **smallest** named file or symbol; mention blast radius in the reply or `TODOS.md` only when it is not obvious from the edit itself.
