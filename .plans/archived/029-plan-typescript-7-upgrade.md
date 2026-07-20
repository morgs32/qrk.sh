# 029 — TypeScript 7 Upgrade Implementation Plan

## Summary

1. Upgrade the workspace from the currently installed TypeScript 6.0.3 compiler to TypeScript 7 for every CLI typecheck and declaration-build path.
2. Keep the official TypeScript 6 compatibility package under the `typescript` dependency name for tools that still require the JavaScript compiler API.
3. Upgrade the matched `nx` and `@nx/js` packages from 22.7.1 to the current Nx 23 release so the dual TypeScript 6/7 arrangement is supported by Nx.
4. Remove the stale root `pnpm.overrides.typescript: 5.7.2` entry instead of forcing one compiler implementation through incompatible consumers.
5. Preserve the existing package scripts, Nx target dependency order, source/auxiliary tsconfig split, emitted declaration layout, runtime targets, and unrelated WIP.

## Current State

1. Root `devDependencies.typescript` is already 6.0.3, and `node_modules/typescript` resolves to 6.0.3.
2. The lockfile currently contains TypeScript 6.0.3 for workspace tooling and TypeScript 5.9.3 for dependency-analysis tooling.
3. Every workspace package also declares TypeScript 6.0.3 directly, which shadows the root compiler binary when its package scripts run.
4. Root `pnpm.overrides.typescript` still declares 5.7.2, but it is not the compiler currently resolved at the workspace root.
5. Nx and `@nx/js` are 22.7.1. Nx 22 officially supports TypeScript versions below 5.10, while Nx 23 supports the TypeScript 6 API and the TypeScript 7 CLI transition.
6. The TypeScript 7 compiler does not expose the programmatic compiler API. Nx's TypeScript plugin, Astro/Volar, Vite, and typescript-eslint must continue resolving the TypeScript 6 API during this upgrade.
7. The workspace already explicitly sets `rootDir` and `types` on its product and auxiliary tsconfigs, uses modern `NodeNext` or `Bundler` module resolution, and does not use `ignoreDeprecations`.
8. The pre-upgrade `nx run-many -t ts --all --nxBail` baseline passes for all 16 projects with a `ts` target and their 15 dependent `lib` targets.

## Implementation

1. Establish the supported Nx 23 baseline.
   1. Use the Nx migration workflow to upgrade `nx` and `@nx/js` together from 22.7.1 to the latest stable Nx 23 release; do not leave the two packages on different versions.
   2. Inspect generated package, configuration, and migration changes before running them, and retain only changes required for the Nx 23 upgrade.
   3. Preserve the existing `nx/plugins/package-json` and `@nx/js/typescript` plugin configuration, including the `vendor/**` exclusions and inferred `tsc:typecheck` target name.
   4. Preserve `targetDefaults.ts.dependsOn: ["lib", "^lib"]`; do not replace the repo's explicit `lib` and `ts` targets with newly inferred targets.
   5. Do not upgrade unrelated dependencies or rewrite project scripts as part of the Nx prerequisite.

2. Install TypeScript 7 and the TypeScript 6 API side by side using the official alias arrangement.
   1. Replace root `devDependencies.typescript: "6.0.3"` with `typescript: "npm:@typescript/typescript6@^6.0.2"` so tools importing `typescript` receive the supported TypeScript 6 API and the `tsc6` compatibility binary. The compatibility package's latest published version is 6.0.2 even though the existing JavaScript compiler package reached 6.0.3.
   2. Add root `devDependencies["@typescript/native"]: "npm:typescript@^7.0.2"` so the workspace `tsc` binary resolves to the stable TypeScript 7 native compiler.
   3. Remove only the stale `pnpm.overrides.typescript: "5.7.2"` entry. Do not replace it with a TypeScript 7 override because that would route API-dependent tooling to a package with no programmatic API.
   4. Regenerate `pnpm-lock.yaml` with pnpm 11.1.1 and verify the root importer records both aliases exactly as authored.
   5. Remove the existing `typescript: "6.0.3"` development dependency from workspace package manifests so package scripts cannot shadow the root TypeScript 7 binary. Keep only embedded-language packages such as `docs` on the official `npm:@typescript/typescript6` compatibility alias when pnpm peer resolution otherwise binds their language server to TypeScript 7. Because the compatibility package exposes `tsc6`, the workspace root remains the owner of the `tsc` CLI.
   6. Keep React test runtimes on the workspace's existing root-overridden React 19.2.6 while regenerating the lockfile: align Studio's runtime dependencies and DevTools' test-only development dependencies with 19.2.6, while preserving DevTools' public `>=18` peer range.

3. Make the TypeScript 6 configuration explicitly TypeScript 7-compatible before relying on the native compiler.
   1. Add `stableTypeOrdering: true` to the existing root `tsconfig.base.json` compiler options so `tsc6` checks with TypeScript 7's mandatory type-ordering behavior.
   2. Run the workspace `lib` and `ts` targets once with the `tsc6` binary before treating TypeScript 7 failures as native-compiler issues.
   3. Do not add `ignoreDeprecations`. Remove or replace any deprecated compiler option discovered during verification instead of suppressing it.
   4. Keep existing explicit `rootDir`, `types`, `module`, `moduleResolution`, `target`, and `lib` choices unless TypeScript 7 produces a concrete incompatibility in that config.
   5. Preserve the source-only `tsconfig.json` and auxiliary `tsconfig.etc.json` ownership split; do not merge product source, specs, generated declarations, or config files into one program.

