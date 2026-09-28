# AGENTS.md

## Working rules

- Complete the requested behavior in one pass: no stubs, no-op hooks, or deferred wiring. Use mock data when requested; add no unrequested functionality.
- Preserve unrelated WIP, intentional local wiring, and relevant comments. Do not refactor, prettify, add dependencies, stabilize unfinished glue, or fix adjacent failures outside scope. Report unrelated failures and suggest alternatives without implementing them.
- Read existing code before editing; prefer targeted edits, reuse current context, and skip files over 100 KB unless required. Keep control flow simple and explicit; do not change unrelated component props or function arguments.
- Be terse, concrete, and accurate. Treat the user as an expert, label uncertainty, and show only relevant code excerpts. Every question is blocking until explicitly answered or withdrawn.
- Keep affected documentation current. User instructions override this file.

## Approval and code conventions

- Ask before introducing abstractions, single-call wrappers, barrels, re-exports, or concision refactors; provide the proposed name, purpose, and exact call sites. Import symbols from their defining modules.
- Ask before adding named types or interfaces; provide the name, shape, and use sites. Inline single-use shapes and follow [named-type guidance](./wiki/patterns/typescript/named-types.md); do not export a type just to share a small parent/child shape.
- Never add `ALLOWED_CAST` without explicit human authorization. Read the relevant code before adding or retaining casts; ask if a necessary cast requires a marker. No assertion chains that hide mismatches; use `as const` only when requested or demonstrably required.
- Fix types at their actual model, factory, annotation, or call-site boundary; do not bolt on fields or intersection types to silence errors.
- Use PascalCase component filenames matching the primary component, except shadcn and framework special files. Prefer one primary component per file; keep single-use route logic in its owning `page.tsx`. Preserve existing brick identity, drag, grid, and group conventions.
- Prefer named `Effect.fn` programs for domain behavior and thin Promise boundaries. Use Effect Schema at untrusted boundaries, preserving local naming and decoding conventions. Ask before moving validation or trust boundaries between browser, server, packages, or Workers. Do not parenthesize `yield*`.

<!-- patterns configuration start-->

## Patterns

Use `$use-morgs32-wiki-patterns` for TypeScript, Effect, RPC, React/Next.js, Cloudflare, runtime, testing, naming, and code-shape work, including proposed capabilities or coordination mechanisms. Read only relevant references. This file and the [local index](./wiki/patterns/index.md) take precedence; consult the [Zerospin index](./vendor/zerospin/wiki/patterns/index.md) for domain guidance.

<!-- patterns configuration end-->

## Vendors

Direct source edits are allowed in `vendor/zerospin`, but they must eventually be synced to the upstream Zerospin repository (`../zerospin`). This exception takes precedence over `$update-vendor`'s read-only rule for that vendor. Treat all other `vendor/**` paths as read-only: make their source changes upstream, commit and push there, then pull through `$update-vendor`; never author direct edits or subtree-push for those vendors here. Use the prefix, origin, and branch in [README.md](./README.md) for vendor syncs. The pull workflow may restore existing consumer metadata verbatim. Keep consumer integrations outside vendors.

## Verification

- Verify requested changes before declaring completion. For `@qrk.sh/library` / `apps/library`, never write, run, restore, or maintain tests; use typechecking, lint, and manual checks only.
- For long-running servers, wait for actual readiness, never a fixed sleep or process exit: Wrangler `Ready on http://`, Next.js `Ready in` or its local URL. Inspect other servers' output for their readiness signal; if absent, report the terminal tail and stop.

## Plans

Keep specs at `wiki/plans/specs/XXX-spec-<topic>.md` and implementation plans at `wiki/plans/plans/XXX-plan-<topic>.md`. Use one above the highest existing three-digit prefix for new specs; reuse the spec number/topic for its plan. Revise in place, use ordered steps and numbered review findings, archive specs after conversion, and archive plans only after implementation and verification.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## Nx

- Use `nx-workspace` before workspace exploration, `nx-run-tasks` for task execution, and `nx-generate` before scaffolding discovery or generation. Skills live under [`.agents/skills/`](./.agents/skills/).
- Run workspace targets through `pnpm nx`; use available Nx MCP tools where relevant. Check `nx_docs` or `--help` for unfamiliar flags/configuration; consult `node_modules/@nx/<plugin>/PLUGIN.md` when present for plugin guidance.

<!-- nx configuration end-->
