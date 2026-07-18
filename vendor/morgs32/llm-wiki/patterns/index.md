# llm-wiki pattern index

Keyword → pattern file routing. Code shows good; `@bad` JSDoc tags document anti-patterns.

See [README.md](./README.md) for format.

## classes

| File                                           | Description |
| ---------------------------------------------- | ----------- |
| `classes/class-method-destructure-props.ts`    | /\*\*       |
| `classes/no-helper-bags-for-public-methods.ts` | /\*\*       |

## cloudflare

| File                                              | Description |
| ------------------------------------------------- | ----------- |
| `cloudflare/dont-equate-unrelated-identifiers.ts` | /\*\*       |

## durable-objects

| File                                                        | Description |
| ----------------------------------------------------------- | ----------- |
| `durable-objects/do-constructor-init-returns-assigns.ts`    | /\*\*       |
| `durable-objects/lifecycle-names-describe-startup-phase.ts` | /\*\*       |

## effect

| File                                                 | Description |
| ---------------------------------------------------- | ----------- |
| `effect/catchall-return-yieldable-error.ts`          | /\*\*       |
| `effect/effect-fn-generators-must-yield.ts`          | /\*\*       |
| `effect/effect-fn-observability.ts`                  | /\*\*       |
| `effect/effect-partition-batch-failures.ts`          | /\*\*       |
| `effect/either-left-is-yieldable.ts`                 | /\*\*       |
| `effect/effect-fn-return-contract-before-cast.ts`    | /\*\*       |
| `effect/inline-named-effect-fn-programs.ts`          | /\*\*       |
| `effect/managed-runtime-rpc-boundary.ts`             | /\*\*       |
| `effect/maybe-names-for-effect-either.ts`            | /\*\*       |
| `effect/no-one-step-gen-wrapper.ts`                  | /\*\*       |
| `effect/nullable-json-column-wire-type.ts`           | /\*\*       |
| `effect/pascalcase-schema-locals.ts`                 | /\*\*       |
| `effect/primitives-json-explicit-schema-boundary.ts` | /\*\*       |
| `effect/schema-domain-parity.ts`                     | /\*\*       |
| `effect/schema-helpers-carry-encoded-types.ts`       | /\*\*       |
| `effect/yieldable-error-return-yield.ts`             | /\*\*       |

## functions

| File                                               | Description |
| -------------------------------------------------- | ----------- |
| `functions/avoid-wrapped-yield-casts.ts`           | /\*\*       |
| `functions/destructure-props-immediately.ts`       | /\*\*       |
| `functions/effect-fn-one-props-object.ts`          | /\*\*       |
| `functions/entrypoint-export-only.ts`              | /\*\*       |
| `functions/inline-effect-before-yield.ts`          | /\*\*       |
| `functions/inline-one-off-props-types.ts`          | /\*\*       |
| `functions/make-normalize-optional-collections.ts` | /\*\*       |
| `functions/mapvalues-not-from-entries.ts`          | /\*\*       |
| `functions/no-one-off-export-aliases.ts`           | /\*\*       |
| `functions/separate-helpers-not-overloads.ts`      | /\*\*       |

## naming

| File                                         | Description |
| -------------------------------------------- | ----------- |
| `naming/avoid-abbreviations.ts`              | /\*\*       |
| `naming/dynamic-module-reads.ts`             | /\*\*       |
| `naming/generic-type-parameters-all-caps.ts` | /\*\*       |
| `naming/monorepo-cross-package-imports.ts`   | /\*\*       |
| `naming/no-re-exports-outside-barrels.ts`    | Import from the defining module; do not re-export from features |
| `naming/package-barrels-index-ts.ts`         | Keep package aggregation in `index.ts` barrels                 |
| `naming/relative-paths-with-extensions.ts`   | /\*\*       |
| `naming/repo-table-shapes-inline.ts`         | /\*\*       |
| `naming/type-aliases-use-i-prefix.ts`        | Prefix named type aliases with `I`                             |
| `naming/types-live-in-types-ts.ts`           | /\*\*       |

## nextjs

| File                                            | Description |
| ----------------------------------------------- | ----------- |
| `nextjs/cached-loader-name-mirrors-rpc.ts`      | Name cached loaders after their RPC method       |
| `nextjs/cached-loaders-one-per-file.ts`         | Keep one cached loader in each file              |
| `nextjs/either-in-shared-cached-loaders.ts`     | Let each RSC consumer choose how to unwrap Either |
| `nextjs/inline-validate-params-sync.ts`         | /\*\*       |
| `nextjs/redirect-notfound-outside-effect.ts`    | /\*\*       |
| `nextjs/route-params-auth-in-default-export.ts` | /\*\*       |
| `nextjs/routepattern-for-sidebar-is-active.ts`  | /\*\*       |
| `nextjs/rsc-loader-shell-effect-fn.ts`          | /\*\*       |

