# Explicit mapped contracts, unified operation retention, and async lifecycle

**Date:** 2026-10-02
**Status:** Implemented and verified on 2026-10-02. Superseded async paths have been replaced. Changed fixed schemas require empty storage.
**Handoff:** [Handoff 027](../handoffs/027-handoff-actor-bound-async-contracts.md).

## Problem and scope

1. Authors must be able to read declarations and identify registered contracts, permitted emissions, the complete command program/output, authoritative result, and replay behavior. Obviousness is a design requirement.
2. Replace automatic `after` triggering and source-result-derived async input with explicit server-side mapped programs that emit typed async operations. Commit model changes, async emissions, and terminal results atomically; start producers after commit.
3. Unify locally authored and received model-operation retention under `modelOperations`. Store async emissions and their producer lifecycle together under `asyncOperations`, without a separate work table or duplicate history row. Reconstruct complete ordered command output from both tables.
4. Build on [plan 026](026-plan-contract-operation-emission-and-results.md). [Plan 030](030-plan-remove-replicas-and-service-subscriptions.md) removes replica models, `replicate`, resource captures/subscriptions, service subscriptions, and service `inbound`/`emissions`, and reconciles superseded work from plan 025. Plan 027 builds on that remaining runtime and must not restore those features. Preserve unrelated command-history WIP and its surviving guarantees.
5. Keep the command-table organization remaining after plan 030. This plan consolidates surviving operation storage; it does not preserve command tables or imported-history paths that plan 030 deletes. Direct backend invocation without an initiating command, cross-owner async continuations, provider integrations, agent hosts, pruning, automatic upgrades, and arbitrary durable schedule serialization are excluded. Payment examples do not authorize restoring Shopping or integrating a provider.
6. Aggregates never receive service commands. Aggregate histories contain aggregate-owned commands, including their own private async continuation commands. Remove service-command ingestion, service-command provenance fields, and mixed service/aggregate occurrence assumptions from in-scope aggregate paths; do not preserve a future ingestion option. Actor/session projection of aggregate commands remains.
7. Apply the pre-release hard cutover. Replace superseded in-scope code, readers, writers, schemas, fixtures, and documentation outright. Changed fixed schemas require empty storage; add no compatibility paths, fallback lookup, translation migrations, or automatic storage deletion.

## Agreed declarations and execution

The implemented interface follows this shape. Domain schema names and bodies below are illustrative.

```ts
const asyncProcessPaymentV1 = makeAsyncContract({
  name: 'asyncProcessPayment',
  version: '1.0.0',
  payload: {
    paymentId: primitives.foreignKey({ abbreviation: 'pay' }),
  },
  models: { payment: paymentV1 },
  external: {
    result: PaymentObservation,
    program: ({ payload }) => collectOrReconcilePayment(payload),
  },
  result: PaymentReceipt,
  program: ({ payload, external, models }) =>
    applyPaymentObservation({ payload, external, models }),
});

const mappedCommencePaymentProcessingV1 = mapContractVersion({
  contractVersion: commencePaymentProcessingV1,
  operations: {
    models: { payment: paymentV1 },
    contracts: { asyncProcessPayment: asyncProcessPaymentV1 },
  },
  result: PaymentProcessingResult,
  program: ({ command, db, claims, failures, operations }) =>
    Effect.gen(function* () {
      yield* operations.models.payment.update(/* ... */);
      yield* operations.contracts.asyncProcessPayment({
        paymentId: command.payload.paymentId,
      });
      return makePaymentProcessingResult(command.result);
    }),
});

const contracts = {
  commencePaymentProcessing: mappedCommencePaymentProcessingV1,
  asyncProcessPayment: asyncProcessPaymentV1,
};
```

