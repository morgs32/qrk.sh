# Handoff: implement explicit mapped contracts and async lifecycle

**Date:** 2026-10-02
**Status:** Completed and verified on 2026-10-02; archived with the completed plan.
**Governing plan:** [Plan 027](../plans/027-plan-actor-bound-async-contracts.md).

## Goal

Completed implementation and verification of plan 027, including the agreed removal of redundant private source ordinal and the `asyncCommandId` naming. It contains the agreed interface, physical schemas, transaction/recovery rules, replay behavior, and acceptance checks; use it rather than reconstructing a design from superseded handoffs.

## Settled decisions

1. Explicit server mappings declare `operations.models`, `operations.contracts`, and a required authoritative result codec. Browser staging/locks use the original contract. Mappings inherit command name/version and public business failures; server owner/actor versions pin the mapping.
2. Both aggregate and service version histories key `modelOperations` and `asyncOperations` by `(commandId, operationIndex)`. `asyncOperations` holds each emission and its producer lifecycle together. No `importedOperations`, `applicationKind`, replica operations, separate work table, or extra operation ordinal remains.
3. Replay runs the full program and records its output, then applies only model operations. It ignores async emissions, including newly added/changed ones. No producer, enqueue, child allocation, or replay-to-child matching occurs. Admitted async continuations replay independently from their recorded input/observation.
4. Only original execution allocates `asyncCommandId` and initializes production. Recovery requires a child ID, no recorded observation, and a due deadline. Lifecycle columns stay in the producing VersionRepo; history transports immutable emission data only. Retain async rows and authority after source publication cleanup.
5. Aggregates never receive service commands. [Plan 030](../plans/030-plan-remove-replicas-and-service-subscriptions.md) has completed replica/subscription/service inbound-emission removal. Build on that runtime and preserve unrelated work. Do not restore removed features or redesign intentionally broken application callers.

## Verification

All required Nx checks passed. See the governing plan's verified outcome for fixture and runtime restart evidence. Private input retains `sourceCommandId` and `external`; emission ordering retains `operationIndex`. No source ordinal is duplicated. Fixed schemas require empty storage.

## Remaining

None.

## Suggested skills

1. `$implement` — complete the approved behavior and verification, maintain remaining work, then archive.
2. `$use-morgs32-wiki-patterns` — consult the local index and relevant transaction/registry/replay guidance.
3. `$spec` — only if new evidence exposes a material unresolved decision; do not re-approve the settled design.

## Open decisions

None. Physical schemas and implementation rules are in plan 027. Direct backend invocation without an initiating command and other stated exclusions remain deferred.

## Pointers

1. [Plan 027](../plans/027-plan-actor-bound-async-contracts.md).
2. [Completed removal plan 030](../plans/030-plan-remove-replicas-and-service-subscriptions.md).
3. [Operation emission and retained results](../plans/026-plan-contract-operation-emission-and-results.md).
4. [Local pattern index](../../patterns/index.md).
