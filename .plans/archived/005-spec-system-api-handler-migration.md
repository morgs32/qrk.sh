# SystemApi handler migration design

**Date:** 2026-07-12
**Status:** Draft

## Problem Statement

`SystemApi` is the secret-key gateway for system tooling, direct account finalization, service queries, system metadata, and RepoExplorer reads. Its public methods currently repeat argument handling, per-call SystemWorker resolution, raw RPC invocation, error encoding, and transient retry behavior. Only account finalization owns a telemetry root and persistence path, so the gateway has inconsistent observability and failure semantics across methods.

The frontend API-handler work establishes a concrete leaf boundary with strict tuple validation, fresh SystemWorker acquisition, named Effects, completed telemetry persistence, and a linked response envelope. SystemApi should be evaluated separately because its authorization model, clients, method count, retry needs, and administrative workloads differ from FrontendApi.

## Solution

Migrate SystemApi methods to a SystemApi-owned handler boundary after the frontend handler has proven its contracts. Preserve `ZerospinApis.getSystemApi({ zerospinSecretKey })` as the capability factory and keep secret-key validation outside leaf telemetry. Each leaf validates its complete positional argument tuple, resolves a fresh raw SystemWorker, runs a named root Effect, persists the completed telemetry batch, and returns a linked encoded envelope suitable for a SystemApi-specific traceable client.

The migration must be all-or-nothing for the public SystemApi surface. It must not leave a mixture of linked and unlinked leaf return shapes behind one concrete target.

## User Stories

1. As a Studio or administrative client, I want every SystemApi leaf to produce consistent telemetry, so that system inspection and mutation failures are diagnosable.
2. As a SystemApi maintainer, I want one explicit boundary policy for argument validation, SystemWorker acquisition, telemetry persistence, encoding, and disposal.
3. As a client author, I want concrete SystemApi typing preserved through Cap’n Web without a parallel handwritten interface drifting from the class.
4. As an operator, I want domain failures and transport failures to remain distinguishable.
5. As a security reviewer, I want secret-key capability construction kept separate from leaf telemetry and leaf arguments.

## Implementation Decisions

1. Preserve `ZerospinApis.getSystemApi` and the concrete `SystemApi | SystemApiFailure` capability model.
2. Keep secret-key validation, identity resolution, and SystemWorker-name binding in the factory. Do not persist factory telemetry.
3. Use a SystemApi-local handler policy rather than exporting or importing FrontendApi's file-local handler.
4. Validate the complete positional argument tuple with strict excess-property rejection before executing a leaf.
5. Resolve a fresh raw `SystemWorker & Disposable` for every leaf and dispose it on every completion path.
6. Run every leaf as a named root Effect and persist its completed server telemetry through the same untraced raw SystemWorker stub.
7. Return the linked encoded envelope contract established by the frontend implementation, including a null link when telemetry persistence fails.
8. Preserve domain result semantics when telemetry persistence fails.
9. Replace `ISystemApi` with concrete class typing only if all current consumers and emitted declarations retain their required concrete method typing. Do not bolt missing fields onto the client type.
10. Migrate `SystemApiFailure` with the concrete class so every leaf returns the original factory error without SystemWorker resolution or telemetry persistence.
11. Preserve complete command objects and all existing account-finalization validation.
12. Remove the unused `SystemApi.getAccountResources` leaf. Keep `SystemWorker.getAccountResources` and `AccountRepo.getAccountResources` unchanged.
13. Do not change SystemWorker, Repo, ledger, or RepoExplorer domain behavior as part of the gateway migration.

## Testing Decisions

1. Use the existing shopping SystemApi end-to-end seam as the highest proof: acquire SystemApi with a secret key, execute a read leaf and a mutation leaf, persist their telemetry, and observe their linked results from a concrete client.
2. Add focused handler tests for strict tuple validation, root creation, fresh stub acquisition, result encoding, persistence failure, and disposal.
3. Prove all twenty-nine public SystemApi and SystemApiFailure methods have the concrete linked return shape at compile time.
4. Preserve Studio RepoExplorer integration tests and direct account-finalization telemetry assertions.
5. Prove publishable keys remain rejected by the factory before a SystemApi target is created.

## Out of Scope

1. FrontendApi behavior or browser session telemetry.
2. Changes to SystemWorker or Repo public methods.
3. A generic handler shared between FrontendApi and SystemApi.
4. Retry policy implementation before the explicit retry-policy spec is approved.
5. Authentication or capability-factory telemetry.

## Further Notes

1. The final grill must decide whether SystemApi browser and Node clients collect links through one new SystemApi-specific proxy or through a generalized API-target proxy proven by FrontendApi.
2. The final grill must classify which SystemApi methods are safe to retry before the existing inline retry calls are removed.
3. The final grill must decide whether administrative telemetry links have a session-owned collector, a command-owned collector, or no client persistence outside a caller-provided collector.