1. Keep canonical server registries explicitly authored. Capability declarations identify permitted async contract references; they never register contracts. Reject missing, mismatched, and non-async contract references at construction. Add no implicit traversal, registry substitution, or `actor.asyncContracts`. Reuse exact mapped declarations across required owner/actor registries and preserve current aggregate versus service lookup responsibilities.
2. A mapping retains the original command name/version, payload adaptation, claims, guards, and declared business failures. Changing mapped behavior, capabilities, or its result codec requires new server owner/actor versions under existing identity constraints. Add no independent mapped version.
3. Run the ordinary program first. Pass the mapper a read-only command containing decoded payload, collected base operations, decoded base result, and existing invocation identity. These are collected outputs, not an already committed command; include no terminal outcome or commit metadata.
4. Both programs and their dependencies finish synchronously and query pre-application state. The base program keeps its declared capabilities. The mapper's queries and bound methods use its explicitly declared models; async methods use its declared contracts. Preserve owner/actor model-scope validation.
5. Append mapper emissions after base operations in emission order. The mapper cannot edit base output. Validate the base result against its original codec and the mapper result against its explicitly required mapped codec before application. Even forwarding the base result requires an explicit mapped result declaration.
6. Supply original `failures` to the mapper. It may reject the composed command using those business failures; a new business failure must be declared on the ordinary contract. Preserve existing framework-error handling.
7. Async contracts declare their own ordinary `payload` descriptors. Bound methods accept that payload type. The producer and continuation consume the same frozen payload; the continuation also receives the recorded external observation. Remove `after`, source-result coupling, and source fields retained only for dependency traversal or result-codec lookup.
8. Preserve separately inferred producer and synchronous requirements. Producers can suspend and use backend capabilities but cannot emit local operations or query a live owner/actor database. Continuation guards, codecs, and programs remain synchronous and retain their own model/result/failure declarations. Preserve the existing omitted-result convention for ordinary and async continuation contracts.

## Browser, identity, and result boundaries

1. Browser sessions import and stage the original ordinary contract, never the mapping or async definition. Server-only makers and producer capabilities remain outside browser exports.
2. Public session specs/locks describe the original definition. Server authorization resolves the registered mapping and compares its original definition with the lock. Server system specifications describe the original public contract and mapped authoritative definition distinctly without serializing programs or capabilities.
3. Authoritative execution and retained-result decoding resolve the mapped definition through recorded server context. Keep authoritative results server-side; preserve browser state-delta/failure delivery and the original staging result. Do not decode mapped results with the original browser codec.
4. Async identity is `asyncContractName` and `asyncContractVersion` within pinned owner/actor context. Source association and ordinal identify causality/emission identity, not async contract lookup. Preserve the convention `async<Action>` and `async<Action>V<N>`; the name prefix never grants authority.

## Operation storage and complete output

1. Use `modelOperations` for retained model operations in the remaining owner history, actor projections, and session synchronization paths. Remove `importedOperations` outright. Plan 030 deletes subscription-driven imported paths; replace any surviving operation readers/writers/schemas/fixtures and model-only `operations` storage with `modelOperations`. Keep complete operation bodies and table-owned codecs; store no canonical bytes or serialized whole-command copies.
2. Use `asyncOperations` for each retained async emission and its producer lifecycle together. Replace `externalWork`; do not retain a second emission row in a generic operation table or a separate work table. Frozen arguments and async contract name/version have one retained location per occurrence.
3. Within each aggregate or service version, both `modelOperations` and `asyncOperations` use `(commandId, operationIndex)` as their unique operation key. Both admission paths deduplicate command IDs, and each version executes each admitted command once; delivery retries do not create new occurrences. Replaying versions have separate storage scope. Enforce the composite key in SQL and delivery validation, replacing execution-position-derived operation IDs. Keep existing `aggregateIndex`, `serviceIndex`, and `executedIndex` columns where required for sequence/progress without adding an occurrence ID or separate `operationOrdinal`. Async contract name/version cannot key multiple emissions.
4. Remove `applicationKind`; do not add its proposed nullable form. With replicas/observed tables and service `inbound`/`emissions` removed by plan 030, there is no owned/observed application distinction or outbound model emission awaiting application elsewhere. Remaining model operations concern owner models; chains retain them and actor/session materializers project them according to their existing role. Receipt and projection do not need a per-operation application category. Keep required command provenance and occurrence identity.
5. Remaining model operations are `create`, `update`, `delete`, and `move`. Plan 030 removes `replicate`, replica-specific capture persistence, and observed model tables; add no `replicaOperations` or substitute. Async external observations remain in `asyncOperations` and survive rejection of their synchronous continuation. This does not retain or reintroduce replica/resource capture machinery.
6. Preserve one complete ordered output across `modelOperations` and `asyncOperations`, including async entries in server history/transport and retaining original ordinals. For one command within an aggregate or service version, merge both operation tables and order by original `operationIndex`. Validate one operation per index across the combined output. Model-only projections may have gaps; do not renumber them after excluding async emissions.
7. Multiple emissions to the same async contract retain distinct operation indexes. Original authoritative execution allocates distinct stable child command IDs. Replay generates and records the complete output, then applies only model operations. Ignore async operations during replay application: no producer, enqueue, child-command allocation, or matching to original child commands. History delivery does not own production.
8. Allocate `operationIndex` once over base operations followed by mapper operations. Retain each operation in exactly one of the two tables. The collector and transactional retention boundary reject duplicate indexes across the combined output; decoding/delivery validates that same invariant. Table-local composite uniqueness prevents duplicates within either table. Do not add a third index/work table or store the complete output as another command blob.

