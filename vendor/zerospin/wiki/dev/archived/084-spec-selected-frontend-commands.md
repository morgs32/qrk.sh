# Selected frontend commands design

**Date:** 2026-09-20
**Status:** Implemented

## Problem Statement

Frontend histories currently expose server execution machinery, inconsistent
command shapes, and obsolete finalized, state, and sync terminology. Aggregate
delivery leaks `AggregateExecutionEntry`; service delivery exposes a complete
chained service command even though the browser only needs its selected effect.

The frontend seam must represent each retained history row as a new, minimal
selected-command occurrence. It must preserve contiguous selection, snapshot
recovery, pending-command reconciliation, private failure delivery, and hash
checkpoints without forwarding source payloads or execution metadata.

## Solution

Selection creates a derived command occurrence rather than forwarding or
redacting the admitted or executed source command. Aggregate and service
frontends receive domain-specific selected commands containing only an opaque
command identity, their exact history positions and hashes, and a minimal
frontend delta. Aggregate command failure is visible only to the exact
originating frontend.

## User Stories

1. As an aggregate frontend, I receive only the selected command fields needed
   to advance my replica and reconcile local optimism.
2. As a service frontend, I receive only the selected service delta, position,
   identity, and service-history checkpoint.
3. As a reconnecting aggregate frontend, I can request selected outcomes for
   local pending commands that completed before my snapshot cursor.
4. As a frontend receiving another origin's command, I can apply its selected
   delta without receiving its payload, authentication, provenance, or failure.
5. As a browser session, I can restore a snapshot and then apply buffered
   selected commands without losing concurrent updates.
6. As an operator, I can distinguish aggregate disposition history, service
   disposition history, and selected frontend history by their existing hash
   names and algorithms.

## Implementation Decisions

1. Add `IAggregateSelectedCommand`, `IServiceSelectedCommand`, and matching
   schemas. Delete the superseded frontend finalized-command types and schemas
   without aliases.
2. Keep `IFrontendDelta`, but hard-cut its shape to `upserted` complete
   resources and `deleted` refs. Applied mutation journals and the
   inserted-versus-updated classification remain internal.
3. Keep aggregate `dispositionHash`, `serviceHash`, and `selectionHash` as
   distinct commitments. `selectionHash` continues hashing the tuple
   `[previousSelectionHash, selectionIndex, underlyingCommandId, disposition]`.
4. Browsers persist hashes as resume checkpoints but do not recompute them,
   because another origin's true failure disposition may be hidden.
5. SelectionVAC privately retains nullable originating `authentication` and
   `frontendName` beside each aggregate selected command. Exact equality
   controls failure disclosure and snapshot reconciliation. Service-derived
   entries have no completion owner.
6. Rename complete-state contracts and schemas to
   `IAggregateFrontendSnapshot` and `IServiceFrontendSnapshot`. Aggregate
   snapshots contain aggregate/authentication/frontend identity, version,
   `aggregateIndex`, `selectionIndex`, `selectionHash`, complete resources, and
   `selectedCommands` matching the requested `pendingCommandIds`.
7. Service snapshots retain authentication, service/frontend identity,
   service version, `serviceIndex`, `serviceHash`, and complete resources.
8. Remove `systemId` from snapshots, browser session state, bootstrap results,
   offline locators, mocks, and standalone-session parity. Backend capability
   routing continues using `systemId` internally.
9. Rename public frontend RPCs to `getSnapshot` and `getSelectedCommands`.
   Aggregate `getSnapshot` accepts `{ pendingCommandIds }`; service
   `getSnapshot` has no pending-command argument.
10. Populate `pendingCommandIds` from restored local commands whose optimistic
    mutation rows remain unresolved. SelectionVAC returns only exact-owner
    matches through the captured snapshot `selectionIndex`.
11. Snapshot installation uses selected matches only to complete journal rows,
    remove optimism, and record aggregate position or failure. It must not
    apply their deltas because `snapshot.resources` already incorporates them.
