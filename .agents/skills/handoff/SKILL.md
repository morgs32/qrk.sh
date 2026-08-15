---
name: handoff
description: >-
  Merge every explicit decision from the current conversation with the spec,
  plan, or handoff it started from or actively used, then write or update one
  concise Markdown handoff under wiki/dev/handoffs/. Use when the user says
  handoff, /handoff, $handoff, thread handoff, new-thread context, save this
  context, or asks to preserve design or planning decisions for another thread.
---

# Handoff

Create one durable decision handoff that lets a fresh thread continue the
current spec or plan without reopening settled questions. The handoff is a
lossless merge of decision-bearing context, not a fresh codebase review.

## Workflow

1. Read the repository instructions needed for handoff placement and naming.
2. Read the full available current conversation chronologically, including any
   compaction summary. Resolve terse replies such as “yes,” “no,” or an option
   number to the exact proposal they answered.
3. Identify and read completely every spec, plan, or handoff that the current
   conversation started from or actively used. Read another task, transcript,
   attachment, or document only when the user identifies it as decision-bearing
   context. Do not recursively follow references unless they are necessary to
   interpret a decision.
4. Before drafting, build the private decision inventory below from the
   conversation and carried artifacts.
5. Merge the inventory into one current account. Carry forward still-current
   decisions from prior artifacts even when the conversation did not repeat
   them. Deduplicate equivalent decisions, preserve supersessions, and do not
   merely link to an earlier artifact in place of carrying its decisions
   forward.
6. If identified decision-bearing context is unavailable and could materially
   change the result, stop and ask for it. Do not fill the gap from source code
   or an agent proposal.
7. Write or update exactly one handoff under `wiki/dev/handoffs/`:
   1. For work tied to a numbered spec or plan, reuse its prefix:
      `XXX-handoff-<topic>.md`.
   2. For standalone work, use `YYYY-MM-DD-handoff-<topic>.md`; do not consume a
      spec or plan number.
   3. Update an existing handoff for the same work instead of creating serial
      session summaries.
8. Reconcile the finished handoff against the private inventory one item at a
   time. Verify its filename and links, then run `git diff --check` for the
   handoff and skill files when applicable.

## Decision inventory

Capture every explicit decision relevant to the current spec or plan,
including positive and negative decisions about:

1. Names, renames, terminology, and exact shapes.
2. Required behavior, ownership, boundaries, and lifecycle rules.
3. Required or forbidden methods, fields, routes, wrappers, and abstractions.
4. Error and failure behavior.
5. Hard cutovers, deletions, exclusions, and rejected alternatives.
6. Explicitly deferred or unresolved questions.
7. The next action, when the user decided one.

For each item retain the decision, its provenance, its status, and any decision
that superseded it.

| Status                 | Meaning                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| Settled                | The user decided it; only a later explicit user decision can reopen it. |
| Rejected               | The user explicitly rejected the alternative.                           |
| Superseded by `<item>` | A later explicit decision replaced it; retain the visible relationship. |
| Unresolved             | The user explicitly left it open.                                       |

Use this precedence when accounts conflict:

1. The user's latest explicit decision in the current conversation.
2. Earlier explicit user decisions in the current conversation.
3. Decisions carried by the spec, plan, or handoff the conversation is using.

Between carried artifacts, honor explicit supersession recorded in those
artifacts. If they conflict without a recorded resolution, preserve the
conflict as unresolved; do not infer precedence from document type or current
source code.

Do not infer acceptance from an assistant or subagent proposal the user never
confirmed. Include an unconfirmed proposal only when needed to identify what a
terse response or explicit rejection referred to, and label it unaccepted.

Do not assign or independently verify implementation status unless the user
explicitly requests it. If the conversation itself established relevant work
state, preserve it separately and describe its verification exactly as the
conversation recorded it.

## Handoff content

Use only the sections that contain useful information, normally in this order:

1. Capture date and a direct instruction for the receiving thread.
2. Inputs merged: the current conversation and each carried artifact.
3. Brief objective and context needed to interpret the decisions.
4. Consolidated decisions with status, provenance, and supersession links.
5. Explicitly unresolved questions.
6. The decided next action, if any.
7. Optional thread-established work state or preservation constraints when they
   are directly relevant.

Self-contained means the current decision set is present without requiring the
receiving thread to reconstruct it from prior artifacts. It does not mean
restating the codebase, architecture, implementation path, or test history.

## Completeness check

Before finishing:

1. Map every inventory item to an explicit handoff entry.
2. Confirm every still-current decision from each carried artifact is present,
   even when it was not repeated in the current conversation.
3. Include negative decisions and rejected alternatives directly; do not rely
   on omission to express them.
4. Preserve every superseded decision with a visible `superseded by`
   relationship.
5. Search for every exact decided symbol, replacement name, error code, and
   deleted name.
6. Search conditional language such as `maybe`, `recommended`, `if accepted`,
   `whether`, `open`, and `unresolved`. Remove it wherever the inventory says
   the matter is settled.
7. Confirm that the unresolved section contains only genuinely unresolved
   decisions.

## Boundaries

1. Do not perform a general architecture, source, test, runtime, Git status, or
   diff audit for a handoff. Do so only when the user explicitly requests that
   additional scope.
2. Do not introduce new analysis, design proposals, or implementation
   recommendations merely to make the handoff appear complete.
3. A handoff records decisions; it does not authorize implementation,
   runtime-boundary changes, commits, plan archival, cleanup, or edits to the
   active spec or plan.
4. Preserve explicitly recorded WIP constraints, but do not inspect the whole
   worktree to discover new ones.
5. Do not paste secrets, credential values, generated signatures, tokens, or
   sensitive logs into the handoff.

## Done when

1. One correctly named handoff exists or was updated.
2. Every explicit decision from the current conversation and every
   still-current decision from the carried artifacts appears in it or has a
   visible supersession relationship.
3. No unaccepted proposal is presented as settled, and no settled decision is
   presented as optional or unresolved.
4. A fresh thread can continue the spec or plan from the consolidated decision
   set without reviewing the repository to rediscover what was decided.
