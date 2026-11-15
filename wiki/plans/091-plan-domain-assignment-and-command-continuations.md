# Domain assignment and recorded command continuations

## Problem and scope

Zerospin's recorded command operations currently deliver a frozen destination command until admission, then acknowledge the outbox item without returning its execution outcome. QRK needs to create a Site, request a globally unique address from Domains, and save the result on the Site without waiting for another owner inside the creation transaction.

Add result-bearing command operations, server-only contract extensions, and a framework-triggered continuation-failure contract in the sibling Zerospin source. Use them for QRK's Site address assignment. This is local development work; production deployment is out of scope. This plan supersedes the username/slug hostname resolution in [Plan 090](./090-plan-local-published-pages.md), but does not replace its publication, rendering, or verification requirements.

## Agreed behavior

1. A creator must have a saved QRK username before creating a Site. Treat provisioning and changing QRK-owned usernames as a prerequisite, not as a Clerk-username fallback. The Site is created without a user-supplied slug and starts unpublished.
2. At Site creation, Domains assigns and reserves the complete hostname `<username>-<six lowercase letters or digits>`. Its suffix is derived from the Site identity; handle collisions by choosing another candidate. The Domains Service enforces global hostname uniqueness and one stable assignment per Site. Repeating the same assignment returns the existing address. The address survives username changes, unpublish, and republish.
3. The User aggregate records `Domains.assignDomain` from a server-only extension of `createSite`. The shared command's model operations are applied before its extension runs, inside one source-owner transaction. The Site and the frozen command operation commit atomically; delivery and destination execution happen independently after commit. Do not run network requests in that transaction.
4. A recorded command operation has an optional continuation. Every admitted destination command outcome is retained in framework history, associated with its source operation, whether or not a continuation is configured. Run the continuation when that destination command finishes, without waiting for downstream work. It is a separate framework-triggered, claims-free command in the originating owner, bound to the originating owner release. Admission failures remain separate and do not invoke the outcome continuation.
5. A final Domains failure reaches the User continuation, which creates a `SiteFailure`. A final continuation failure triggers an authored, claims-free failure-handling contract that creates a `SiteFailure`. If that failure handler fails, retain its failure in framework history without recursively invoking a failure handler. A storage or infrastructure failure may prevent creation of the application row; do not claim otherwise.
6. Do not add a creator Retry button, current-attempt property, attempt counter, Node-history UI query, or business retry policy. A known final failure is displayed from `SiteFailure`; automatic recovery of the business action is deferred. When delivery is interrupted and admission is uncertain, recover the **same** recorded command ID. Do not restage it as a new business attempt.
7. `isPublished` remains the publication control. Reserving an address does not publish the Site. Web must resolve the saved mapping and serve only the current published Page snapshot; a request beginning after unpublish commits must not serve it. Keep public Web reads server-only and scoped to the fields needed for rendering.

## Annotated flow

```ts
// Illustrative proposed API, not an existing Zerospin declaration.
const extension = makeAggregateContractExtension(createSiteVNext, {
  operations: {
    assignDomain: makeCommandOperation({
      destination: { service: Domains, version: 1 },
      contract: assignDomainV1,
      continuation: assignDomainContinuationV1,
    }),
  },
  program: Effect.fn(function* (props) {
    const { operations, payload } = props;
    // Read the saved username from the User aggregate, not from the client.
    // Record the destination input and continuation's Site ID together.
    yield* operations.assignDomain(/* siteId, userId, username */);
  }),
});
```

```ts
// The continuation sees the destination's final result, not admission.
if (outcome.result._tag === 'Failure') {
  // Create SiteFailure with stage 'domains'.
} else {
  // Save outcome.result.success.domain on the Site.
}

// If the continuation itself finally fails, Zerospin triggers the
// registered failure-handling contract with siteId and the failure.
// That contract uses SiteFailure.operations.create.
```

Example: `createSite` for `site_A` commits a frozen command for Domains. Domains assigns `morgs32-a7b2c3`; its successful outcome triggers the User continuation, which stores the hostname. The address remains reserved if the Site is unpublished. If Domains returns a final refusal, the continuation creates a failure row instead. If the continuation fails, the failure-handling contract attempts to create a separate row.

## Implementation