## Physical schemas and retention

These are the implementation shapes. Reuse existing table-owned codecs and each storage owner's existing sequence columns; those columns are paging metadata, not another operation identity.

| Table                | Immutable retained columns                                                                                                                  | Constraints and use                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelOperations`    | `commandId`, `operationIndex`, `modelName`, `modelVersion`, `resourceId`, `operationName`, `body`, `committedAt`, existing sequence columns | Unique `(commandId, operationIndex)`; `operationName` is `create`, `update`, `delete`, or `move`. Keep the existing encoded model-body codec. Remove the redundant synthetic operation `id`. |
| `asyncOperations`    | `commandId`, `operationIndex`, `asyncContractName`, `asyncContractVersion`, `payload`, `committedAt`, existing sequence columns             | Unique `(commandId, operationIndex)`; `commandId` identifies the emitting command. `payload` is JSON encoded and validated using the async contract's own declared payload.                  |
| `asyncCommandOutbox` | `outboxIndex`, `asyncCommandId`, `lastDeliveryFailure`                                                                                      | Primary monotonic `outboxIndex`; unique `asyncCommandId` references the producing Repo's retained async row. Pending deliveries only. Preserve the existing durable outbox counter.          |

Only aggregate/service VersionRepos add producer lifecycle columns to their `asyncOperations` table:

| Column                                | Meaning                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asyncCommandId`                      | Nullable, unique private continuation ID; allocated once when original execution applies the async operation.                                                             |
| `actorName`, `actorVersion`, `claims` | Nullable persisted original authority; required together whenever `asyncCommandId` is present. Retain these because source command rows can be deleted after publication. |
| `systemName`                          | Aggregate-Repo extension, retained when required to reconstruct its existing command envelope. Do not add service identity fields to aggregate storage.                   |
| `external`, `externalRecordedAt`      | Nullable JSON observation and recording timestamp. The timestamp makes recorded JSON null distinguishable from unfinished production.                                     |
| `nextRunAt`                           | Nullable durable eligibility deadline; initialized at original commit, updated on retry, cleared when observation recording succeeds.                                     |
| `lastProducerFailure`                 | Nullable existing public failure encoding for producer diagnostics.                                                                                                       |

