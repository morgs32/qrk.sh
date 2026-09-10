# Plan 068 — Aggregate-version materializer cutover

Status: implemented with pinned service replicas on 2026-09-07. Focused behavior checks pass; broader verification remains blocked by existing worktree failures listed below. Do not archive.

Source: [archived Spec 068](../archived/068-spec-aggregate-version-cutover.md). The pinned-service and independent-frontend decisions in this plan supersede that spec's Chain-owned captures, canonical base-result storage, service-command admission into the aggregate chain, and cutover gate spanning remote execution.

## Outcome and ownership

1. Preserve AAC → VAR → VAFC → VARR → VFFC for aggregate commands. AAC admits complete immutable command inputs and selects a base aggregate version. Each VAR owns execution and VAFC publication for one aggregate version.
2. VAR and VARR independently consume pinned VSFC histories. Service updates do not enter AAC, change aggregate admission indices, or create VAFC entries.
3. VARR retains its existing projection role and publishes one combined frontend stream. VFFC output order is `frontendIndex`; `aggregateIndex` is the latest consumed aggregate watermark. Keep VSRR for standalone service frontends. There is no VMFR.
4. Preserve strict success/failure-history comparison for aggregate and service cutover. Mutable replica observations can change a guard's result even when its code is unchanged; such a candidate must fail comparison.
5. Use the pre-release hard cutover: changed fixed schemas require a fresh `systemId` and empty storage. Do not preserve obsolete protocol fields, queues, decoders, migrations, aliases, or derived service-command paths. Shared and remote state resets are outside this work.

## Identity and authored definitions

1. AAC binds `{ systemId, aggregateId, aggregateName }`; VAR and VAFC additionally bind `aggregateVersion`. Worker configuration supplies `systemId`; the direct command or admitted frontend capability supplies the aggregate fields; AAC selection or registration supplies `aggregateVersion`.
2. VARR and VFFC additionally bind `{ userId, frontendName }`. Authentication supplies `userId`; the admitted frontend capability supplies `frontendName`. Snapshot tickets retain the exact versioned VFFC identity.
3. Within either materializer, a service source is `{ serviceName, serviceVersion }`; the enclosing materializer key supplies `systemId`. Resource enrollment adds `{ modelName, resourceId }`. The aggregate definition supplies `serviceName` and its version pin, the replica model supplies `modelName`, and a replication mutation supplies `resourceId`.
4. Require `makeReplica({ sourceModel, modelVersion, serviceName })`. The explicit model version selects the schema, inferred resource type, and supported historical definitions. Preserve the canonical authoritative `sourceModel` identity; selecting an older replica version does not replace provenance with a copied source object.
5. Add `services: Record<string, string>` to current and historical aggregate snapshots. Example:

   ```ts
   makeReplica({
     sourceModel: Product,
     modelVersion: '2.0.0',
     serviceName: 'catalog',
   });

   // On the corresponding aggregate snapshot:
   services: {
     catalog: '5.0.0';
   }
   ```

6. Validate every current and historical aggregate snapshot against its pinned service snapshots. Require the service, require that service snapshot, and require exact source-model version equality. Existing canonical source ownership and replica/model validation remain in force.
7. Preserve pins through `aggregate.getVersion`, authored historical-definition validation, `makeSystemSpec`, and `SystemSpecSchema` round trips. Model and contract executable history remains authored on the model and contract; aggregate/service historical definitions remain snapshot tuples.
8. Missing executable snapshots fail explicitly. Never substitute current definitions for a persisted pin. Changing SAC's base does not change an existing aggregate's service source.

## Admission, registration, and retained execution

1. AAC commands retain aggregate-only input rows: admitted position, command ID, complete encoded command, canonical bytes, and admission time. Delete its service subscriber, service subscription discovery, derived service admission, and service-frontier columns.
2. SAC continues admitting complete service commands, registering materializers, and comparing strict service cutover checkpoints. Delete its aggregate-delivery queue, subscriber table, delivery-version ranges, finalized-history stitching, and associated notification methods.
3. Retain versioned aggregate terminal execution entries in VAFC and service terminal entries in VSFC. The original command, execution timestamp, preparation version, prepared mutations, and relevant execution metadata stay intact across outboxes and fanout.
4. Register a pinned VSR even if its service version has never been SAC's current base. `VSR.catchup` reuses `SAC.initialize({ serviceVersion })` before consuming admission history. Every registered, valid pinned service materializer continues receiving service admissions after a base cutover.
5. VSFC owns distinct typed `aggregateFanoutQueue`, `aggregateReplicaFanoutQueue`, and existing `serviceReplicaFanoutQueue` queues. Queue progress belongs to the exact subscribed materializer identity.
6. VAR commits its aggregate head, disposition hash, resources, and terminal results outbox atomically. Direct retries recover the selected base's retained result from the pending outbox or VAFC. VAFC durability is required by `flush`, while ordinary direct execution does not wait for browser publication.

