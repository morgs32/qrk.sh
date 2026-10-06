# Agent selections browser and row command forms

**Date:** 2026-10-03
**Status:** Completed and verified; archived.

## Approved behavior

1. Render declared agent selections in Studio's compact table browser, with breadcrumbs, selection sidebar, typed column headers, row numbers and one responsive inspector panel.
2. Adopt actor-style `db` and prebuilt `selections` in `makeAgentSession`, replacing `models` and the single `query` declaration. Retain all runtime models needed by ordinary contracts.
3. Declare row commands once through `makeAgentContract({ contractVersion, model, bind })` in the agent's `contracts` record. Preserve canonical contract identity while deriving ordinary callable contracts and display bindings.
4. Validate canonical bindings, selection membership and field names during cold construction and System composition. Type-check decoded payload-to-row assignments; serialize selection and binding metadata.
5. Display action buttons for each selected model. Open fixed row bindings and generated editable payload inputs in the inspector. Reuse `ShapeForm` and its compiled styles.
6. Preserve drafts during live updates. Reset on row, command, selection or session changes. Disable missing-row submissions while retaining command outcomes. Resolve current row bindings immediately before ordinary staging.
7. Preserve session connection, recovery, delivery, confirmation, rejection and disposal behavior. Let ordinary contracts enforce business eligibility; remove the provider-state heuristic.
8. Remove superseded single-query declarations, rendering and in-scope callers without compatibility code.

## Implementation

1. Extend core/browser declarations, normalized contracts, System composition/manifest and Shopping's paid-purchase/all-purchase-item selections. Export browser-safe authoring helpers.
2. Extend `ShapeForm` with optional partial initial values, descriptor defaults, blank drafts, disabled controls/submission and empty-shape submission. Preserve async codecs and complete payload validation.
3. Reuse the existing live-query structural executor for captured selections and subscribe to selection model dependencies.
4. Extract cohesive shared Studio table-browser presentation. Keep Repo fetching and agent session lifetime/data ownership in their existing callers.
5. Replace agent radio selection and JSON payload editors with model row actions and the command inspector. Show staged, pushed, confirmed and rejected command outcomes.
6. Update affected documentation and implemented glossary terms after verification; archive this plan when no work remains.

## Verification

1. Declaration/type fixtures: valid and invalid bindings, field compatibility, canonical object identity, selected model membership, cold imports and manifest round trips.
2. Browser fixtures: actor-style selection filtering and model dependencies, Date/JSON binding, optimistic staging, authoritative rejection, recovery and disposal.
3. Form tests: partial initial values, defaults, disabled submission, empty shapes and existing primitive/codec behavior.
4. Independent Studio fixture: selection switching/filtering, action placement, fixed bindings, draft preservation, row disappearance, command statuses, reconnect and responsive layout.
5. Scoped Nx typechecks/lint, agent checks, React form tests/package checks, Studio preview build, and Shopping cold-import/build checks. No browser-driven Shopping verification.

## Implementation and verification record

1. Replaced agent `models`/single `query` declarations with `db`/`selections`, preserving actor selection capture/serialization and all declared execution models. Removed the old query schema and renderer. Shopping declares paid purchases and all purchase items.
2. Implemented typed `makeAgentContract` wrappers, normalized ordinary contracts and separate frozen display bindings. Core fixtures verify invalid names, incompatible decoded types, canonical model/contract identity, selection membership, manifest round trips and unchanged canonical contracts. System also rejects substituted captured executors/dependency maps and binding metadata that attempts to override the ordinary contract.
3. Extracted the existing Studio table browser for both repo and agent views. Implemented ordered selections, typed headers, row numbers, model row actions, JSON inspection, current-row bindings, shared forms, explicit refresh and live subscriptions to captured model dependencies.
4. Added optional partial ShapeForm seeds, descriptor defaults, blank drafts, disabled fields/submission, empty-shape submission and asynchronous lifetime fencing. All 38 React form tests pass, including primitive behavior, async codecs, field errors, null controls, failed drafts, disabled changes and unmount/key replacement during decoding. The live-query adapter retains result types in compile-only fixtures.
5. Normalized agent snapshots, recovered outcomes and live output through canonical resource/table codecs before SQLite insertion. Node and independent UI fixtures verify custom Date and JSON fields; journal serialization preserves the received wire values. Ordinary aggregate runtime code remains unchanged.
6. Scoped Nx typechecks, lint, library builds and core/browser/Shopping agent checks pass. Shopping cold-import checks and application build pass. Studio preview build and React primitives packaging/CSS checks pass. Existing React build-script lint warnings and Nx Cloud access failure (401) do not fail the local task graph. Concurrent Shopping Workerd configuration changes were preserved; its final typecheck passes.
7. The independent Studio fixture passes 31 checks covering declarations, live/relational updates, switching, fixed bindings, draft retention, Date/JSON payloads, empty editable shapes, local/authoritative rejection, row disappearance, recovery, unchanged retry, disposal, initialization failure and empty selections. No browser-driven Shopping verification was performed.
8. Inspected the independent interactive fixture at 1440 × 900 and 390 × 844. Table overflow remains within its own scroller; the responsive inspector moves below the grid on mobile. Editable drafts survive both orientation changes and confirmation, and submission re-enables after delivery resolves.
9. Updated Studio/React documentation, authored-system architecture and glossary. Scoped formatting/diff checks pass; no superseded single-query or `rowCommands` references remain in active source/docs. Preserved concurrent WIP.

## Remaining work

None.
