# Contract program database reads design

**Date:** 2026-09-28
**Status:** Approved for planning

## Problem Statement

Contract programs receive payload, claims, declared model mutation helpers, and
failure constructors, but cannot query the materialization used for their
execution. A command such as applying a coupon needs to read cart lines before
returning discount mutations. Requiring another command to complete that work
would introduce an unnecessary command lifecycle.

The earlier rationale for keeping programs independent of the database no longer
matches execution ownership: AggregateChain retains admitted commands, while
AggregateVersionRepo evaluates programs and applies and retains their mutations.
ServiceVersionRepo also evaluates contract programs against its own materialization.
Guards already receive a query-only database interface named `queryDb`.

## Solution

Give aggregate and service contract programs a synchronous, read-only `db`
interface using the existing guard query interface and declared-model typing.
Rename the guard argument to `db` as well. Programs continue returning mutation
arrays; existing execution paths own applying and persisting those mutations.

## User Stories

1. As a contract author, I can query the current cart and return all mutations
   needed to apply a coupon in one command execution.
2. As an aggregate session user, I see an optimistic result calculated from my
   local state, including earlier optimistic changes visible in that session.
3. As a server contract author, I calculate the authoritative result from the
   materialization executing the command rather than trusting a client-calculated
   allocation.
4. As a session user, I receive recalculated optimistic results when pending
   commands replay against reconciled state.
5. As a service contract author, I use the same query interface as aggregate
   contract authors, against the service execution database.
6. As a guard or program author, I use `db.query` with inferred types for my
   contract's declared models, without database write methods in that interface.

## Implementation Decisions

1. Add `db` to contract program arguments and rename guard `queryDb` to `db`.
   Preserve the existing payload, claims, failure constructors, model mutation
   helpers, and mutation-array result. Apply the change to aggregate and service
   contracts, including inherited and upgraded contract definitions.
2. Reuse the existing query-only interface, conceptually
   `Readonly<Pick<DatabaseForDeclaredModels, 'query'>>`. Infer readable models from
   the contract's existing `models` declaration. Do not introduce a second read
   declaration, query database, or general-purpose database interface.
3. This is the same restricted author-facing TypeScript interface used by guards.
   It excludes insert, update, delete, transaction, raw execution, and internal
   tables from the exposed type. It does not introduce a sandbox for arbitrary
   application code. Queries retain the existing decoded relational results and
   synchronous `.sync()` execution.
4. Supply the invocation's database wherever a contract program is evaluated:
   session validation, client staging, pending-command replay, server actor
   staging, aggregate execution, service execution, and existing automation
   callers that evaluate contracts. Use the active transaction when evaluation
   already runs inside one, so reads see its preceding writes.
5. Each evaluation reads state from its own execution context. Client predictions
   and server results may differ. A coupon command expresses coupon intent;
   it does not freeze the client's calculated allocation into the command.
   Pending replay recalculates from reconciled state and preceding replayed
   commands. Existing actor and session selection scope remains unchanged;
   providing `db` does not make missing server rows available on the client.
6. Reads describe state at program evaluation. Constructing or returning a
   mutation does not apply it, so subsequent queries inside that same program
   do not see those proposed writes. Preserve command ordering so later command
   evaluations see earlier commands' applied state.
7. Keep writes in returned mutations. Existing mutation application, guards,
   failure handling, rollback, terminal results, and persistence remain in their
   current execution paths. Do not move program evaluation into AggregateChain
   or add a second mutation persistence path.
8. Validation may calculate mutations to establish validity but must not apply
   them. Query errors and declared program failures use existing failure handling.
   Keep synchronous program execution; database access does not authorize new
   asynchronous work or external calls.
9. Hard-cut the argument rename across affected definitions, callers, fixtures,
   tests, examples, and current documentation. Remove `queryDb` aliases in this
   contract execution interface. Preserve historical archived documents.
10. No persisted command, mutation, or fixed database schema change is required.
    The implementation must preserve existing durable representations.

## Testing Decisions

1. Prefer existing session and command execution entry points with real database
   fixtures. A test that passes fabricated mutations directly to a transaction
   helper is insufficient to establish that program database access is wired.
2. Extend the browser mock-session execution coverage that already exercises
   guards, validation, staging, and pending replay. Use a state-dependent contract
   to prove validation leaves rows unchanged, staging applies calculated
   mutations, and replay recalculates when its input state changes.
3. Exercise aggregate and service command execution with programs that query
   existing rows and return mutations. Verify persisted resource state and
   mutation history, and verify a subsequent command reads the preceding
   command's applied changes.
4. Cover failure after a state-dependent calculation through existing execution
   seams, establishing that rejected commands do not leave partial resource
   changes. Preserve existing terminal-failure behavior.
5. Compile author-facing contract assertions for inferred query results,
   declared-model scope, and absence of write methods in guards and programs.
   Include upgraded or inherited model declarations. Verify the `queryDb`
   argument is removed rather than retained as an alias.
6. Prior art is the mock-session runtime execution suite, aggregate and service
   command execution suites, contract claims coverage, and the unified decoded
   database queries work. Reuse their fixtures and adapters; introduce no new
   testing framework. Run the affected Nx checks during implementation, including
   type checking of consumers of changed core declarations.

## Out of Scope

1. Removing automations or implementing machine actors, jobs, or Workflows.
2. Direct program database writes or read-after-write execution of returned
   mutations inside the program.
3. New command types, extra emitted commands, persistence tables, migrations,
   or capture of client-calculated mutation allocations as command inputs.
4. Expanding actor selections, synchronizing additional data to clients, or
   guaranteeing identical results against different client and server state.
5. Redesigning replication, admission, guards, concurrency ownership, or replay
   architecture beyond passing the correct invocation database.
6. Building a production coupon feature. The coupon is a motivating scenario
   and may inform a focused behavioral fixture.

## Further Notes

1. This spec is independent of the machine-actor handoff. Existing automation
   callers need only the interface update necessary to keep current execution
   working.
2. The archived unified decoded database queries design intentionally left guard
   callback naming unchanged. This design now settles that remaining name as
   `db` while reusing its query behavior.
3. Implementation and its plan are separate follow-up work; this document records
   the approved design only.
