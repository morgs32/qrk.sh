# Plan 085 — Single-socket aggregate frontend admission

**Date:** 2026-09-20
**Status:** Implemented; broader verification blocked by unrelated existing failures
**Source:** Follow-up to Plan 084 review issue 3

## Required outcome

1. Make the aggregate selected-command WebSocket the only browser transport for
   both live selected-command delivery and staged source-command admission.
   Snapshot retrieval, ticket creation, authentication, authorization, and
   service queries remain transient HTTP RPCs.
2. Permit command submission only after the socket has validated the exact
   `{ selectionIndex, selectionHash }` checkpoint and entered `phase: "live"`.
   Before that transition the connection accepts only its initial resume
   message.
3. Bind admission to the connection's complete retained frontend-session
   capability:
   `{ systemId, aggregateId, aggregateName, aggregateVersion, selectionPath,
   authentication, frontendName, aggregateFrontendLock }`. `systemId` comes
   from the SelectionVAC Repo key selected by SystemRepo from the consumed
   ticket. The remaining fields come from the consumed ticket and are checked
   by `SelectionVersionedAggregateChain.onConnect` against that Repo key before
   becoming connection state.
4. Preserve the complete encoded `IChainedCommand` occurrence unchanged from
   the browser journal through `AggregateChain.admitCommands`. SelectionVAC
   validates the occurrence against the retained connection state and selected
   contract but does not rebuild, redact, or reinterpret the command.
5. Return the existing `{ aggregateIndex, commandId }` admission receipt over
   the same socket. A receipt records durable admission and stops resubmission;
   it does not resolve optimism. Only a later selected command or a reconciled
   snapshot completes the local command.
6. Remove `historyValidated` and the independently authenticated HTTP push
   path. Socket liveness plus the server-owned `phase: "live"` state becomes
   the admission invariant; no browser-side authorization token or parallel
   capability is introduced.
7. Implement the change as a pre-release hard cutover. Delete the superseded
   public RPC, browser helper, exports, failure-target method, tests, and docs
   without aliases, fallback transports, or dual submission paths.

## Protocol and failure semantics

1. Keep the current initial client message exactly
   `{ selectionIndex, selectionHash }`. A socket in `awaiting-resume` validates
   that checkpoint, replays a contiguous retained suffix, sends
   `replay-complete`, and only then becomes `live`.
2. Once live, accept an exact client envelope containing
   `type: "pushAggregateCommand"`, the unchanged encoded `command`, and the
   current optional trace context. Decode with excess-property rejection using
   the existing `SessionCommandSchema` and logger trace-context shape. Keep the
   envelope schemas inline at the two transport edges rather than adding a new
   named type or generic transport abstraction.
3. Return an exact server envelope containing
   `type: "aggregateCommandAdmission"`, `commandId`, the encoded success or
   typed failure result, and the optional telemetry link. The browser has only
   one admission in flight, requires the envelope `commandId` to equal the
   submitted command ID, decodes the result, and ignores neither mismatched nor
   malformed receipts.
4. Continue interleaving server-to-browser `aggregateSelectedCommand` messages
   with admission receipts. Route both through the one live socket handler;
   selected commands apply immediately, while the receipt settles only the
   currently pending admission Deferred.
5. Serialize browser admission exactly as today: select the oldest journal row
   with `pushIndex IS NULL`, send one command, wait for its matching receipt,
   persist the returned aggregate index, then consider the next row. Manual
   push pause stops new sends but does not stop selected-command delivery.
6. Allow only one admission in flight per connection on the server. Retain its
   command ID in connection state without leaving `phase: "live"`, so live
   selected-command broadcasts continue while `AggregateChain` admission is
   awaiting an RPC. A second push before the first settles is a protocol
   violation and closes that socket; it is not admitted concurrently.
7. Treat a malformed live envelope, a push before `live`, an invalid connection
   target, or a mismatched receipt as a socket protocol failure. Close the
   socket and enter the existing reconnect path rather than attempting a
   second authorization route.
