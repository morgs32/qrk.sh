# Plan 071 — Versioned service execution and frontend delivery

**Status:** Implemented and verified on 2026-09-07. Unrelated workspace failures are recorded below.

## Approved design

1. Apply Plan 069 to the complete service path using dedicated ServiceAdmittedChain (SAC), VersionedMaterializedServiceRepo (VMSR), VersionedServiceChain (VSC), VersionedMaterializedServiceReplicaRepo (VMSRR), and FrontendServiceChain (FSC).
2. SAC owns complete immutable admission bytes, contiguous service indices, version registration, the current base, aggregate subscriber cursors, and immutable delivery-version ranges. Its identity is `{ systemId, serviceName }`; Worker configuration supplies systemId and command/API admission supplies serviceName.
3. VMSR and VSC add serviceVersion, selected by registration/base selection. Every VMSR uses its service slice and prepares commands before execution. Domain rejection rolls back one command; infrastructure failure aborts the page. State, terminal outcomes, head, disposition hash, and complete output entries commit atomically. Remove execution claims and halted-chain repair.
4. ServiceExecutionEntrySchema preserves source bytes, terminal occurrence including resource deltas, ordered prepared mutations, preparation version, and execution timestamp. No new service guards. VMSR's delete outbox feeds retained, contiguous, exact-byte-checked VSC history.
5. admitServiceCommand durably retains the input and returns { commandId, serviceIndex }. The durable materializer fanout executes asynchronously; VMSR and VSC retain execution outcomes independently of the admission response.
6. flush(serviceIndex) executes and durably publishes through the exact checkpoint and returns `{ serviceIndex, commandId, dispositionHash }`, with genesis at zero. Cutover compares parallel base/candidate flushes at sampled n and invalidates divergent candidates. Candidates must be registered after the current base, using registration order rather than semantic-version ordering.
7. Promotion atomically changes the base and records m, the last admitted index at promotion. Already-admitted positions retain their old aggregate-delivery source; subsequent admissions select the new base. Admissions continue while flushing. No transaction or whole-owner gate spans RPCs.
8. SAC aggregate fanout reads bounded retained VSC suffixes through delivery-version ranges. Preserve old history/execution for lagging subscribers. Never replace missing results with another version. SAC retains routing metadata, not terminal history. Capture the admitted horizon before remote history reads so concurrent promotion cannot move subscriber tip anchoring past the selected delivery source.
9. VSC calls SAC.notifyFinalizedCommands after result commit and before producer acknowledgement; duplicates repeat the durable alarm notification. Preserve full terminal service occurrence bytes, exact-byte deduplication, contiguous service frontiers, and initial tip anchoring in AC.
10. Replication snapshots select the current service base once and preserve resource modelName/version. Both fetched resources and delivered service resources use existing mutation adaptation. VMAR persists adapted prepared replication mutations; its replica replays those mutations. Fanout updates only enrolled resources; preserve tombstones, adapter discards, and terminal adaptation failures.
11. VMSRR and FSC add `{ userId, frontendName }`; authentication supplies userId, the admitted frontend capability supplies frontendName, and bootstrap selects serviceVersion. VMSRR replays successful prepared mutations without programs, maintains source state/preceding projection, and uses existing service frontend bindings/adapters without new selection APIs.
12. Commit one frontend output per service position including failure/empty progress, independent of page boundaries. Projection failure rolls back the page. A delete outbox feeds exact retained FSC history before acknowledgement/broadcast.
13. Remove serviceFrontendIndex. Use serviceIndex throughout and include serviceVersion in snapshots, outputs, initialized sessions, history requests, and tickets. Preserve complete occurrences. Capture snapshot resources/cursor atomically, wait for publication outside execution exclusivity, and pin tickets/replay to that snapshot version until rebootstrap.
14. Add SystemApi.cutoverServiceVersion({ serviceName, destinationServiceVersion }), matching failure behavior, and new-owner inspection methods. Route queries/authorization through the base VMSR without moving validation across runtime boundaries. Update bindings, exports, registration, Studio, SDK/browser/session consumers, fixtures, and affected docs together.

## Verification and rollout

1. Test admission conflicts/source preservation, bounded execution, domain/infrastructure failures, cold recovery, outbox deletion retries, and retained execution retries.
2. Test genesis/nonzero cutover, divergence, concurrent admission, interrupted publication, and lagging subscribers crossing multiple version ranges with identical ordered bytes.
3. Test fetched/fanout model-version adaptation, discard, tombstones, missing adapters, and identical aggregate execution/replica state.
4. Exercise the full workerd pipeline, duplicates/gaps, durable notification retries, per-position frontend output, projection rollback, published snapshots, and version-pinned nonzero WebSocket replay.
5. Run relevant Nx Node/workerd tests, source/consumer typechecks, lint/format, static-cutover, and documentation validation; distinguish unrelated pre-existing failures.
6. Work on main and preserve concurrent WIP/aggregate renames. Use fresh local/example systemIds and empty storage. Do not reset shared state or deploy. Archive only after complete implementation and verification.

## Implementation reconciliation

1. Preserved the concurrent VMAR/VMARR rename and admission-only service API cutover. `admitServiceCommand` returns the durable receipt; execution proceeds through SAC fanout. This supersedes the initial synchronous `finalizeServiceCommand` requirement. Materializer retries still recover committed outcomes from pending output or retained VSC history without re-execution.
2. Updated all eight relevant Worker configurations with the five service owners and fresh local/example systemId values. No shared storage was reset and nothing was deployed.
3. Added the CapnWeb Workers entrypoint alias to the shared workerd test configuration so service outbox RpcTargets cross the actual Worker RPC boundary during consumer integration tests.

## Verification results

1. `nx run system-worker:test --excludeTaskDependencies`: **94 passed**. Covers complete admission bytes/conflicts, bounded execution, domain rejection, transaction rollback, retained retries, registration-order cutover, zero/nonzero checkpoints, multiple delivery boundaries, concurrent admission/history reads, commit interruption, projection rollback, and fetched/fanout adaptation with tombstones, discards, and missing adapters.
2. `nx run system-worker:test:workerd --excludeTaskDependencies`: **29 passed**. The affected service pipeline was rerun after the final registration change: **2 passed**. Retained-history replay, notification interruption, cold recovery, published snapshots, duplicate/gapped delivery, and version-pinned nonzero WebSocket replay passed.
3. Shopping service frontend workerd integration: **1 passed**. Frontend Node tests: **4 passed**. Focused core command, service-session, and replication-mutation tests: **21 passed**.
4. Full `nx run core:test --excludeTaskDependencies`: **297 passed, 2 unrelated failures** in `models/makeModel.node.spec.ts` and `system/tests/schema-validated.node.spec.ts`, both asserting deep freezing of authored definitions. No service-path test fails.
5. System-worker source and test typechecks pass. Core, SDK, dev-worker, and production-worker typechecks pass. Full frontend/Studio consumer validation remains blocked by unrelated OPFS `backupClientId` errors and Studio's removed `contract` property references in contract inspection.
6. Relevant Nx lint targets report zero errors; existing factory/Repo warnings remain. Scoped formatting, `git diff --check`, static-cutover checks, all eight Worker configuration owner inventories, and affected documentation links/line ranges and sequence numbering pass.
