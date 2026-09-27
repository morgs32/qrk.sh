---
name: Drop frontend reexports
overview: Delete the two React frontend pass-throughs, and split both root typechecks so each assertion sits with the module that owns it.
todos:
  - id: barrel
    content: Re-export both frontend factories from packages/react/src/index.ts directly from core
    status: completed
  - id: callers
    content: Retarget session and mock-session imports and delete the two pass-through files
    status: completed
  - id: typecheck-split
    content: Delete both root typechecks after moving their assertions onto makeSession, makeRuntime, useLiveQuery, useInitializeSession, and the core factories
    status: completed
  - id: docs
    content: Point architecture citations at the defining modules and the new typecheck files
    status: completed
isProject: false
---

# Drop the React frontend pass-throughs

**Status:** Archived at the maintainer’s request after implementation in [PR #20](https://github.com/morgs32/zerospin/pull/20). Recorded verification results and remaining acceptance limitations are preserved below.

The file you opened is a shallow module: its interface is the core factory, and the implementation is a single re-export. Deleting it does not move any behavior. The factory already lives in [`packages/core/src/frontendController/makeAggregateFrontend.ts`](packages/core/src/frontendController/makeAggregateFrontend.ts).

## Where else

Same shape, one other file:

- [`packages/react/src/makeServiceFrontend/makeServiceFrontend.ts`](packages/react/src/makeServiceFrontend/makeServiceFrontend.ts) re-exports [`packages/core/src/frontendController/makeServiceFrontend.ts`](packages/core/src/frontendController/makeServiceFrontend.ts)

No other source file in the repo is a same-named module whose whole body is `export { symbol } from '@zerospin/core/...'`.

These are the allowed version of a re-export, so leave them:

- Package barrels: [`packages/react/src/index.ts`](packages/react/src/index.ts) (including `stageCommand` straight from core), [`packages/sdk/src/index.ts`](packages/sdk/src/index.ts), [`packages/sdk/src/browser/index.ts`](packages/sdk/src/browser/index.ts), and the other `index.ts` barrels.
- Worker entrypoints that must export Durable Object classes from the worker module: `DevWorker`, `ProductionWorker`, `TestWorker`.

Public apps already import `makeAggregateFrontend` / `makeServiceFrontend` from `@zerospin/react`, not from the pass-through paths. Nothing imports `@zerospin/react/makeAggregateFrontend/...`.

## Move

Point the React barrel at the defining modules:

```ts
export { makeAggregateFrontend } from "@zerospin/core/frontendController/makeAggregateFrontend";
export { makeServiceFrontend } from "@zerospin/core/frontendController/makeServiceFrontend";
```

Then delete the two pass-through files and switch the remaining in-package callers to those core paths:

- [`packages/react/src/makeSession/makeSession.node.spec.ts`](packages/react/src/makeSession/makeSession.node.spec.ts)
- [`packages/react/src/makeMockSession/makeMockSession.react.spec.tsx`](packages/react/src/makeMockSession/makeMockSession.react.spec.tsx)
- the `makeMockSession` type proofs

## Former root frontend-factory type proofs

Yes. There is no `makeAppFrontends` module. The file lives at the React package root, uses `.tsx` with no JSX, and checks several factories in one place. A typecheck is named after its sibling subject.

Split the existing assertions; do not rewrite them:

- Exact selected-model records (`selected.models`, `selectedService.models`) and the authentication-schema case that types do not yet reject belong on the defining factories: the `aggregateFrontend` type proofs and the `serviceFrontend` type proofs. Core already checks individual selected fields; keep the whole-record `Equals` asserts there.
- Runtime versus local layer, `initialize` `Date` versus persisted string, and contract services such as `ApiRequestInit` belong in the `makeSession` type proofs. The frontends in those blocks are fixtures.
- The explicit `makeRuntime<ApiRequestInit>` rejection belongs in the `makeRuntime` type proofs.
- `useLiveQuery` accepting `account` and rejecting `user` belongs in the `useLiveQuery` type proofs.

Delete the `makeAppFrontends` type proofs after the move. The existing etc compiler configuration included the dedicated type proofs.

## Former root frontend-compatibility type proofs

Yes. There is no `makeFrontendCompatibility` module either. Delete it in the same pass and move the assertions:

- `frontend.models` equaling `main.models` belongs with the core aggregate frontend factory, next to the other selector asserts.
- `session.initialize` accepting the handshake token and rejecting `{ userId }`, the handshake whose authentication schema does not match the frontend, and the service-session `initialize` call belong in the `makeSession` type proofs. The service frontend is a fixture.
- The three `useInitializeSession` calls, including the rejected `token: 1`, belong in the `useInitializeSession` type proofs.

Retarget the architecture citations that currently describe the React pass-throughs, `makeAppFrontends`, and `makeFrontendCompatibility`, at the defining modules:

- [`wiki/architecture/browser/bootstrapBrowserSession.md`](wiki/architecture/browser/bootstrapBrowserSession.md)
- [`wiki/architecture/AuthoredSystem.md`](wiki/architecture/AuthoredSystem.md)

App authors still call the factories through `@zerospin/react`.

Run the React package typecheck and unit tests, plus the core typecheck, after the move.

## Patterns review and implementation sequence — 2026-09-23

1. Reviewed shared `functions/no-one-off-export-aliases.ts`, `testing/colocate-single-subject-specs.ts`, and scoped execution guidance alongside the local pattern index. Keep package barrels, remove the two pass-through modules, and preserve assertions at their source owners.
2. Current source confirms both root typecheck files remain. The compatibility file no longer contains a whole-record model assertion; preserve the existing assertions and add the planned exact-record check beside the aggregate factory. Remove unused server-system fixture construction when splitting the React type proofs; keep the frontends and all assertion scenarios local to their subjects.
3. Implement this plan first, followed by mock-session split, version-keyed registries, system-only layers/runtime, executed-command tables, and props-destructuring cleanup. Each subsequent PR targets the preceding branch. The last cleanup must scan the final implementations rather than use the historical 56-function count.
4. Validate with the resolved Core and React Nx typecheck targets and React test lanes. Record any baseline failures separately; do not weaken assertions to obtain a passing check.

## Implementation and verification — 2026-09-23

1. Removed both React pass-through modules; the React barrel exports directly from Core. Updated in-package imports and architecture citations.
2. Deleted the two root typecheck files and preserved their scenarios beside Core frontend factories and React session/runtime/query/initialization modules. Removed unused server fixture construction. Removed one redundant `@ts-expect-error` while preserving the incompatible-authentication assertion at its actual diagnostic site.
3. Core Nx typecheck passes. React Nx typecheck reports only two pre-existing unused directives in the `makeMockSession` type proofs. React Node/React tests report 15 passing tests and the existing failed-before-publication lifecycle test. Both failures were reproduced against the unmodified source in this isolated checkout. The mock-session plan owns those files next.
4. Scoped lint has no errors or warnings; changed TypeScript files are formatted and `git diff --check` passes. These checks do not claim a green React package baseline.
