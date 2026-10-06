# AGENTS.md

## Pre-release hard cutover

**Temporary: retain this policy until the maintainer explicitly removes it.** Replace superseded designs outright, including in-scope callers, tests, and docs. No compatibility aliases, dual paths, fallback decoders, legacy fields/tables, translation migrations, version shims, or compatibility-only tests without explicit approval in this chat. Existing compatibility code is not precedent.

Changed fixed schemas require empty storage. Never preserve deprecated rows through compatibility code. Stay within the requested scope.

## Working rules

- Avoid the ambiguous word “target” when a specific domain term is available. Name the referenced entity and qualify its identity fields. For example, use “async contract name/version, such as `asyncProcessPayment@1.0.0`, within the retained owner/actor context” instead of “target name/version”; that phrase could otherwise mean an actor, service, or delivery destination.

- Please remember that we are using transaction boundaries whenever possible, synchronous ones even.

- Do not soften well-supported conclusions out of humility or a desire to agree. Make sound architectural arguments firmly, explain concrete failure modes, and treat correctness requirements as requirements—not optional caveats. Reconsider when evidence changes, not merely when challenged. Express genuine uncertainty precisely.

- Take initiative to make this repo more obvious. In the area you are working, remove redundancy and bloat: duplicates, unused paths, and names that hide what the thing is. Delete that cruft. Do not rename it and keep it, and do not explain it as a second concept.

- When weighing a smaller change against a clearer data model or architecture, **always prioritize the clearer data model or architecture**.

- Use `$patterns` and the [local index](./wiki/patterns/index.md); local rules take precedence. Follow [scoped execution](../wiki/skills/use-morgs32-wiki-patterns/references/patterns/tooling/scoped-execution.md), reusing relevant context.
- Use `$implement` for approved work and unfinished verification. Be concise and explicit about uncertainty; distinguish current code from intended architecture.
- Resolve unsettled design choices through [spec](../wiki/skills/spec/SKILL.md); do not re-approve settled decisions. Write plans for agreed work, keep domain terms in `wiki/glossary.md`, and record only qualifying decisions in `wiki/adrs/`. Do not create new spec files.
- Never add `ALLOWED_CAST` without explicit user authorization; ask if a necessary cast requires it.
- Keep active plans in `wiki/plans/`. Follow `$implement` for completion and archival, [spec](../wiki/skills/spec/SKILL.md#document-conventions) for plan conventions, and [handoff](../wiki/skills/handoff/SKILL.md#destination-and-lifecycle) for handoffs. Keep governing ADRs in `wiki/adrs/`; mark a replaced ADR **Superseded** and link its successor. Move it to `wiki/archive/adrs/` only when it no longer governs anything and archival is wanted.

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
