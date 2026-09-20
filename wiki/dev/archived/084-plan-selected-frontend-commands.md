# Plan 084 — Selected frontend commands

**Date:** 2026-09-20
**Status:** Implemented and verified
**Source:** [Spec 084](./084-spec-selected-frontend-commands.md)

## Required outcome

1. Replace every browser-facing finalized-command, execution-entry, state, and
   sync contract with a domain-specific selected-command or snapshot contract.
   Selection creates a new minimal occurrence; it does not redact or mutate the
   complete command occurrences retained by admission and execution histories.
2. Preserve three independent commitments without changing their algorithms:
   aggregate `dispositionHash`, service `serviceHash`, and aggregate-frontend
   `selectionHash`. Browsers persist the appropriate index/hash pair as a resume
   checkpoint and never attempt to recompute a hash whose true failure
   disposition may be private.
3. Preserve contiguous selected-history replay, snapshot replacement,
   optimistic-command reconciliation, exact-owner aggregate failure delivery,
   duplicate handling, and replay-to-live transition across both aggregate and
   service frontend sessions.
4. Remove `systemId` from frontend snapshots, live session state, browser
   persistence locators, standalone-session parity, and mocks. Continue using
   it only inside backend capability routing and Repo identity.
5. Treat the protocol and fixed-schema changes as a pre-release hard cutover.
   Delete superseded names and shapes without aliases, fallback decoders,
   dual paths, or migrations. Do not reset shared, remote, or production-like
   storage; existing disposable local and test state must be recreated before
   reuse.

## 1. Define the selected-command contracts

1. In `packages/core/src/session/types.ts`, define
   `IAggregateSelectedCommand` with only `id`, `selectionIndex`,
   `aggregateIndex`, `delta`, nullable privately deliverable `failure`, and
   `selectionHash`.
2. In `packages/core/src/serviceSession/types.ts`, define
   `IServiceSelectedCommand` with only `id`, `serviceIndex`, `delta`, and
   `serviceHash`; expose no failure or source-command fields.
3. Hard-cut `IFrontendDelta` to complete `upserted` resources and `deleted`
   refs. Keep mutation journals and inserted-versus-updated classification on
   the internal execution side.
4. Replace the old command/state schemas with
   `AggregateSelectedCommandSchema`, `AggregateFrontendSnapshotSchema`,
   `ServiceSelectedCommandSchema`, and `ServiceFrontendSnapshotSchema` in their
   owning session modules. Remove the superseded schema files and exports.
5. Make aggregate snapshots contain their aggregate, authentication, version,
   frontend, `aggregateIndex`, `selectionIndex`, `selectionHash`, complete
   resources, and owner-filtered `selectedCommands`. Make service snapshots
   contain authentication, service/frontend identity, service version,
   `serviceIndex`, `serviceHash`, and complete resources.
6. Add focused schema tests that accept the new minimal shapes and reject old
   execution-entry, finalized-command, state, and mutation-journal fields.

## 2. Produce and retain aggregate selected history

1. In SelectionVAR, derive one `IAggregateSelectedCommand` for every selected
   aggregate or service-derived occurrence, including empty deltas. Advance
   `selectionIndex` and `selectionHash` with the existing tuple
   `[previousSelectionHash, selectionIndex, underlyingCommandId, disposition]`.
2. Preserve `aggregateIndex` as the latest incorporated aggregate watermark;
   service-derived selected commands may advance selection history without
   advancing that watermark.
3. Persist the public selected occurrence separately from nullable originating
   `authentication` and `frontendName`. Do not copy source payload,
   provenance, mutations, preparation version, timestamp, or execution entry
   into the selected occurrence.
4. Rename SelectionVAC storage to `commands`, its producer/outbox surface to
   `selectedCommands`, receiver to `receiveSelectedCommands`, and retained
   reader to `getSelectedCommands`.
5. On delivery and retained reads, disclose `failure` only when both persisted
   owner fields exactly equal the capability-bound authentication and
   `frontendName`. Deliver `failure: null` to every other frontend and for
   service-derived selections.
6. Preserve exact retry and duplicate semantics, contiguous page reads, hash
   mismatch rejection, and the existing aggregate/source execution histories.

## 3. Produce and retain service selected history

1. In FrontendVersionedServiceRepo, derive one `IServiceSelectedCommand` for
   each relevant service history occurrence using only its opaque command ID,
   service position, selected resource delta, and service hash.
