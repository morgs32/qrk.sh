# AGENTS.md

## Daily choices

- Before the first repository change each day, ask the user whether to work directly on `main` or use branches and PRs.
- Before the day's first task that requires manual verification, ask whether the user or the agent should perform it.
- Ask both together when both apply. As soon as the user gives or changes either choice, update the dated record below in this file. Keep the current day's answers and reuse them across chats. Ask only for choices the user has yet to give that day.
- For 2026-11-11, work directly on `main`. The user performs manual verification.

<!-- intent-skills:start -->

## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:

- Run `pnpm exec intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm exec intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Working rules

- Before substantial design recommendations, reviews, or edits, run the installed Intent discovery and load matching local skills, including for read-only rubber-duck discussions. Do not wait until editing to consult package guidance; the missing-dependency policy above still applies.
- Use `$implement` for approved work and unfinished verification. Use mock data when requested; add no unrequested functionality.
- Preserve intentional local wiring. Do not refactor, prettify, add dependencies, stabilize unfinished glue, or fix adjacent failures outside scope.
- Prefer targeted edits, reuse current context, and skip files over 100 KB unless required. Keep control flow simple and explicit; do not change unrelated component props or function arguments.
- Be terse, concrete, and accurate. Treat the user as an expert, label uncertainty, and show only relevant code excerpts. Every question is blocking until explicitly answered or withdrawn.
- Keep affected documentation current. User instructions override this file.
- When the user says "sibs" or "sibling repos", scope the work to repositories using Zerospin. Other adjacent repositories are outside that scope unless explicitly named.

## PR reviews

Review changed code and the declarations that define its guarantees:

- Check null/undefined guards against the actual model and inferred query types; relation filters can make a required relation nullable.
- Keep required invariants required in public contracts and factories instead of repeating optional-field checks at each caller.
- Flag duplicated module-owned rendering or validation, including placeholder handling, and fallback/default branches that hide invalid trusted data.
- Distinguish normal route misses from broken session invariants, and route unexpected failures to their owning error boundary.

## Approval and code conventions

- NEVER iterate a record with `for (const [key, value] of Object.entries(record))`. Use `mapValues` from `es-toolkit` with `(value, key)` callbacks for record traversal and validation.

- All authored TypeScript type aliases and interfaces use `I` followed by PascalCase, including exported, internal, local, props, helper, and inference types (for example, `IPaymentsSession`, `IProps`, and `IInferPayload`). Generic type parameters, imported third-party names, runtime classes and schema constants, generated/vendor code, and required framework augmentation names retain their existing conventions.
- Modules own their module-specific behavior. Before adding module-specific logic or dependencies to application code or shared module contracts, warn the user, identify the proposed coupling, and explain why the module cannot own it.
- Ask before introducing abstractions, single-call wrappers, barrels, re-exports, or concision refactors; provide the proposed name, purpose, and exact call sites. Import symbols from their defining modules.
- Treat API simplicity as a correctness requirement. Routine domain code must stay concrete, readable, and inferred. If a change demands factories, wrappers, elaborate generic signatures, or model/version injection merely to accommodate an API or abstraction, stop: identify and explain the underlying API or ownership problem, and address it at its source within the approved scope. If Zerospin's API is forcing complexity, PROPOSE a fix before implementing it. Never conceal that problem with consumer-side machinery or push its complexity onto callers. Feature approval does not authorize this complexity; warn the user before introducing it.
- Ask before adding named types or interfaces; provide the name, shape, and use sites. Inline single-use shapes and follow [named-type guidance](./wiki/patterns/typescript/named-types.md); do not export a type just to share a small parent/child shape.
- Never add `ALLOWED_CAST` without explicit human authorization. Read the relevant code before adding or retaining casts; ask if a necessary cast requires a marker. No assertion chains that hide mismatches; use `as const` only when requested or demonstrably required.
- Fix types at their actual model, factory, annotation, or call-site boundary; do not bolt on fields or intersection types to silence errors.
- Every function that accepts `props` must destructure it as the first statement (`const { foo, bar } = props;`) before doing anything else. Keep `props` as the parameter rather than destructuring in the parameter list, and use the destructured names throughout the body.
- Use PascalCase component filenames matching the primary component, except shadcn and framework special files. Prefer one primary component per file; keep single-use route logic in its owning `page.tsx`. Preserve existing brick identity, drag, grid, and group conventions.
- In the wall editor, **selected** means a Brick's Edit Brick panel is open in the workspace sidebar. **Active** means DOM focus, including keyboard focus. An Article can be editable in Studio without being selected.
- Prefer named `Effect.fn` programs for domain behavior and thin Promise boundaries. Use Effect Schema at untrusted boundaries, preserving local naming and decoding conventions. Ask before moving validation or trust boundaries between browser, server, packages, or Workers. Do not parenthesize `yield*`.

<!-- patterns configuration start-->

## Patterns

Use `$use-morgs32-wiki-patterns` for TypeScript, Effect, RPC, React/Next.js, Cloudflare, runtime, testing, naming, and code-shape work, including proposed capabilities or coordination mechanisms. Read only relevant references. This file and the [local index](./wiki/patterns/index.md) take precedence; consult the [upstream Zerospin index](../zerospin/wiki/patterns/index.md) when the sibling checkout is available for domain guidance.

<!-- patterns configuration end-->

## Zerospin packages and vendors

This project is in development. Do not backport fixes or maintain older-release
branches. Fix the current development line and move in-scope consumers forward.
This does not authorize deleting or resetting persisted data.

Zerospin source and releases belong to the sibling `../zerospin` checkout.
QRK consumes exact package versions from the local registry; never edit installed
Zerospin files or rebuild them in this consumer. Make upstream fixes in Zerospin,
release a new package version, and update QRK's dependencies and lockfile.
Treat any `vendor/**` paths as read-only and use `$update-vendor` for configured
vendor operations. Keep consumer integrations outside vendors.

# Testing and checks

Test authored backend behavior with `makeSystemHarness` from
`@zerospin/sdk/testing` and scoped `it.effect` tests from `@effect/vitest`.
Use the actual System and registered releases, create model rows through commands,
and call `harness.flush()` to execute queued external and command operations.
Substitute provider services with Effect Layers; never call live providers in tests.
The current harness accepts System-origin commands only; it does not test actor
authentication or actor-origin commands. Keep representative success and rejection
paths concise. These tests verify
authored behavior, not Durable Object delivery, browser synchronization, or production.
Run the backend `test` script (through Nx when configured).

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

## Development sign-in URLs

The user authorizes agents to freely operate the local QRK development flow
entered through these `__dev` sign-in URLs, including normal App URLs after the
redirect. Create, edit, delete, and reset local QRK verification data as needed;
switch existing development users, simulate offline conditions, and start or
restart the configured QRK services. Do not ask for separate confirmation for
these local development actions or for creating a verification Site, Page, or
Brick. This authorization is limited to local QRK development: preserve keys,
Clerk accounts, unrelated work, and other projects. Production changes and the
user-only handwritten registry restriction remain separately governed.

Use only this repository's existing, configured Portless `.localhost` URLs and
`__dev` sign-in routes for local development and permitted browser verification.
Reuse the documented URLs and running services; start or restart those same
configured services when needed. Do not substitute raw `localhost:PORT` or
`127.0.0.1:PORT` URLs, create extra aliases or subdomains for verification, or
start parallel app servers merely to obtain a fresh browser origin. Keep any
authorized storage isolation behind the existing URLs and follow this
repository's storage rules. Use a different origin only when the user explicitly
requests it.

Open the existing sign-in links in the browser used for testing:

- [Web sign-in and normal App handoff](https://qrk.localhost/__dev/log-me-in/morgan.intrator%40gmail.com?returnTo=/replace)
- [App shortcut](https://app.qrk.localhost/__dev/log-me-in/morgan.intrator%40gmail.com)

The route is `/__dev/log-me-in/<email>?returnTo=<path>`. Replace the URL-encoded email
with an existing user in the configured Clerk development application. Unknown accounts
are never created. Web remains the authentication owner. The App development shortcut
forwards to Web; `/replace` performs the existing handoff to the signed-in username on
App. `returnTo` paths belong to the Web origin.

The development page loads Clerk directly, without waiting for domain sessions. A
same-origin POST looks up the user and issues a 60-second sign-in ticket when needed.
Matching browser identities reuse their session; switching ends the active session before
activating the requested user. Tickets stay out of URLs and responses are uncached. `curl`
does not sign in the browser.

Only relative, same-origin return destinations are accepted; missing or unsafe values fall
back to `/`. Both Clerk keys must be development keys. Web login requests return 404 in
production and do not load the development login implementation. The App shortcut is
registered only by the development server. Do not add authentication to unauthenticated
scaffolds or change domain permissions for these shortcuts.

Run the focused HTTP tests with `node --experimental-strip-types --test apps/web/dev/handleDevelopmentSignIn.spec.mjs`. These tests mock Clerk requests and create no accounts.

<!-- zerospin:agent-rules:start -->

## Strict rule: user-only handwritten registry changes

Agents **MUST NOT change an existing `canonical` selection or remove/omit any
previously registered Aggregate, Service, or owner release from the System
registry/SystemSpec. The user must personally handwrite those changes.**

This prohibition includes temporary canonical changes, whole-registry rewrites,
scripts, generated configuration, automation, and Studio/UI actions. General
implementation, upgrade, repair, cleanup, or migration requests do not authorize
these edits. Successful validation, a newer release, or apparent lack of
remaining dependencies does not authorize them either.

Agents may add candidate releases while preserving **all existing canonical
selections and registrations**, investigate promotion/retirement eligibility,
and present evidence and exact recommendations. Stop before editing a canonical
selection or omitting a registration; leave that handwritten change to the user.

<!-- zerospin:agent-rules:end -->
