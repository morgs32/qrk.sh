---
name: Split mock sessions
overview: Replace the overloaded `makeMockSession` with `makeMockAggregateSession` and `makeMockServiceSession`, so each implementation is typed to one frontend and the union-plus-cast body goes away.
todos:
  - id: split-factories
    content: Add makeMockAggregateSession and makeMockServiceSession, extract shared mock lifecycle helpers, delete makeMockSession
    status: completed
  - id: update-callers
    content: Update package export, react spec, and typechecks
    status: completed
  - id: update-docs
    content: Update AuthoredSystem, glossary, and bootstrapBrowserSession mentions
    status: completed
isProject: false
---

# Split mock session factories

**Status:** Archived at the maintainer’s request after implementation in [PR #21](https://github.com/morgs32/zerospin/pull/21). Recorded verification results and remaining acceptance limitations are preserved below.

The public overloads in [`packages/react/src/makeMockSession/makeMockSession.ts`](packages/react/src/makeMockSession/makeMockSession.ts) already return `IAggregateSession` or `IServiceSession`. The implementation signature unions both frontends and then casts (`frontend as IAggregateFrontend`, `IZerospinRuntime<any>`). Split that into two functions. No `makeMockSession` alias.

[`makeSession`](packages/react/src/makeSession/makeSession.ts) has the same implementation union. Leave it alone.

## Shape

- [`makeMockAggregateSession.ts`](packages/react/src/makeMockSession/makeMockAggregateSession.ts) — current aggregate overload as the real signature, including the `layer` generics and `initializeFrontendGuards` path.
- [`makeMockServiceSession.ts`](packages/react/src/makeMockSession/makeMockServiceSession.ts) — current service overload as the real signature (`layer` stays `Layer<never, IAnyError, never>`).
- Shared lifecycle (`createLifecycle`, `admitInitialization`, `beginCleanup`), `encodeFixtureResources`, and `MOCK_SYSTEM_NAME` move to a local helper module under `makeMockSession/`. Each factory keeps its own initialize program.
- Delete [`makeMockSession.ts`](packages/react/src/makeMockSession/makeMockSession.ts).

## Call sites and docs

- [`packages/react/src/index.ts`](packages/react/src/index.ts) exports the two factories.
- Rename calls in [`makeMockSession.react.spec.tsx`](packages/react/src/makeMockSession/makeMockSession.react.spec.tsx) to `makeMockAggregateSession`. Those tests only use the aggregate `main` frontend.
- Move the existing aggregate cases in the `makeMockSession` type proofs onto `makeMockAggregateSession`, and add a service typecheck using `makeServiceFrontend` (same shape as the `makeFrontendCompatibility` type proofs).
- Update the `makeMockSession` mentions in [`wiki/architecture/AuthoredSystem.md`](wiki/architecture/AuthoredSystem.md), [`wiki/glossary.md`](wiki/glossary.md), and [`wiki/architecture/browser/bootstrapBrowserSession.md`](wiki/architecture/browser/bootstrapBrowserSession.md).

`useInitializeMockSession` stays as-is. It already accepts either session through a structural `initialize` / `dispose` / `store` shape.

## Patterns review — 2026-09-23

1. Reviewed the shared `functions/separate-helpers-not-overloads.ts` and `testing/colocate-single-subject-specs.ts` guidance and the current factory, initialization helper, and type proofs. Split the actual typed implementations; do not retain an unknown/union implementation signature or replace removed casts with new assertions.
2. This is PR 2, based on `codex/drop-frontend-reexports` (PR 20). The first PR removed React factory pass-throughs and moved compatibility proofs; import frontend fixtures directly from Core and use the `makeSession` type proofs as the current service-handshake example.
3. Keep lifecycle identity, interruption, cleanup, and scope handling unchanged through shared local helpers. Preserve the aggregate's local capability layer and the service factory's empty-output layer contract. Add service initialization/disposal coverage rather than relying only on aggregate tests.
4. The baseline React typecheck has two redundant authentication error directives; retain each rejection assertion at the diagnostic produced by the split signatures. The baseline lifecycle test incorrectly expects a local capability layer to acquire during initialization: `initializeExecution` now retains that layer for invocation rather than building it. Update that test to reflect lazy capability acquisition while continuing to prove cleanup for resources that were actually acquired. Do not eagerly build layers just to satisfy the old assertion.
5. Run the complete React Node/React suite and React typecheck after the split, plus export/reference and scoped lint/format checks. Preserve `makeSession` and `useInitializeMockSession` behavior.

6. The typed split exposes a stale requirement signature in frontend `initializeExecution`: its implementation only captures ambient context and stores the capability layer for later invocation, but its overloads claim to execute the frontend/local-layer requirements. Correct those overloads to require only their existing scope, preserving the lazy implementation and existing factory admission checks. This is necessary to remove the old casts without eagerly building capabilities; include Core and consumer typechecks for this shared signature change.

## Implementation and verification — 2026-09-23

1. Implemented both factories with concrete generic bodies and shared lifecycle/resource encoding helpers; deleted the overloaded factory and all of its implementation casts. Public exports and current documentation name both factories. `makeSession` and `useInitializeMockSession` are unchanged.
2. Preserved aggregate runtime/layer input checks at the typed factory boundary. Updated the frontend initializer's stale requirements signature to match lazy capability capture; moved its application-input rejection proof to the mock factory. Service mock layer signature remains unchanged.
3. Preserved all aggregate lifecycle scenarios and added service fixture, duplicate initialization, disposal/reinitialization, and malformed-authentication cases. Updated the historical failed-authentication assertion to prove local capabilities remain unacquired and the caller-owned application runtime releases on disposal.
4. `pnpm nx run-many -t ts -p @zerospin/core,@zerospin/react` passes. `pnpm nx run @zerospin/react:test` passes all 18 tests across six files. Scoped lint/format and diff checks pass. Nx Cloud reports an access warning; local tasks succeed.
