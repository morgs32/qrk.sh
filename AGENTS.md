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

### Ask before abstractions

I am afraid of abstractions. Before adding any new helper, function, wrapper, utility, service, loop over data, barrel, re-export, or other abstraction, ask me first and get explicit confirmation.

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
- Use the existing brick identity, drag, grid, and catalog conventions documented in the styleguide. Do not invent parallel identifiers or wrapper APIs.

### Effect and TypeScript

- This is an Effect-first repository. Read [`docs/effect/README.md`](./docs/effect/README.md) and the linked section relevant to the change before editing Effect code.
- Use [`docs/tooling/typescript.md`](./docs/tooling/typescript.md) for TypeScript work.
- Prefer named `Effect.fn` programs for domain behavior. Promise-returning functions belong at framework or runtime boundaries and should remain thin.
- Use Effect `Schema` at untrusted boundaries and preserve the repository's schema naming and decoding conventions.
- Do not move validation or trust-boundary behavior between the browser, Next.js server code, packages, or Workers without asking first.

### Plan documents

Plans and specs live under [`.plans/`](./.plans/):

- Design specs: `.plans/specs/XXX-spec-<topic>.md`.
- Implementation plans: `.plans/plans/XXX-plan-<topic>.md`, reusing the source spec's number and topic.
- Choose a new number by inspecting existing filenames and using one more than the highest three-digit prefix.
- Archive a spec after converting it into a plan; archive a plan only after implementation is complete and verified.
- Update an existing plan in place when revising it.
- Use ordered lists for plan steps.
- Present plan-review findings as a numbered list.

### Documentation routing

| Topic | Guidance |
| --- | --- |
| React components, files, site workspace, bricks, and catalog | [`docs/styleguide/component-and-file-naming.md`](./docs/styleguide/component-and-file-naming.md) |
| Effect core, Schema, and errors | [`docs/effect/README.md`](./docs/effect/README.md) |
| TypeScript fixes and validation patterns | [`docs/tooling/typescript.md`](./docs/tooling/typescript.md) |
| Next.js client route params, `useParams`, and `ParamsSchema` | [`validated-client-route-params.ts`](./vendor/morgs32/llm-wiki/patterns/nextjs/validated-client-route-params.ts) |
| Local Zerospin model resets and clean development state | [`zerospin-dev-clean-until-production.ts`](./vendor/morgs32/llm-wiki/patterns/tooling/zerospin-dev-clean-until-production.ts) |
| Reusable code patterns | [`vendor/morgs32/llm-wiki/patterns/`](./vendor/morgs32/llm-wiki/patterns/index.md) |
| React controls, shadcn, buttons, and design-system components | [`prefer-design-system-components.ts`](./vendor/morgs32/llm-wiki/patterns/react/prefer-design-system-components.ts) |
| Agent workflow skills | [`.agents/skills/`](./.agents/skills/) |

When a code change invalidates a linked doc, update that doc in the same requested pass. Do not leave stale file paths or symbol names.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating or exploring the workspace, invoke the `nx-workspace` skill first.
- Run build, test, lint, serve, typecheck, and other configured tasks through Nx so dependency targets and task pipelines run too.
- Prefix Nx commands with this workspace's package manager, for example `pnpm nx run <project>:<target>`.
- Use direct package-manager commands only when the user explicitly asks for them or no Nx target exists.
- For Nx plugin details, check `node_modules/@nx/<plugin>/PLUGIN.md` when it exists.
- Never guess unfamiliar Nx flags; check the relevant docs or `--help` first.

## Scaffolding and generators

- Invoke the `nx-generate` skill before scaffolding apps, libraries, or project structure.

<!-- nx configuration end-->
