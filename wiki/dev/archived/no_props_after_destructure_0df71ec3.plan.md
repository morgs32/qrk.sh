---
name: No props after destructure
overview: Record the local rule that a function destructures `props` once at the top and never reads that binding again, then apply it to every real hit in the repo.
todos:
  - id: write-pattern
    content: Add wiki/patterns/typescript/no-props-after-destructure.ts and index row
    status: completed
  - id: fix-hits
    content: Destructure remaining fields and remove later props uses in the scanned functions, skipping the two type-position false positives
    status: completed
  - id: verify
    content: Re-run the AST scan and typecheck the touched packages
    status: completed
isProject: false
---

# Stop using props after the top destructure

**Status:** Archived at the maintainer’s request after implementation in [PR #26](https://github.com/morgs32/zerospin/pull/26). Recorded verification results and remaining acceptance limitations are preserved below.

## Pattern

Shared guidance already says to destructure a `props` argument on the first line and not thread `props.field` through the body ([`destructure-props-immediately.ts`](/Users/morgs32/.agents/skills/use-morgs32-wiki-patterns/references/patterns/functions/destructure-props-immediately.ts)). This repo does not state that, and [authorizeServiceFrontend](packages/system-worker/src/ServiceVersionRepo/authorizeServiceFrontend/authorizeServiceFrontend.ts) breaks it: it destructures some fields, then still uses `props.serviceVersion` and passes the whole `props` into `resolveServiceActorVersion`.

Add [wiki/patterns/typescript/no-props-after-destructure.ts](wiki/patterns/typescript/no-props-after-destructure.ts):

- Leading JSDoc: destructure `props` on the first line, then use only those bindings.
- `@bad` for a later `props.serviceVersion` read.
- `@bad` for passing `props` into a callee after that destructure.
- Body shows the preferred shape: one destructure, then `resolveActor(service, { actorName, actorVersion })`.

Add a typescript row in [wiki/patterns/index.md](wiki/patterns/index.md) with keywords `props destructure`, `props.field`, `pass props`.

## Code fix

An AST scan found **56 functions** that destructure a `props` parameter and then refer to that same binding (about 133 lines). Two are type-position parameter names, not runtime uses, and stay as they are:

- [packages/core/src/aggregateSession/make/makeAggregateSession.ts](packages/core/src/aggregateSession/make/makeAggregateSession.ts) (`handler: (props: …)`)
- [packages/core/src/serviceSession/make/makeServiceSession.ts](packages/core/src/serviceSession/make/makeServiceSession.ts)

For each remaining function:

- Put every field the body needs in the first `const { … } = props`.
- Fold a later `const { … } = props` in the same function into that first line (for example `session` in [bootstrapServiceFrontendSession.ts](packages/frontend/src/bootstrapServiceFrontendSession.ts)).
- Replace `props.field` with the binding. Use a destructuring default when the old code was `props.field ?? fallback`.
- Replace a whole-object pass with an object built from those bindings. `resolveServiceActorVersion` / `resolveAggregateActorVersion` get `{ actorName, actorVersion }`. `catchup(props)` and `catchup({ ...props, throughMaterializationIndex })` become `{ subscriber, throughMaterializationIndex }` (service side: `throughServiceIndex`), because those are the only fields [catchup](packages/system-worker/src/AggregateActorVersionRepo/catchup/catchup.ts) reads.
- In [makeRelations.ts](packages/core/src/models/makeRelations.ts), replace `'ownRef' in props` with `ownRef !== undefined`. The selector is `ownRef: OWN_REF` or `ownRef?: never`, so key presence and a defined binding match.
- Leave nested functions that take their own `props` parameter alone, including type signatures and arrows such as `overwriteDb: props => …`.

The motivating edit in [authorizeServiceFrontend.ts](packages/system-worker/src/ServiceVersionRepo/authorizeServiceFrontend/authorizeServiceFrontend.ts) destructures `serviceVersion`, `actorName`, and `actorVersion` with the existing fields, then calls `resolveServiceActorVersion({ [service.version]: service }, { actorName, actorVersion })`.

## Check

Re-run the AST scan and expect no runtime `props` identifier after the destructure in the same function. Typecheck the packages that changed.

## Patterns review — 2026-09-24

Reviewed with `use-morgs32-wiki-patterns`: shared immediate destructuring, defaulted props, and scoped execution guidance, together with the local index. This is PR 6, based on `codex/actor-executed-commands` (PR 25).

1. The current TypeScript-symbol scan finds 59 functions and 147 runtime references after an initial destructure. Earlier counts predate the stack. Resolve each reference to the actual parameter symbol, skip type positions, and preserve nested parameters that shadow `props`; closure reads of the outer parameter remain in scope.
2. Merge later destructures into the leading declaration, preserve aliases and defaults, and add only fields actually consumed. Keep names distinct from declarations in the function and nested callbacks. A new binding must not shadow an existing reference or lose a method's receiver; inspect callback-method uses explicitly.
3. Replace resolver passes with explicit actor identity and snapshot catch-up passes with the subscriber and the relevant bound. The aggregate bound is now `throughExecutedIndex`; service catch-up retains `throughServiceIndex`.
4. Preserve null semantics. Destructuring defaults apply only to undefined, whereas `??` also handles null. Move a fallback into the destructure only when the declared input excludes null and runtime behavior remains equivalent; otherwise retain `binding ?? fallback` at the use site. Do not eagerly evaluate a formerly lazy or branch-specific fallback.
5. `defineAggregate` validates excess properties on the full authored object. Preserve that validation by retaining additional own properties in a rest binding and validating the reconstructed input; replacing its validator input with only `{ name }` would silently remove rejection behavior. Retain literal-name inference without casts.
6. Apply the plan's `ownRef !== undefined` discriminator to the two relation helper branches. Preserve all unrelated declarations and runtime semantics; do not widen this into parameter or API redesign.
7. Add the requested local pattern and keyword row. Verify the complete owned-source scan has zero runtime reads of the same `props` binding after its destructure. Typecheck all changed projects through their Nx dependency graph and run focused tests for contracts/relations, schema tables, queues, actor snapshots, and session/frontend behavior. Compare inherited failures with the recorded PR 25 baseline.

Implementation follows this committed review: local rule and index, symbol-guided edits, manual whole-object/default/closure review, then scan and scoped verification.


## Implementation and verification — 2026-09-24

- Added the local pattern and index row. Removed all 147 post-destructure runtime parameter references found across 59 functions, merging later destructures and replacing whole-object forwarding with explicit fields. Preserved nested parameter scopes, decoded/input distinctions, nullish behavior, and full authored aggregate validation.
- The dispatch-name discriminated union retains its variant-specific fields in a rest binding, without adding a production-only placeholder field. Service snapshot catch-up explicitly forwards its optional bound; its type now accepts explicit undefined as the existing runtime already did.
- A fresh TypeScript symbol scan of all owned TS/TSX source files (packages, examples, and tooling; excluding vendor, documentation snippets, declarations, and generated output) reports zero functions and zero runtime references after the initial destructure. The scanner follows closure references and excludes type positions and shadowed parameter symbols.
- Nx typechecks pass for all six changed projects: Schema, Core, Frontend, System Worker, Dev Worker, and Dispatch Worker. Focused Core tests pass 116 cases, Schema passes 54, and Dispatch passes 3; Dev Worker's test target reports no test files. The aggregate excess-property regression test proves the refactor preserves rejection of additional authored fields.
- Worker Node tests: 257 passed, 26 failed. Frontend: 21 passed, 19 failed. Exact failure-name comparisons show no differences from PR 25. Nine Workerd tests pass across actor snapshots, selected reconciliation, and pinned-service cold recovery. No production acceptance or Shopping browser verification is claimed.
- Changed files are formatted; scoped lint reports no errors, with existing warnings. `git diff --check` passes. No runtime compatibility path or cast was added.
