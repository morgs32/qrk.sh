# AGENTS.md

## Working rules

- Use `$implement` for approved work and unfinished verification. Use mock data when requested; add no unrequested functionality.
- Preserve intentional local wiring. Do not refactor, prettify, add dependencies, stabilize unfinished glue, or fix adjacent failures outside scope.
- Prefer targeted edits, reuse current context, and skip files over 100 KB unless required. Keep control flow simple and explicit; do not change unrelated component props or function arguments.
- Be terse, concrete, and accurate. Treat the user as an expert, label uncertainty, and show only relevant code excerpts. Every question is blocking until explicitly answered or withdrawn.
- Keep affected documentation current. User instructions override this file.

## Approval and code conventions

- Modules own their module-specific behavior. Before adding module-specific logic or dependencies to application code or shared module contracts, warn the user, identify the proposed coupling, and explain why the module cannot own it.
- Ask before introducing abstractions, single-call wrappers, barrels, re-exports, or concision refactors; provide the proposed name, purpose, and exact call sites. Import symbols from their defining modules.
- Ask before adding named types or interfaces; provide the name, shape, and use sites. Inline single-use shapes and follow [named-type guidance](./wiki/patterns/typescript/named-types.md); do not export a type just to share a small parent/child shape.
- Never add `ALLOWED_CAST` without explicit human authorization. Read the relevant code before adding or retaining casts; ask if a necessary cast requires a marker. No assertion chains that hide mismatches; use `as const` only when requested or demonstrably required.
- Fix types at their actual model, factory, annotation, or call-site boundary; do not bolt on fields or intersection types to silence errors.
- Every function that accepts `props` must destructure it as the first statement (`const { foo, bar } = props;`) before doing anything else. Keep `props` as the parameter rather than destructuring in the parameter list, and use the destructured names throughout the body.
- Use PascalCase component filenames matching the primary component, except shadcn and framework special files. Prefer one primary component per file; keep single-use route logic in its owning `page.tsx`. Preserve existing brick identity, drag, grid, and group conventions.
- Prefer named `Effect.fn` programs for domain behavior and thin Promise boundaries. Use Effect Schema at untrusted boundaries, preserving local naming and decoding conventions. Ask before moving validation or trust boundaries between browser, server, packages, or Workers. Do not parenthesize `yield*`.

<!-- patterns configuration start-->

## Patterns

Use `$use-morgs32-wiki-patterns` for TypeScript, Effect, RPC, React/Next.js, Cloudflare, runtime, testing, naming, and code-shape work, including proposed capabilities or coordination mechanisms. Read only relevant references. This file and the [local index](./wiki/patterns/index.md) take precedence; consult the [upstream Zerospin index](../zerospin/wiki/patterns/index.md) when the sibling checkout is available for domain guidance.

<!-- patterns configuration end-->

## Zerospin packages and vendors

Zerospin source and releases belong to the sibling `../zerospin` checkout.
QRK consumes exact package versions from the local registry; never edit installed
Zerospin files or rebuild them in this consumer. Make upstream fixes in Zerospin,
release a new package version, and update QRK's dependencies and lockfile.
Treat any `vendor/**` paths as read-only and use `$update-vendor` for configured
vendor operations. Keep consumer integrations outside vendors.

## Verification

- For `@qrk.sh/library` / `apps/library`, never write, run, restore, or maintain tests; use typechecking, lint, and manual checks only.

## Plans

Use `$spec` to resolve unsettled design decisions and write implementation plans at `wiki/plans/XXX-plan-<topic>.md`. Do not create new spec files; existing specs remain under `wiki/specs/` and `wiki/archive/specs/`. Record a settled decision in `wiki/adrs/` only when it is hard to reverse, surprising without context, and the result of a real trade-off. If no glossary exists, ask before creating one. Revise plans in place and use ordered steps and numbered review findings.

Follow `$implement` for plan completion and archival. Mark a replaced ADR **Superseded** and link its successor; move it to `wiki/archive/adrs/` only when it no longer governs anything and archival is wanted. Completing a plan does not retire its ADRs.
Plans created by agents must include gratuitous annotated examples and annotated code snippets.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## Nx

- Use `nx-workspace` before workspace exploration, `nx-run-tasks` for task execution, and `nx-generate` before scaffolding discovery or generation. Skills live under [`.agents/skills/`](./.agents/skills/).
- Run workspace targets through `pnpm nx`; use available Nx MCP tools where relevant. Check `nx_docs` or `--help` for unfamiliar flags/configuration; consult `node_modules/@nx/<plugin>/PLUGIN.md` when present for plugin guidance.

<!-- nx configuration end-->
