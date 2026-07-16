/**
 * One Vitest config per runtime lane; spec filename suffix must match the config `include` glob.
 *
 * @bad Nested `react-tests/vitest.config.ts` with generic `*.test.tsx` — browser pool picks up workerd imports.
 * @bad Workerd and browser specs in one config — different pools, roots, and globalSetup.
 *
 * Good layout (package root):
 *
 * - `vitest.node.config.ts` -> nested `src` `.node.spec.ts` files
 * - `vitest.workerd.config.ts` -> nested `.workerd.spec.ts` files
 * - `vitest.playwright.config.ts` -> nested `e2e` `.playwright.spec.{ts,tsx}` files
 * - `vitest.zerospin.config.ts` -> app-local nested `src` `.zspec.ts` files through the shared `@zerospin/dispatch-worker` workerd harness
 * - `zerospin e2e` -> load `zerospin.config.ts`, pass the system entry path through env, and run the app-local Zerospin Vitest config
 *
 * Good scripts:
 *
 * ```json
 * {
 *   "test:vitest:browser": "vitest run --config vitest.playwright.config.ts",
 *   "e2e": "vitest run --config vitest.workerd.config.ts && vitest run --config vitest.playwright.config.ts"
 * }
 * ```
 *
 * Browser config scopes `include` and sets `globalSetup` when a dev server is required.
 */
export {};
