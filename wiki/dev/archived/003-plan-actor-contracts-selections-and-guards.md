# Actor-owned contracts, versioned selections, and guard capabilities

**Date:** 2026-09-22
**Status:** Implemented and verified
**Specification:** [Spec 003](003-spec-actor-contracts-selections-and-guards.md)

## Implementation sequence

1. Add named, versioned selection and guard authoring APIs. Derive selection query parameters from authentication schemas, retain declarative query capture, and preserve guard implementation requirements and failure validation. Extend existing Core authoring tests and SDK exports.
2. Add contract authentication and shared guard callbacks. Decode authentication once before callbacks, keep authoritative guards inside mutation transactions, and run local guards during initial execution and pending replay. Remove binding-owned guard hooks and retain contract failure codecs.
3. Move aggregate contract registration into actor versions. Validate contract names, selected mutation models, canonical model versions, authentication compatibility, and projection identity requirements. Remove aggregate-authored registries and update frontend registration and generated system specifications.
4. Require actor provenance independently of browser sessions throughout aggregate command construction, admission, retained rows, retries, and historical materialization. Resolve contracts only in the recorded actor lineage and preserve explicit contract adaptation. Keep service-derived entries distinct.
5. Support server-only actors by omitting signature/authenticate together. Reject browser authentication and frontend bindings for these actors. Add Shopping provisionerV1, route trusted user creation through it, and derive Clerk identity from validated authentication.
6. Establish aggregate-over-actor guard layer precedence with actor fallback, invocation-specific execution services, and scoped cleanup. Migrate Shopping and affected SDK fixtures to versioned selections, actor contracts, and shared guards.
7. Update affected architecture documentation, glossary, examples, and local patterns. Run affected Nx Core, SDK, System Worker, and Shopping library/typecheck, lint, Node, and Workerd targets. Review the final diff and archive this plan only when implementation and verification are complete.

## Validation seams

1. Core authoring and typecheck: incompatible authentication, non-identity claims, model identity/version mismatches, wrong guard payloads, independent guard versions, and missing requirements.
2. Core execution: one authentication decode per attempt, callback ordering, guard rejection without mutations, local replay, layer precedence, invocation isolation, and acquisition cleanup.
3. System Worker: actor-specific admission, exact historical provenance, transactional guard failure retention, supported version adaptation, and no cross-actor lookup.
4. Shopping: trusted sessionless provisioning, browser impersonation rejection, verified identity/target agreement, duplicate-user handling, and filtered user projection.

## Constraints

1. Preserve the approved spec's execution, replication, ordering, and failure-envelope invariants. Do not introduce compatibility registries, aliases, null actor paths, or fallback decoders.
2. Changed fixed schemas require empty storage. Do not reset user storage.
3. Preserve unrelated checkout changes. At implementation start, only the source specification was untracked; tracked source was clean.
4. Record actual validation results and remaining work below rather than treating intended behavior as implemented.

## Progress

1. Implemented actor-owned contracts, explicit sessionless provenance, server-only actors, named selection versions, typed authentication, and named guard services. Removed aggregate-authored contract maps and binding guard callbacks from affected callers.
2. Preserved transactional authoritative guards and local/replay guards, aggregate-over-actor capability precedence, per-invocation context, scoped cleanup, retained failures, and explicit contract lineage adaptation. Sessionless actor commands do not acquire browser completion ownership.
3. Migrated Shopping and affected SDK/React/Worker/Config/CLI/Studio consumers. Shopping verifies Clerk session tokens before deriving caller claims and provisions through provisionerV1. Added Clerk verification tests and disposable signed test fixtures.
4. Updated architecture docs, glossary, Shopping setup, and local contract-lookup/admission guidance.
5. Node/unit verification passed: Core 374 tests, SDK 7, System Worker 266, Shopping 31 (678 total). Workerd verification passed: System Worker 79, Shopping 5 (84 total). Coverage includes shared guard replay, transaction rollback, unrelated historical lineage rejection, impersonation rejection, trusted provisioning, duplicate users, and selection isolation.
6. Available Nx typecheck targets passed for Core, System Worker, Shopping, React, CLI, and Studio; their dependency graph also built SDK, Config, and affected consumers. Available lint targets passed for the same six projects, with existing warnings in the repository (no lint errors). Scoped formatting and git diff --check passed. Nx Cloud reported workspace-access 401 warnings; local checks completed successfully.
7. Verification commands: `pnpm nx run-many -t test -p @zerospin/core,@zerospin/sdk,system-worker`; `pnpm nx run shopping:test --run`; `pnpm nx run-many -t test:workerd -p system-worker,shopping`; `pnpm nx run-many -t ts -p @zerospin/core,@zerospin/sdk,system-worker,shopping,@zerospin/react,@zerospin/cli,@zerospin/studio,config`; the same project list with `-t lint`.
8. Deployment setup: provide CLERK_JWT_KEY and CLERK_AUTHORIZED_PARTIES as documented in the Shopping README. Changed fixed schemas require empty backend/browser storage. User storage was not reset, and nothing was deployed. Browser acceptance and a production Shopping build were not run; the approved Node, Workerd, typecheck, and lint checks are complete.
