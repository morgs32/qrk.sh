# Finish concrete session initializers

**Status:** release and QRK adoption implemented October 22, 2026. Source checks, all 19 published artifacts, exact consumer adoption, App/Storybook builds and connected/mock runtime flows passed. Actual initializer retry after cleanup and final archival remain pending.

## Outcome and scope

1. Integrate the existing concrete initializer implementation into Zerospin's current development line, release it, and finish QRK adoption. The implementation must no longer exist only on the temporary branch that produced 28.0.0.
2. Scope includes Zerospin's maintained source, in-repo callers, documentation and packaged Intent skills, all 19 packages in its fixed release group, and QRK's exact dependency adoption. Stackshirts, Red Rope Parking and Mentor Mailbox remain on their existing exact pins; their migrations are separate work.
3. Preserve the current upload implementation and all unrelated WIP. Image upload hooks/SWR, page-layout consolidation, Cards cleanup, and the dev-canvas cutover are separate work. Uploads remain outside the Zerospin session; this plan adds no application-service typing machinery to `makeReactUI` for them.
4. This changes construction APIs, not domain declarations or persisted schemas. Preserve session identity, declaration locks, SharedWorker partitions, claims, seed behavior, retry, readiness and disposal. Do not reset storage, add migrations, deploy applications, or change authentication configuration.

## Verified planning baseline

These facts describe the starting point before implementation; current completion evidence follows the verification requirements below.

1. Zerospin main is currently `dd70c5fbe8`, release `29.0.2`. It contains typed SystemApi and the staged-command startup fix. The original checkout has unrelated system-worker/test/documentation WIP.
2. Concrete initializer implementation is commit `65c1860134`, in `/private/tmp/zerospin-concrete-session-initializers`. Its common ancestor with current main is `48248f6393`. A read-only three-way comparison found no TypeScript source conflicts; conflicts concern package versions, changelog and packaged skill version metadata.
3. QRK currently pins `29.0.1`. Its source already imports `ConnectedAggregateInitializer` and `MockAggregateInitializer`, but installed React declarations still export the old `Initializer` and `MockInitializer`. Consumer source migration alone therefore does not establish adoption.
4. The documented local registry metadata currently lists `29.0.2` as latest and contains no `30.0.0`. Use `30.0.0` for this breaking fixed-group release. Recheck registry and source HEAD immediately before release; incorporate newer committed source first, and revise this plan if another release has occupied that version.
5. Sources: [existing implementation](../../../../../../../private/tmp/zerospin-concrete-session-initializers/packages/react/src/index.ts), [QRK owner](../../../apps/app/components/ZerospinUser.tsx), [QRK story](../../../apps/app/components/WallEditorProvider.stories.tsx), and [Zerospin release configuration](../../../../zerospin/nx.json). Current code and registry metadata take precedence over historical release claims.
6. Planning tooling: QRK's installed Intent discovery and package guidance were loaded. The upstream checkout has no installed `intent` executable; no replacement was downloaded. Upstream Nx discovery attempted pnpm's automatic dependency installation and failed on sandbox write permissions. No builds or tests ran during planning. Install the committed workspace dependencies in the isolated integration checkout before resolving and executing its Nx checks.

## Implementation sequence

### 1. Integrate on the current development line

1. Create a clean `codex/` integration worktree from the latest committed Zerospin main. Leave both existing checkouts, the original concrete worktree, and their WIP untouched. Use committed source rather than copying dirty worktrees or generated outputs.
2. Port the functional diff of `65c1860134` using a three-way patch. Include source, maintained examples, DevTools/native integration, docs, architecture references and meaningful Browser/React skill changes. Exclude its old changelog, all package version changes and metadata-only skill changes. Retain current versions until generating the new release.
3. Keep the current typed SystemApi implementation and staged-command startup behavior. Update import paths where the concrete change moves browser-session helpers; do not replace newer files with whole older snapshots.
4. Retain the five concrete React components and their matching browser factories:

   | React component                  | Browser constructor              |
   | -------------------------------- | -------------------------------- |
   | `ConnectedAggregateInitializer`  | `makeConnectedAggregateSession`  |
   | `ConnectedServiceInitializer`    | `makeConnectedServiceSession`    |
   | `StandaloneAggregateInitializer` | `makeStandaloneAggregateSession` |
   | `MockAggregateInitializer`       | `makeMockAggregateSession`       |
   | `MockServiceInitializer`         | `makeMockServiceSession`         |

