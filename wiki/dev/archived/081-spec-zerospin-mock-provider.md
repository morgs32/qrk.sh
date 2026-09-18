# ZerospinMockProvider design

**Date:** 2026-09-17
**Status:** Archived — converted to [implementation plan](../plans/081-plan-zerospin-mock-provider.md)

## Problem Statement

1. `makeMockProvider` uses `useSWRImmutable` with a ref of full provider props as the cache key.
2. SWR `stableHash` deep-serializes that key, including React `children`, which throws `RangeError: Invalid string length` under SSR and large trees.
3. The factory API (`makeMockProvider({ frontend, layer })`) is unnecessary for remount or init identity; remount is already React `key`.
4. Library workarounds (client gate, children-via-context) paper over the API defect instead of fixing the mock provider.

## Solution

1. Replace `makeMockProvider` with a plain `ZerospinMockProvider` component in `@zerospin/react`.
2. Drive one-shot WASM session init without SWR.
3. Enforce client-only evaluation with `'use client'` and `import 'client-only'`.
4. Remount for a fresh mock session remains the caller's React `key` (for example a reset counter).
5. Author the change in `vendor/zerospin` first, then port to the sibling `../zerospin` repository; update the qrk library consumer in the same consumer pass.

## User Stories

1. As a Zerospin app author, I can mount `ZerospinMockProvider` with `frontend`, `layer`, `authentication`, optional `resources`, and normal `children`, so that I get an in-memory aggregate session without production transport.
2. As a Zerospin app author, I can remount the provider with a new React `key`, so that I get a fresh seeded mock session.
3. As a library sandbox user, I can wrap the full Layout tree as `children` under SSR-capable bundlers, so that init does not blow up hashing the React tree.
4. As a library sandbox user, I can reset the wall via remount, so that I return to the empty seeded wall without a reset contract.
5. As a Zerospin maintainer, I no longer ship `makeMockProvider` or a `swr` dependency on `@zerospin/react` for this path, so that the mock surface stays minimal.

## Implementation Decisions

1. **Name and export:** Public symbol `ZerospinMockProvider` from `@zerospin/react/ZerospinMockProvider`. Delete `makeMockProvider`, `@zerospin/react/mock`, and related factory exports. No compatibility alias.
2. **Props:** `frontend` (the `makeFrontend` selector), `layer`, `authentication`, optional `resources`, `children`. Same session bootstrap semantics as today's mock (guards, in-memory WASM SQLite, seed resources, publish `ZerospinProviderContext`).
3. **Capture once per mount:** On mount, capture `frontend`, `layer`, `authentication`, and `resources`. Ignore later changes to those props until remount. Always re-render `children` against the published session.
4. **Init without SWR:** Mount-scoped async init with React state: render `null` while pending or before client mount; throw on init failure; publish the session registry when ready; release the database on unmount / late completion as today.
5. **Client boundary:** Module starts with `'use client'` and `import 'client-only'`. Until client mount (and while init is pending), render `null`. Callers must not rely on SSR HTML from inside the mock.
6. **Remount:** Document that a new mock session requires remounting the provider (React `key`). Do not add a provider-level `key` prop that duplicates React.
7. **Dependencies:** Add npm `client-only`. Remove `swr` from `@zerospin/react` once unused.
8. **Delivery order:** Implement and verify under `vendor/zerospin`, then port the same change to `../zerospin`. Update qrk library to import `ZerospinMockProvider`, pass normal children, and remove the LibrarySandboxProvider children-context / client-gate workaround while keeping `key={sessionKey}` reset.
9. **Hard cutover:** Pre-release Zerospin policy applies — update all in-tree callers and tests; do not leave dual APIs.

## Testing Decisions

1. Retarget [`packages/react/src/mock.react.spec.tsx`](../../packages/react/src/mock.react.spec.tsx) (and typecheck) to `ZerospinMockProvider`: init success, command execution, remount/reset boundary, teardown / failed-init cleanup.
2. Add a regression that mounts the provider with a non-trivial nested `children` tree and completes init without a hash/`RangeError` failure (covers the former SWR key bug).
3. After library consumer cutover: `pnpm nx run @qrk.sh/library:tsc` and `pnpm nx run @qrk.sh/library:lint` only — no new library automated tests.
4. Prior art: existing `makeMockProvider` react specs in `@zerospin/react`.

## Out of Scope

1. Production browser session / SharedWorker / websocket mock replacement.
2. A Zerospin-owned `@zerospin/client-only` package (use npm `client-only` for now).
3. Changing live-query or production `makeZerospinApp` Provider APIs.
4. A domain `resetWall` contract; remount remains the reset mechanism for disposable mock sessions.
5. Studio migration onto the mock provider.

## Further Notes

1. Spec path is under Zerospin's `wiki/dev/` so it ports with the vendor → `../zerospin` workflow.
2. Library README / brick-layout docs that name `makeMockProvider` should be updated when the consumer lands.
