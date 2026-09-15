# AGENTS.md

**Agents and LLMs may not add `ALLOWED_CAST` comments.** Only the human user may add an `ALLOWED_CAST` marker manually, or authorize one through an explicit prompt or explicit permission in chat. If a cast appears necessary and no permission has been given, stop and ask instead of adding the marker yourself.

**Please do not give me partial implementations.** Ship the full requested behavior in one pass. Do not land stubs, no-op hooks, or unrequested follow-up wiring when the intended behavior is already known.

**Do not add unrequested functionality.** If I give you a component to add with mock data, use mock data. Do not change the props or arguments of any other component or function.

## Behaviors

### Work habits

- Think before acting. Read existing files before writing code.
- On every task, read the relevant guidance under [`docs/`](./docs/). For React or site-workspace changes, always read [`docs/styleguide/component-and-file-naming.md`](./docs/styleguide/component-and-file-naming.md).
- Prefer editing over rewriting whole files unless I explicitly ask you to wipe or replace a file.
- Do not re-read files you have already read unless the file may have changed.
- Skip files over 100 KB unless explicitly required.
- Test your code before declaring it done.
- Keep solutions simple, direct, and verbose enough to make control flow obvious.
- User instructions always override this file.
- Preserve existing work in progress and unrelated changes.

### Communication

- Any question asked to the user is blocking. Do not infer an answer or continue past it until the user explicitly answers or withdraws the question.
- Be terse. No sycophantic openers or closing fluff.
- Treat me as an expert.
- Give the answer immediately. If I ask for a fix or explanation, provide the actual code or concrete explanation, not high-level advice.
- Be accurate and thorough. Value good arguments over authority.
- Suggest useful alternatives at the end; do not implement them without approval.
- Speculation and prediction are allowed, but label them.
- Preserve code comments unless they are completely irrelevant after the change. If unsure, keep them.
- When showing adjustments to code I supplied, show only the relevant surrounding lines instead of repeating the entire file.

### Long-running dev servers

When starting a long-lived process such as `next dev`, `wrangler dev`, or the root `pnpm dev`, do not use a fixed sleep as the readiness check. Watch stdout/stderr for the server's actual ready message, then proceed. Do not wait for the process to exit.

- Wrangler: wait for `Ready on http://`.
- Next.js: wait for `Ready in` or its printed local URL.
- Unknown server: inspect its output and use a real ready-looking line; do not invent a silent delay.

If the ready message never appears, report the terminal tail and stop.

## Rules

### Scope and WIP

Treat the codebase as partially authored by whoever is iterating in the IDE.

- Do what I ask and only that.
- Do not restore, rewrite, prettify, refactor, add dependencies, or fix adjacent errors unless I explicitly request that scope.
- Do not replace intentional local wiring with a shared or canonical alternative unless I ask to unify it.
- If a file looks like glue in progress, assume it is WIP. Do not stabilize it unless asked.
- If unrelated type, dependency, lint, or test failures exist, report them; do not fix them.
- Do not change component props or function arguments outside the requested change.
- If another change would be useful, mention it after completing the requested work instead of bundling it into the diff.

### Vendored subtrees are read-only

- Treat every Git subtree under `vendor/**` as read-only in this repository.
- Do not author source changes in a vendored subtree and do not use `git subtree push` from this repository.
- When vendored code must change, make the change in that vendor's source repository, commit and push it there, then pull the resulting upstream commit into this repository through the configured vendor workflow.
- Files under `vendor/**` may change here only through that pull workflow, including verbatim restoration of existing consumer-owned subtree metadata when the workflow requires it.
- Keep repository-specific integrations and adaptations outside `vendor/**`.

### Ask before abstractions

- If you think an abstraction is better, stop and provide its proposed name, purpose, and exact call sites.
- Do not make code more concise without approval. Implement it explicitly and verbosely, with annotations where they clarify the behavior.
- Do not create a local wrapper around a single call expression. Inline the call unless I explicitly approve the wrapper.
- Do not add `index.ts` barrels or re-export symbols without approval. Import from the module that defines the symbol.

### Ask before new types

Before adding a new `type` alias, `interface`, or other named type assignment, ask me first and get explicit confirmation.

- Provide the proposed name, shape, and exact use sites.
- Inline single-use prop and argument shapes at the use site.
- Do not export a type merely to share a small shape between a parent and child component.