5. Keep the pure `definition` separate from host inputs through browser construction and the core session facade. Host inputs include the layer, SharedWorker factory and applicable credential configuration. Do not merge those inputs into `session.sessionDefinition`.
6. Remove the superseded overloaded initializers, generic browser/mock constructors, combined browser-definition helpers and their public modules/exports outright. Add no compatibility aliases, forwarding wrappers or replacement generic dispatcher. Keep genuine runtime SharedWorker routing intact.
7. Keep `makeReactUI(pureDefinition)` as the existing context binding. Keep the common React lifetime implementation where it genuinely owns readiness, retry and cleanup; do not duplicate lifecycle behavior in each concrete component.
8. Bring maintained in-repo callers forward, including Shopping, Tic-Tac-Toe, DevTools and native integration. Search maintained source and current docs for removed API references; preserve historical changelog/archive evidence.
9. Reconcile current documentation and packaged skills with the actual concrete API. Correct clean-merging but stale README claims about release 28.0.0 and typed SystemApi 27.0.0. Align every packaged skill's `library_version` with the release generated below.

### 2. Build and publish the integrated release

1. Run the existing affected checks in the isolated worktree before generating release metadata. Use the workspace's resolved Nx targets; the verification matrix below specifies the required projects and behaviors.
2. Generate a fixed-group major release with the existing Nx release workflow: preview a major version plan, then apply it through `pnpm release`. Expected result is `30.0.0` across all 19 packages, their internal published dependencies and lockfile. Explicitly update all eight packaged skills' `library_version` fields to match; the release script does not update those fields. Do not carry the original 28.0.0 release metadata forward.
3. Rebuild release outputs from the integrated source, cleaning stale outputs for packages whose modules were deleted or moved. Inspect packed JS and declarations for all five concrete React/browser APIs and the absence of the removed modules. A correct source export is insufficient if a package tarball still contains old output.
4. Commit only the integration and release changes. Incorporate that exact commit into current Zerospin main before publication, preserving unrelated WIP. If main advances during verification, integrate the new committed changes and rerun the checks affected by that update. Do not publish while the implementation exists only on a temporary branch.
5. Dry-run and then publish the entire fixed group to the configured local registry using the existing publish credentials and Nx release command. Do not publish to public npm or overwrite an existing version.
6. Read registry metadata for every group member, inspect the published React/Browser tarballs, and record the source commit, versions and integrity evidence. Verify that the source commit containing the concrete implementation is an ancestor of the development main used for subsequent releases.

### 3. Finish QRK adoption

1. Validate the committed QRK baseline in an isolated checkout with the new exact release. Update every existing `@zerospin/*` dependency and lockfile resolution together through pnpm. Do not edit installed package files, build Zerospin inside QRK, or add source aliases/path overrides.
2. Preserve the already-authored connected and mock initializer call sites. Make only remaining initializer import/argument fixes required by the concrete API and update affected QRK documentation. Keep its pure session declaration, worker registration, identity inputs and application layer ownership unchanged.
3. Apply the scoped consumer changes to the user's current checkout without reverting or committing its existing upload/docs WIP. Re-run the App and Storybook builds against that exact checkout after adoption.
4. Verify actual installed JS/declarations and all exact pins. Confirm `ConnectedAggregateInitializer` and `MockAggregateInitializer` resolve from the published package; old generic APIs must not be the artifacts serving those imports.
5. Complete the runtime checks below, record actual evidence and limitations, then mark this plan complete and archive it. Publication or a successful build alone is not completion.

## Annotated API and behavior examples

The intended connected composition already has a caller in `ZerospinUser.tsx`; retain its existing credentials and error presentation while adopting the actual package exports:

```tsx
<ConnectedAggregateInitializer
  // 1. Domain declaration stays pure and is also registered by the worker.
  definition={userSessionDefinition}
  // 2. Host wiring is explicit; no connection object or sessionType is authored.
  sharedWorker={userSharedWorker}
  credentialsSchema={signature}
  layer={userApplicationLayer}
  aggregateId={aggregateId}
  expectedClaims={{ aggregateId, clerkUserId }}
  getCredentials={getCredentials}
  renderError={renderError}
>
  {({ session, isLoaded }) =>
    // 3. The initializer owns the lifetime; UserUI supplies the ready session.
    isLoaded ? <UserUI session={session}>{children}</UserUI> : null
  }
</ConnectedAggregateInitializer>
```