1. Owner identity and version come from the VersionRepo key. Do not copy redundant owner fields onto each async row or resolve recovery through the initiating mapping. Freeze async contract name/version and payload in the emission itself.
2. Recording an emission during replay inserts only its immutable output columns. The normal producer columns remain null because replay never applies the async operation. There is no separate replay status, producer flag, or association to an original child. Changed replay programs may emit different async contracts, arguments, counts, or indexes; retain exactly that output while applying only model operations.
3. Original successful execution initializes the child ID, actor authority, and deadline in the same transaction as model changes and terminal output. Use the existing original-executor predicates: aggregate `originalExecutionVersion === key.aggregateVersion`; service `command.serviceVersion === key.serviceVersion`. An async emission requires an admitted actor context with the referenced async contract registered on that actor. Reject missing authority before commit; direct invocation without this context remains deferred.
4. Activation/recovery launches rows with `asyncCommandId IS NOT NULL`, `externalRecordedAt IS NULL`, and a due `nextRunAt`. Alarm scheduling finds the earliest `nextRunAt` among all rows with a child ID and no recorded observation, including future deadlines; it must not drop the alarm merely because no deadline is due yet. This excludes replay rows without adding a stored production-mode field. Validate lifecycle invariants through the table codec; never infer authority from the async contract's name prefix.
5. Complete output transport is the model/async operation union in original index order. Preserve model operation names; identify async entries as `operationName: 'async'` and carry their async contract name/version and encoded payload. Reconstruct the constant operation name from the async table; no stored `applicationKind` or duplicate kind column is needed. Transport immutable emission columns only. Mutable producer columns remain in the producing VersionRepo; history receivers retain emission data and never run recovery for it.
6. Preserve producer-owned async rows after source-command/output acknowledgement and after child admission. Existing source cleanup may delete command rows and model publication material, but must not delete async evidence, authority, or pending work. Pruning is deferred. History retains complete immutable output under its existing retention rules.
7. Rebuild the private child envelope from the retained async row and Repo key. Use `asyncCommandId` as the child's command ID, `asyncContractName`/`asyncContractVersion` as its command declaration identity, and the frozen payload as its payload. Its private `asyncInput` contains `sourceCommandId` and `external`; remove source contract name/version used only for old result-codec lookup. Owner/actor/async version pins remain in the existing envelope/context. Aggregate and service children clear initiating node/session occurrence fields.
8. Trusted child admission validates the retained producer row by child ID and its complete immutable envelope, using `asyncCommandId` to locate the emission that already retains `commandId` and `operationIndex`. Admission and replay do not duplicate that index in private input. Replay of an admitted child uses that child's persisted input; it never consults a replayed initiating emission. Do not require the source command row to remain locally available for producer recovery or child reconstruction.

## Transactions, recovery, admission, and replay

1. Commit complete successful output, locally applied model changes, eligible async lifecycle state, mapped result, and terminal history atomically. Rejection, invalid output/result, or failed application commits no new async emission. Preserve the previously recorded async external observation if its continuation rejects.
2. Arm recovery before committed pending work can be exposed. Start producers after commit, outside SQL transactions, execution semaphores, and owner gates. Original execution alone creates eligible production state; staging, duplicate execution, historical replay, and received emissions do not.
3. Keep one local active run per item until production, observation recording, interruption, and finalizers settle. Independent items proceed concurrently. Timeout interrupts and awaits settlement before retrying the same item. Retain approved defaults of 30,000 ms timeout and 1,000 ms retry delay. Persist no generation, attempt token, running claim, or retry counter.
4. Validate/encode the returned observation and atomically freeze it beside the emission and enqueue delivery. `externalRecordedAt` distinguishes recorded-null evidence from unfinished production. An interrupted detached callback cannot later record/enqueue. A recording/timeout race recovers recorded delivery instead of rerunning production.
5. Reuse the existing dedicated async command outbox and monotonic local delivery cursor. It references retained async data and stores delivery diagnostics, without duplicating immutable arguments/identity or retaining an admission receipt. Delete acknowledged deliveries only after confirmed durable admission. Keep unrelated queues unchanged.
6. Admit each child as a distinct backend-only command with the normal aggregate/service admission index. Pending production reserves no chain position. Preserve source context/authority, but do not reuse the initiating Node occurrence or issue a second initiating-command completion. Reject public invocation and fabricated observations. Exact duplicate input returns the original occurrence/index; conflicting immutable input fails.
7. Reconstruct recovery deadlines from durable rows through the existing `alarmRegistry`. Authored `Effect.retry` handles active production; durable deadlines handle later recovery. Recorded observations resume delivery only. Resolve exact original owner/actor/async pins, never a newer producer. Missing pins retain explicit failure diagnostics.
8. Provider capabilities require stable business idempotency/reconciliation after a remote effect whose local recording was interrupted. A recorded decline or unknown outcome remains immutable. Continuation rejection retains the observation and is terminal, not permission to repeat production. Later reconciliation is a new command/observation.
9. Historical mapped execution reruns the complete base-plus-mapper program and records its version-specific output/result. During application it ignores every async operation and applies only model operations. Do not introduce a replay-to-child association mechanism. An already admitted async continuation replays independently using its recorded payload and external observation; replayed initiating output cannot replace those inputs. Actor/history delivery applies or projects retained model output without starting producers.
10. Private async replay decodes unchanged payload/observation using producing context and validates them against the replaying version's synchronous async contract definition. Missing/incompatible inputs fail explicitly. Public payload adaptation does not translate private payloads or observations. Authorized state changes publish through existing actor projection without exposing private completion inputs to unrelated sessions.