2. Rename FrontendServiceChain storage to `commands`, its producer/outbox
   surface to `selectedCommands`, receiver to `receiveSelectedCommands`, and
   retained reader to `getSelectedCommands`.
3. Preserve `serviceIndex` and `serviceHash` contiguity for successful, failed,
   unrelated, and empty-delta source occurrences while exposing no failure,
   source payload, mutation journal, or repeated service version.
4. Keep internal `ServiceExecutionEntry` and service disposition history
   unchanged.

## 4. Cut over snapshots and frontend capabilities

1. Rename aggregate and service public frontend RPCs to `getSnapshot` and
   `getSelectedCommands`, including failure targets and same-named Effect
   method folders. Delete `getState` and `getFinalizedCommands` compatibility
   surfaces.
2. Make aggregate `getSnapshot` accept exactly `{ pendingCommandIds }`.
   Capture resources, `aggregateIndex`, `selectionIndex`, and `selectionHash`
   coherently, await selected-history publication through the captured
   selection position outside the execution permit, and return only requested
   exact-owner selected commands through that position.
3. Keep service `getSnapshot` argument-free and return the coherent resource,
   `serviceIndex`, and `serviceHash` snapshot after publication.
4. Rename SystemApi's aggregate inspection path to snapshot vocabulary and
   update gateway, production-worker, dev-worker, SDK, and fixture consumers.
5. Keep complete `AggregateExecutionEntry` and `ServiceExecutionEntry` values
   internal. Do not change admission, authored execution, source ordering, or
   aggregate/service disposition-hash algorithms.

## 5. Install snapshots and selected commands in Core

1. Rename application procedures and transaction procedures to
   `applyAggregateSelectedCommand`, `applyServiceSelectedCommand`,
   `applyAggregateFrontendSnapshot`, and `applyServiceFrontendSnapshot`.
2. For live aggregate selected commands, atomically unwind current optimism,
   apply `delta.upserted` and `delta.deleted`, complete a matching journal row
   by opaque command ID, record its authoritative position/failure, replay
   remaining optimism in durable order, and advance both cursor/hash pairs.
3. For aggregate snapshot installation, replace authoritative resources,
   complete only journal rows matched by `snapshot.selectedCommands`, remove
   their optimistic mutations, record their outcomes, preserve unmatched
   optimism, and replay that optimism. Do not apply a selected command's delta
   again because the snapshot resources already include it.
4. For service snapshots and selected commands, replace or incrementally apply
   resources while enforcing service cursor/hash contiguity and duplicate
   behavior.
5. Store the received `IAggregateSelectedCommand` as the local command outcome;
   never reconstruct an `AggregateChainedCommand` from the browser-facing
   result. Preserve the locally authored command fields already stored in the
   journal.

## 6. Close the browser snapshot/WebSocket race

1. Rename frontend fetch procedures to
   `fetchAggregateFrontendSnapshot` and `fetchServiceFrontendSnapshot`.
2. Before aggregate snapshot acquisition, read restored local commands that
   still own optimistic mutation rows and send their IDs as
   `pendingCommandIds`. Do not send merely admitted or already reconciled IDs.
3. Replace WebSocket messages with
   `{ type: 'aggregateSelectedCommand', command }` and
   `{ type: 'serviceSelectedCommand', command }`.
4. Resume aggregate delivery with `selectionIndex` and `selectionHash`, and
   service delivery with `serviceIndex` and `serviceHash`. Buffer every
   selected command through `replay-complete`.
5. Install the snapshot first, use its selected commands only for journal
   reconciliation, then apply `bufferedSelectedCommands` contiguously before
   switching the same socket to direct live application. Reject gaps and hash
   mismatches and ignore committed duplicates.
6. Remove `systemId` from frontend bootstrap results, session state, backup
   keys/offline locators, React mocks, standalone sessions, and affected
   Shopping fixtures. Keep backend routing inputs unchanged.

## 7. Reconcile consumers, terminology, and guidance

1. Replace frontend-flow `finalized`, `resolution`, `state`, and `sync`
   terminology with selected-command, outcome, snapshot, and update vocabulary
   across Core, frontend, React, DevTools, worker packages, e2e fixtures, and
   Shopping. Retain terminal/finalized vocabulary only for internal source
   execution histories where it remains accurate.
2. Update `AGENTS.md` and the Zerospin pattern case to state that source
   admission/execution paths preserve complete commands while frontend
   selection creates a separate minimal selected occurrence.
