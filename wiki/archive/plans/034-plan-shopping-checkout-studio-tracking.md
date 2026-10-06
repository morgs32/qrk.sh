# Shopping checkout and Studio tracking sessions

**Date:** 2026-10-02
**Status:** Completed and verified; archived.

## Goal and agreed behavior

1. Shopping Checkout consumes the authoritative cart into a pending per-user purchase. Payment success makes the purchase completed; decline retains its items and leaves the cart empty.
2. Studio opens a transient admin session. The operator's `createTrackingLabel` and `updateTrackingInfo` buttons run ordinary contracts locally and push the same committed command through the existing session protocol.
3. `makeAgentSession` is the sole agent constructor. Browser-safe `agents.ts` exports cold sessions and is imported by the System and Studio. Use one full-view, system-only admin actor per aggregate, without an actor per agent or special action declarations.
4. Example providers supply payment and tracking evidence. Tracking changes remain separate from payment. Paid purchases remain visible. No real provider, automatic refresh/shipment, durable agent runner, SharedWorker/backup acquisition for Studio, or subscription restoration.
5. [ADR 001](../../adrs/001-async-replay-retains-output-without-production.md) governs original-only async production and immutable observations. Changed fixed schemas require empty disposable storage and no compatibility paths.

## Implementation

1. Replace `makeAgent` with a cold, typed `makeAgentSession` exposing the existing core aggregate-session object and definition/query. Keep one session per file. Construction acquires no runtime, SQLite connection or stream; initialize/dispose own those resources and support selection replacement.
2. Validate registered aggregate/admin actor versions, canonical full-view models, claims, query, and ordinary/mapped-original contract bindings during System composition. Serialize descriptors in the manifest; import executable sessions through conventional project-root `agents.ts` in Studio. Keep server-only authentication, mappings and providers outside that browser import graph.
3. Replace preview-only bootstrap with bounded admin-session bootstrap. Server resolves the declaration and exact lock; Studio retains the secret. Exclude private async contracts from the ticket. Preserve rejection of system-only actors by ordinary application authentication.
4. Use core staging, in-memory session journal, optimistic inverses/replay and authoritative reconciliation. Retain a stable client identity and submission positions while the view is open. Recover command outcomes before settling optimism; reconnect retries the unchanged command. Dispose/reinitialize fence late callbacks. No durable Node is acquired.
5. Load ordinary contract controls for selected purchases. Each button stages and then pushes. Show local/delivery/provider pending states and errors, prevent duplicate UI submissions, disable new staging during recovery, retain rows, and observe committed stream updates.
6. Add a same-origin Shopping app-worker Checkout endpoint verifying Clerk. Accept only cart ID and stable nonce; derive command and purchase identities. Wait for existing cart edits to settle, retaining the nonce after uncertain delivery.
7. Execute marketplace checkout with verified shopper claims. Freeze authoritative item/name/price/quantity snapshots, delete the exact consumed cart-item rows, and append `asyncCreatePurchase` in one synchronous transaction. Retain the quote in the existing immutable async emission, with no extra quote table or outbox. Later cart additions are independent.
8. Deliver the same complete deterministic `createPurchase` command through the existing administrative command path, using a Shopping-local worker delivery seam. Atomically create purchase/items and emit payment work. Register each exact mapped/async definition on its owner and originating actor.
9. Retain payment `pending | paid | declined` and authoritative evidence, with prices in displayed USD units. The example provider normally succeeds; fixtures cover decline and interrupted-effect reconciliation. Decline does not restore the cart.
10. `createTrackingLabel({ purchaseId })` requires payment success, reserves work once, and records deterministic example label/tracking evidence. Repeated/concurrent requests reuse pending work or the existing label. Label creation does not mark shipment.
11. `updateTrackingInfo({ purchaseId })` requires a ready label. Reserve a refresh sequence, coalesce concurrent pending refreshes, freeze provider inputs, and validate the label/sequence before applying the immutable observation. Example refresh 1 reports `in_transit`; refresh 2 onward reports `delivered`. Provider failures use durable retries and stable business keys.

## Verification and documentation