4. Route all existing compiler commands through TypeScript 7 without adding wrapper scripts.
   1. Keep package `lib` scripts using their existing direct `tsc -b ...` commands; after alias installation those commands resolve to TypeScript 7.
   2. Keep package `ts` scripts using their existing direct `tsc -p ... --noEmit` commands; after alias installation those commands resolve to TypeScript 7.
   3. Keep Astro's `astro check`, Vite, typescript-eslint, the Nx TypeScript plugin, and other compiler-API consumers resolving the `typescript` alias to TypeScript 6.
   4. Do not introduce a local compiler-selection helper, wrapper function, shell script, package script alias, or per-project command abstraction.
   5. Do not switch framework/template checks to TypeScript 7 until their existing tools support its programmatic API.

5. Resolve only failures caused by the compiler/Nx upgrade.
   1. Run each failing Nx target without cache and capture the first TypeScript 6/7 diagnostic difference before editing source.
   2. Fix TypeScript 7 incompatibilities at the actual source or shared factory/base-type owner; do not add call-site casts, `ALLOWED_CAST`, `as const`, compatibility schemas, or bolt-on intersections.
   3. Ask before adding any helper, wrapper, named type assignment, export, barrel, loop, or runtime-boundary move required by a diagnostic.
   4. Preserve full command objects, Effect-first implementation boundaries, package public surfaces, and emitted declaration paths.
   5. Classify failures already present in the user's current WIP separately and do not repair them unless the upgrade exposed or caused them.

6. Synchronize directly affected tooling documentation.
   1. Update package/version references in repo-owned tooling documentation only where they become stale because of the dual TypeScript 6/7 installation or Nx 23 migration.
   2. Preserve the existing Nx `ts`-depends-on-`lib`, split-tsconfig, and exclusive emit/typecheck patterns.
   3. Do not add an architecture page or LLM-wiki pattern unless implementation reveals a reusable rule beyond the official dual-install transition.

## Testing and Verification

1. Verify dependency and executable resolution immediately after installation.

   ```text
   pnpm exec tsc --version
   pnpm exec tsc6 --version
   node -p "require('typescript/package.json').version"
   pnpm why typescript
   nx report
   ```

2. Require `tsc` to report TypeScript 7.x, `tsc6` and `require('typescript')` to report 6.0.x, and Nx packages to report one matched 23.x version.
3. Validate the TypeScript 6 compatibility path first, without changing package scripts permanently.

   ```text
   pnpm exec tsc6 -b tsconfig.json --pretty false
   ```

4. Run every emitted library build and auxiliary/project typecheck through Nx with cache disabled so each TypeScript 7 invocation actually executes.

   ```text
   nx run-many -t lib --all --skip-nx-cache --nxBail
   nx run-many -t ts --all --skip-nx-cache --nxBail
   ```

5. Run all lint and unit-test targets through Nx after compiler output is green.

   ```text
   nx run-many -t lint --all --skip-nx-cache --nxBail
   nx run-many -t test --all --skip-nx-cache --nxBail
   ```

6. Run all Worker-runtime tests because declaration emit and Worker globals cross the compiler boundary.

   ```text
   nx run-many -t test:workerd --all --skip-nx-cache --nxBail
   ```

7. Run architecture/wiki freshness only if implementation changed code-backed documentation sources.

   ```text
   .llmwiki/freshness.sh --stale-only
   ```

8. Audit the final dependency graph and diff.

   ```text
   pnpm why typescript
   git diff --check
   git status --short
   ```

9. Confirm the final diff contains no TypeScript version override, `ignoreDeprecations`, new compiler wrapper, new named type, new helper, `ALLOWED_CAST`, unapproved `as const`, per-package TypeScript 7 dependency, unrelated dependency upgrade, or unrelated WIP change.
10. Keep this plan active until both compiler paths resolve correctly and all required uncached Nx verification targets pass; do not archive it on a partially green migration.

## Guardrails

1. Preserve all unrelated WIP and active plans; do not normalize the dirty checkout or rewrite adjacent source.
2. Treat TypeScript 7 as the CLI compiler and TypeScript 6 as the temporary compiler API compatibility layer. Do not claim every process is running TypeScript 7 while API consumers still require TypeScript 6.
3. Do not add `ALLOWED_CAST`, `as const`, `ignoreDeprecations`, deprecated-option fallbacks, or compatibility code.
4. Ask before adding any abstraction, helper, wrapper, named type assignment, export, barrel, loop, or runtime-boundary change.
5. Keep Nx package versions matched and run npm-style workspace targets through Nx.
6. Preserve existing package scripts, project references, `rootDir` choices, `types` lists, module resolution, emit layout, and target ordering unless a concrete compiler diagnostic requires a microscopic change.
7. Ship dependency resolution, configuration compatibility, source fixes, declaration emit, framework checks, tests, Worker tests, and directly affected documentation in one verified pass.
