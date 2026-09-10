# Zerospin-owned backend Wrangler configuration design

**Date:** 2026-09-10
**Status:** Approved for planning; implementation recorded below

## Problem Statement

Applications duplicate Zerospin's internal Worker bindings and SQLite exports in authored Wrangler files. The CLI already generates effective configuration but still requires those files as input. Shopping also carries a redundant backend Worker and generated backend declarations despite using packaged CLI entrypoints.

## Solution

Zerospin generates the complete backend configuration for development, deployment, and workerd tests. Projects supply their deployment identity alongside the live System:

```ts
export default system.config({
  systemId: 'sys_shopping_20260907_pinned_replicas',
});
```

The Worker name derives as `zerospin-${system.name}`. Frontend hosting remains application-owned.

## User Stories

1. As an application author, I configure my System and explicit system ID without enumerating internal DO classes.
2. As a developer, I run the backend with project-root environment files and retain existing local state across restarts.
3. As an operator, I deploy through the existing CLI workflow without maintaining backend Wrangler configuration.
4. As a test author, I pass project configuration to workerd setup and run tests without a prior CLI invocation.
5. As a framework maintainer, I declare backend bindings and SQLite exports once for development, production, and tests.
6. As a Shopping maintainer, I retain frontend hosting configuration without owning a backend Worker or generated backend declarations.

## Implementation Decisions

1. Extend existing configuration types, factory, and schema with required `systemId`, validated by the existing system-ID contract. Preserve concrete System inference and reference identity; introduce no new named types.
2. Derive the Worker name with the `zerospin-` prefix. Validate the complete name and reject invalid names instead of silently rewriting them.
3. Share the approved `makeWranglerConfig` helper from `@zerospin/dev-worker` across CLI dev, CLI deploy, and `makeWorkerdVitestConfig`.
4. The builder owns entrypoint, system alias, required DO bindings, SQLite exports, environment variables, and production version metadata. Keep compatibility date `2026-01-20`, `nodejs_compat`, and Shopping's existing observability settings.
5. Expose no Wrangler passthrough, account/routes settings, binding customization, or compatibility options through project configuration. Retain existing CLI credential handling and production acceptance, promotion, recovery, and interruption behavior.
6. Generate configs and adapters in unique ignored directories beneath `.wrangler/zerospin/`, with explicitly resolved source paths. Dispose generated files on normal completion, failure, and interruption. Keep the existing local persistence path and existing explicit `--clean` behavior; introduce no automatic reset.
7. Preserve project-root `.env` and `.dev.vars` discovery through Wrangler's loader. Framework environment and system-ID bindings remain authoritative. Production keys remain separate from generated configuration and use the existing scoped secrets file.
8. Require explicit `config` on `makeWorkerdVitestConfig`, replacing `wranglerConfigPath`. Generate a configuration adapter for direct test invocation. Retain internal fixture entrypoint, system-module, and test-binding facilities, including production-worker tests.
9. Update every affected in-repo consumer and fixture, preserving existing system IDs. Delete superseded backend Wrangler files, test templates, and the CLI's separate Wrangler validation gate.
10. Remove Shopping's redundant backend Worker, generated backend declarations, corresponding TypeScript includes, and backend type-generation script. Do not add a `zerospin types` command. Keep necessary runtime declarations in framework packages or test configuration.
11. Update affected documentation and source references in the same change. Do not retain compatibility aliases, alternate authored-config paths, migrations, or fallback decoders.

## Testing Decisions

1. Extend existing Core/configuration tests for required and invalid system IDs, identity and inference preservation, and invalid derived Worker names.
2. Use the existing CLI dev, deployment, and CLI/workerd fixture seams. Check generated bindings, exports, entrypoint, identity, environment, and production metadata; retain spec acceptance, reload, rollback, failure, and interruption coverage. Verify generated-file cleanup while persisted local state survives.
3. Run affected Nx typechecks, Shopping unit/workerd tests, packaged Worker workerd tests, and a local Shopping dev readiness check. Use no remote deployment or storage reset for acceptance.

## Out of Scope

1. Shopping frontend hosting and `wrangler.app.jsonc`.
2. Unrelated Workers and vendored repositories.
3. Consumer-authored Cloudflare overrides and new backend type-generation commands.
4. Remote deployment, physical schema changes, compatibility migrations, and automatic state deletion.

## Implementation and Verification Record

1. Implemented the configuration cutover and consumer removals described above.
2. Core configuration/owner tests, CLI dev lifecycle and workerd fixture tests, production deployment tests, packaged Worker workerd tests, and Shopping unit tests passed. Core, CLI, dev-worker, and production-worker typechecks passed.
3. Shopping reached `Ready on http://127.0.0.1:3045/ (system spec accepted)` using generated configuration. Stopping the process removed its generated directory without resetting local storage.
4. Shopping's application typecheck reports seven existing import-casing errors in unchanged UI files; its test/config typecheck reports additional casing errors. Unit-test type resolution uses the existing `cloudflare:workers` mock, matching runtime resolution, without generated backend declarations. The lowercase import spellings predate this change.
5. Shopping's four workerd tests fail with `aggregate-spec-not-accepted`. Re-running `basicFlow1` with the pre-change workerd helper and authored Wrangler configuration reproduces the failure. Repairing their missing spec-acceptance setup is separate from this cutover.
6. No remote deployment or state reset was performed. No implementation-plan document was created.
