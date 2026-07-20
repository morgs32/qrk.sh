# 032 — Controller Version Validation Implementation Plan

## Summary

1. Preserve required `version` properties in the TypeScript signatures for systems, account controllers, actor controllers, frontend controllers, and service controllers.
2. Add direct runtime validation to the same five factories so unchecked JavaScript, stale declarations, or transpile-only consumers fail when the authored system module is evaluated.
3. Make `zerospin dev` preserve and display the specific factory validation failure instead of allowing it to appear later as `local-deploy-allocation-failed` during SystemSpec persistence.
4. Do not add a CLI-owned `tsc` invocation, compatibility default, shared validation helper, new error abstraction, or inferred version.

## Incident Evidence

1. qrk.sh pulled current Zerospin and initially authored these values at runtime:

   ```text
   userAccount.version === undefined
   owner.version === undefined
   ```

2. The current `makeAccountController` and `makeActorController` TypeScript inputs require `version`, but qrk.sh's application typecheck did not report either omission before Wrangler evaluated the current system source.
3. `makeSystemSpec` returned an object containing the undefined controller versions because its return type was trusted without runtime decoding.
4. `DevZerospinApis` first encountered the malformed value while encoding the candidate deployment row's `systemSpec` JSON column.
5. The Effect Schema parse error identified the exact paths:

   ```text
   accountControllers.user.version: Expected string, actual undefined
   accountControllers.user.actorControllers.owner.version: Expected string, actual undefined
   ```

6. That parse error was wrapped by the candidate transaction as `local-deploy-allocation-failed`, so the CLI reported a deployment allocation problem even though no deployment identity or database constraint was the cause.
7. Clearing local Wrangler and Zerospin state reproduced the same failure on an empty database, proving that persisted state was unrelated.

## Desired Behavior

1. A TypeScript consumer that omits any required factory version fails its normal typecheck at the factory call site.
2. A JavaScript, stale-declaration, transpile-only, or otherwise unchecked consumer fails immediately when the affected factory executes.
3. The runtime error names the factory and invalid property, for example:

   ```text
   makeAccountController: version must be a non-empty string
   makeActorController: version must be a non-empty string
   ```

4. `zerospin dev` shows that authored-system error directly in its terminal failure output and retained diagnostic file.
5. No candidate deploy or generation row is allocated for an invalid authored system.
6. No version is defaulted, inferred from the system version, copied from a model, or recovered through a compatibility path.

## Implementation

1. Lock the compile-time contract with explicit typecheck fixtures.
   1. Add negative compile-time cases for an omitted `version` beside the existing typecheck coverage for `makeSystem`, `makeAccountController`, `makeActorController`, `makeFrontendController`, and `makeServiceController`.
   2. Require each omission to remain a TypeScript error at the direct factory call site.
   3. Keep each factory's existing `VERSION extends string` generic and required `version: VERSION` input; do not widen the input to optional or add overloads that accept missing versions.
   4. Add positive cases showing that literal versions continue to flow into the inferred return type.
   5. Verify declaration output exposes the required property from the module that defines each factory, not through a compatibility re-export.

2. Add immediate runtime guards to the five version-owning factories.
   1. In `packages/core/src/system/makeSystem.ts`, reject a non-string or empty `props.version` before validating controller maps.
   2. In `packages/core/src/accountController/makeAccountController.ts`, reject a non-string or empty `props.version` immediately after destructuring and before model or mutation-adapter validation.
   3. In `packages/core/src/actorController/makeActorController.ts`, reject a non-string or empty `props.version` immediately after destructuring and before model, selection, API, frontend, or adapter validation.
   4. In `packages/core/src/frontendController/makeFrontendController.ts`, reject a non-string or empty `props.version` immediately after destructuring and before model and guard construction.
   5. In `packages/core/src/service/makeServiceController.ts`, reject a non-string or empty `props.version` immediately after destructuring and before model, contract, query, or mutation-adapter validation.
   6. Use a direct `typeof version !== "string" || version.length === 0` check in each factory. Keep the validation explicit; do not add a shared helper, loop, schema wrapper, or new named type.
   7. Throw an ordinary `Error` using the existing factory validation style and the exact message `make<FactoryName>: version must be a non-empty string`.
   8. Do not trim, normalize, or add SemVer validation in this change. This plan detects the missing/invalid runtime primitive that caused the incident without expanding version policy.

3. Add focused runtime tests for every factory guard.
   1. Add one missing-version test and one empty-version test to each existing `make*.node.spec.ts` file.
   2. Use `Reflect.deleteProperty` or `Reflect.set` on an otherwise valid fixture only inside the runtime tests so the test can exercise unchecked input without weakening production types or adding casts.
   3. Assert the exact factory-specific error message.
   4. Assert that validation runs before downstream model, selection, contract, adapter, and controller-map validation by keeping the remainder of each fixture valid.
   5. Do not add a parameterized test loop or shared invalid-version fixture; keep the five factory boundaries independently visible.

