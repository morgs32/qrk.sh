# Flow architecture view

Implement the approved interactive walkthrough in the root `flow/` package.
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
5. Inspect only the standalone flow app in the browser, including resizing,
   controls, relationships, keyboard access, and reduced motion.
6. Document startup and fixture provenance. Reconcile glossary terminology only
   if implementation introduces new domain terms. No ADR is expected for this
   reversible standalone demonstration. Archive this plan after verification.

## Outcome

Completed 2026-10-02. The standalone pnpm/Nx package contains a React Flow
canvas covering all 12 production classes, 96 concrete table instances and
870 columns, plus sessions, Node, entrypoints, sockets, owners, actors and
contracts. Source metadata is checked in and captured without importing worker
implementations into the browser.

Six deterministic walkthroughs cover cart reconciliation/rejection and
illustrative purchase success, decline, response-loss recovery and reconnect
replay. Contract inspectors connect original programs and server mappings.
Playback exposes complete atomic batches, retained async evidence, separate
parent/continuation outcomes, and durable delivery acknowledgements.

Verification completed:

1. Scoped Nx build, typecheck, lint, test and format checks pass. All 11 focused
   playback tests pass. Nx Cloud reports an unrelated access error after the
   successful local checks.
2. Current-source recapture matches all 66 schema declarations. Metadata and
   scenario checks found no missing graph/source identities, undeclared row
   fields, duplicate nodes or missing mappings.
3. Chrome verification covered table/column readability, declared field
   connections, search, owner/connection filters, table rows/diffs, mapping
   navigation, play/pause, reverse/reset, timeline scrubbing, zoom/fit/minimap,
   keyboard controls and reduced motion. Layouts at 1440×900, 900×720 and
   390×844 have no horizontal page overflow. Temporary browser emulation is
   cleared after verification. Shopping received no browser verification.

Startup and fixture provenance are documented in the flow README.
No new domain terms or governing architectural decisions were introduced, so
no glossary or ADR changes were needed. Production Shopping and worker
definitions remain outside this implementation's write scope.

## Remaining work

None.
