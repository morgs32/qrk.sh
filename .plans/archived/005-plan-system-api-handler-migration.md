# 005 — SystemApi Handler Migration Implementation Plan

## Summary

1. Migrate the complete concrete `SystemApi` surface to the linked request-envelope boundary already proven by `FrontendApi`.
2. Keep secret-key capability construction untraced, then give every valid leaf one fresh disposable SystemWorker, one named root Effect, one completed telemetry batch, best-effort persistence through that same raw worker, and one linked encoded response.
3. Preserve the root RPC route, SystemWorker and Repo contracts, RepoExplorer behavior, command objects, domain validation, and the exact existing retry placement.
4. Replace the drifting handwritten `ISystemApi` and now-redundant `IPublicApis` only after a concrete-type proof preserves synchronous nested-target declarations for all remaining leaves.
5. Update every concrete caller, add the missing focused SystemApi and Studio coverage, synchronize architecture documentation, and land the public migration atomically.

## Resolved Design Decisions

1. Retain and migrate `hello` as the twenty-ninth public SystemApi leaf. Add the corresponding `SystemApiFailure.hello` leaf so a failed capability can never inherit behavior that resolves a dummy SystemWorker.
2. Reuse `makeTraceableApiTarget` for SystemApi clients. Add no SystemApi-specific proxy and do not generalize the logger target again; the existing target already supplies the current caller span, validates `ILinkedRpcEnvelope`, appends non-null links, and exposes `Effect<A, E | Error, TelemetryCollector>`.
3. Keep administrative links caller-owned. Tests retain their collectors to assert causality. Studio creates one collector and caller root inside each Node middleware request, then flushes and discards that request-local batch after producing the response. Add no session-owned, command-owned, global, or persisted administrative client telemetry store.
4. Preserve retry behavior exactly while the separate explicit retry-policy design remains unapproved. Keep the existing retry placement inside `finalizeAccountCommands`, `executeSelectQuery`, `finalizeServiceCommands`, and all twenty-two RepoExplorer leaves. Keep `hello`, `getFrontendState`, `executeServiceQuery`, and `makeSystemSpec` one-shot. Add no retry to the factory, common handler, telemetry persistence, or traceable target.
5. Approve only three new file-local SystemApi abstractions: `SystemApiAuthResults`, `SystemWorkerApi`, and `makeApiHandler`. Add no other helper, wrapper, service, named type, method-definition table, schema table, barrel, or re-export.
6. Implement and test all twenty-nine leaves explicitly. Do not generate methods or assertions by looping over data; retain the existing explicit Studio switches and write the handler, failure-target, and compile-time coverage verbosely.
7. Remove the unused `SystemApi.getAccountResources` leaf rather than migrating it. Keep `SystemWorker.getAccountResources` and `AccountRepo.getAccountResources` unchanged.
8. Make `SystemApiFailure` a standalone `RpcTarget`, matching the proven FrontendApi failure boundary, rather than retaining inheritance from `SystemApi` and placeholder system identity values.

## Public Contracts

1. Preserve `ZerospinApis.getSystemApi({ zerospinSecretKey })` as the capability factory and declare its concrete result as `Promise<SystemApi | SystemApiFailure>`.
2. Keep secret-key decoding, identity resolution, secret-key rejection, and SystemWorker-name binding in `ZerospinApis`. Do not add a span, collector, persistence, link, retry, or SystemWorker leaf call around capability construction.
3. Change all thirteen zero-argument leaves to accept `IRpcRequest<[]>` and return a linked encoded envelope: `hello`, `makeSystemSpec`, `getSystemRepos`, `getAccountRepos`, `getAuthorizationRepos`, `getActorRepos`, `getFrontendRepos`, `getServiceRepos`, `getAccountBlockRepos`, `getActorBlockRepos`, `getFrontendBlockRepos`, `getServiceBlockRepos`, and `getLogRepos`.
4. Change all sixteen one-argument leaves to accept `IRpcRequest<[props]>` and return a linked encoded envelope: `getFrontendState`, `executeServiceQuery`, `finalizeAccountCommands`, `executeSelectQuery`, `finalizeServiceCommands`, `getSystemRepoTableRows`, `getAccountRepoTableRows`, `getAuthorizationRepoTableRows`, `getActorRepoTableRows`, `getFrontendRepoTableRows`, `getServiceRepoTableRows`, `getAccountBlockRepoTableRows`, `getActorBlockRepoTableRows`, `getFrontendBlockRepoTableRows`, `getServiceBlockRepoTableRows`, and `getLogRepoTableRows`.
5. Use the existing `ILinkedRpcEnvelope<A, IAnyErrorJson>` contract. Encoded domain failures remain `IAnyErrorJson`; RPC rejection, malformed envelopes, and client-boundary failures remain `Error` after `makeTraceableApiTarget` wraps the concrete target.
6. Preserve full command objects and all existing account-finalization checks, including executed and failed command decoding, pushed-block invariants, mutations, cursor, index, and failure data. Preserve the current service-finalization result mapping.
7. Remove `ISystemApi` and `IPublicApis` only after the preflight type gate passes. Concrete callers use `ZerospinApis`, `SystemApi`, and `SystemApiFailure`; core must not import dispatch-worker classes or grow a replacement interface.

