# SystemWorker telemetry and LogRepo persistence plan (completed)

## Goal

1. Graduate `@zerospin/logger` from the isolated workerd proof into the real `SystemApi.finalizeAccountCommands` workflow.
2. Preserve the current public `ISystemApi.finalizeAccountCommands` `Schema.EitherEncoded` response contract.
3. Carry one trace through `SystemApi` → `SystemWorker` → `AccountRepo` → `AccountBlockRepo` → `ActorRepo`.
4. Persist completed synchronous, drain, and alarm telemetry in structured LogRepo tables.
5. Ship the happy path, domain-error path, transport-retry path, deferred drain path, and alarm-resume path together.

## Settled decisions

1. `makeRpcHandler` will return an `Effect`; it will no longer call bare `Effect.runPromise`.
2. WorkerEntrypoint and Durable Object public methods remain thin Promise boundaries that immediately call their existing `managedRuntime.runPromise(...)`.
3. Logger transport stays generic. Zerospin RPC call sites explicitly encode `ZerospinError` values before returning an envelope and explicitly decode them after `makeTraceableRpcTarget` unwraps an envelope.
4. LogRepo stores spans, logs, and links in separate structured tables.
5. The originating SystemApi preserves the external API response and sends the completed batch to a non-instrumented internal `SystemWorker.appendTelemetryBatch` sink RPC.
6. Deferred AccountBlockRepo drain and alarm roots persist their own telemetry batches directly to LogRepo because they execute after the originating SystemApi request has completed.
7. Telemetry persistence is best-effort. A LogRepo failure must not change account-command success or failure.
8. The sink RPC and LogRepo append method are deliberately not instrumented, preventing telemetry-persistence recursion.
9. No compatibility overloads, optional legacy argument paths, or alternate encoded-return shapes will remain after each migrated method is updated end-to-end.

## Explicit approvals carried by this plan

1. Add `ILogId = \`lgr_${string}\`` in `packages/logger/src/types.ts` and add `logId` to `ILogRecord`.
2. Add `ISpanLinkId = \`lnk_${string}\`` in `packages/logger/src/types.ts` and add `linkId` to `ISpanLinkRecord`.
3. Add synchronous `makeLogId()` and `makeSpanLinkId()` generation beside the existing trace/span ID generation.
4. Add the three explicit insertion loops in `LogRepo.appendTelemetryBatch`: one over spans, one over logs, and one over links. Do not introduce a generic row-mapping helper.
5. Add the internal RPC `SystemWorker.appendTelemetryBatch({ batch })` and the public LogRepo method `LogRepo.appendTelemetryBatch({ batch })`.
6. Add no other named type aliases, interfaces, helpers, wrappers, services, or exports unless a compile/runtime constraint is reported and separately approved.

## Scope boundaries

1. This pass instruments the complete account-finalization workflow proven by the logger workerd test.
2. This pass updates every caller affected by changing `SystemWorker.finalizeAccountBlock`, `AccountRepo.finalizeAccountBlock`, `AccountBlockRepo.publish`, and `ActorRepo.handleAccountBlocks` to request/envelope RPC contracts.
3. This pass does not instrument unrelated SystemWorker methods, service finalization, query methods, FrontendApi methods, or RepoExplorer methods.
4. This pass does not add a trace UI or change LogAgent websocket state. Structured rows remain available through LogRepo and RepoExplorer tables.
5. This pass does not export telemetry in the public SystemApi response and does not add OTLP export.

## Task 1: Graduate the logger boundary to real managed runtimes

1. Modify `packages/logger/src/makeRpcHandler.ts`.
   1. Preserve `makeRpcHandler(name)(generator)(request)` naming and call shape.
   2. Generalize the generator environment beyond `TelemetryCollector` so domain effects may require `Async`, ID factories, or other existing runtime services.
   3. Return `Effect.Effect<IRpcEnvelope<A, E>, never, R>` after installing the per-call telemetry layer.
   4. Remove the internal `Effect.runPromise`; the Worker/DO boundary owns execution.
2. Modify `packages/logger/src/types.ts`.
   1. Replace the spike `IEitherEncoded` alias with Effect's real `Schema.EitherEncoded` type in `IRpcEnvelope`.
   2. Add the approved `ILogId` and `ISpanLinkId` types and record fields.
3. Modify `packages/logger/src/makeTelemetryIds.ts`, `makeTelemetryLogger.ts`, and `makeTelemetryTracer.ts`.
   1. Generate stable log and link IDs when records are first created.
   2. Preserve IDs when batches merge or retry persistence.
