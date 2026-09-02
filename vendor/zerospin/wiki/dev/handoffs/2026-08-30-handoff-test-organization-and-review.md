# Test Organization and Review Handoff

Captured 2026-08-30. The receiving thread should implement the settled plan
below without reopening its organization, pilot, or publication decisions.

## Inputs merged

- The current conversation: the E Pluribus Machina convention review, the
  user's three explicit option selections, the accepted implementation plan,
  and the later instruction to implement that plan.
- No numbered spec, plan, or earlier handoff was used. The accepted plan exists
  in the conversation rather than as a repository document.

## Objective and context

Codify one complete test-organization convention, add test review and
restructuring to the shared `make-obvious` workflow, audit Zerospin's 220
test/typecheck files, and prove the convention by splitting Core's 694-line
`makeSystem.node.spec.ts`. This is structural test cleanup only: production
behavior, public APIs, test semantics, and runtime ownership must not change.

## Consolidated decisions

1. **Settled — rule ownership.** The user selected **shared plus local**.
   Universal organization and annotation rules belong in canonical
   `morgs32/llm-wiki` shared testing patterns; Zerospin's runtime filename lanes
   remain in its repository-local testing profile. The shared `make-obvious`
   skill gains the orchestration workflow rather than duplicating either rule
   source. A dedicated test skill and a Zerospin-only workflow were rejected.

2. **Settled — focused versus behavioral placement.** A focused test with one
   source owner stays colocated and mirrors that source basename before the
   configured suffix. A behavioral, lifecycle, concurrency, or cross-module
   contract uses one kebab-case feature file in a local `tests/`, integration,
   or e2e area. Complete integrations must not be colocated beside one arbitrary
   participant or mirror the entire source tree beneath `test/`.

3. **Settled — runtime lanes.** Preserve distinct discovery lanes:
   `*.node.spec.ts`, `*.workerd.spec.ts`, `*.react.spec.tsx`,
   `*.playwright.spec.ts[x]`, and `*.typecheck.ts`. Vitest configurations must
   not combine incompatible Node, workerd, browser, or Playwright lanes.

4. **Settled — feature boundaries and annotations.** Each behavioral file owns
   one observable promise. Use a short suite-level contract comment only when
   the filename and suite title are insufficient. Only multi-phase or
   scheduling-sensitive tests receive annotations: an ordered phase list
   immediately above the test and matching `// N — concrete checkpoint`
   markers in the body. Every overview number must appear in the body and stay
   synchronized. Simple validation or transformation tests remain
   unannotated.

5. **Settled — test behavior rules.** Use deterministic barriers such as
   `Deferred`, never sleeps, polling, or timeouts as ordering proof. Keep
   assertions in the test. Use `it.effect` or `it.layer` and import `it` from
   `@effect/vitest` for Effect-native tests rather than wrapping the whole test
   in `Effect.runPromise`. Type RPC doubles through their declared interface or
   `Pick`, not a terminal cast. Live integration tests fail clearly when
   required secrets are absent rather than reporting a zero-test pass.

6. **Settled — fixtures and abstractions.** Keep fixtures local to the feature.
   Do not introduce universal factories, fake runtimes, wrapper APIs, shared
   fixture bags, new helpers, or new named types during this restructuring
   without separate explicit approval. A scenario driver is justified only
   when it owns a reusable domain scenario, not repeated setup alone.

7. **Settled — review safety.** Before moving tests, create an
   old-test-to-invariant-to-new-test coverage map. Preserve happy, failure,
   retry/resume, cancellation, identity, ordering, and exact-Cause assertions.
   Judge mode reports numbered actionable findings only. Restructure mode moves
   one invariant-sized feature, verifies it, and stops unless the user requested
   a bounded pass.

8. **Settled — first-pass breadth.** The user selected **audit plus pilot**, not
   audit-only or a repository-wide bulk migration. The audit is grouped by
   package and feature and records oversized or multi-contract specs,
   runtime/naming inconsistencies, missing or stale annotations, duplicated
   fixtures, nondeterministic scheduling, and the recommended sequence of
   invariant-sized follow-up slices.