4. Preserve the authored-system failure through `zerospin dev`.
   1. Add a CLI development fixture whose system entry bypasses TypeScript and omits an account-controller version at runtime.
   2. Run that fixture through the existing `devFn` Wrangler boundary rather than reproducing only the core factory call.
   3. Confirm the Worker fails during authored system module evaluation, before `DevZerospinApis` candidate allocation.
   4. Update `devFn` error handling only if the existing Wrangler output capture discards the thrown factory message.
   5. If an update is required, preserve the original factory message in the CLI's displayed failure and diagnostic file; do not translate it into a deployment, persistence, readiness, or compatibility error code.
   6. Keep the CLI responsible only for reporting the Worker startup failure. Do not move controller validation into the CLI and do not import the consumer's system module into the Node process.
   7. Do not add `tsc --noEmit` to `zerospin dev`. The CLI must not depend on a consumer's tsconfig, compiler version, project references, unrelated application errors, or TypeScript installation merely to run local development.

5. Improve the SystemSpec boundary as defense in depth.
   1. Decode the freshly produced SystemSpec with `SystemSpecSchema` before candidate allocation and before passing a production deploy payload to the API.
   2. Keep this validation at the existing SystemSpec construction call sites; do not relocate deployment ownership between CLI, dispatch Worker, or system-worker.
   3. Map a decode failure to the existing system-spec build/validation failure boundary with the full Effect Schema path preserved.
   4. Ensure an invalid SystemSpec never reaches `Schema.encodeUnknownSync(deployRowSchema)` inside the candidate allocation transaction.
   5. Treat this as defense in depth for malformed objects that did not originate from the public factories. The factory guard remains the primary error for the missing-version incident.

6. Synchronize deployment documentation.
   1. Update `wiki/architecture/DeploySystem.md` to state that authored system factories validate required runtime identity fields before local candidate allocation.
   2. Document that SystemSpec runtime decoding precedes persistence and compatibility comparison.
   3. Keep TypeScript checking described as a consumer build concern rather than a responsibility of `zerospin dev`.
   4. Refresh source hashes and run the wiki freshness check after the source changes are committed.

## Testing and Verification

1. Run the core library build, typecheck, lint, and unit tests through Nx with cache disabled.

   ```text
   nx run @zerospin/core:lib --skip-nx-cache
   nx run @zerospin/core:ts --skip-nx-cache
   nx run @zerospin/core:lint --skip-nx-cache
   nx run @zerospin/core:test --skip-nx-cache
   ```

2. Run the CLI library build, typecheck, lint, and unit tests through Nx with cache disabled.

   ```text
   nx run @zerospin/cli:lib --skip-nx-cache
   nx run @zerospin/cli:ts --skip-nx-cache
   nx run @zerospin/cli:lint --skip-nx-cache
   nx run @zerospin/cli:test --skip-nx-cache
   ```

3. Run the dispatch Worker build, typecheck, lint, unit tests, and Worker-runtime tests if the SystemSpec defense-in-depth boundary changes there.

   ```text
   nx run @zerospin/dispatch-worker:lib --skip-nx-cache
   nx run @zerospin/dispatch-worker:ts --skip-nx-cache
   nx run @zerospin/dispatch-worker:lint --skip-nx-cache
   nx run @zerospin/dispatch-worker:test --skip-nx-cache
   nx run @zerospin/dispatch-worker:test:workerd --skip-nx-cache
   ```

4. Reproduce the original unchecked-consumer case and require the terminal output to contain the direct factory error.

   ```text
   makeAccountController: version must be a non-empty string
   ```

5. Confirm that the invalid fixture creates no deploy, generation, clean-request, or deploy-log row.
6. Run the valid development fixture and require Wrangler's real readiness line followed by a successful `/__zerospin/ready` response.
7. Run the full affected target set through Nx.

   ```text
   nx affected -t lib,ts,lint,test --skip-nx-cache --nxBail
   ```

8. Run repository integrity checks.

   ```text
   .llmwiki/freshness.sh --stale-only
   git diff --check
   git status --short
   ```

9. Keep this plan active until the compile-time negative fixtures, five runtime factory guards, CLI integration fixture, SystemSpec defense-in-depth validation, and documentation checks are all green.

## Guardrails

1. Do not make `version` optional in any public factory type.
2. Do not assign a default version or infer one from another definition.
3. Do not add a compatibility path for previously malformed authored objects.
4. Do not add a shared version-validation helper, wrapper, service, named type, export, barrel, or test loop without explicit approval.
5. Do not make `zerospin dev` run the consumer's full TypeScript project.
6. Do not move controller validation or SystemSpec ownership across the CLI, dispatch Worker, or system-worker runtime boundaries.
7. Do not allocate deployment or generation state before authored-system validation succeeds.
8. Do not hide the original factory error behind `local-deploy-allocation-failed`, `zerospin-dev-worker-not-ready`, or another generic lifecycle error.
9. Do not add `ALLOWED_CAST`, assertion chains, or bolt-on intersection types.
10. Preserve unrelated WIP and active plans.