1. Recheck both repositories' current declarations, uncommitted work, releases, storage, and plan numbers. The username prerequisite is not implemented merely by the nullable, per-aggregate unique User field; establish an authorized QRK-owned username before integrating this flow. If that prerequisite is unavailable, report the blocker rather than using Clerk as a substitute or building an unapproved identity system.
2. In Zerospin, extend `makeCommandOperation` and its typed declarations for the optional exact-release continuation. Retain the destination's success or final failure against the original operation even with no continuation. Freeze source/destination identity, destination release, continuation declaration, and input once. Retain an outcome before capacity-dependent continuation admission; recover each handoff without generating another destination command or running another continuation for the same observation. Preserve separate command and external-work outboxes.
3. Replace the current earliest-first admission bottleneck with independently delivered operations as agreed. Redesign and prove destination deduplication and source acknowledgement rather than relying on a contiguous ordered producer checkpoint. Keep distinct admission failures out of the continuation; do not retry final business outcomes. Do not block source transactions on another owner or confuse destination completion with completion of its downstream work.
4. Add the User-release-bound `makeAggregateContractExtension` mechanism. Run shared operations, then extension evaluation and operations, within a single source transaction; keep each program's collect-then-apply behavior. Register extensions on the server, with no new frontend-visible contract or operation. Preserve the source contract's version and adapter semantics; replay must not send outbound work again. Define how a new release replays the extension's model effects without allocating or dispatching new external work.
5. Add framework-triggered, release-bound failure-handling contracts for final continuation failures, including the existing external-continuation family where applicable. Preserve the failed continuation outcome and durably hand off the handler with the Site ID and failure; recover uncertain handoff with the same identity. Never run a failure handler for a still-unknown outcome. If handler execution fails, retain that fact without an infinite failure chain.
6. Implement Domains and its globally unique mapping using the actual current model, SQLite, and operation APIs. Use a stable six-character lowercase-alphanumeric candidate derivation with deterministic collision handling and a bounded failure path. Confirm username and DNS-label constraints, assignment ownership, same-Site idempotency, and the actual unique constraint. Do not assume random values or IDs generated during program evaluation are stable across fresh-release replay.
7. Evolve User/Site and add the SiteFailure model, source extension, continuation, and failure-handling contract. Use `makeId(SiteFailure)` only after verifying that differing failure-row identities are safe across release projection, optimistic reconciliation, and every reference. If the check fails, stop and resolve the identity guarantee rather than shipping a cross-release mismatch. Apply the same analysis to Domain identity and address selection.
8. Update the local published-page path to resolve the exact hostname through Domains using the existing trusted Web System API, then read the identified User's current published Site and Page snapshot. Preserve Plan 090's no-cache, pointer-recheck, unpublish, server-rendering, responsive Wall, and interactive-Brick behavior. Validate the hostname and preserve base-host routes and authentication. Do not add a separate publishing system or production configuration.
9. Register candidate owner releases and evolve actor and session declarations through their existing upgrade paths. Preserve every existing registry entry and canonical selection. Produce retained-history, candidate catch-up, and publication evidence with the exact proposed promotion edit; the user personally handwrites any canonical or removal changes. Do not reset storage.
10. Update the relevant Zerospin SDK guidance and QRK documentation, reconcile the glossary, and add an ADR only if the implemented decision meets repository criteria. Release the framework upstream and update QRK's exact dependency pins before consumer verification. Archive this plan only after the required checks; ask the day's manual-verification choice at implementation time if it has not been recorded.

## Verification

1. Use focused Zerospin tests for successful and failed destination outcomes, optional continuation, exact owner release, claims-free authority, no wait for downstream work, independent delivery, reordered admission, and admission failures distinct from final outcomes. Exercise both aggregate and service destinations.
2. Test interruption after source commit, uncertain destination admission, lost acknowledgement, outcome retained before continuation admission, restart, duplicate delivery, and recovery with the same IDs. Verify one final destination outcome and at most one continuation per operation, and no new outbound work during replay. Check backpressure and recovery without holding a source-owner transaction across network work.
3. Test rollback and atomicity of shared operations and extension; extension visibility of the shared Site; no extension work on failed source command; continuation final failure; successful and failed failure-handler commands; retained history; and absence of recursive error handling. Test the external-continuation failure path as applicable.
4. Test username-required Site creation, hostname constraints, global uniqueness, candidate collisions, same-Site idempotency, existing assignments, username changes, and unpublish/republish. Exercise parallel-release replay, address and ID consistency, and failure rows with actual registered models and releases. Include source and destination outcome differences across releases.
5. Verify the local Web reader serves only the resolved Site's current published snapshot and stops serving new requests after unpublication. Preserve existing tests for the two-read pointer race, responsive rendering, and Brick initialization. Run the relevant Bricks, backend, App, Web, and upstream framework checks; distinguish harness results from real local delivery and browser evidence. The manual-verification choice is not yet recorded for 2026-11-15.

## References and planned files

- [Recorded-command continuation research](../research/zerospin-recorded-command-continuations.md), [server domain generation](../research/zerospin-server-domain-generation.md), and [QRK-owned usernames](../research/qrk-owned-usernames.md) document current behavior and evidence limits; earlier proposed hostname examples in those notes are historical.
- [Current command-operation preparation](../../../zerospin/packages/core/src/contracts/prepareCommandOperation.ts), [delivery queue](../../../zerospin/packages/system-worker/src/commandOperations/makeCommandDeliveryQueue.ts), and [external outcome admission](../../../zerospin/packages/system-worker/src/AggregateChain/recordExternalOutcomeAndAdmitCommandTx.ts) identify the existing durability boundaries.
- Expected implementation areas: sibling `zerospin/packages/core`, `packages/system-worker`, `packages/sdk`, and their tests; QRK `apps/zerospin`, `apps/bricks` model declarations, `apps/app`, `apps/web`, and dependency pins. Recheck exact files and versions before implementation.