## Implementation and verification

1. Update core mapping/async declarations, requirements inference, bound emitters, collectors, structural specs, exports, public locks, and authorization using the agreed interface and schemas above. Replace obsolete `after` fixtures outright.
2. Cut over operation storage and complete-output readers/writers/transport together. Preserve the command-table organization left by plan 030 and its owned execution, actor projection, and session behavior. Wire unified async retention to aggregate/service transaction paths and existing recovery/admission machinery.
3. Extend existing contract-program and async fixtures for explicit registration, undeclared/unregistered async contracts, precise payload/observation/result inference, model scopes, original business failures, base-before-mapper order, synchronous requirements, and mapped codec validation.
4. Verify remaining owner execution, actor projections, session synchronization, and optimistic replay. Include idempotent repeated deliveries in both aggregate and service histories, multiple emissions to the same async contract, mixed model/async output reconstruction, and stable original operation indexes. Ensure the cutover does not restore `applicationKind`, `importedOperations`, observed applications, or outbound model emissions.
5. Exercise aggregate/service transaction seams for success, mapper rejection, invalid output/result, failed application, and rollback. Assert atomic terminal retention and no eligible work for staging, replay, duplicate execution, or received emissions. Assert recorded async observations survive continuation rejection. Acknowledge and delete source publication/command rows, then verify async recovery and child reconstruction still work from retained async data.
6. Verify browser staging with the original codec, locks against the original declaration, authoritative decoding with the mapped codec, exact server registration, and absence of mapping/async capabilities from browser exports.
7. Preserve async runner/admission cases: concurrent different-item progress, overlapping alarms, blocked timeout finalizers, late promise completion, recorded-null evidence, recording/enqueue rollback, monotonic outbox indexes, duplicate admission, conflicting input, and private authority.
8. Verify replay under changed programs/results, including an added `asyncSendReceipt` emission and changed async payload/ordering. Assert the new history records that output while applying only model operations, with zero producer calls, enqueues, or child-command allocations. Cold-activate a Repo containing replay-only async rows and assert no producer recovery is scheduled. Verify a fresh original command under that updated version does run the new producer. Retain unchanged original continuation observations and explicit failures for missing/incompatible codecs. Use the existing disposable Workerd harness for restart after source commit, provider effect before recording, observation/outbox commit, and admission before deletion; record actual runtime evidence.
9. Use the resolved Nx checks below, rechecking configuration if it changes before implementation. They are acceptance checks for the revised design and have not run for it. Keep Shopping and Tic Tac Toe excluded; diagnose and report unrelated blockers without claiming adjacent plans' checks passed.
   1. `pnpm nx run-many -t contract-programs:check async-contracts:check async-contracts:runtime-check command-history:restart:check -p system-worker`.
   2. `pnpm nx run-many -t ts lint -p @zerospin/core system-worker @zerospin/browser`.
   3. `pnpm nx run @zerospin/sdk:lib`.
   4. `pnpm nx run @zerospin/core:node-outcomes:check` and `pnpm nx run @zerospin/browser:agent-preview:check` for affected actor/session and browser-export behavior.
   5. Check formatting, local links, and whitespace in the changed documentation.