8. Encode contract/target/version validation failures and downstream admission
   failures as admission results. Preserve the current transient-error retry
   schedule in the browser and keep terminal failures observable through the
   existing `pushNow` result without failing the selected-command stream.
9. On socket close, revocation, replacement, or session release, fail the
   pending admission wait, stop new submission, and interrupt the period's push
   lane. The reconnect path must validate history on a new socket before it
   restarts admission.
10. If the socket closes after `AggregateChain` durably admits a command but
    before the receipt reaches the browser, leave the journal row unacknowledged.
    The next live socket resends the identical encoded occurrence;
    `AggregateChain` exact-byte idempotency returns the original receipt. A
    conflicting retry retains the existing admission failure. Closing a socket
    cannot roll back work already durably handed to `AggregateChain`.
11. Preserve push telemetry. Capture the caller trace context in the socket
    request, run and persist the server admission span through `SystemLogRepo`,
    return the same caused-by link semantics in the receipt, and add that link
    to the browser collector. Telemetry persistence failure must continue not
    to replace a successfully obtained domain receipt.

## 1. Make SelectionVAC own live admission

1. Extend `SelectionVersionedAggregateChain/onMessage/onMessage.ts` to branch
   on connection phase. Keep the current resume/replay implementation for
   `awaiting-resume`; accept push envelopes only in `live`; reject messages in
   `replaying` or while another admission is pending.
2. Validate the command against the retained connection and Repo state with the
   same checks currently owned by `AggregateFrontendApi.pushCommand`:
   `aggregateId`, `aggregateName`, `authentication`, `frontendName`,
   `systemName`, `pushIndex: null`, non-null delta, current configured aggregate
   version, selected contract name, and selected contract version.
3. Resolve `AggregateChain` with exactly
   `{ systemId, aggregateId, aggregateName }`, where `systemId` comes from the
   SelectionVAC key and the aggregate fields have already matched the retained
   connection. Submit `[command]` unchanged and require the first receipt.
4. Preserve the current admission error codes, retry/idempotency behavior,
   root-span collection, `SystemLogRepo` persistence, and optional caused-by
   link. Send the settled encoded result to the still-current connection and
   clear its in-flight marker only if it still names that command.
5. Keep selected-command filtering and broadcasting unchanged. Connections
   remain eligible for live output while an admission RPC is pending, and the
   existing exact authentication/frontend comparison remains the sole rule for
   private failure disclosure.
6. Update the repeated inline connection-state shapes in
   `SelectionVersionedAggregateChain.ts`, `onConnect.ts`, and `onMessage.ts` to
   carry only the in-flight admission marker needed by this implementation. Do
   not introduce a new named type or helper as part of this cutover.

## 2. Route the browser push lane through the retained socket

1. In `bootstrapAggregateFrontendSession.ts`, replace
   `pushAggregateFrontendCommand` calls with a send-and-await operation against
   the current live socket. Capture the current command ID and Deferred before
   sending so a synchronous close or receipt cannot race registration.
2. Extend the live socket handler to decode and route
   `aggregateSelectedCommand` and `aggregateCommandAdmission` independently.
   Keep selected-command application, duplicate handling, metadata refresh,
   and session-store publication unchanged.
3. Start or wake the push lane only after replay has completed and the live
   handler is attached. On close, fail any pending receipt, interrupt the push
   fiber, mark the connection offline, and queue serialized recovery. A later
   `online` event may request recovery but may not independently authorize a
   send.
4. Delete `historyValidated`. Make `pushNow`, automatic queue draining, and
   pause/resume controls require the current ownership period and its retained
   live socket. Do not replace the boolean with another browser authorization
   flag.
5. Preserve local journal behavior: receipt success writes `pushIndex`, leaves
   optimistic mutations active, refreshes store metadata, and proceeds to the
   next unpushed row. Receipt failure keeps `pushIndex` null and returns the
   existing retry-exhausted status after the configured retry schedule.
6. Keep snapshot replacement, replay buffering, backup capture, ownership
   revocation, service-query HTTP calls, and service frontend sessions outside
   this protocol change.

