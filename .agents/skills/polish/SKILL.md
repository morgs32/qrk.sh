---
name: polish
description: 'Run a full Zerospin repo polish pass: fix formatting failures, lint errors and warnings, TypeScript/typecheck failures, and unit or workerd test failures across the whole repo. Use when the user says polish, repo polish, fix all lint warnings, make lint/typecheck/tests pass, run a full quality pass, or asks for whole-repo verification and fixes.'
---

# Polish

## Goal

Make the repo pass the current root quality gates with direct, microscopic fixes. Do not refactor, add abstractions, add named types, add exports, create barrels, or rewrite WIP glue unless the user explicitly approved that scope.

If an abstraction, named type, export, runtime-boundary move, or broad cleanup appears necessary, stop and ask with the proposed name, purpose, exact use sites, and tradeoffs.

## Orient First

1. Read `AGENTS.md`, root `package.json`, and `nx.json`.
2. Use the `AGENTS.md` docs lookup for any domain touched by a failure. Read relevant architecture docs before changing repo roles, finalize paths, batch workflows, trust boundaries, or API/worker behavior.
3. Run `git status --short` and preserve unrelated user changes.
4. Use `pnpm`; this repo declares `packageManager: pnpm@11.1.1`.
5. Do not hide command failures inside shell loops or bundled command chains. Run gates intentionally so each failure is readable.

## Baseline Gates

Run the root gates one at a time and keep the failing output visible:

```bash
pnpm format:check
pnpm lint
pnpm ts
pnpm types
pnpm test
pnpm test:workerd
```

`pnpm ts` is the broad TypeScript gate. `pnpm types` is narrower but still part of this repo's root contract, so include it in a full polish pass.

If an Nx task or target shape is unclear, use the `nx-workspace` skill to inspect resolved project configuration. If the issue is task execution, use the `nx-run-tasks` skill.

## Fix Order

1. Formatting: if `pnpm format:check` fails, run `pnpm format`, inspect the diff, and keep only formatting changes that belong to the current polish pass.
2. Lint: fix every lint error and warning surfaced by `pnpm lint`. Prefer the smallest source change that satisfies the rule. Do not silence rules unless the rule is wrong for this exact line and the comment explains why.
3. TypeScript: fix `pnpm ts` and `pnpm types` failures at their real source. Do not use bolt-on assertions, new type aliases, interfaces, `as const`, or exported wrappers without user approval.
4. Tests: fix `pnpm test` and `pnpm test:workerd` failures by preserving intended behavior. Do not skip, delete, or weaken tests unless the user explicitly requested that.
5. Docs: if a fix moves, renames, inlines, or deletes code referenced by repo docs, update the relevant docs in the same pass.

## Iteration Rules

After each fix, rerun the narrowest failing command or project target that proves the change. After all known failures are fixed, rerun the full baseline gates in the same order.

When a failure points into WIP or unrelated user edits, read the file carefully and work with the existing direction. If the required change would rewrite the user's WIP instead of fixing the reported failure directly, stop and ask.

Do not end with running tasks still active. If a final gate cannot pass, report the exact command, the remaining failure, and why it was not fixed.

## Final Report

Report:

1. The files changed.
2. The root cause categories fixed: format, lint, TypeScript, unit tests, workerd tests.
3. The final gate results, including exact commands.
4. Any remaining blocked gate with the concrete error.