4. Update logger Node and workerd fixtures.
   1. Use `Effect.runPromise` only in test/runtime entrypoints around the Effect returned by `makeRpcHandler`.
   2. Keep the current three-trace DAG snapshot unchanged except for the new record IDs.
5. Add a workerd assertion that an encoded Zerospin-style JSON error crosses the envelope unchanged while the remote span ends with `status: 'error'`.

## Task 2: Link workspace packages through pnpm

1. Run `pnpm add @zerospin/logger --filter system-worker --workspace`.
2. Run `pnpm add @zerospin/logger --filter @zerospin/dispatch-worker --workspace`.
3. Verify each consumer has a real `node_modules/@zerospin/logger` workspace symlink.
4. Do not add TypeScript path aliases or manually edit these dependency entries.

## Task 3: Add structured telemetry tables to LogRepo

1. Modify `packages/system-worker/src/LogRepo/LogRepo.ts` and keep the shapes inline with the owning table definitions.
2. Add `telemetrySpans` with these columns.
   1. `spanId` as the primary key.
   2. `traceId`, nullable `parentSpanId`, `name`, `status`, `startedAt`, `endedAt`, nullable JSON `attributes`.
   3. `systemId` and `systemVersion` supplied by LogRepo rather than the incoming batch.
   4. Indexes on `traceId`, `parentSpanId`, and `endedAt`.
3. Add `telemetryLogs` with these columns.
   1. `logId` as the primary key.
   2. Nullable `traceId`, nullable `spanId`, `createdAt`, `level`, `message`, `source`, nullable JSON `payload`.
   3. `systemId` and `systemVersion`.
   4. Indexes on `traceId`, `spanId`, and `createdAt`.
4. Add `telemetryLinks` with these columns.
   1. `linkId` as the primary key.
   2. `traceId`, `spanId`, `priorTraceId`, `priorSpanId`, and `kind`.
   3. `systemId` and `systemVersion`.
   4. Indexes on `traceId`, `spanId`, and `priorTraceId`.
5. Use `InferDecodedRow` assertions against the logger record shapes after omitting LogRepo-owned `systemId` and `systemVersion` fields.
6. Create `packages/system-worker/src/LogRepo/appendTelemetryBatch/appendTelemetryBatch.ts`.
   1. Define the same-named `Effect.fn('LogRepo.appendTelemetryBatch')`.
   2. Accept `db`, `batch`, `systemId`, and `systemVersion` in one inline props shape.
   3. Validate `systemId` using the existing System ID schema approach.
   4. Insert spans, logs, and links in one SQLite transaction using the three approved explicit loops.
   5. Use the stable record IDs plus `onConflictDoNothing()` so retrying the same batch is idempotent.
   6. Retain the newest 1,000 traces by latest span `endedAt` and delete older span/log/link rows together so retention never leaves a partial trace.
7. Add `LogRepo.appendTelemetryBatch({ batch })` in `LogRepo.ts`.
   1. Delegate immediately to the same-named Effect function.
   2. Supply `this.db`, `this.key.systemId`, and `this.env.ZEROSPIN_SYSTEM_VERSION`.
   3. Return the existing encoded Zerospin RPC Either shape.
8. Do not add one-consumer table-shape files or a generic telemetry-table factory.

## Task 4: Add the non-recursive SystemWorker sink RPC

1. Add `SystemWorker.appendTelemetryBatch(props: { batch: ITelemetryBatch })` in `packages/system-worker/src/SystemWorker.ts`.
2. Resolve LogRepo using `env.ZEROSPIN_SYSTEM_ID` and the existing `getLogRepo` boundary.
3. Call `logRepo.appendTelemetryBatch({ batch })`, decode the existing RPC result, and encode the SystemWorker result.
4. Keep this method unwrapped by `makeRpcHandler` so storing telemetry cannot generate another telemetry batch.
5. Catch persistence failures only at the originating or deferred caller; the sink method itself must return its real encoded error.

## Task 5: Instrument the synchronous finalize chain