## 3. Delete the second push surface

1. Remove `packages/frontend/src/pushAggregateFrontendCommand.ts` and its
   package export. Keep `frontendPushRetrySchedule`; the socket push lane still
   uses it for typed transient admission failures and reconnect recovery.
2. Remove `AggregateFrontendApi.pushCommand`, its same-named method folder,
   imports, JSDoc, request typing, node tests, and the matching
   `AggregateFrontendApiFailure.pushCommand` method and folder.
3. Update `AggregateFrontendApi` and its failure target to expose only their
   remaining snapshot, selected-history, ticket, and service-query operations.
   Do not leave a method that forwards to the socket path or returns a
   compatibility error.
4. Replace direct `frontendApi.pushCommand` usage in system-worker and Shopping
   Workerd tests with real ticket consumption, checkpoint validation, live
   socket submission, and receipt observation. Keep lower-level
   `AggregateChain.admitCommands` tests for chain semantics.
5. Search all non-vendored source, package exports, typechecks, tests, patterns,
   and active docs for `pushAggregateFrontendCommand` and frontend
   `pushCommand`. Retain `pushCommand` only where it names an unrelated domain
   operation or a historical archived document.

## 4. Replace tests at the deeper module interface

1. Extend `SelectionVersionedAggregateChain.workerd.spec.ts` as the server
   acceptance surface. Cover rejection before resume, successful resume to
   live, exact target and contract validation, unchanged command forwarding,
   receipt success, typed failure, one-in-flight enforcement, live selected
   delivery during pending admission, and receipt recovery after reconnect.
2. Replace the deleted `AggregateFrontendApi.pushCommand` unit tests with
   socket-level assertions. Do not retain tests whose only purpose is the
   superseded HTTP method.
3. Extend `frontendPrograms.node.spec.ts` with a controllable WebSocket that
   interleaves selected commands and receipts. Verify one-at-a-time sends,
   journal `pushIndex` updates, optimism retention, pause/resume, transient
   retries, close-while-pending, reconnect-before-resend, receipt mismatch,
   and no push before `replay-complete`.
4. Update `preparedExecution.workerd.spec.ts` and Shopping's
   `pushCommand1.spec.ts` to exercise the complete ticket-to-live-to-admission
   route, including read-only contract rejection and stale authentication
   rejection against retained socket state.
5. Preserve focused `AggregateChain` tests proving identical bytes recover the
   original receipt and conflicting bytes fail. Use that durable behavior as
   the acceptance evidence for the lost-receipt reconnect case.
6. Assert that service frontend sockets remain receive-only and that this plan
   introduces no service command submission path.

## 5. Synchronize architecture and repository guidance

1. Update `wiki/architecture/browser/FrontendWebSocket.md` so its sequence shows
   snapshot and ticket HTTP calls followed by one bidirectional live socket:
   browser push, SelectionVAC validation, unchanged AggregateChain admission,
   admission receipt, and selected-command delivery.
2. Update `wiki/architecture/browser/PushSequence.md` to replace
   `AggregateFrontendApi.pushCommand` with the validated live SelectionVAC
   connection and to document lost-receipt idempotent resend.
3. Update `wiki/architecture/browser/Authentication.md` to state that fresh
   HTTP authentication applies to snapshots, ticket creation, and queries,
   while admission uses the already authenticated, authorized, and
   history-validated live socket until close.
4. Update `wiki/architecture/browser/bootstrapBrowserSession.md` and
   `wiki/architecture/server/admitCommands.md` to make the socket ownership and
   exact admission tuple explicit and remove the separate push-capability
   lane.
5. Update `wiki/architecture/SystemApi.md`, repository indexes/glossary entries,
   `llm-wiki/patterns/system-worker/aggregate-frontend-admission.ts`, and the
   API JSDoc guidance so none claims frontend admission is owned by
   `AggregateFrontendApi`.
