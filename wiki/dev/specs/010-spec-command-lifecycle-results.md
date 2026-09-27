# Command lifecycle results and failures

**Status:** Implemented; server actor staging follows [Plan 011](../plans/011-plan-actor-staging-and-gated-listener-execution.md), while listener delivery was superseded by [Spec 012](012-spec-aggregate-state-machines.md).

Plan 011 adds AAVR-owned durable server staging without inventing browser staging
results for server commands. It replaces the per-listener queue entry below with
one actor-owned `aggregateCommandsOutbox`; the rest of the lifecycle result
ownership remains in force.

## 1. Purpose and interfaces

1. Replace commands whose fields change meaning over time with stable command input and explicitly owned results.
2. A failed synchronous staging attempt returns a structured failure to its caller. It creates no command row, durable history entry, or submission position. Existing telemetry records the attempt.
3. Successful staging creates a session command. Session history exposes one record containing the command, its successful staging result, and named admission and execution results.
4. Keep input types distinct from retained commands. Use `ISessionCommandInput` for input to staging and `ISessionCommand` for the successfully staged command with its lifecycle results. Replace the broad `IStagedCommand` composition with the explicit staging result.
5. Staging contains `startedAt`, `completedAt`, and `stagedDelta`. Because only successful staging creates a retained command, its stored staging result needs neither a failure field nor a redundant success discriminator.
6. Admission has these states:
   1. `pending`.
   2. `succeeded`, with `startedAt` and `completedAt`.
   3. `failed`, with `startedAt`, `completedAt`, and `failure`.
7. Execution has the same states plus `skipped`. Admission rejection produces `{ status: 'skipped', reason: 'admission-failed' }`, without execution timestamps or an execution failure.
8. Standalone and mock sessions retain successful staging results. Server phases are explicitly skipped with reason `local-only`; they do not fabricate admission or execution results.
9. Server-originated commands have admission and execution results without invented local staging data. Each interface contains the operations that actually apply to its owner.
10. Preserve delta meanings: `stagedDelta` is local execution data, `executionDelta` is authoritative resource output, and `actorDelta` is the actor-selected projection. Client execution summaries omit the full `executionDelta`; actor deliveries carry the permitted `actorDelta`.

## 2. One failure representation

1. Use the existing public structured error envelope as the canonical stored and transported failure: `_tag`, `code`, optional `scope`, `message`, `status`, and JSON `extra`.
2. Producers validate declared business failures and convert them to that envelope once. Table codecs perform SQL serialization; failure values do not contain another JSON string.
3. Remove the retained-business-failure wrapper, its repeated command identity/version, unused historical decoding, and interfaces carrying both `failure` and `originalFailure`.
4. Keep necessary command identity and version on the enclosing command or result context. Do not duplicate them inside failures.
5. Preserve optional receiver-side recognition against the receiving contract. Unknown but valid failures remain usable structured errors and must not block acknowledgement, history, or reconciliation.
6. A failure belongs to the operation that failed. Admission rejection remains `admission.failure`; it is never relabeled as an execution failure or copied into a generic current failure.
7. Transport errors, unexpected defects, and interruptions retain their operational error behavior. They do not become durable business rejections merely because a request could not complete. Diagnostic causes and stacks remain available through telemetry.
8. Direct calls and delivery interfaces return the applicable operation results. Successfully delivering a failed command result is successful delivery, not a queue failure.

## 3. Timing, storage, and reconciliation

1. Measure start and finish for attempted staging, admission, and execution. Capture start before that operation's validation/preparation and finish after its success or recognized failure is determined.
2. Retain both timestamps atomically with the completed result. Do not persist or publish running phases, interrupted-attempt records, or an attempt-history store. History remains pending until a completed result is retained.
3. Duplicate submissions and delivery retries return the original retained result and timestamps. Timestamps from different machines do not determine ordering; existing indexes and hashes continue to do that.
4. Remove overloaded `chainedAt`, duplicated `failedAt`, and the separate command `executionTimestamp`. Use the owning phase's timestamps. Resource mutation timestamps use the phase's `startedAt`; `completedAt` describes operation completion, not downstream delivery or transaction acknowledgement.
5. Keep resource `createdAt`, `updatedAt`, and `deletedAt`. Rename mutation undo metadata `lastAppliedAt` to `previousUpdatedAt`, reflecting the value it actually restores.
6. Store complete phase results in JSON columns. Keep command identity, provenance, and ordering/query fields in ordinary columns, with no duplicate positions or payload copies inside phase JSON.
7. Use table-owned codecs for complete server/session rows and field codecs when replacing a phase column. Preserve the durable node's native Drizzle JSON mapping and asynchronous transactions.
8. Make `sessionRepoDbConfig` the sole export of its same-named module. Inline its table declarations, use its typed `tables` and `schema`, and remove the journal-to-actor-command conversion.
9. Failed staging rolls back local database changes and consumes no session or node position. Successful staging and durable node acceptance preserve the existing uncertain-handoff and retry behavior.
10. When the node durably records admission rejection, mark execution skipped and immediately rebuild tab optimism without that command. Other unresolved commands replay over the confirmed resource snapshot.
11. Admission rejection does not independently advance execution/resource checkpoints. Its ordered server result must still advance the existing result log, disposition hash, and recovery progress without executing mutations or inventing an execution failure.
12. Preserve atomic authoritative application and recovery: resource changes, applicable own-command results, and checkpoints commit together before publication. Historical results fill history without applying resource changes again.
13. Preserve failure privacy and ownership checks. Actor projections expose private phase results only to authorized recipients; other recipients receive their allowed resources and progress without leaked failure status or details.
14. Push only the stable command and required provenance to admission. Original local staging data remains with the session/node that owns it.