## Initial replica materialization

1. Keep full-resource `replicate` mutations. Caller resources serve optimistic execution; VAR resolves authoritative resources from each aggregate snapshot's pinned VSR before opening the SQLite transaction.
2. Read each resource and its service position atomically from that source materializer. Finalized replication operations include `serviceName`, `serviceVersion`, `serviceIndex`, and the complete effective resource, preserving the originating command ID and mutation index.
3. Hold VAR's execution permit throughout preparation so its committed source cursor cannot move between reading progress and committing a command. Contract mutation evaluation and service RPCs occur before opening SQLite transactions.
4. For a new resource whose copy at `S` is older than committed source progress `G`, read and validate retained VSFC entries `(S, G]` before committing enrollment. Replay matching resource changes and tombstones in source order; unrelated and failed occurrences still establish that the copy is current through `G`.
5. Inside the command savepoint, install effective replica copies and provisional enrollment before running either execution guard. Existing guards query the transaction's replica state. Apply aggregate-owned mutations afterward.
6. A newer enrolled copy wins over an older fetched copy. Successful finalized replication mutations publish the resource actually retained by VAR and its effective source position.
7. A domain rejection rolls back provisional replicas, enrollment, and aggregate mutations together. A missing initial resource is a domain failure with no enrollment. Transport, malformed source history, or persistence failures before commit leave the aggregate occurrence retryable from its durable head.
8. VARR consumes successful initial copies from VAFC. It does not independently fetch an initial replacement from VSR. It performs the same bounded retained-history catch-up when a newly enrolled copy is behind its own committed source cursor.

## Independent source progress and recovery

1. VAR and VARR persist `serviceSources` with each pinned version and consumed service position, plus `replicaResources` enrollment and per-resource freshness. These are fixed-schema local tables, not AAC admission metadata.
2. For a first source enrollment, begin source progress at the earliest necessary initial-copy position. Copies ahead of that cursor skip source changes already covered by their own freshness frontier. Never rewind an existing global source cursor.
3. Consume complete terminal VSFC entries in order. Apply changes and tombstones only to enrolled resources. Failed commands and unrelated changes still advance source progress; duplicate committed delivery does not apply another change.
4. Validate source identity, execution version, terminal occurrence, and contiguous position before committing. Invalid delivery rolls back the source page, does not advance its cursor, and retains the existing fanout subscriber failure. Do not fabricate an aggregate failure command.
5. Hold a durable alarm lease before committing new subscription work. Subscribe after commit and outside the receiving execution permit. Cold activation and alarms enumerate committed enrollments and subscribe from committed progress.
6. Retained VSFC history closes the interval between initial source reads and completed subscription. A failed or interrupted subscribe leaves durable work recoverable. Re-enrollment must not erase a publisher's terminal subscriber failure.
7. Recheck newly committed source identities under the execution permit before releasing the subscription alarm lease. A concurrent enrollment must not lose its recovery wakeup.
8. Keep enrollment for the materializer's lifetime. Do not add automatic unsubscribe, reference-count cleanup, or service-stream garbage collection.

## Combined frontend publication

1. VARR serializes VAFC and VSFC application through one execution permit. For each consumed source occurrence, commit resource changes, consumed progress, the projected graph, resolved command IDs where applicable, and one outgoing delta together.
2. Publish the following shape:

   ```ts
   {
     frontendIndex,  // contiguous VFFC output position
     aggregateIndex, // latest consumed aggregate position
     delta,
     resolution,
   }
   ```

3. Service-only outputs retain the aggregate watermark and have `resolution: null`, including empty outputs for failed or unrelated source occurrences. Aggregate resolutions retain the complete original command identity. Different VARR instances may interleave independent inputs differently; each output history is durable and replayable.
4. Index VARR's delta outbox and VFFC's history by `frontendIndex`. Use it for contiguous validation, duplicate handling, bounded history reads, replay completion, WebSocket resume, and live delivery.
5. Capture snapshot graph, both indices, and resolved command IDs under execution exclusivity. Release the permit, then await VFFC publication through that captured frontend position before returning the snapshot.
6. Browser snapshots, buffers, reconnect, and restored state use `frontendIndex` for output ordering. Aggregate push receipts and journal `pushIndex` remain aggregate admission positions.
7. Preserve the browser transaction: undo optimistic changes, apply the authoritative delta, process an actual matching terminal resolution, reapply remaining optimism, and commit resources with both cursors. A service-only output cannot acknowledge a pending command.

