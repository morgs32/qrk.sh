# 006 — Frontend Index Rename Implementation Plan

## Summary

1. Rename the existing numeric, incrementing `syncCursor` field to `frontendIndex` across FrontendRepo, FrontendBlockRepo, browser session state, schemas, fixtures, and documentation.
2. Preserve behavior exactly: FrontendRepo initializes the index to `0`, each emitted frontend block increments it once, and browser consumers use it for ordering and duplicate suppression.
3. Add no `frontendCursor`, compatibility field, fallback read, data migration, helper, wrapper, export, or named type.

## Implementation

1. Rename the core frontend contracts and session storage fields.
   1. Rename `IFrontendBlock.syncCursor`, `IFrontendState.syncCursor`, and both initialized and uninitialized session-state fields to `frontendIndex` without changing their existing number/null shapes.
   2. Rename the field in `FrontendBlockSchema` and the SharedWorker metadata table.
   3. Remove the stale `coreAbbreviations.syncCursor` entry; `frontendIndex` is numeric and has no cursor abbreviation.

2. Rename FrontendRepo persistence and block production.
   1. Rename `SYNC_CURSOR_KV_KEY` to `FRONTEND_INDEX_KV_KEY` and its stored key from `syncCursor` to `frontendIndex`.
   2. Initialize the FrontendRepo value to `0`, increment it once for each accepted actor block, and emit the incremented value on `IFrontendBlock`.
   3. Rename the FrontendRepo frontend-block outbox column and every insert, ordering, lookup, update, and error-path reference to `frontendIndex`.
   4. Return `frontendIndex` from `getFrontendState` with the existing `0` fallback.

3. Rename FrontendBlockRepo archive and websocket ordering.
   1. Rename the archive column to `frontendIndex`.
   2. Sort, deduplicate, insert, and broadcast frontend blocks by `frontendIndex` with no behavior change.

4. Rename browser and frontend-package consumers.
   1. Rename bootstrap locals and initialized store writes to `frontendIndex`.
   2. Compare websocket blocks against `currentState.frontendIndex`, ignore duplicate or older indexes, and advance the store after applying a newer block.
   3. Rename every mock, fixture, assertion, and example state literal across core, frontend, React, DevTools, dispatch-worker, and Shopping.

5. Synchronize documentation.
   1. Update `wiki/architecture/Blockchain.md`, `wiki/architecture/FrontendApi.md`, `wiki/architecture/bootstrapBrowserSession.md`, and `wiki/glossary.md` to use `frontendIndex` and describe it as the FrontendRepo-owned numeric ordering watermark.
   2. Refresh affected architecture source hashes, citations, and `wiki/log.md` through the architecture-doc workflow.

## Testing and Verification

1. Use the existing FrontendRepo workerd seam to prove bootstrap returns `frontendIndex: 0`, successive convergence blocks receive increasing indexes, and outbox/archive delivery remains ordered and idempotent.
2. Use the existing React bootstrap and websocket tests to prove the initialized store receives the frontend index, duplicate or older blocks are ignored, and newer blocks advance the index after application.
3. Run affected TypeScript, lint, and unit targets through Nx.

   ```text
   nx run-many -t ts,lint,test -p @zerospin/core,@zerospin/frontend,@zerospin/react,@zerospin/devtools,@zerospin/dispatch-worker,system-worker,shopping
   ```

4. Run the focused Worker suites.

   ```text
   nx run system-worker:test:workerd
   nx run shopping:test:workerd
   ```

5. Verify the old term is absent from active code and documentation, then check the diff.

   ```text
   rg -n '\bsyncCursor\b' packages examples wiki
   git diff --check
   ```

6. After implementation and verification are complete, move this plan unchanged to `.plans/archived/006-plan-frontend-index-rename.md`.

## Guardrails

1. The Shopping local Wrangler state was explicitly wiped before this plan; do not repopulate it or run seeds as part of this work.
2. Do not preserve or read persisted `syncCursor` keys or columns. Existing state must be recreated under the renamed schema rather than supported through a compatibility path.
3. Preserve full command objects, pushed-command rebasing, account watermarks, websocket payload structure apart from the field rename, and all existing error/deferred delivery behavior.
4. Add no `ALLOWED_CAST`, `as const`, abstraction, named type, loop, barrel, re-export, dependency, or unrelated cleanup.