9. **Settled — Core pilot.** The user selected the System factory rather than
   the recommended replay-mutation seam or the model factory. Replace
   `packages/core/src/system/makeSystem.node.spec.ts` with these files under
   `packages/core/src/system/tests/`:
   - `registry-normalization.node.spec.ts`
   - `frontend-authorization.node.spec.ts`
   - `system-version.node.spec.ts`
   - `service-model-ownership.node.spec.ts`
   - `guard-model-identity.node.spec.ts`

   Add numbered scenario/checkpoint annotations only to the service-ownership
   and guard-identity workflows. Keep normalization, authorization, and version
   cases free of ceremonial step annotations.

10. **Settled — shared publication sequence.** In canonical
    `morgs32/llm-wiki`, add one complete shared organization/annotation pattern,
    update the pattern index, and add a **Test** lens to `make-obvious` with
    Judge and Restructure modes. Publish that coherent change through the
    repository's required ready pull-request workflow. Do not edit installed
    skill copies or Zerospin's vendored/shared copy directly, and do not refresh
    downstream guidance from an unmerged pull request.

11. **Settled — Zerospin profile.** After the shared guidance is available,
    replace Zerospin's narrow runtime-boundary example with a local testing
    profile that layers the Node/workerd and other configured suffixes over the
    shared convention.

12. **Settled — verification.** Compare collected test names and invariant
    coverage before and after the pilot. Run
    `nx run @zerospin/core:test --skipNxCache` and
    `nx run @zerospin/core:ts --skipNxCache` separately, followed by relevant
    non-rewriting lint/format checks and `git diff --check`. Verify Vitest
    discovers every new Node spec and no deleted filename remains in configs,
    docs, or scripts. Validate the changed shared skill with the Codex skill
    validator and check added links.

13. **Settled — Git and WIP constraints.** Zerospin work is direct-to-`main`
    under the repository's temporary policy; canonical shared guidance follows
    its own mandatory pull-request workflow. Recheck status and diffs
    immediately before restructuring. Preserve the active System/config and
    broader SystemRepo WIP exactly; do not restore, rewrite, or fold it into the
    test-only change. Inspect exact staged diffs before committing.

## Explicitly unresolved

1. Merging the canonical `morgs32/llm-wiki` pull request is not authorized by
   the implementation request. Open and validate the PR, then stop for explicit
   merge authorization before refreshing Zerospin's downstream guidance.

## Decided next action

Implement the complete accepted plan. Start from current repository state,
prepare the shared pattern and `make-obvious` Test lens through the canonical
shared-repository workflow, produce the Zerospin audit, and restructure the
five-file Core System pilot without changing production code. The immediately
preceding implementation turn was intentionally aborted before any work began;
this handoff is the continuation point.

## Implementation audit

The current checkout contains 210 matching `*.spec.ts[x]` and
`*.typecheck.ts[x]` files, not the handoff snapshot's 220. Of those, 189 are
first-party or workspace-level files and 21 are under the read-only
`vendor/epluribus-machina/` subtree.