1. Modify `SystemApi.finalizeAccountCommands` in `packages/dispatch-worker/src/SystemApi/SystemApi.ts`.
   1. Store the constructor's existing `systemId` in a private field for telemetry annotations and sink diagnostics.
   2. Create one collector per invocation and install `makeTelemetryLayer(collector)` around a root `SystemApi.finalizeAccountCommands` span.
   3. Resolve SystemWorker per call as it does today.
   4. Wrap the stub with `makeTraceableRpcTarget` and invoke `finalizeAccountBlock` with the unchanged domain props.
   5. Decode encoded Zerospin errors immediately after the wrapped call, retain `retryTransientDoErrors`, and keep the final public `encodeRpc` result unchanged.
   6. After the root span closes on success or failure, flush once and call unwrapped `systemWorker.appendTelemetryBatch({ batch })`.
   7. Make the sink best-effort without replacing the account-finalization result.
2. Modify `SystemWorker.finalizeAccountBlock`.
   1. Accept `IRpcRequest<[props]>` and return `Promise<IRpcEnvelope<IAccountBlockOutboxRecord, IAnyErrorJson>>`.
   2. Use `makeRpcHandler('SystemWorker.finalizeAccountBlock')` around the current domain program.
   3. Remove the duplicated `recordSystemWorkerLog` started/succeeded/failed calls for this method only; Effect logs/spans now own those observations.
   4. Wrap AccountRepo with `makeTraceableRpcTarget`, decode its encoded error JSON, and preserve the current repo lookup and result.
   5. Execute the handler Effect with the existing system-worker `managedRuntime`.
3. Modify `AccountRepo.finalizeAccountBlock`.
   1. Accept the request envelope and return the telemetry response envelope.
   2. Delegate to the existing same-named `finalizeAccountBlock` Effect and `drainAccountOutboxes` without rebuilding commands or block rows.
   3. Execute with the existing managed runtime and explicitly encode errors for the wire.
4. Modify `AccountRepo.publishAccountBlock`.
   1. Wrap AccountBlockRepo with `makeTraceableRpcTarget`.
   2. Preserve the existing retry schedule and `Either` conversion that records terminal publish failure on the outbox row.
   3. Decode encoded Zerospin errors immediately after the wrapped call.
5. Modify `AccountBlockRepo.publish`.
   1. Accept a request envelope and return a telemetry response envelope.
   2. Delegate to the existing same-named publish Effect.
   3. Capture the completed publish span context for the deferred drain before scheduling `ctx.waitUntil`.
   4. Preserve the existing idempotent block archive and drain scheduling.

## Task 6: Instrument and persist deferred drain/alarm telemetry

1. Persist only the minimal trace-link context in AccountBlockRepo Durable Object storage.
   1. Store the successful publish span as the next drain's `causedBy` context.
   2. Store the failed process-subscriber span as the next alarm's `retryOf` context.
   3. Delete each stored context after the corresponding root consumes it.
2. Modify `AccountBlockRepo.drainActorOutbox`.
   1. Run a root `AccountBlockRepo.drainActorOutbox` telemetry handler with no parent.
   2. Add the stored publish span as a `causedBy` link.
   3. Run the existing queue refresh, concurrency, delivery, and settled-alarm behavior unchanged.
   4. Flush the completed root batch and append it directly to LogRepo in the same `waitUntil` task.
   5. Keep telemetry persistence best-effort while preserving real drain failures for the queue/alarm logic.
3. Modify `AccountBlockRepo.processSubscriber`.
   1. Wrap ActorRepo with `makeTraceableRpcTarget` and decode its encoded error JSON.
   2. Preserve current cursor claims, delivery-attempt fields, retry timing, and success updates.
   3. On delivery failure, capture the current `AccountBlockRepo.processSubscriber` span and persist it as the next alarm's retry context.
4. Modify `ActorRepo.handleAccountBlocks`.
   1. Accept a request envelope and return a telemetry response envelope.
   2. Delegate to the existing same-named Effect without rebuilding account blocks.
   3. Execute with the existing managed runtime and explicit error encoding.
5. Modify `AccountBlockRepo.alarm`.
   1. Run a root `AccountBlockRepo.alarm` telemetry handler with no parent.
   2. Add the stored failed-delivery span as a `retryOf` link.
   3. Run the existing alarm/drain behavior as a nested `AccountBlockRepo.drainActorOutbox` span rather than creating a second root.
   4. Flush and append the alarm batch directly to LogRepo.
   5. Preserve alarm rescheduling and queue-settlement behavior on every exit path.

## Task 7: Update every affected caller without compatibility paths

1. Update `ActorRepo.pushActorCommands` to call the migrated AccountRepo target through `makeTraceableRpcTarget` inside an ambient boundary collector, then persist its completed origin batch to LogRepo.
2. Update parking and shopping workerd specs that call `SystemWorker.finalizeAccountBlock` directly.
   1. Send the new request envelope explicitly or invoke through a wrapped target under a test collector.
   2. Decode `envelope.result` with the existing `decodeRpc` boundary.
   3. Do not add production compatibility overloads for tests.
