# Studio aggregate-agent query preview

## Status

Completed and verified. The Shopping typing blocker was resolved by plan 027 and [plan 031](031-plan-shopping-marketplace-cutover.md), which replaced the cart preview with the per-user purchase preview.

## Scope and agreed behavior

1. Add named `makeAgent` declarations to `makeSystem`, binding an exact registered aggregate and dedicated system-only actor version to a serializable model-row query with optional literal Drizzle-style filtering. Validate bindings at composition and include query and projected model metadata in the manifest.
2. Add aggregate actor `authentication: 'system'`. Reject ordinary application admission. Studio uses its existing secret-key server broker to obtain a bounded snapshot and actor-stream ticket; the secret remains server-side and the capability admits no commands.
3. Add a synchronous `makeAgentSession` constructor with explicit initialize/dispose. Use main-thread in-memory SQLite, existing schema primitives and live-query table subscriptions, with no backup, SharedWorker, durable Node, journal, or additional projection Repo/Chain.
4. Apply whole actor deltas and checkpoints atomically. Ignore duplicates, recover gaps or invalid checkpoints with fresh snapshots, reconnect interrupted sockets, and retain rows with visible stale/error status. Session lifetime is the mounted view; disposal and replacement invalidate late callbacks.
5. Navigate aggregate type/version → registered aggregate ID → declared agent. Show binding versions, status, count, update time and model-derived rows with loading/empty/error states.
6. Add a read-only Shopping purchase-item actor and `purchaseItems` agent querying `purchaseItem` where `quantity > 0`, reconciled with plan 031’s per-user purchase aggregate. Defer service attachments, commands, payment processing, durable execution, async contracts and upgrades.

## Implementation and verification

1. Implement declarations, manifests and system-only admission; add assertion fixtures for valid/invalid bindings, manifest serialization and filtering.
2. Implement bounded SystemApi bootstrap and Studio broker with existing actor snapshot/output/WebSocket protocol and aggregate registration discovery.
3. Implement transient client database/session and extend `useLiveQuery` structurally for its store/database.
4. Implement aggregate-first Studio navigation and agent results view, with selection-scoped cleanup.
5. Verify initial snapshot, later updates and race replay, duplicates, gaps, isolation, failure/reconnect, pending initialization disposal and rapid replacement; assert no durable infrastructure acquisition.
6. Exercise live-query and UI states using an independent fixture. Respect Shopping's prohibition on browser-driven verification and check that example by source/types.
7. Run scoped Nx type/lint targets, focused fixtures and Studio build. Preserve unrelated WIP; record external blockers here.
8. Reconcile glossary and relevant docs against implemented behavior; create an ADR only for a decision meeting the repository criteria. Archive after all required work passes.

## Implemented outcome and evidence

1. System declarations/manifest metadata, aggregate-only system authentication, bounded SystemApi/bootstrap broker, transient read-only SQLite/stream sessions, `useLiveQuery`, aggregate-first navigation, and Shopping's `purchaseItems` example (replacing the original cart preview under plan 031) are implemented.
2. `pnpm nx run-many -t ts lint agent-preview:check preview:build -p @zerospin/core @zerospin/browser @zerospin/react @zerospin/studio system-worker` passed. The graph also built/typechecked SDK and the CLI consumers. SDK has no authored `ts`/`lint` target; its `lib` runs TypeScript. An exploratory inferred SDK `tsc:typecheck` stopped at the existing workspace-wide TypeScript-sync gate; no global sync changes were made.
3. Declaration fixtures cover manifest round-trip, exact registration, missing projection models, filter fields/types and system-only application rejection. Session fixtures use real SQLite and cover snapshot-to-stream replay, subsequent updates, duplicates, atomic rollback, gap recovery, disconnect/reconnect, aggregate isolation, late callbacks and disposal during pending initialization. No durable infrastructure is imported/acquired by the preview constructor.
4. The independent `/src/fixtures/agentPreview.html` reported all assertions passed in the browser: loading, initial rows/count, live status, `useLiveQuery` after committed deltas, empty results, stale rows during reconnect, replacement isolation, initialization failure, and no Worker/SharedWorker acquisition. No Shopping browser verification was performed.
5. `shopping:agent-preview:check` passed against the actual Shopping System and manifest; `shopping:lint` passed. Full `shopping:ts` failed in existing `shopperSession.ts:42`: contract operation-sink requirements escape `ExcludeOperationSink` into the caller layer. Agent declaration files produced no type errors.
6. Glossary, AuthoredSystem architecture, actor README and Studio README now describe the implemented behavior. No ADR was added: this transient preview decision does not meet all three ADR criteria. Manifest schema changes follow the pre-release empty-storage policy; no compatibility path was added.
7. Studio browser build passed, including the SQLite WASM asset. Vite's chunk-size notice, Nx Cloud 401 and the existing empty-project-pattern warning did not prevent local validation.

## Final verification under plan 031

1. Shopping's `ts`, `lint`, `build` and adapted `agent-preview:check` passed; the original contract-operation requirement blocker no longer remains. The read-only `purchaseItems` agent uses `user@1.0.0` and `purchaseItemPreview@1.0.0`, filtering `purchaseItem.quantity > 0`. Actual fixture rows verify filtering and purchase snapshot relations.
2. Affected browser/Studio typechecks and lint, Studio `preview:build`, and browser `agent-preview:check` passed with dependencies. The user approved removing Studio's obsolete service-pins section after the framework removed aggregate service pins. No Shopping browser verification occurred. Existing independent UI verification above remains the evidence for the preview UI.
3. Updated the Studio example and Shopping documentation. Formatting, changed documentation links and whitespace checks passed. Nx Cloud 401 and Vite build notices did not prevent local validation.

## Remaining work

None.