```tsx
<MockAggregateInitializer
  // 1. Storybook selects the concrete local execution arrangement explicitly.
  definition={userSessionDefinition}
  claims={claims}
  resources={resources}
  renderError={renderError}
>
  {({ session, isLoaded }) =>
    // 2. The same UserUI/context and production editor consume the mock session.
    isLoaded ? <UserUI session={session}>{children}</UserUI> : null
  }
</MockAggregateInitializer>
```

```text
1. Current main + concrete source -> integrated commit on development main.
   # Later releases retain the implementation instead of silently reverting it.
2. Integrated commit -> clean outputs -> published 30.0.0 tarballs.
   # Inspect runtime exports and declarations, not only package version labels.
3. Exact QRK install -> connected App + mock Wall Editor story.
   # Verify the two real consumer arrangements without moving uploads into either.
```

## Verification and completion

1. Run existing Nx `lib`, `ts` and `lint` targets for Browser, React and DevTools and the affected dependency graph. Run native `build`/`ts`/`lint` and Shopping/Tic-Tac-Toe `ts`/`lint`. Run `zerospin:test` for its test compilation and existing backend/SystemApi suite. That suite does not establish browser initializer or staged-command startup behavior. Do not run Explorer checks.
2. Use existing example/browser flows to verify connected aggregate/service startup and a representative command/query. On a fresh connected mount, submit the first ordinary command as soon as the UI is ready and confirm its authoritative execution evidence, not just optimistic rendering. This is the acceptance check for preserving the staged-command startup fix. Verify disposal/navigation behavior and the existing retry-after-cleanup path. Inspect all five exported constructors/components and their emitted declaration inference. Add no test files, fixtures, runners or permanent compile-only assertions. Record honestly which families received direct runtime exercise versus compilation/source checks.
3. After registry installation, run QRK `pnpm nx run @qrk.sh/app:build` and `pnpm nx run @qrk.sh/app:build-storybook`. Check the complete exact package set and loaded packaged Intent skills; stale generic initializer guidance is a failure of adoption.
4. With the existing authenticated Chrome session, load a saved QRK page, verify initialized live reads and one ordinary edit, navigate its drawers without replacing the username session, and reload to verify saved-state persistence. In the existing Wall Editor Storybook story, verify mock startup and one edit/save using the production query/command path. Preserve pre-existing content; use temporary content only where necessary and remove it through normal commands.
5. This plan adds no upload-specific checks or refactor and authorizes no storage reset. Preserve existing backend/browser databases, authentication and R2 uploads throughout verification. A storage or readiness failure must be diagnosed, not worked around by a reset.
6. Completion evidence must include the integrated main commit, all 19 registry versions, inspected tarball exports/declarations, QRK's exact lockfile adoption, successful existing checks and the connected/mock runtime results. Distinguish any unrelated failure from initializer work; do not mark the plan complete with required adoption checks unresolved.

## Implementation and verification evidence