12. Browser command-journal rows retain locally authored command fields. On
    completion, their outcome JSON becomes the matching
    `IAggregateSelectedCommand`; the browser does not reconstruct an
    `AggregateChainedCommand`.
13. Rename application procedures to `applyAggregateSelectedCommand`,
    `applyServiceSelectedCommand`, `applyAggregateFrontendSnapshot`, and
    `applyServiceFrontendSnapshot`, including their transaction procedures and
    parameters.
14. Aggregate and service WebSockets send `{ type:
    'aggregateSelectedCommand', command }` and `{ type:
    'serviceSelectedCommand', command }` respectively.
15. Rename replay locals to `bufferedSelectedCommands`. Install the snapshot
    first, then apply buffered commands contiguously before switching to direct
    live delivery.
16. Rename frontend-chain storage tables to `commands`; producing
    outboxes/accessors to `selectedCommands`; receivers to
    `receiveSelectedCommands`; and retained-history methods to
    `getSelectedCommands`.
17. Replace frontend-flow finalized terminology with selected terminology in
    symbols, messages, errors, tests, comments, glossary entries, and
    architecture documentation. Upstream terminal histories retain their own
    terminology.
18. Repository guidance must distinguish source admission and execution paths,
    which preserve complete commands, from selection, which creates a distinct
    minimal selected-command occurrence.
19. Architecture prose and Mermaid workflows must show
    `frontendApi.getSnapshot({ pendingCommandIds })`, domain-specific selected
    WebSocket delivery, buffering through `replay-complete`, and snapshot
    installation followed by `bufferedSelectedCommands`.
20. Implement this as a pre-release hard cutover. Changed fixed Durable Object
    and browser schemas require empty disposable local and test state. Add no
    compatibility fields, fallback decoders, aliases, or migrations, and never
    reset shared or production-like state without explicit approval.

## Testing Decisions

1. Use SelectionVAC and FrontendServiceChain Workerd suites as the server
   acceptance seam for command persistence, exact retries, contiguous replay,
   new message envelopes, private failure filtering, pending-ID ownership, and
   resume-hash mismatches.
2. Use `frontendPrograms.node.spec.ts` as the browser acceptance seam for
   snapshot requests, atomic installation, selected-command reconciliation,
   buffering, duplicate handling, and live transition.
3. Update focused schema and application tests to reject old frontend shapes
   and verify minimal deltas and selected commands.
4. Verify aggregate selected history advances `selectionIndex` and
   `selectionHash` for aggregate success, aggregate failure, other-frontend
   commands, and service-derived commands while service-derived entries retain
   the aggregate watermark.
5. Verify service selected commands expose no source payload, failure, mutation
   journal, or repeated service version while preserving `serviceIndex` and
   `serviceHash`.
6. Verify snapshot-selected deltas are not applied twice, unmatched optimism
   survives, matched optimism is removed, and own authoritative failures remain
   inspectable.
7. Verify no frontend or session persistence or public type retains
   `systemId`.
8. Run affected Core, frontend, React, system-worker, SDK, dev-worker,
   production-worker, and Shopping Nx validation targets plus
   `git diff --check`.

## Out of Scope

1. Changing aggregate or service disposition-hash algorithms.
2. Renaming SelectionVAR, SelectionVAC, FrontendServiceChain, or other topology
   owners.
3. Removing internal `AggregateExecutionEntry` or `ServiceExecutionEntry`.
4. Changing command admission, authored execution, or source-chain ordering.
5. Resetting shared, remote, or production-like storage.

## Further Notes

1. Aggregate `aggregateIndex` remains the latest incorporated aggregate
   watermark and may remain unchanged across service-derived selected commands.
2. Empty deltas still produce selected commands and advance the relevant
   selected history.
3. A selected command always exposes its opaque `id`; command name, payload,
   provenance, mutations, preparation version, and execution timestamp never
   cross this seam.
