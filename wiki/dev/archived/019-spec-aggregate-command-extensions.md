# Aggregate command extensions design

**Date:** 2026-09-28
**Status:** Approved for planning

## Problem Statement

A shared contract program can update client-visible state optimistically, while
authoritative execution needs additional changes based on private aggregate
state. Submitting an expense should mark it submitted and create its approval
assignment atomically. The employee session need not contain the private approval
policy or execute the assignment logic.

Issuing another command for that assignment introduces a separate admission,
failure, and completion lifecycle. The desired behavior belongs to the original
command's execution and mutation history.

## Solution

An aggregate version declares an optional `extensions` map keyed by command name.
After successfully applying the shared program's mutations inside the command
transaction, authoritative execution runs the command's extension against that
updated transaction. The extension returns additional mutations. Both phases
commit or roll back together.

The agreed authoring shape is:

```ts
extensions: {
  submitExpense: ({ db, models, payload, failures }) =>
    /* synchronous Effect returning mutations */
}
```

## User Stories

1. As an employee, I see my expense become submitted optimistically without
   needing private approval policies in my session.
2. As an aggregate author, I query the now-submitted expense and private policy
   rows, then create an approval assignment and record the policy revision used.
3. As an aggregate author, I apply the same assignment rule regardless of which
   authorized actor submitted the command.
4. As an employee, I receive a normal command rejection if approval assignment
   cannot complete, and reconciliation removes the optimistic submission.
5. As an aggregate author, I can perform required server changes even when the
   shared program successfully returns an empty mutation array.
6. As a maintainer, I recover one committed command result and its complete
   mutation history without managing a separately pending extension.

## Implementation Decisions

1. Use the public name `extensions`. Each registered command may have one
   optional callback on its aggregate version. Infer keys and payload types from
   that version's effective contracts, including contracts supplied by existing
   modules. Reject unknown command keys. Extensions are independent of actor
   identity and do not grant permission to call a command.
2. `db` is the active command transaction exposed through the existing synchronous,
   query-only interface. Its typed model scope is the aggregate's full effective
   declared model set. `models` supplies mutation helpers for that same set;
   private models need not be added to the shared contract or client selection.
3. `payload` is the decoded, adapted payload used for the executing contract.
   `failures` supplies that contract's existing declared failure constructors.
   An extension may reject with a declared aggregate-scoped failure, such as
   `approvalPolicyUnavailable`. Use existing failure validation and serialization,
   without introducing a separate extension failure registry or result type.
4. Run the extension only during authoritative aggregate command execution, after
   the existing guards and shared mutation application succeed. Do not run it in
   client validation, client staging, pending replay, or server actor staging.
   Preserve current shared-program preparation and guard placement.
5. Run the extension after a successful shared execution even if its mutation
   array is empty. An extension may itself return an empty array. Skip it when
   admission, shared evaluation, guards, or shared mutation application fails.
6. Extension queries observe the shared mutations already applied in the active
   savepoint. Constructing returned extension mutations does not apply them or
   make them visible to subsequent queries within that callback. Apply the
   returned mutations in their authored order after the callback succeeds.
7. Keep execution synchronous using the existing program execution rule. The
   expense example reads local policy rows and writes aggregate-owned expense,
   assignment, and policy-revision data. Do not introduce network calls or new
   replica enrollment/capture behavior inside the transaction.
8. Validate extension mutations against the executing aggregate's canonical
   models and existing operation constraints. Read-only query access does not
   authorize direct writes or bypass normal mutation validation.
9. Apply and retain extension mutations through the same mutation machinery as
   shared mutations, under the original command ID and terminal occurrence.
   Continue mutation indexes after the shared mutations so identifiers cannot
   collide. Do not emit another command or recursively trigger an extension for
   an individual mutation.
10. Track resource changes across both phases for the final execution delta.
    Preserve the original before-image when both phases affect the same row, and
    include rows first touched by the extension. The final delta must represent
    the complete command, including create/update/delete combinations. Existing
    selection rules determine which final changes reach each client.
11. An extension rejection or mutation failure rolls back both phases' resource
    changes and mutation rows. Declared aggregate failures become the original
    command's normal terminal failure. Infrastructure errors retain existing
    abort/retry semantics; do not turn them into successful partial commands.
12. Retrying an already committed command uses existing deduplication and does
    not run its extension again. An aborted, uncommitted attempt may run again
    against its execution state. A different command ID is a new occurrence;
    business idempotency, such as finding an existing approval assignment, belongs
    in authored logic. There is no independent extension cursor or retry queue.
13. Each aggregate version executes its own authored extension when materializing
    a command. The admitted command retains intent; no client-calculated approval
    allocation is frozen into it. Persist resulting mutations and rows through
    existing formats, without new fixed tables or compatibility paths.

## Testing Decisions

1. Use the existing aggregate command execution seam with a real database as the
   primary behavioral test surface. Extend the state-dependent program tests
   from spec 018 rather than testing only a detached extension callback.
2. Use an expense fixture whose shared contract knows the expense model and whose
   aggregate also owns private policy and assignment models. Verify the extension
   sees the submitted state, chooses an approver from policy, and records the
   assignment and policy revision under the same command history.
3. Verify final resource state, retained mutation indexes, and final deltas when
   the extension touches both a shared-phase row and an additional row. Include
   overlapping mutations so stale intermediate state cannot escape reconciliation.
4. Verify an aggregate-scoped rejection and an extension mutation application
   failure leave neither phase's resource or mutation changes committed. Verify
   failed commands skip the callback, successful empty shared results invoke it,
   empty extension results succeed, and committed retries do not invoke it again.
5. Reuse a session execution/reconciliation test to show optimistic submission
   succeeds without private models, does not run the extension, and reconciles
   with either the full selected server result or a normal command rejection.
6. Compile declaration assertions for command keys, inferred payloads, full
   aggregate model queries and helpers, query-only database access, and declared
   aggregate-scoped failures. Preserve the shared contract's narrower model scope.
7. Retain durable-runtime coverage for atomic history and resource persistence.
   Run affected Nx checks during implementation; this design does not require
   a new test framework or a production expense application.

## Out of Scope

1. Service extensions or extensions declared independently on actors, sessions,
   or individual model mutations.
2. Independently scheduled reactions, external side effects, jobs, Workflows,
   machine actors, or removal of existing automations.
3. Extension chains, multiple callbacks per command, recursive invocation, direct
   database writes, or asynchronous work inside the command transaction.
4. Expanding client selections to expose private policies, new replication
   behavior, or introducing another mutation persistence mechanism.

## Further Notes

1. The chosen name is `extensions`; `continuations` was a discussion name and
   must not become an alias or second public concept.
2. This builds on the completed query-only program database interface from spec 018. It adds authoritative behavior after shared writes rather than changing
   what shared program queries can observe.
3. Implementation and an implementation plan are separate follow-up work. No
   source changes or verification runs are claimed by this spec.