1. Zerospin development main contains the integrated source/release at `c35b85fcc48cda1ebbcb0f2771e93090f73852d6`, including functional integration commit `657b23aad7`. The newer typed SystemApi and staged-command startup fixes were retained. Main integration preserved the original checkout's unrelated WIP; recorded evidence is [main integration report](/private/tmp/plan040-main-integration-evidence.json).
2. Browser/React/DevTools and affected example library/type/lint graph passed; native build/type/lint passed; `zerospin:test` passed **8 files and 60 tests**. The initial sandboxed test run stalled; the same suite passed with local process/port permissions. No new tests, fixtures or runners were added. Logs: [source checks](/private/tmp/plan040-source-checks.log), [native checks](/private/tmp/plan040-native-checks.log), [existing tests](/private/tmp/plan040-source-tests.log).
3. All **19** fixed-group packages were published to the configured local registry as `30.0.0`, each reporting `latest: 30.0.0`. Actual published tarballs were downloaded and checked for concrete JS/declaration exports, deleted generic modules and all **8** version-aligned packaged skills. The complete published integrity table is below; its source is the [published artifact report](/private/tmp/plan040-published-artifact-report.json), rather than the earlier preview packs.
4. QRK's **22 direct dependency pins** across `apps/app`, `apps/api`, `apps/zerospin` and `apps/scraper`, plus `pnpm-lock.yaml`, now resolve/install exactly `30.0.0`. Installed React/Browser exports and declarations expose the concrete APIs. Existing Drizzle and unrelated upload/documentation WIP were preserved. See [installed dependency report](/private/tmp/plan040-qrk-installed-report.json). App and Storybook builds passed in both the isolated adoption checkout and the primary checkout: [isolated App](/private/tmp/plan040-qrk-isolated-build.log), [isolated Storybook](/private/tmp/plan040-qrk-isolated-storybook.log), [primary App](/private/tmp/plan040-qrk-primary-build.log), [primary Storybook](/private/tmp/plan040-qrk-primary-storybook.log).
5. Authenticated QRK initialized live reads and saved an ordinary `updateSiteSettings` edit through `cmd_D74AIkYGq95lAZw0zkqID`, aggregate index **24**. Backend command/version-chain outcomes finalized `Success`; recorded operations matched the stored Site row, and reloading retained the saved value. Page Settings drawer open/close retained session `sesn_a18C2rNZCyZuWgIcJF1-7`. The original uploaded image remained available through public GET **200**. See [canonical edit evidence](/private/tmp/plan040-qrk-live-edit-evidence.json) and [saved page screenshot](/private/tmp/plan040-qrk-saved.png). The original Site description was restored through normal command `cmd_5_27lm43bRKItthJWeRzx`, aggregate index **28**; both canonical chains finalized `Success` and the materialized Site row matches its original description and `cardStyle: false`. See [restoration evidence](/private/tmp/plan040-qrk-restoration-evidence.json).
6. Wall Editor Storybook exercised `MockAggregateInitializer` with production queries and commands: Swatch `#4A7C59` changed to `#336699`, saved, closed and reopened with the saved value. See [saved story screenshot](/private/tmp/plan040-storybook-saved.png). This verifies local mock behavior, not canonical server execution.
7. The isolated Shopping example exercised connected aggregate and service startup. The service reached index **12** with **12** successful finalized product-creation commands and matching canonical Product operations/rows. The first ordinary shopper `addToCart`, `cmd_-ooriIbXwkeBdaWm4cnXe` at aggregate index **1**, finalized `Success` with matching Cart/CartItem operations and rows; reload retained quantity **1**. A normal `removeFromCart` at aggregate index **2** removed the temporary item; both canonical chains finalized `Success`, the retained delete operation matches the temporary CartItem, and the materialized CartItem count is **0**. See [Shopping runtime evidence](/private/tmp/plan040-shopping-runtime-evidence.json).
8. Direct runtime exercise covers connected aggregate, connected service and mock aggregate. Standalone aggregate and mock service received compilation, emitted-declaration and source inspection only. Browser accessibility/CDP snapshot timeouts were avoided with DOM snapshots. A hidden-view-transition rejection was observed without a source change. The actual initializer Retry-after-cleanup check was not exercised. The user explicitly waived it on October 22, 2026 with “No verification”; source inspection and successful startup are not represented as Retry verification.
9. No storage reset, schema migration, authentication reconfiguration or production deployment was performed. Existing QRK browser/backend data, login and R2 uploads were preserved.

## Published artifact integrity

All entries below were read back from the local registry at `30.0.0`, with `latest: 30.0.0`; integrity identifies the downloaded published tarball.

