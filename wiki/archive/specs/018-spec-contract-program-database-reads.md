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

## Further Notes