## rpc

| File                                             | Description |
| ------------------------------------------------ | ----------- |
| `rpc/avoid-second-yield-after-promise.ts`        | /\*\*       |
| `rpc/decode-rpc-with-flatmap.ts`                 | /\*\*       |
| `rpc/double-encode-or-plain-repo.ts`             | Encode once at the repo boundary                  |
| `rpc/eitherencoded-vs-decoded-at-loader-exit.ts` | /\*\*       |
| `rpc/error-on-failure-channel-not-success.ts`    | /\*\*       |
| `rpc/factory-map-catchall-not-encoderpc.ts`      | Map API factories to success or failure targets   |
| `rpc/gateway-type-and-success-type.ts`           | /\*\*       |
| `rpc/nested-worker-rpc-flatmap-decode.ts`        | /\*\*       |
| `rpc/no-blanket-catchall-on-rpc.ts`              | /\*\*       |
| `rpc/non-rpc-runners-return-effects.ts`          | /\*\*       |
| `rpc/promise-either-then-get-or-throw.ts`        | Unwrap Promise Either with `then`                  |
| `rpc/return-either-from-loaders.ts`              | /\*\*       |

## react

| File                                       | Description                                                        |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `react/prefer-design-system-components.ts` | Default to existing shadcn components instead of hand-styled HTML |

## runtime

| File                                            | Description |
| ----------------------------------------------- | ----------- |
| `runtime/access-controls-check-reject-case.ts`  | /\*\*       |
| `runtime/api-call-worker-rpcs-not-internals.ts` | /\*\*       |
| `runtime/dont-remap-not-found-error.ts`         | /\*\*       |
| `runtime/effect-fn-map-thrown-causes.ts`        | Map thrown causes and preserve typed failures    |
| `runtime/get-by-key-or-throw.ts`                | /\*\*       |
| `runtime/get-named-controller.ts`               | /\*\*       |
| `runtime/no-provide-layers-inside-effect-fn.ts` | /\*\*       |
| `runtime/no-rsc-api-helper-modules.ts`          | Keep one-consumer API calls in the owning RSC    |
| `runtime/no-thread-secrets-through-props.ts`    | /\*\*       |
| `runtime/pretty-unknown-failure-on-cause.ts`    | /\*\*       |
| `runtime/rpc-client-module-public-env.ts`       | /\*\*       |
| `runtime/rpc-server-module-secret-env.ts`       | /\*\*       |
| `runtime/shiki-use-swr-immutable.ts`            | /\*\*       |

## testing

| File                                              | Description |
| ------------------------------------------------- | ----------- |
| `testing/inline-decode-rpc-no-decode-wire.ts`     | /\*\*       |
| `testing/local-secrets-fail-at-load.ts`           | /\*\*       |
| `testing/managed-runtime-it-layer.ts`             | /\*\*       |
| `testing/no-run-promise-in-specs.ts`              | /\*\*       |
| `testing/one-it-from-effect-vitest.ts`            | /\*\*       |
| `testing/plain-rpc-interface-test-doubles.ts`     | /\*\*       |
| `testing/vitest-config-spec-suffix-by-runtime.ts` | /\*\*       |
| `testing/workers-vitest-env-import.ts`            | /\*\*       |

## tooling

| File                                           | Description |
| ---------------------------------------------- | ----------- |
| `tooling/avoid-unrequested-annotations.ts`     | /\*\*       |
| `tooling/command-rows-spread-not-mapper.ts`    | /\*\*       |
| `tooling/db-transaction-infer-tx.ts`           | /\*\*       |
| `tooling/duplicate-tsconfig-pass-on-emit.md`   | tooling     |
| `tooling/effectful-work-inside-transaction.ts` | /\*\*       |
| `tooling/sync-drizzle-no-effect-sync.ts`       | /\*\*       |
| `tooling/git.md`                               | tooling     |
| `tooling/manual-column-loop-vs-mapvalues.ts`   | /\*\*       |
| `tooling/no-infer-row-type-alias.ts`           | /\*\*       |
| `tooling/numbered-plan-lists.ts`               | /\*\*       |
| `tooling/nx-ts-depends-on-lib.md`              | tooling     |
| `tooling/partial-row-interfaces.ts`            | /\*\*       |
| `tooling/prisma-db-push.md`                    | tooling     |
| `tooling/read-before-casting.ts`               | /\*\*       |
| `tooling/table-vs-drizzle-schema-naming.ts`    | /\*\*       |
| `tooling/tsconfig-split-for-ide.md`            | tooling     |
| `tooling/zerospin-dev-clean-until-production.ts` | Run local Zerospin development with a detached clean generation |
| `tooling/validate-before-insert.ts`            | /\*\*       |
| `tooling/vitest-setup-real-dependencies.ts`    | /\*\*       |
