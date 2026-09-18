# Plan 081 — ZerospinMockProvider

**Date:** 2026-09-17
**Status:** Implemented and verified. `@zerospin/react` mock specs (init, command, remount, teardown, nested-children) pass; library tsc/lint pass; library Reset remounts a new seeded empty wall (`wal_sandbox`).
**Source:** [Spec 081](./081-spec-zerospin-mock-provider.md)

Hard-cutover `@zerospin/react` mock session mounting: replace `makeMockProvider` with `ZerospinMockProvider`, drop SWR, enforce client-only. Author under `vendor/zerospin` first, port to `../zerospin`, then update the qrk library consumer.

## Outcome and constraints

1. Callers mount `ZerospinMockProvider` from `@zerospin/react/ZerospinMockProvider` with `frontend`, `layer`, `authentication`, optional `resources`, and `children`.
2. Remount via React `key` starts a new seeded session; fixture props are captured once per mount.
3. No `makeMockProvider`, no `@zerospin/react/mock`, no `swr` dependency for this path, no compatibility alias.
4. Preserve today's bootstrap semantics (guards, in-memory WASM SQLite, seed encode, `ZerospinProviderContext`, teardown).
5. Do not change production `makeZerospinApp` Provider, live-query, or transport APIs.

## 1. Replace the mock module in vendor Zerospin

1. Add npm `client-only` to `@zerospin/react`. Remove `swr` once nothing imports it.
2. Create `packages/react/src/ZerospinMockProvider.tsx` exporting `ZerospinMockProvider`.
3. Start the module with `'use client'` and `import 'client-only'`.
4. Props: `frontend` (makeFrontend selector), `layer`, `authentication`, optional `resources`, `children`.
5. On mount, capture `frontend`, `layer`, `authentication`, and `resources` in refs. Ignore later changes until remount. Always render latest `children` once the session is published.
6. Detect client mount (for example `useSyncExternalStore` with server snapshot `false`). Until client mount, or while init is pending, render `null`.
7. Run the existing init Effect pipeline without SWR: scope, ManagedRuntime, guards, aggregate session, WASM DB, encode auth/resources, `applyAggregateFrontendState`, `makeBrowserSession`, publish registry value matching today's shape.
8. On init failure, throw (same as today's SWR error path). On unmount or late completion after unmount, release the session/DB exactly once (preserve current finalizer / microtask teardown behavior).
9. Delete `packages/react/src/mock.ts`. Update or delete `mock.typecheck.ts` so it imports `ZerospinMockProvider` from `./ZerospinMockProvider`.
10. Confirm `@zerospin/react/ZerospinMockProvider` resolves via the existing `./*` export map after `lib` emit. Ensure no remaining `mock.js` export is required.

## 2. Retarget Zerospin react tests

1. Rename/retarget `mock.react.spec.tsx` to exercise `ZerospinMockProvider` (file may keep or take the new name; describe block must match the new symbol).
2. Replace factory usage with direct JSX: pass `frontend={ZerospinMainMain}` (or equivalent selector), `layer`, `authentication`, `resources`, `children`.
3. Keep existing coverage: init success, executeCommand without RPC, remount/reset via React `key`, failed-init cleanup / release.
4. Add a regression: mount with a non-trivial nested `children` tree and assert init completes without `RangeError` / hash failures.
5. Run the `@zerospin/react` test and typecheck targets that cover this package; fix only in-scope failures.

## 3. Port to sibling `../zerospin`

1. Copy the same source, dependency, and test changes into `../zerospin` (same paths under `packages/react`).
2. Copy this plan and the archived spec into that repo's `wiki/dev/` layout if not already present via the usual vendor workflow.
3. Run the same react package verification there.
4. Do not `git subtree push` from qrk; push from `../zerospin` when ready, then pull into vendor through the configured vendor workflow when the consumer needs the published commit.

## 4. Cut over the qrk library consumer

1. In `apps/library/aggregates/library/libraryFrontend.ts`, stop calling `makeMockProvider`; export composition helpers only (frontend selector + layer) as needed.
2. Rewrite `apps/library/app/LibrarySandboxProvider.tsx` to render `ZerospinMockProvider` with normal `children`, `frontend={LibraryFrontend}`, `layer`, `authentication`, and wall seed `resources`. Remove the SandboxChildrenContext outlet and the client-only gate that existed only to dodge SWR hashing.
3. Keep Layout reset as `key={sessionKey}` on the provider (count increment).
4. Update docs that name `makeMockProvider`: `apps/library/README.md`, `wiki/brick-layout-conventions.md`, and any other in-scope references.
5. Run `pnpm nx run @qrk.sh/library:tsc` and `pnpm nx run @qrk.sh/library:lint`. Do not add library automated tests.

## Verification

| Seam | Required result | Evidence |
| --- | --- | --- |
| `@zerospin/react` react specs | Init, command, remount, teardown, nested-children regression pass | Vendor and sibling `ZerospinMockProvider.react.spec.tsx` coverage; mock describe block retargeted. Package test run 33 passed / 1 failed (`makeZerospinAppDevtoolsImportFailure.react.spec.tsx`, out of scope). |
| `@zerospin/react` typecheck / lib | `ZerospinMockProvider` emits; `mock` / `makeMockProvider` gone; `swr` unused | `mock.ts` deleted; `client-only` added; `swr` removed. Sibling `:ts` passed. Vendor `:ts` still has pre-existing `makeFrontend`/devtools errors; no in-scope mock failures. |
| Library tsc + lint | Consumer compiles; workaround code gone | `pnpm nx run @qrk.sh/library:tsc` and `:lint` passed. `LibrarySandboxProvider` mounts `ZerospinMockProvider`. |
| Manual library reset | Remount returns empty seeded wall | `/modules` empty wall after WASM init. Reset incremented `sessionKey` 0→1, new `sessionId`, `wal_sandbox` still present, memberships 0, toolbar/grids returned. |

## Completion

1. Mark steps done only with evidence from the verification table.
2. Archive this plan to `wiki/dev/archived/` only after vendor implementation, `../zerospin` port, library cutover, and verification are complete.