## Implementation

1. Establish the concrete-type gate before changing the public leaf shapes.
   1. Add dispatch-worker compile-time coverage that constructs `newSyncRpcSession<ZerospinApis>`, obtains the synchronous `SystemApi | SystemApiFailure` capability, and proves every leaf remains callable through the concrete union and `makeTraceableApiTarget`.
   2. Prove every remaining concrete leaf is callable through the concrete union and `makeTraceableApiTarget`.
   3. Build dispatch-worker and inspect the emitted `SystemApi`, `SystemApiFailure`, and `ZerospinApis` declarations for concrete class names, all twenty-nine linked request signatures, the success/failure union, and the absence of leaked private fields.
   4. If emitted concrete-target typing fails, stop before migrating any public leaf and revise the design. Do not retain `ISystemApi`, add an intersection, introduce a compatibility overload, or bolt fields onto the client type.

2. Add the SystemApi-local handler policy in `packages/dispatch-worker/src/SystemApi/SystemApi.ts`.
   1. Add file-local `SystemApiAuthResults` containing exactly `systemId` and `systemWorkerName`, file-local `SystemWorkerApi` containing the raw SystemWorker, and file-local `makeApiHandler` owning the repeated leaf boundary.
   2. Have `makeApiHandler` strictly validate the complete mutable positional tuple with `onExcessProperty: 'error'` before resolving a worker. Encode an argument-validation failure into `{ result, link: null }` without acquiring or persisting through a SystemWorker.
   3. After successful validation, resolve one fresh `SystemWorker & Disposable` from `SystemWorkerResolver`, provide it and the factory auth results to the named leaf Effect, and retain that same unwrapped stub until the leaf and telemetry-persistence attempt finish.
   4. Create one fresh collector for the leaf. Run the named leaf under its existing `SystemApi.<method>` identity with `{ root: true }`, supply the fresh telemetry layer, and settle both domain success and domain failure before encoding the result.
   5. Finish the root before flushing the collector. Persist the complete batch through `systemWorker.appendTelemetryBatch({ batch })` outside the telemetry layer so persistence does not add itself to the batch.
   6. Return a `causedBy` link only when append succeeds, the request contains a caller trace context, and the completed batch contains the expected SystemApi root. The link owns the server root `traceId` and `spanId` and points through `priorTraceId` and `priorSpanId` to the caller span.
   7. Treat rejected append calls and encoded append failures as `{ link: null }` without changing the encoded leaf result. Do not retry telemetry persistence.
   8. Dispose the acquired stub after the leaf and persistence attempt on success, domain failure, defect, rejected persistence, and encoded persistence failure.

3. Convert every SystemApi leaf to an explicit named Effect and raw handler method.
   1. Inline a strict empty tuple schema for each zero-argument handler and a strict one-element tuple containing the exact existing props shape for each one-argument handler. Reuse existing command schemas where they describe the complete command object; inline the exact encoded-query and RepoExplorer argument shapes rather than adding schema helpers or named shapes.
   2. Decode every SystemWorker encoded result inside the named leaf before the handler re-encodes the SystemApi result. Keep existing error mapping, annotations, and return-value transformations at the same domain boundary.
   3. Preserve `hello`, `getFrontendState`, `executeServiceQuery`, and `makeSystemSpec` as one-attempt leaves.
   4. Preserve the existing retry scope for `finalizeAccountCommands`, `executeSelectQuery`, and `finalizeServiceCommands`; do not move their retry outside the named leaf or broaden which failures qualify.
   5. Preserve the existing retry scope independently in each of the eleven `get*Repos` Effects and eleven `get*RepoTableRows` Effects. Do not introduce a RepoExplorer handler loop, handler map, shared operation descriptor, or generic repo-call helper.
   6. Keep `makeTraceableRpcTarget` inside account finalization where it merges downstream SystemWorker and Repo telemetry into the SystemApi collector. Remove the old second-stub persistence path because the common handler now persists the completed batch through the original raw stub.
   7. Leave SystemWorker, LogRepo, RepoExplorer, ledger, WebSocket, and root RPC routing code unchanged.

