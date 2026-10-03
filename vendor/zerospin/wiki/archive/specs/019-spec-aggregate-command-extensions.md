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

## Further Notes

1. The chosen name is `extensions`; `continuations` was a discussion name and
   must not become an alias or second public concept.
2. This builds on the completed query-only program database interface from spec 018. It adds authoritative behavior after shared writes rather than changing
   what shared program queries can observe.
3. Implementation and an implementation plan are separate follow-up work. No
   source changes or verification runs are claimed by this spec.