| Package or scope                                 | Files | Feature grouping and finding                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`                                  |    78 | Contracts (16), models (12), session (11), Drizzle (11), utils (7), service session (6), System (5), and smaller focused areas. Runtime suffixes are consistent. The System pilot below removes the multi-contract factory suite; replay mutation and model construction are the next Core review slices. |
| `packages/system-worker`                         |    29 | API, Repo, delivery, and authorization workflows. `SystemApi.node.spec.ts` (1,265 lines), `GatewayApi.node.spec.ts` (1,060), and `AggregateFrontendApi.node.spec.ts` (706) should each receive a Test/Judge invariant map before any move.                                                                |
| `examples/shopping`                              |    18 | Playwright, workerd, and React/unit flows. The 919- and 692-line SharedWorker browser flows are multi-scenario candidates; `system.e2e.spec.ts` and generic unit suffixes require config-backed lane review before renaming.                                                                              |
| `packages/logger`                                |    13 | Node/workerd workflow specs coexist with generic source specs. Review each generic file against its configured runtime before applying a suffix; do not bulk rename.                                                                                                                                      |
| `packages/devtools`                              |    11 | React routes and command/log views. `SessionsLogsRoute.react.spec.tsx` (615 lines) is the first feature-sized review candidate.                                                                                                                                                                           |
| `packages/shared-worker`                         |     7 | `startSharedWorker.invariants.node.spec.ts` (4,711 lines) is the largest suite and highest-priority Judge pass. Its invariant groups and deterministic gates must be mapped before restructuring.                                                                                                         |
| `packages/react`                                 |     7 | Node bootstrap and React behavior use explicit lanes. Devtools (848 lines), mock behavior (713), and bootstrap capabilities (600) are separate follow-up slices.                                                                                                                                          |
| `packages/cli`                                   |     7 | Deploy, dev, migration, and config tests use generic suffixes. Confirm the Node runner boundary before any lane rename.                                                                                                                                                                                   |
| `packages/schema`                                |     5 | `primitives.node.spec.ts` (1,446 lines) should be reviewed by primitive-family promise rather than split by line count alone.                                                                                                                                                                             |
| `packages/sync`                                  |     3 | Workerd and Playwright lanes are explicit; browser waits require scenario-by-scenario judgment rather than automatic replacement.                                                                                                                                                                         |
| `packages/studio`                                |     2 | One React and one Node suite; `RepoExplorer.react.spec.tsx` (490 lines) is the local hotspot.                                                                                                                                                                                                             |
| `packages/error`                                 |     2 | Small generic specs; confirm the intended Node lane before renaming.                                                                                                                                                                                                                                      |
| Six single-file packages plus the workspace root |     7 | SDK, production worker, live query, frontend, dispatch worker, dev worker, and one root-level workspace spec. Preserve each configured runner boundary.                                                                                                                                                   |
| `vendor/epluribus-machina`                       |    21 | Audit-only, read-only input. Its behavioral naming and paired phase annotations are useful evidence but must not be edited from Zerospin.                                                                                                                                                                 |

The timing scan found 26 files containing sleep, timeout, polling, or wait tokens.
Most are browser or Playwright waits and are not automatically defects. The
first-party non-browser review targets are Core session/RPC tests,
`startSharedWorker.invariants.node.spec.ts`, System Worker delivery/log-agent
tests, and any case claiming ordering from elapsed time rather than a barrier.
Existing first-party numbered checkpoints are concentrated in two Core service
session suites, one System Worker Repo suite, and the Shopping home e2e flow;
they need a paired-overview check because the current styles are inconsistent.
Repeated authentication, model, and controller construction remains local by
design unless a later review proves a reusable domain scenario.

### Core System pilot coverage map

| Old test promise                                                          | Preserved destination                               |
| ------------------------------------------------------------------------- | --------------------------------------------------- |
| Normalize aggregate and service registry keys                             | `system/tests/registry-normalization.node.spec.ts`  |
| Resolve aggregate query grants to service queries                         | `system/tests/registry-normalization.node.spec.ts`  |
| Normalize aggregate and service frontend bindings                         | `system/tests/frontend-authorization.node.spec.ts`  |
| Reject aggregate and service frontend owners without authorization        | `system/tests/frontend-authorization.node.spec.ts`  |
| Reject an empty System version                                            | `system/tests/system-version.node.spec.ts`          |
| Enforce authoritative service ownership and exact replicas                | `system/tests/service-model-ownership.node.spec.ts` |
| Preserve authoritative guard model identity and reject projected identity | `system/tests/guard-model-identity.node.spec.ts`    |

The split preserves all nine original `it(...)` names. Only the ownership and
guard-identity workflows receive paired phase annotations; the other three
files remain unannotated.

### Recommended follow-up sequence

1. Judge `startSharedWorker.invariants.node.spec.ts` and map its observable
   invariants without moving code.
2. Restructure one System Worker API promise at a time, starting with
   `SystemApi.node.spec.ts`, then `GatewayApi.node.spec.ts`.
3. Judge `primitives.node.spec.ts` by primitive family.
4. Restructure one Core contract/model slice, starting with
   `replayAppliedMutationTx.node.spec.ts`, then `makeModel.node.spec.ts`.
5. Review the React/devtools and Shopping browser hotspots after their runtime
   lane and scheduling contracts are explicit.