## 4. Delivery ownership and cutover

1. Name queues by the records they deliver and distinguish destinations where an owner has multiple routes:

   | Route                                           | Queue name                         |
   | ----------------------------------------------- | ---------------------------------- |
   | Command chain → version repos                   | `admissionResultsFanout`           |
   | Version repo → version chain                    | `executionResultsOutbox`           |
   | Version chain → actor version repos             | `executionResultsFanout`           |
   | Service version chain → aggregate version repos | `serviceResultsToAggregatesFanout` |
   | Actor version repo → actor version chain        | `actorCommandsOutbox`              |
   | Actor repo staged commands → aggregate chain    | `aggregateCommandsOutbox`          |

2. Update capabilities, subscribers, alarm registrations, diagnostics, and documentation together. Do not retain generic `commands` queue aliases.
3. Delivery state belongs to the named queue or subscriber. Use `acknowledgedAt` for successful acknowledgement by the immediate receiver. Keep retry diagnostics distinct from a subscriber's blocking failure through their owning interfaces and existing retry/block behavior, rather than inventing `terminalDeliveryFailure`.
4. Apply the structured failure representation to delivery diagnostics as well. Preserve their existing clearing, retry, and blocking semantics.
5. Hard-cut affected storage and wire contracts. Replace obsolete fields, wrappers, codecs, callers, and tests outright.
6. Increment the current node storage version from 3 to 4. Reject incompatible nonempty databases with the reset-required error before reading changed columns. Preserve catalog lookup and node identity; do not delete databases automatically.
7. Require empty storage for changed server schemas and retained standalone journals. Provide no translation migration, fallback decoder, or compatibility alias.
8. Update active architecture documentation and local patterns. Preserve archived designs as historical records.
9. This spec does not redesign Node runtime-status failures, backup lifecycle ownership, unrelated application messages, telemetry timestamps, or live-query timestamps. Those review findings remain separate work.

## 5. Acceptance and testing

1. Through the synchronous session interface, prove that failed staging returns its structured failure, rolls back local changes, creates no command/history row, and does not consume ordering positions. A following successful command remains contiguous.
2. Through existing admission/execution seams, cover success, admission rejection, execution rejection, and unexpected infrastructure failure. Verify failure ownership, explicit skipped execution, start/finish timing, and unchanged retained results on retries.
3. Verify that phase JSON round-trips through table codecs and native node storage without double encoding, duplicate failure representations, or weakened required-field validation.
4. Through existing node/browser integration seams, verify immediate removal of optimism after durable admission rejection, convergence across tabs, worker restart, uncertain handoffs, and replay of the remaining unresolved commands.
5. Verify that immediate optimistic rollback does not prematurely advance authoritative checkpoints, and that recovery still commits resources, results, and checkpoints atomically.
6. Exercise publication/replay and direct-call interfaces with recognized and unfamiliar failures. Preserve exact public failure data, ownership/privacy rules, and progress despite failed recognition.
7. Exercise queue retry and acknowledgement seams: a retained result survives delivery failure, repeated delivery does not rewrite its timestamps, and a command rejection is not mistaken for failed delivery.
8. Run scoped schema/core/error/system-worker/browser tests and typechecks, affected React/DevTools/example typechecks, relevant workerd tests, and the durable-node Playwright suite.
9. Finish with scoped formatting/lint and a scan for obsolete lifecycle fields, retained-failure wrappers, dual failure representations, generic queue names, and compatibility paths.