3. Update AccountRepo and FrontendRepo workerd specs that call `AccountRepo.finalizeAccountBlock` directly in the same way.
4. Update any TypeScript-exposed SystemWorker/Repo target shapes to the exact request/envelope contracts.
5. Grep the four migrated method names after edits and leave no old-shaped call site.

## Task 8: Test persistence and the production workflow

1. Add focused logger tests.
   1. `makeRpcHandler` returns an Effect requiring the domain environment.
   2. Encoded JSON failures produce error spans.
   3. Log and link IDs remain stable through merge and persistence retry.
2. Add `packages/system-worker/src/LogRepo/LogRepo.workerd.spec.ts`.
   1. Append a batch containing at least one span, log, and link.
   2. Append the identical batch again.
   3. Inspect the LogRepo database and assert one stored row per stable ID.
   4. Assert `systemId` and `systemVersion` are supplied by LogRepo.
   5. Assert a failed insert rolls back the entire batch.
   6. Assert retention deletes all three row kinds for an evicted trace.
3. Add or extend a shopping workerd integration spec through the actual public SystemApi.
   1. Finalize an account command through `getSystemApi` rather than calling SystemWorker directly.
   2. Run the real AccountBlockRepo drain and alarm retry path.
   3. Read LogRepo tables and reconstruct the stored DAG.
   4. Assert three roots: request, drain, and alarm.
   5. Assert the request trace contains SystemApi, SystemWorker, AccountRepo, AccountBlockRepo publish, and lost/retry spans.
   6. Assert `causedBy` and `retryOf` links point backward to the correct stored spans.
   7. Assert the public API result remains the existing encoded account block.
4. Preserve and rerun the isolated logger Node/workerd DAG specs as the fast contract suite.

## Task 9: Synchronize architecture documentation

1. Update `wiki/architecture/SystemApi.md`.
   1. Add the telemetry collector and LogRepo persistence path to the finalize-account sequence.
   2. Document that the public API response remains unchanged.
   3. Document the non-instrumented sink RPC and best-effort persistence behavior.
2. Update `wiki/architecture/Blockchain.md`.
   1. Add the account-finalization trace across SystemWorker, AccountRepo, AccountBlockRepo, and ActorRepo.
   2. Document separate request, drain, and alarm trace roots plus `causedBy`/`retryOf` links.
   3. Keep block ownership and delivery behavior unchanged.
3. Refresh every changed `sources[].sha` with `git hash-object` and update cited line ranges.
4. Append one numbered manual-doc entry to `wiki/log.md` describing structured LogRepo telemetry and the finalize workflow.
5. Do not change unrelated architecture pages.

## Task 10: Verification through Nx

1. Run `nx run @zerospin/logger:test`.
2. Run `nx run @zerospin/logger:test:workerd`.
3. Run `nx run @zerospin/logger:ts`.
4. Run `nx run @zerospin/logger:lint`.
5. Run `nx run system-worker:test`.
6. Run `nx run system-worker:test:workerd`.
7. Run `nx run system-worker:ts`.
8. Run `nx run system-worker:lint`.
9. Run `nx run @zerospin/dispatch-worker:test`.
10. Run `nx run @zerospin/dispatch-worker:ts`.
11. Run `nx run @zerospin/dispatch-worker:lint`.
12. Run `nx run shopping:test:workerd` and `nx run parking:test:workerd` after their direct call-site migrations.
13. Run `git diff --check`.

## Completion criteria

1. The public SystemApi account-finalization result is byte-shape compatible with the current `Schema.EitherEncoded` contract.
2. The synchronous request is one trace across SystemApi, SystemWorker, AccountRepo, AccountBlockRepo, and ActorRepo RPC boundaries.
3. Deferred drain and alarm work are separate persisted roots linked by `causedBy` and `retryOf`.
4. LogRepo persists spans, logs, and links atomically and idempotently with bounded retention.
5. Telemetry sink failures do not change command finalization, drain settlement, or alarm rescheduling.
6. No migrated RPC retains its previous argument or return shape as a fallback.
7. No telemetry persistence RPC instruments itself.
8. All affected callers, tests, package dependencies, and architecture docs are updated in the same pass.
9. Every listed Nx target and `git diff --check` passes.
