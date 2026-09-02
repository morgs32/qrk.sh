# Stale Code Cleanup Audit Handoff

Captured 2026-08-31. The receiving thread must treat only the
`examples/orpc-counter` deletion as settled. Use the remaining audit findings
to obtain explicit cleanup scope from the user; do not present them as accepted
work or implement them without that authorization.

## Inputs merged

- The current conversation: the user's request for a thorough repository-wide
  stale-code review, including `packages/*`, and the resulting read-only audit.
- No numbered spec, plan, or earlier handoff was used as decision-bearing
  context.

## Objective and context

Identify obsolete examples, whole packages, source files, exports,
dependencies, configuration, documentation, and local debris without changing
the concurrently edited worktree. Distinguish proven reachability facts from
cleanup proposals that the user has not accepted.

## Consolidated decisions

1. **Settled — review scope.** The user requested a thorough stale-code review
   across the codebase and specifically asked whether any whole `packages/*`
   projects could be removed. The request authorized review, not implementation.

2. **Settled — oRPC example deletion.** The user explicitly said the
   [`examples/orpc-counter`](../../../examples/orpc-counter/package.json)
   example can go. The audit found seven tracked files totaling 464 lines, no
   consumer or documentation references, and only its lockfile importer and
   oRPC dependencies outside the directory. This decision has not been
   superseded.

3. **Settled — no broader acceptance.** The user did not accept, reject, or
   modify any of the assistant's other cleanup recommendations before asking
   for this handoff. None of those recommendations is authorized work.

## Unaccepted audit findings

These are source-grounded findings from the requested review, not user
decisions.

1. **Whole-package candidates.** The assistant recommended deleting private
   [`@zerospin/dispatch-worker`](../../../packages/dispatch-worker/package.json):
   it has nine tracked files totaling 254 lines, no incoming Nx graph edge, no
   consumer import, and retains only hosted Workers-for-Platforms/API-key
   naming behavior outside the current direct-Gateway architecture. The
   assistant separately recommended deleting private
   [`@zerospin/sync`](../../../packages/sync/package.json) unless its research
   value remains intentional: it is a 27-file, 1,443-line Cloudflare Agents
   spike with no incoming graph edge and an empty public `export {}` entrypoint.
   Neither deletion was accepted.

2. **Current transport proof.** The assistant found
   [`examples/capnweb-counter`](../../../examples/capnweb-counter/package.json)
   equally isolated at the workspace-graph level: seven tracked files totaling
   253 lines and no consumer. It is recent and demonstrates the selected
   transport, so the audit did not classify it as stale without a user decision
   about whether that proof is intentionally maintained.

3. **Confirmed unreferenced code.** The audit found no caller for
   [`executeInRepo`](../../../packages/system-worker/src/workerd-utils/executeInRepo.ts),
   no reference beyond the definitions of `ServiceFinalizationReceiptSchema`,
   `sharedWorkerMetadataDrizzleSchema`, `SystemEnvironmentIdSchema`,
   `useAggregateSessionOrThrow`, or `useServiceSessionOrThrow`, and recommended
   deleting those files, aliases, or exports. The underlying
   `sharedWorkerMetadataTable` and `ISystemEnvironmentId` remain live. No source
   deletion was accepted.

4. **Direct dependency candidates.** Knip plus direct source/config searches
   found no actual package use for:

   - `@zerospin/cli`: `@inkjs/ui`
   - `@zerospin/dev-worker`: `@remix-run/route-pattern`, `@zerospin/error`,
     `@zerospin/logger`, `@zerospin/schema`, and `system`
   - `@zerospin/frontend`: `drizzle-orm`
   - `@zerospin/production-worker`: `@zerospin/error`, `@zerospin/logger`, and
     `@zerospin/schema`
   - `@zerospin/react`: `@remix-run/route-pattern`, `@zerospin/sdk`, and
     `drizzle-orm`
   - `@zerospin/shared-worker`: `es-toolkit` and `zustand`
   - `@zerospin/studio`: `@zerospin/error`

   The audit did not recommend mechanically deleting every dependency reported
   by Knip. Shopping's `wa-sqlite` and several build/test dependencies are
   reached through scripts, aliases, Wrangler configuration, or test helpers.

5. **Stale configuration and documentation.** The audit found that
   [`knip.jsonc`](../../../knip.jsonc) still configures absent
   `examples/parking`, marks Vite/React Router Shopping as Next, and lacks entry
   edges for string-loaded migrations and test/tool entrypoints. Root
   [`README.md`](../../../README.md) still includes dispatch-worker, recommends
   nonexistent `nx run parking:ts`, omits current packages, and describes a
   package type-export convention that current manifests do not follow.
   [`AGENTS.md`](../../../AGENTS.md) contains conflicting direct-`nx` versus
   package-manager-prefixed Nx instructions, hosted-dispatch terminology, and
   links to removed architecture pages. `wiki/index.md` still links to the
   deleted `wiki/log.md`. None of these edits was accepted.

6. **Historical documentation and fixtures.** The 528-line
   [`packages/error/README.md`](../../../packages/error/README.md) cites deleted
   `packages/client` and `packages/zerospin` paths plus old Next.js examples.
   The logger's `finalizeAccountCommands` Node/workerd fixtures total 978 lines
   and use obsolete AccountRepo/ActorRepo terminology, although their telemetry
   coverage remains valuable. The audit recommended deleting or rewriting the
   error README and updating rather than blindly deleting the logger coverage.

7. **Local-only debris.** The review counted 318 empty directories, 56 ignored
   `wrangler.zerospin-dev.*.local.json` files, and three `.DS_Store` files.
   These are not tracked source changes. Removing generated runtime files must
   wait until any active development processes have stopped.

## Explicitly unresolved

None. The user did not explicitly leave a design question open. Every audit
recommendation other than the settled oRPC example deletion remains unaccepted,
not an unresolved decision.

## Decided next action

No implementation sequence, commit, or additional deletion batch was decided.
The receiving thread may implement the settled `examples/orpc-counter` deletion
only after the user asks it to proceed; it must obtain explicit approval for
all other cleanup candidates.

## Thread-established work state and constraints

- This audit made no repository edits. The worktree contained substantial,
  concurrently changing Drizzle/configuration and architecture-document WIP;
  preserve it exactly and do not fold cleanup into it accidentally.
- The Nx graph showed no incoming edges for `@zerospin/dispatch-worker` or
  `@zerospin/sync`; every other `packages/*` project had incoming workspace
  edges or was a deliberate executable/tool boundary.
- `NX_DAEMON=false nx sync:check` reported the workspace up to date.
- Root `./node_modules/.bin/knip --reporter compact` reported six unused files
  and one unused export. After tracing non-import entry edges, the real findings
  were `executeInRepo.ts` and `ServiceFinalizationReceiptSchema`; the migration
  manifests, Shopping Cloudflare stub, and VS Code extension entrypoint were
  live false positives.
- The dependency-mode Knip run exposed the direct dependency candidates above
  plus intentional or configuration-driven findings requiring individual
  judgment. Knip exited `1` while findings remained, as expected.
- `git diff --check` was clean at the end of the review. No package tests were
  run because this was a read-only reachability and cleanup audit.