4. Rebuild `SystemApiFailure` against the concrete class.
   1. Make it extend `RpcTarget` directly and store only the captured factory `IAnyError`.
   2. Implement all twenty-nine public leaves explicitly, including `hello`, with parameters and return types derived directly from the corresponding concrete `SystemApi` method.
   3. Return `{ result: encodeLeft(error), link: null }` from every leaf. Do not validate leaf tuples, resolve a SystemWorker, create telemetry, persist telemetry, retry, or inherit executable success-target behavior.

5. Remove the handwritten public API hierarchy after the concrete-type gate passes.
   1. Delete `ISystemApi` from `packages/core/src/system/types.ts` and `IPublicApis` from `packages/core/src/session/types.ts`.
   2. Remove `implements IPublicApis` from `ZerospinApis`; keep its concrete factory methods as the source of truth.
   3. Remove the unused core `mockSystemApi` rather than replacing it with another parallel interface or mock surface.
   4. Keep generic synchronous Cap'n Web transformation coverage in core's `newSyncRpcSession.typecheck.ts`, and move SystemApi-specific concrete target, union, and linked-return assertions to dispatch-worker.
   5. Remove the unused `getSystemApi` member and `ISystemApi` import from CLI's `ICliApis`; CLI has no SystemApi leaf caller.

6. Migrate every caller atomically.
   1. In Studio's Node-side Vite middleware, type the RPC session with concrete `ZerospinApis`, wrap the returned concrete target with `makeTraceableApiTarget`, and run each existing explicit RepoExplorer switch branch inside one request-local caller root and collector. Flush and discard only that caller batch after the response; do not share collectors across middleware requests.
   2. In the shopping Playwright SystemApi seams, use `newSyncRpcSession<ZerospinApis>`, the concrete capability union, `makeTraceableApiTarget`, and explicit caller collectors and roots.
   3. Create collectors and roots inside each Playwright `expect(...).toPass` attempt so failed attempts cannot leak telemetry into later retries.
   4. Update shopping and parking workerd tests that are not asserting client links to call the raw request-envelope methods and decode `envelope.result`. This avoids adding a logger dependency solely for an immediately discarded link.
   5. Keep `telemetryWorkflow.zspec.ts` focused on real server batch persistence and the account-finalization DAG. Use the shopping HTTP SystemApi test as the cross-store client-link proof.
   6. Leave logger topology fixtures, SystemWorker and Repo documentation references, and example domain callbacks unchanged; they are not SystemApi clients.

7. Link only the dependencies required by the concrete callers.
   1. Add Studio workspace dependencies and TypeScript project references for the concrete dispatch-worker type and logger runtime through their owning package manifest and project files.
   2. Add Studio's Vitest configuration, test script, development dependency, and Nx-inferred `test` target because no current Studio integration test exists.
   3. Preserve shopping's existing logger and dispatch-worker dependencies. Do not add logger to parking when its tests use raw envelopes.
   4. Add no package barrel, root export, compatibility export, or runtime dispatch-worker import where a type-only import is sufficient. Inspect emitted Studio JavaScript to ensure concrete dispatch-worker typing did not become a runtime import.

8. Synchronize documentation in the same implementation pass.
   1. Use the `update-architecture` workflow to rewrite `wiki/architecture/SystemApi.md` for concrete capability typing, strict linked leaves, fresh same-stub execution and persistence, all-leaf telemetry, retry preservation, and caller-owned links.
   2. Update `wiki/architecture/Blockchain.md` for the account-finalization SystemApi root and cross-store link.
   3. Update `wiki/architecture/FrontendApi.md` to remove the statement that `IPublicApis` remains for SystemApi.
   4. Refresh the affected `wiki/architecture/DeploySystem.md` source hash and citations without changing unrelated deployment behavior.
   5. Update `wiki/glossary.md` so `ILinkedRpcEnvelope` is no longer described as Frontend-only, update `wiki/index.md` where it summarizes the gateway, and append the required `wiki/log.md` entry.
   6. Search both pattern subtrees for stale `ISystemApi`, `IPublicApis`, concrete-client, and SystemApi path examples. Change only matching stale references; do not churn unrelated SystemWorker patterns.
   7. Refresh every affected architecture source hash and line citation after the code reaches its final form.

## Test and Verification Plan

1. Add `packages/dispatch-worker/src/SystemApi/SystemApi.node.spec.ts` with explicit focused cases for:
   1. Strict empty and one-argument tuples, missing arguments, extra positional arguments, and excess object properties.
   2. Zero resolver calls for invalid tuples and one fresh disposable stub for every valid leaf invocation.
   3. Correct provision of `SystemApiAuthResults`, `SystemWorkerApi`, and the telemetry collector to the named Effect.
   4. Encoded success and encoded domain failure for representative read, mutation, and RepoExplorer leaves.
   5. Root completion before append, complete-batch persistence, and use of the same raw stub for leaf execution and append.
   6. Correct `causedBy` ownership, null links without caller context, and null links with unchanged results after rejected or encoded append failure.
   7. Disposal after success, domain failure, thrown RPC failure, rejected persistence, and encoded persistence failure.
   8. Preservation of full executed and failed account commands, pushed-block invariants, mutations, cursor, index, and failure mapping.
   9. Preservation of the four one-shot leaves and exact existing retry scope for the twenty-five retrying leaves, without handler- or proxy-owned retry.