6. Preserve every active architecture page's Mermaid numbering, immediately
   following annotated workflow steps, working source links, and distinction
   between an admission receipt and authoritative selected completion.

## 6. Verification and completion

1. Run focused Node tests for `@zerospin/frontend` and focused Workerd tests for
   `system-worker` and Shopping while iterating.
2. Run resolved Nx `tsc:typecheck`, `lint`, and `test` targets for
   `@zerospin/core`, `@zerospin/frontend`, `system-worker`, `@zerospin/react`,
   `@zerospin/sdk`, `@zerospin/dev-worker`, `@zerospin/production-worker`,
   `@zerospin/e2e-frontend-adapters`, and `shopping` where those targets exist.
   Run `system-worker:test:workerd`, affected worker Workerd suites, and
   `shopping:test:workerd` for the real socket boundary.
3. Run `system-worker:static-cutover:check`, the obsolete-symbol search, active
   documentation link/diagram checks, and `git diff --check`.
4. Verify the final code has one aggregate session WebSocket, no browser HTTP
   push request, no `historyValidated` authorization bookkeeping, no public
   `AggregateFrontendApi.pushCommand`, no compatibility shim, and no new
   `ALLOWED_CAST` marker.
5. Do not reset storage, deploy, edit vendored code, or modify the unrelated
   active standalone-session/backup WIP while implementing or verifying this
   plan.

## Non-goals

1. Fixing review issues 1, 2, 4, 5, or 6 from the source review.
2. Changing snapshot, ticket, service-query, or authentication HTTP transport.
3. Adding command submission to service frontend sockets.
4. Changing AggregateChain admission ordering, receipt shape, exact-byte
   idempotency, downstream execution, SelectionVAR projection, or selected
   history hashes.
5. Adding a new generic WebSocket transport module, protocol type hierarchy,
   browser authorization token, persisted schema, migration, or compatibility
   path.

## Implementation and verification — 2026-09-20

1. Implemented the single live aggregate socket for unchanged command admission,
   selected delivery, matching receipts, telemetry links, serialized retries,
   pause/resume, and reconnect recovery. Removed the HTTP push helper, export,
   API method, failure-target method, and superseded test.
2. Added browser coverage for sequential sends, selected delivery during an
   admission, retained optimism, typed transient and terminal failures, pause
   during retry delay, malformed/null/mismatched receipts, and identical resend
   only after a new socket resumes. Server coverage includes pre-resume rejection,
   target and contract validation, concurrent-push rejection, downstream byte
   conflicts, telemetry persistence failure, and lost-receipt recovery while
   selected delivery remains live. Service sockets remain receive-only.
3. Passed all five requested Workerd suites: system-worker (73 tests), Shopping
   (4), dev-worker (1), production-worker (2), and e2e-frontend-adapters (1).
   The extended SelectionVAC suite also passed separately after adding telemetry
   failure and downstream conflict assertions. Passed the requested Node test
   targets and the focused frontend/system-worker test-file typechecks.
4. Resolved and ran all requested available Nx typecheck, lint, and test targets.
   Shopping typecheck remains blocked at
   `examples/shopping/tests/browser/frontendLifecycleFixture.ts:147` and `:155`
   by aggregate/service session generic assignability errors in unrelated
   lifecycle fixture code. That code was left unchanged. Lint exits successfully
   with existing warnings outside the new admission changes.
5. Passed `system-worker:static-cutover:check`, obsolete transport-symbol checks,
   sequence/annotated-step alignment, and `git diff --check`. Introduced no broken
   documentation links; the modified pages still contain twelve pre-existing
   broken links to unrelated removed cutover procedures and React tests.
6. Graft refresh is blocked because the installed CLI cannot import
   `@nanonets/graft/dist/claude/init.js`. Generated graph artifacts were not
   manually rewritten. No storage reset, deployment, vendor edit, compatibility
   path, or new `ALLOWED_CAST` marker was introduced.
7. Keep this plan active until the unrelated Shopping typecheck and existing
   documentation/tooling verification blockers are resolved; do not archive it
   as fully verified.
