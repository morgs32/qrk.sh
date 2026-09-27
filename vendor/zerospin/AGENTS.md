# AGENTS.md

## Pre-release hard cutover

**Temporary: retain this policy until the maintainer explicitly removes it.** Replace superseded designs outright, including in-scope callers, tests, and docs. No compatibility aliases, dual paths, fallback decoders, legacy fields/tables, translation migrations, version shims, or compatibility-only tests without explicit approval in this chat. Existing compatibility code is not precedent.

Changed fixed schemas require empty storage. Never preserve deprecated rows through compatibility code. Stay within the requested scope.

## Working rules

- Take initiative to make this repo more obvious. In the area you are working, remove redundancy and bloat: duplicates, unused paths, and names that hide what the thing is. Delete that cruft. Do not rename it and keep it, and do not explain it as a second concept.

- Use `$patterns` and the [local index](./wiki/patterns/index.md); local rules take precedence. Follow [scoped execution](../wip/skills/patterns/references/patterns/tooling/scoped-execution.md), reusing relevant context.
- Finish the requested behavior, preserve unrelated WIP and relevant comments, and keep affected docs current. Be concise and explicit about uncertainty; distinguish current code from intended architecture.
- Resolve unsettled design choices through [spec](../wip/skills/spec/SKILL.md); do not re-approve settled decisions or require specs for ordinary fixes.
- Never add `ALLOWED_CAST` without explicit user authorization; ask if a necessary cast requires it.
- Keep development documents in `wiki/dev/`, following [spec](../wip/skills/spec/SKILL.md#document-conventions) and [handoff](../wip/skills/handoff/SKILL.md#destination-and-lifecycle) conventions.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

<!-- graft:start -->

## Graft (optional)

Use `graft ask "<question>" --source` to locate context, `graft skeleton <file>` for signatures, or `graft callers <symbol>` for indexed edges. Verify current source; ranked results are not exhaustive. Use `rg` for exhaustive searches, reuse findings, and refresh the graph only when needed.

<!-- graft:end -->