2. Exercise every `SystemApiFailure` leaf explicitly and prove all twenty-nine return the captured encoded Left with a null link and perform no resolver, leaf, collector, retry, or append work.
3. Add compile-time assertions for all twenty-nine concrete SystemApi and SystemApiFailure request and return signatures, the callable concrete union, and the `makeTraceableApiTarget` Effect failure channel.
4. Add `packages/studio/src/startStudio.node.spec.ts` covering the real middleware seam for one repository-list request, one table-row request, domain failure, concurrent request-local collector isolation, and unchanged 404 handling. Assert Studio does not expose the secret key or retain one request's links in another request.
5. Update API factory tests for secret-key success, publishable-key rejection before target creation, identity failure, SystemWorker-name binding, raw linked success, and all twenty-nine failure-target leaves.
6. Extend the shopping SystemApi HTTP seam to execute one read and one harmless mutation through a concrete traced client, retain the caller links, poll LogRepo rows for the linked server trace IDs, and prove each link owns the persisted server root while pointing back to the correct caller span.
7. Preserve and update the shopping authentication query/finalization seam, shopping and parking account-finalization workerd flows, logger DAG suites, SystemWorker RepoExplorer tests, and the detailed telemetry workflow without weakening their existing domain assertions.
8. Run the affected TypeScript and lint targets:

   ```text
   nx run-many -t ts,lint -p @zerospin/logger,@zerospin/core,@zerospin/dispatch-worker,@zerospin/studio,@zerospin/cli,@zerospin/frontend,shopping,parking,system-worker
   ```

9. Run the affected unit targets:

   ```text
   nx run-many -t test -p @zerospin/logger,@zerospin/core,@zerospin/dispatch-worker,@zerospin/cli,@zerospin/frontend,shopping,parking,system-worker
   nx run @zerospin/studio:test
   ```

10. Build all affected publishable libraries:

    ```text
    nx run-many -t lib -p @zerospin/logger,@zerospin/core,@zerospin/dispatch-worker,@zerospin/studio,@zerospin/cli,@zerospin/frontend,system-worker
    ```

11. Run the Worker and end-to-end regression suites:

    ```text
    nx run @zerospin/logger:test:workerd
    nx run system-worker:test:workerd
    nx run shopping:test:workerd
    nx run parking:test:workerd
    nx run shopping:test:e2e --skip-nx-cache
    nx run shopping:test:playwright --skip-nx-cache
    ```

12. Inspect `packages/dispatch-worker/dist/SystemApi/SystemApi.d.ts`, `SystemApiFailure.d.ts`, and `ZerospinApis/ZerospinApis.d.ts` for all twenty-nine linked signatures, concrete union inference, the absence of `getAccountResources`, and no handwritten API interface imports.
13. Inspect Studio's emitted JavaScript to confirm its concrete dispatch-worker import remains type-only, then run:

    ```text
    rg -n '\b(ISystemApi|IPublicApis)\b' packages examples wiki
    git diff --check
    ```

14. Review the final diff to confirm the migration is atomic and contains no SystemWorker, Repo, ledger, WebSocket, unrelated retry-policy, or frontend-session behavior changes.
15. After every required verification passes and the implementation is complete, move this plan unchanged to `.plans/archived/005-plan-system-api-handler-migration.md`.

## Assumptions and Guardrails

1. The current `ILinkedRpcEnvelope`, telemetry collector, telemetry layer, span-link record, and `makeTraceableApiTarget` contracts are sufficient; this plan adds no logger public contract.
2. Browser frontend session telemetry is unrelated to secret-key SystemApi calls and remains unchanged.
3. Server telemetry persistence is authoritative even when a caller does not retain its returned link. No client telemetry persistence is inferred from the linked envelope.
4. Existing inline retry behavior is compatibility behavior, not an endorsed final policy. The separate retry-policy spec may remove or reclassify it later, but this migration neither broadens nor narrows it.
5. No persisted-state migration is required because the SystemApi boundary changes RPC request and response shapes, not stored rows.
6. Add no `ALLOWED_CAST`, `as const`, compatibility overload, hidden fallback, partial migration, method-generation loop, table-driven method test, or unrelated cleanup.
7. Preserve all current dirty `.plans`, `AGENTS.md`, generated example files, and unrelated DevTools work. Edit overlapping files microscopically during implementation.