| Package                       | Version  | Published integrity                                                                               |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `@zerospin/browser`           | `30.0.0` | `sha512-yeg0wkTDUWXbSaQ/9bLq1yQXdkdY/xTCTtbEO0Crv0fDQ9oXXEGj6Ht8AOMaOMZX31MPKPiTu3KC7oU2ewPSWw==` |
| `@zerospin/cli`               | `30.0.0` | `sha512-CYwjcOqed0paHi3q6k/np+pFJZHyKDSZTdcBMJ08wORyAc/+S8E3TmwdBBjfuNGOnHO9JUdtGW/i/tgpKq6dsQ==` |
| `@zerospin/core`              | `30.0.0` | `sha512-XXL/IbpevokIr5/dTOjQt9E9MxCfJnT4biF0EPHysE6TZDy1GX0pHOoohvZiWOPYHom4YoHa6ToUuzclD3yS1w==` |
| `@zerospin/dev-worker`        | `30.0.0` | `sha512-PYnaLiPSoZNUdSagoHkKHJMb+BdWkF0OJCji8R61egJi/zm81iRAES8lxyIgrNlyO4orU/ddJVMzFgz/kvqTLA==` |
| `@zerospin/devtools`          | `30.0.0` | `sha512-itKrZuNTW9skuQG0+Bx/KY2CksYLL/y7+gjl/8sxwST6X3EwrXk1bN9/SIY2I+q2ENd8oeaU83FXJ+EaSvRKUw==` |
| `@zerospin/error`             | `30.0.0` | `sha512-bXevPeG9v4dpRUE/RA+BBAX+2MRD8acxcqqs00OXzgPS+0Q+4G0mwtgeNk5aeWa6FgpqGaerrT3sMEW5RI1IIg==` |
| `@zerospin/error-boundary`    | `30.0.0` | `sha512-T5Tcp+Sqg4LYDDTFw5oASCX34uzlOM+AVJC5ri5J9JSCdtd9jLoj3Kc7H8sviY6BKGUzKwpOzRp73mqOwIlpUQ==` |
| `@zerospin/live-query`        | `30.0.0` | `sha512-cugUwyJ+fLURd4wdY3k5jg2pYgZ5N3jidMfCLKzGu4lwZ9LrIzhnYe/eSjjs8eUp9/Ua3lLJQzNuCjDCp8vD2Q==` |
| `@zerospin/logger`            | `30.0.0` | `sha512-aGnTg1MmEMVqZj18IhRwTpwl2vUn34PVLhVdmwEyIb7GnYXEBQrZhXBS/Jd58oYtL3Kwdq/7cej9AmL9MHytQA==` |
| `@zerospin/production-worker` | `30.0.0` | `sha512-67lv2ySYKGxO05jICoos0RgtGnj9AbVDv5mQ0qHRuxwmBn4i1zW0GpRxHLmpO/RfLM5raRpEnnnhF1q6ZPKjXw==` |
| `@zerospin/react`             | `30.0.0` | `sha512-CBbYqijZjfbFZfnnoQ16fbXj+pW+a3WtHjKfj6h/vfKNcqKKEnUacJQSz/7WAPfFfyjF5Wq8pRjNzzYJpvR2VQ==` |
| `@zerospin/sdk`               | `30.0.0` | `sha512-6yIvDvRvm0KBywGwVw4RVsordXvizB7H/105Rh86XaJ7YRAA5a8RNc3W2f760RLt5ltJjwriR15t+uAnSH5FZA==` |
| `@zerospin/server-only`       | `30.0.0` | `sha512-0Uf8LJVMJTE3OFT1v6HnbcBqZPN3gwFuSnreaVdyRvAodajtKRx5YH+IPzgELEpT5mbCBG6F4DCeAe+aWXzYuQ==` |
| `@zerospin/shapes`            | `30.0.0` | `sha512-KnxOxqcLpaRbPFNvkcJUGChrI2urVFLbF0ek+6RHP+LD1a360Pcb2NlpGiaaxp2oY5nHp2KaE60f55+bER4oGg==` |
| `@zerospin/studio`            | `30.0.0` | `sha512-HpQxUW0R5ba3DZfZ0fFeTMgQ1eVOW3bPaE9d0V4JBWmAQFsGJGGg9Qm6LmVGZP+ka+3S3xlnJSUWCdiB8j6FEw==` |
| `system-worker`               | `30.0.0` | `sha512-Dyc61SLSkv8YhhEbhlQlVlkwqOmMZLuvK2bz/hp1ifei2x1GesO/tLfrLYma88Zly4j9XiPXPLTBDV2Yktu3Pg==` |
| `@zerospin/zod`               | `30.0.0` | `sha512-U7GnMI8W+FuFIN3sbs+s3KtfPtrSMSDxpN9adQAJTEEghIi/p2INyldvKCJ7L1SpKt/JmBmQhbwtiCkRP7oR9g==` |
| `@zerospin/fragment-ui`       | `30.0.0` | `sha512-mwspUdXUWs9y0yo1+SdCTMpsW2quarBcjiNYGrdN9Ik4qSPXwk/D1arLlCJseQcNAvFZ2pPbbiiwedPBe2C7rg==` |
| `@zerospin/machine`           | `30.0.0` | `sha512-aNyZhfCONOxyoE4TTdfhWOWfLo45d00OlU8s8WEi+kbf6qxS2wEVt97zcogXtu1RBmGZHmCI6WusSQY6I9gw/Q==` |

## Remaining work

1. Exercise the existing initializer error/Retry action and verify disposal completes before a fresh owner starts. Native browser controls report that the Mac is locked; the user has been asked to unlock it. Direct browser DOM verification completed the other checks. Source inspection and successful startup are not Retry verification.
2. Record the Retry result, finish only the verification processes/tabs, review the scoped diff/evidence, then mark this plan complete and archive it. Do not archive while required acceptance remains unresolved.
