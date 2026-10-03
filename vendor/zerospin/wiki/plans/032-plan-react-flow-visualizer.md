# React Flow architecture visualizer

Implement the approved interactive walkthrough in the root `visualizer/` package.
The current Shopping addToCart route is service-owned. The aggregate purchase,
payment intent and asyncCompletePurchase contract are illustrative fixtures.

## Agreed behavior

1. Show every current Repo/Chain schema on one React Flow canvas, grouped by
   owner with field relationships, sessions, Node, websockets, access APIs,
   authored owners/actors/contracts, and an illustrative payment provider.
2. Provide search, filters, minimap, zoom, table rows/diffs, and contract details.
3. Deterministically play, pause, reverse, reset, and scrub atomic fixture steps.
4. Trace actual addToCart optimism, mapping, durable delivery, reconciliation,
   and missing-product rejection.
5. Trace illustrative aggregate purchase staging/admission, mapped parent
   transaction, independent publication/production, provider retry with stable
   idempotency, recorded observation, private continuation, and socket replay.
6. Preserve Shopping and worker WIP. No production contracts, external provider
   calls, storage migrations, or live-inspection endpoints are introduced.

## Implementation and verification

1. Add a private React/Vite/TypeScript package with @xyflow/react and package
   scripts registered through existing pnpm/Nx conventions.
2. Capture current schema descriptors and source references in browser-safe
   checked-in metadata; use separately labelled illustrative fixture models.
3. Implement the canvas, inspectors, timeline, and fixture playback tests.
4. Run scoped Nx build, typecheck, lint, test and format checks.
5. Inspect only the standalone visualizer in the browser, including resizing,
   controls, relationships, keyboard access, and reduced motion.
6. Document startup and fixture provenance. Reconcile glossary terminology only
   if implementation introduces new domain terms. No ADR is expected for this
   reversible standalone demonstration. Archive this plan after verification.

## Remaining work

1. App implementation, metadata capture, scenarios, documentation and all
   verification remain pending.