### Casts and type fixes

- Read the relevant code before adding or preserving a cast.
- Do not add `ALLOWED_CAST` comments without explicit human permission.
- Do not use `as any as`, `as unknown as`, or another assertion chain to hide a type mismatch.
- Do not sprinkle `as const` or `as const satisfies` onto object literals unless I ask for it or TypeScript demonstrably requires it.
- Fix type errors at the real factory, model, annotation, or call-site boundary. Do not bolt fields or intersection types onto a value merely to silence the compiler.
- Do not wrap `yield*` in parentheses. Use `return yield* effect.pipe(...)` or assign the result to a binding first.

### Components and files

Follow [`docs/styleguide/component-and-file-naming.md`](./docs/styleguide/component-and-file-naming.md) when touching repo-authored React components, homepage bricks, or the site workspace.

- Use PascalCase component filenames matching the primary component, except for shadcn files and Next.js special files.
- Prefer one primary React component per file, subject to the styleguide's route-local exceptions.
- Keep single-use route logic in its owning `page.tsx` rather than creating a one-consumer sibling module.
- Use the existing brick identity, drag, grid, and group conventions documented in the styleguide. Do not invent parallel identifiers or wrapper APIs.

### Effect and TypeScript

- This is an Effect-first repository. Read [`docs/effect/README.md`](./docs/effect/README.md) and the linked section relevant to the change before editing Effect code.
- Use [`docs/tooling/typescript.md`](./docs/tooling/typescript.md) for TypeScript work.
- Prefer named `Effect.fn` programs for domain behavior. Promise-returning functions belong at framework or runtime boundaries and should remain thin.
- Use Effect `Schema` at untrusted boundaries and preserve the repository's schema naming and decoding conventions.
- Do not move validation or trust-boundary behavior between the browser, Next.js server code, packages, or Workers without asking first.

### Plan documents

Plans and specs live under [`wiki/plans/`](./wiki/plans/):

- Design specs: `wiki/plans/specs/XXX-spec-<topic>.md`.
- Implementation plans: `wiki/plans/plans/XXX-plan-<topic>.md`, reusing the source spec's number and topic.
- Choose a new number by inspecting existing filenames and using one more than the highest three-digit prefix.
- Archive a spec after converting it into a plan; archive a plan only after implementation is complete and verified.
- Update an existing plan in place when revising it.
- Use ordered lists for plan steps.
- Present plan-review findings as a numbered list.

### Documentation routing

| Topic | Guidance |
| --- | --- |
| React components, files, site workspace, bricks, and group | [`docs/styleguide/component-and-file-naming.md`](./docs/styleguide/component-and-file-naming.md) |
| Effect core, Schema, and errors | [`docs/effect/README.md`](./docs/effect/README.md) |
| TypeScript fixes and validation patterns | [`docs/tooling/typescript.md`](./docs/tooling/typescript.md) |
| Next.js client route params, `useParams`, and `ParamsSchema` | Invoke `$engineering-patterns`; read `references/patterns/nextjs/validated-client-route-params.ts` |
| Local Zerospin model resets and clean development state | Invoke `$engineering-patterns`; read `references/patterns/tooling/zerospin-dev-clean-until-production.ts` |
| React controls, shadcn, buttons, and design-system components | Invoke `$engineering-patterns`; read `references/patterns/react/prefer-design-system-components.ts` |
| Zerospin domain patterns and case studies | [Pinned Zerospin pattern index](./vendor/zerospin/llm-wiki/patterns/index.md) |
| Agent workflow skills | [`.agents/skills/`](./.agents/skills/) |

When a code change invalidates a linked doc, update that doc in the same requested pass. Do not leave stale file paths or symbol names.

<!-- patterns configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## Shared patterns

For TypeScript, Effect, RPC, Next.js, Cloudflare, runtime architecture,
testing, naming, and code-shape work—and whenever a change proposes a new
capability, guarantee, abstraction, compatibility path, or cross-owner
coordination mechanism—invoke `$patterns` before editing or reviewing code.
Start at `references/patterns/index.md`, read only the patterns relevant
to the task, and treat this repository's `AGENTS.md` and any repository-local
pattern index as higher-precedence guidance.

<!-- patterns configuration end-->

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