10. After implementation, reconcile glossary, affected workflows/module READMEs, and qualifying patterns. Create an ADR only for an implemented decision that is hard to reverse, surprising without context, and a real trade-off. Record verification evidence, reconcile the handoff, and archive only when no required work remains. Do not update glossary/ADRs during planning.

**Governing ADR:** [Async replay retains output without production](../../adrs/001-async-replay-retains-output-without-production.md).

## Alternatives and rationale

1. Automatic `after`, source-result payloads, and inferred registries are superseded by explicit mapped emissions and direct async contract resolution. Authors control conditional emission in the mapped program without another triggering API.
2. A generic model/async history row plus separate producer-work row is superseded by `modelOperations` and `asyncOperations`. Async contract identity, arguments, and lifecycle remain together; complete output is reconstructed using occurrence/order metadata.
3. Separate authored/imported model-operation tables are removed. Plan 030 deletes subscription-driven imported history; remaining history, delivery, and replay share `modelOperations`. Its removal of observed models and service emissions also eliminates the reason for `applicationKind`, including the proposed nullable form.
4. Separate mapped versioning and mapper-only business failures are rejected in favor of existing server version context and original public failure declarations. Browser staging and authoritative results intentionally use different declared codecs.
5. Pending admission positions, producer execution under owner gates, persisted attempt fencing, and provider recapture during replay remain rejected. Independent producer progress and immutable observations preserve the established lifecycle.

## Verified outcome

1. Implemented `mapContractVersion`, independent async payload descriptors, exact owner/actor registration, original browser staging/locks, authoritative mapped results, and server-only exports. Mapper queries expose only declared models; its immutable command input excludes terminal/admission metadata.
2. Replaced operation storage with ordered `modelOperations` and `asyncOperations`. Original execution commits eligible async lifecycle with model changes and terminal output. Replay records its full mapped output with null producer lifecycle and applies only model operations. Histories and actor projections preserve mixed-output indexes.
3. Replaced separate external-work storage with retained emission/lifecycle and minimal monotonic async outbox. `asyncCommandId` identifies the private continuation and locates its retained emission. Private input contains only `sourceCommandId` and `external`; the emission's `operationIndex` is not duplicated. Async transport retains `operationName: 'async'`. Recovery survives source cleanup and resolves retained exact authority, including aggregate system name.
4. All Nx acceptance commands listed above passed after the final identity/input change: focused contract/async/history checks, scoped TypeScript and lint (no lint errors or warnings), SDK build, node outcomes, and browser agent preview.
5. Disposable Workerd restarts passed after source commit, provider effect before recording, observation/outbox commit, and admission before deletion. Provider call counts were respectively **1, 2, 1, 1**; each scenario recovered its stable async command ID, admitted it once at chain index 2, drained its outbox, and returned `receipt:restart`. Both aggregate acknowledgement orders passed across SQLite restart. The second provider call demonstrates the authorized reconciliation requirement after unrecorded remote work.
6. Fixtures passed original/mapper result validation and rejection, synchronous requirements, original staging, multiple async emissions, atomic rollback for both owners, both actor projections, repeated/conflicting history delivery, duplicate/conflicting private admission, immutable recording/enqueue rollback, recorded-null evidence, timeout/finalizer settlement, late-promise fencing, changed continuation replay and incompatible input failure. Changed mapped replay emits a new async contract with no allocation/production/enqueue; a fresh original command under that version runs both producers. Both owners retain observations after continuation rejection.
7. Updated glossary, affected workflows, module READMEs and local contract pattern. The governing ADR records the durable replay trade-off. Formatting, local links in maintained documentation and repaired inbound links, and whitespace checks passed. Unchanged historical source links in superseded plan 025 still refer to its removed implementation; they were excluded from the scoped link gate. Nx Cloud reported access code 401; every required local command still exited successfully. Shopping/Tic Tac Toe and provider integrations remain outside scope.

## Remaining work

None.