3. Update the glossary and architecture pages for authentication, authored
   systems, frontend WebSockets, IndexedDB backup coordination, aggregate
   submission, browser bootstrap, command admission, and service execution.
4. In Mermaid and matching annotated steps, show
   `frontendApi.getSnapshot({ pendingCommandIds })`, domain-specific selected
   command envelopes, buffering through `replay-complete`, snapshot
   installation, and subsequent `bufferedSelectedCommands` application.
5. Keep diagram numbering, source links, and immediately following annotated
   workflow steps aligned with the implemented call paths.

## 8. Acceptance and completion checks

1. Run focused Core schema and application suites. Verify old shapes fail,
   snapshot-selected deltas are not double-applied, matched optimism is
   removed, unmatched optimism survives, authoritative own failures remain
   inspectable, gaps fail, and duplicates are harmless.
2. Run `frontendPrograms.node.spec.ts`. Verify pending IDs come from unresolved
   optimism, snapshot installation precedes buffered replay, aggregate and
   service messages use their new envelopes, replay remains contiguous, and
   live delivery begins only after replay completion.
3. Run SelectionVAC and FrontendServiceChain Workerd suites. Verify command
   table persistence, exact retries, private failure filtering, pending-ID
   ownership, aggregate/service-derived selection progress, replay hash
   mismatch behavior, and minimal service selected occurrences.
4. Run the affected Nx typecheck, lint, Node test, and Workerd test targets for
   Core, frontend, React, system-worker, SDK, dev-worker, production-worker,
   frontend adapters, and Shopping. Preserve dependency pipelines and report
   any unrelated warning or blocked target accurately.
5. Search non-vendored source, active architecture docs, guidance, and tests for
   the deleted frontend symbols, filenames, message kinds, and persistence
   fields. Retain an old term only in an explicit rejection test or genuinely
   internal execution-history context.
6. Run the repository static cutover check, documentation link/diagram checks,
   and `git diff --check`. Add no `ALLOWED_CAST` markers or unneeded `as const`.
7. Do not reset storage while verifying. Record that changed fixed Durable
   Object and browser schemas require empty disposable local/test state before
   reuse.

## Non-goals

1. Changing aggregate or service disposition-hash algorithms.
2. Renaming SelectionVAR, SelectionVAC, FrontendServiceChain, or other topology
   owners.
3. Removing internal aggregate or service execution-entry types.
4. Changing source-command admission, authored execution, or source-chain
   ordering.
5. Resetting shared, remote, or production-like state.

## Implementation verification — 2026-09-20

1. Implemented the hard cutover across Core contracts and application
   transactions, SelectionVAC and FrontendServiceChain persistence/protocols,
   aggregate and service frontend capabilities, browser bootstrap and replay,
   React/session consumers, DevTools, workers, e2e fixtures, Shopping,
   repository guidance, glossary, and architecture workflows.
2. Verified that aggregate and service browser payloads are minimal selected
   occurrences, aggregate failure disclosure uses exact persisted owner
   metadata, snapshots reconcile requested `pendingCommandIds` without
   reapplying incorporated deltas, and replay buffers through
   `replay-complete` before live delivery.
3. Nx `tsc:typecheck` completed successfully for Core, frontend, React,
   system-worker, SDK, dev-worker, production-worker, frontend adapters, and
   Shopping plus their dependency pipelines. The frontend-adapters inferred
   typecheck remains explicitly disabled by its existing project
   configuration; its Workerd acceptance suite passed.
4. Nx unit suites passed with 654 tests: Core 380, frontend 26, React 13,
   system-worker 216, SDK 7, and Shopping 12.
5. Nx Workerd acceptance passed for system-worker with 71 tests and for
   dev-worker, production-worker, frontend adapters, and Shopping. Expected
   rejection-path exceptions and third-party sourcemap warnings remained
   diagnostic output, not test failures.
6. Nx lint completed with zero errors for every lint-enabled affected project.
   Existing warnings remain. SDK has no lint target.
7. `system-worker:static-cutover:check`, the obsolete-symbol audit, and
   `git diff --check` passed. Active browser architecture index prose was also
   corrected to selected-command and completion vocabulary.
8. No `ALLOWED_CAST` marker, compatibility alias, fallback decoder, migration,
   or storage reset was added. Because fixed Durable Object and browser schemas
   changed, disposable local and test state must be recreated before reuse;
   shared, remote, and production-like state remains untouched.
