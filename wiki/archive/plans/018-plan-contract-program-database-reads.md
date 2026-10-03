# Contract program database reads implementation plan

**Date:** 2026-09-28
**Status:** Implemented and verified
**Source:** [Approved spec 018](../specs/018-spec-contract-program-database-reads.md)

## Outcome and constraints

## 1. Extend the contract interface and forwarding

1. In `packages/core/src/contracts/make/makeContractVersion.ts`, add `db` to the
   internal `InferContractProgram`, authored `IContractProgramFn`, and
   `ContractProgramSchema` callback shapes. Thread declared models through the
   program type so concrete contracts retain exact query keys and decoded row
   inference; preserve the existing erased-registry typing where appropriate.
2. Update the authored-program binding in that file to forward `db` alongside
   payload and claims. Retain model mutation helpers and failure constructors.
   Omitted programs must still return an empty mutation array without special
   database creation or fallback behavior.
3. Cover every make/upgrade overload, including model patches and inherited models.
   Reuse the guard's existing query-only type expression. Preserve payload, claims,
   failure, mutation-result, and Effect-requirement inference; do not widen known
   models to arbitrary table names to satisfy an assignment.
4. Update `packages/core/src/contracts/types.ts` so `IContract.program` carries
   the model-aware database argument. Rename the guard argument in that interface
   and all corresponding definition schemas and overloads to `db`.
5. Require the invocation database in every overload and implementation of
   `packages/core/src/contracts/make/makeMutations.ts`, and forward it into
   `contract.program`. Do not make it optional or synthesize an empty database.
6. Rename `queryDb` in `runContractGuard.ts`, `validateAggregateCommand.ts`, and
   `ownerGuards.ts`, including callback invocations. Preserve each owner's existing
   model scope. The separate `guards/make/makeGuard.ts` interface already uses
   `db`; keep that interface consistent rather than introducing an adapter.

## 2. Wire each execution context

## 3. Complete the rename in consumers and documentation

1. Update affected callbacks and helpers in purchase, fulfillment, browser, and
   system-worker fixtures, including callbacks that forward the database to
   domain helpers. Keep domain behavior and selected models unchanged.
2. Update affected shopping, tic-tac-toe, and domain-modules examples and their
   tests. Rename helper parameters when they carry the same guard database so
   the old name is not preserved as a second concept.
3. Update current guidance in `wiki/glossary.md`,
   `wiki/architecture/AuthoredSystem.md`, `packages/core/src/drizzle/README.md`,
   and affected local patterns. Explain program reads, returned mutations,
   client/server state differences, replay recalculation, and the query-only type.
   Preserve the documented preparation/guard/application ordering.
4. Search `packages`, `examples`, and current wiki documents for remaining
   `queryDb` references. Inspect hits rather than blindly renaming historical
   text; preserve archived documents, including the prior decoded-query spec.
   Do not add compatibility tests, aliases, or broad unrelated documentation edits.

## 4. Verify behavior through existing seams

## 5. Run scoped verification and finish

## Completion criteria

## Implementation and verification outcome