## Cutover

1. Plan 075 supersedes manual aggregate cutover: bundled configuration supplies durable desired intent and the AAC alarm performs checked promotion. Retain manual service cutover. Registration and source catch-up do not promote a base.
2. Sample an admitted comparison position `n`. Flush base and candidate concurrently through that exact position without holding a SQLite transaction or a chain-wide gate across remote execution. Admissions may continue while the comparison runs.
3. Compare the exact command identity and rolling disposition hash at `n`. The aggregate hash advances from its fixed genesis with `[previousHash, aggregateIndex, commandId, disposition]`; service cutover keeps its corresponding strict history comparison.
4. Promote using a compare-and-set of the base pointer after equal checkpoints. Invalidate a divergent candidate. Transport or persistence failure cannot promote it or rewrite terminal history.
5. Different replica observations may invalidate a candidate even when the guard implementation is unchanged. Do not freeze replica data, copy base outcomes, or weaken comparison to make promotion succeed.

## Implementation and verification sequence

1. Update authored replica/model inference, aggregate current and historical service pins, serialized specs, and every affected non-vendored caller including Shopping.
2. Delete SAC→AAC service delivery and obsolete schemas. Preserve admission, registered service materializer delivery, direct result recovery, and strict cutover.
3. Implement VAR authoritative initial copies before guards, effective-copy publication, source enrollment, late catch-up, and durable subscriptions. Verify rejection rollback, missing resources, retryable infrastructure failure, duplicate delivery, and tombstones.
4. Implement VARR direct source consumption and combined output transactions. Verify independent source order, late enrollment, ahead-of-cursor copies, failed/unrelated source progress, invalid-source rollback, interrupted subscription, and captured snapshot publication.
5. Update VFFC and browser snapshot/reconnect/persistence seams. Verify `A1/F1`, service-only `A1/F2`, and terminal `A2/F3`; duplicate and missing frontend positions; unequal snapshot indices; and unresolved optimism without false acknowledgement.
6. Retain authored-definition, real SQLite, and Workerd tests. Prove pinned subscriptions survive service-base changes and prove actual same-guard/different-replica executions invalidate aggregate cutover.
7. Run relevant Nx library builds, tests, and typechecks for `@zerospin/core`, `system-worker`, and `@zerospin/frontend`, including `system-worker:test:workerd`. Verify affected Shopping and inspection callers. Record failures accurately; do not label unrelated worktree failures as baseline without comparison evidence.
8. Synchronize architecture, glossary, patterns, and inspection surfaces. Remove active references to deleted source paths. Keep historical archived design documents as history.
9. Use the new Shopping development `systemId` with empty namespaced storage. Workerd tests use isolated fresh state. Do not delete existing shared, remote, or production-like storage.

## Recorded verification

1. `system-worker:test`: 104 tests pass. `system-worker:test:workerd`: 32 tests pass. `system-worker:ts` and its library dependency pipeline pass.
2. `@zerospin/frontend:test`: five tests pass; its own `ts` target passes. Studio's four inspector tests and its own typecheck pass. Shopping's four Workerd tests pass after aligning its SQL.js test resolver and fresh-session fixture with the current runtime.
3. The full Core suite has 302 passing tests and one recursive System immutability-check failure (the check was removed on 2026-09-09). An isolated copy of HEAD plus the starting worktree changes reproduces that exact failure. The Core typecheck retains exactly the same 86 baseline diagnostics, with no diagnostics in the new replay test; the authored pin tests and historical replica inference checks pass.
4. Full frontend and Shopping typecheck pipelines encounter existing `opfs-backup-worker` references to missing `backupClientId`; Shopping additionally encounters the unchanged duplicate `serviceIndex` declaration in the service DevTools pane. Those unrelated runtime surfaces remain outside this implementation.
5. Shopping uses `sys_shopping_20260907_pinned_replicas` in development and Workerd configuration, leaving the previous namespace untouched.

## Non-goals

1. Admission-time resource captures or frozen replica observations.
2. New admission-guard capabilities, contract evidence fields, or runtime dependency APIs.
3. VMFR or additional browser service streams for aggregate frontends.
4. Automatic promotion, deployment coordination in SystemRepo, or cleanup of retained pinned service histories.
