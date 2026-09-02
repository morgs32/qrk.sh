# Variant data contracts and GitHub profile loading

**Date:** 2026-07-18
**Status:** Approved for planning

## Problem Statement

Brick variants currently describe only their rendered sizes, while the bricks workbench displays the raw variant definition in its data pane. A variant cannot declare the validated input it needs or load preview data through the local scraper RPC boundary. The GitHub repository capability also exposes the generic `scrape(url)` name even though its public operation specifically loads a profile.

## Solution

Allow a variant to remain static or declare a Zerospin primitive payload shape and a `getData` callback. `makeVariant` validates unknown submitted payloads strictly before invoking a data callback, collections preserve the resulting contract, and the workbench renders the supported text inputs and executes the callback through a per-request scraper RPC session. Rename the GitHub repository operation to `getProfile(url)` while retaining `scrape(url)` on the other origin repositories.

This specification supersedes specification 010's `scrape(url)` naming only for the GitHub repository capability.

## Contract and API Decisions

1. `makeVariant` supports exactly two forms: static variants omit both `payload` and `getData`, while data-backed variants provide both fields.
2. A data-backed `payload` is a Zerospin primitive shape.
3. A data-backed callback receives `{ api: ScraperApi, payload }`, where `payload` is inferred from its primitive shape, and returns `Promise<IRpcEither<IJsonValue>>`.
4. `makeVariant` wraps each data-backed callback with `makeEffectSchema` decoding and `onExcessProperty: "error"`.
5. Invalid, missing, or excess payload properties reject before the data callback or scraper capability is invoked.
6. `makeCollection` and `ICollection` preserve `payload` and the wrapped `getData` callback without introducing a separately named variant type.
7. The scraper package exposes direct `scraper/ScraperApi` and `scraper/types` entry points. It does not add a barrel.
8. The bricks package directly depends on `scraper`, `@zerospin/core`, and `effect`.
9. `GitHubRepo.scrape(url)` becomes `GitHubRepo.getProfile(url)`, and every GitHub repository or RPC caller uses the new name.
10. Other origin repositories retain `scrape(url)`.
11. The GitHub profile variant declares `url` with `primitives.text({ defaultValue: "https://github.com/morgs32" })`.
12. The GitHub profile callback calls `api.githubRepo().getProfile(payload.url)`.

## Workbench Decisions

1. Static variants retain the existing raw-definition JSON in the data pane.
2. Data-backed variants replace that JSON with an inline form driven by their primitive payload descriptors.
3. The first form version supports only non-null text descriptors with string defaults.
4. The form explicitly iterates `Object.entries(variant.payload)` to render supported fields.
5. Each supported field starts with its primitive default value.
6. Form submission explicitly iterates the payload keys and copies matching `FormData` values into the unknown payload passed to the wrapped callback.
7. Unsupported primitive kinds or configurations are identified visibly and disable submission.
8. Submission uses the standard shadcn `Button` labeled `Get data`, which is disabled while a request is loading.
9. Each request creates and disposes its own `newSyncRpcSession<ScraperApi>("/scraper-rpc")` session.
10. A successful `Right` value is pretty-printed in the data pane.
11. A `Left` value displays its unwrapped `code` and `message` as the error state.
12. Loaded scraper data is not passed to brick component props.

## Local Development Decisions

1. The bricks package commits `.env` with `SCRAPER_URL=http://127.0.0.1:8787/`.
2. The bricks Vite application loads environment values from the bricks package root.
3. Vite proxies `/scraper-rpc` to `SCRAPER_URL` without exposing the target through client environment values.
4. `packages/scraper/.dev.vars` is ignored and contains the real `GITHUB_TOKEN` used by local Wrangler.
5. Playwright fails clearly before startup when `GITHUB_TOKEN` is absent from the scraper `.dev.vars` file.

## Testing Decisions

1. Deterministic and live scraper tests retain their existing invalid URL, success, cache hit, concurrency, stale refresh, failure, and token-backed smoke coverage while calling `getProfile` for GitHub.
2. Focused bricks unit tests prove static variants omit both data fields.
3. Focused bricks unit tests prove the GitHub profile variant preserves its payload descriptor and callback.
4. Focused bricks unit tests prove valid payloads reach the callback as decoded values.
5. Focused bricks unit tests prove invalid and excess payloads do not invoke the callback.
6. Playwright opens the GitHub profile variant, verifies the default URL, submits through the real Vite proxy and Wrangler Worker, and asserts the successful `morgs32` payload.
7. Playwright submits an invalid GitHub URL and asserts the unwrapped typed error.
8. Verification uses Nx for scraper lint, typecheck, deterministic tests, and live tests, plus bricks lint, typecheck, unit tests, Playwright, and format checks.
9. Live verification waits for Wrangler and Vite readiness messages before browser assertions.
10. Verification ends with `git diff --check`.

## Out of Scope

1. Changes under `apps/web` are excluded.
2. Changes to brick component props are excluded.
3. Changes to `GitHubProfileCard` SWR behavior are excluded.
4. Per-brick persistence of payloads or loaded data is excluded.
5. General form support for nullable text or non-text primitives is excluded.
6. Renaming non-GitHub origin repository methods is excluded.

## Assumptions

1. Wrangler's local scraper address remains `http://127.0.0.1:8787/`.
2. The real-token Playwright test is intentionally required and may fail if GitHub changes its API response.
3. Version one of the generated form supports only the exact non-null text primitive configuration needed by the GitHub URL.
4. No scraper payload is injected into brick components in this change.