1. Extend Shopping contract/SQLite fixtures for authoritative quoting, ownership, atomic rollback, unchanged checkout/delivery retries, immutable snapshots, payment evidence, tracking preconditions, idempotence/concurrency, stale observations and two-user isolation.
2. Extend Workerd restart seams for interruption after parent commit and remote effect, unchanged provider keys/command envelopes, one payment/label effect, private continuation admission and production-free replay.
3. Extend independent Studio fixtures for real ordinary optimistic staging, push messages, authoritative failure/success, reconnect outcome recovery, selection replacement, disposal and zero durable/browser-worker acquisition. Shopping browser verification remains prohibited by its AGENTS.md.
4. Verify cold config/agents imports in Node and Workerd builds. Run scoped Nx typing/lint/builds, Shopping marketplace/session checks, affected core/browser fixtures, worker async/staging checks and the independent Studio UI fixture, preserving dependencies and unrelated WIP.
5. Reconcile Shopping/Studio READMEs, glossary and affected architecture references with implemented behavior. Add an ADR only if the implemented choice meets all repository criteria.
6. Reset only disposable storage for changed schemas; establish worker readiness and System acceptance, run Shopping and Studio against the local backend, and supply two registered aggregates with persisted command-created purchases through allowed non-browser seams.
7. Preserve concurrent `flow/` and completed plan 032/033 work. Archive this plan and [the pickup handoff](../handoffs/2026-10-02-handoff-shopping-fulfillment-studio.md) only after implementation and required verification finish; repair links.

## Implementation and verification record

1. Implemented the cold ordinary session constructor and hard cutover, full-view system-only admin actor validation, bounded bootstrap/outcome recovery and existing WebSocket command delivery. Removed the separate `makeAgent` and preview bootstrap APIs.
2. Implemented same-origin verified checkout, transactional cart consumption and immutable transfer, per-user purchases/payment evidence and both manual tracking commands/providers.
3. Shopping marketplace, checkout endpoint, fulfillment SQLite and Node cold-import fixtures pass. The endpoint fixture verifies signed Clerk tokens, origin/body boundaries and an unchanged complete command after response loss.
4. Core composition/outcome and worker contract/async/staging/command-history fixtures pass. Browser session fixture passes optimistic staging, rejection, unchanged retries, recovery and lifetime fencing.
5. Independent Studio browser fixture passed 21 assertions, including actual staging/push frames, provider-pending state, recovery, replacement and disposal. No Shopping browser verification was performed.
6. Shopping Workerd payment/label fixtures pass all eight interruption/restart cases: after source commit, unrecorded provider effect, immutable recording and private continuation admission. One business effect, stable child/input and production-free recorded replay are verified.
7. Reset the disposable Shopping backend with `shopping:zerospin:dev --clean`; observed worker readiness and successful System acceptance on port 3005. The real local command path created two registered users (`acct_user_runtime_alice`, `acct_user_runtime_bob`) with persisted paid purchases. Ordinary transient sessions staged/pushed label creation and both refreshes, reaching `delivered`; the frozen total was USD 40 despite a browser quote of USD 1. Studio's broker returned both registered IDs and the exact admin snapshot. These fixtures use no browser.
8. Reconciled Shopping/Studio READMEs, aggregate actor documentation, authored-system architecture and glossary. No new ADR is required: ordinary session delivery reuses the existing boundary and ADR 001 continues to govern retained observations.
9. Dedicated Workerd fixture typing passes without casts. Checkout-transfer restart checks pass after marketplace commit and after loss of the purchase-delivery response, preserving the sole frozen quote, complete command identity, later cart additions and one payment effect.
10. Final seven-project Nx typing/library/application/Studio preview builds and lint pass. Nx Cloud reports its existing access failure (401); the local task graph succeeds.
11. The final focused graph passes all Shopping, core, browser and worker checks, including eight payment/label restart cases, both checkout-transfer restart cases, async replay/private admission, staging, command-history restart and cold imports. Shopping typing/lint/build were rechecked after its final UI identity fence; typing/lint and the actual seed command were rechecked after supplying the required administrative service caller in Shopping's catalog seeds.
12. Shopping is running at `http://localhost:3010`, its backend is ready with the accepted System at `http://127.0.0.1:3005`, and Studio is running at `http://127.0.0.1:5555`. HTTP broker checks after restart confirm both registered aggregates, exact admin snapshots, isolated paid USD 40 purchases, frozen quantity/price, ready labels and delivered tracking. Both carts remain empty. The twelve normal catalog seeds persisted alongside the runtime product. The real app-worker Checkout endpoint rejects unauthenticated requests with 401. Secrets remain server-side and no Shopping browser verification was performed.

## Remaining work

None.
