# Handoff: Machine actors

**Date:** 2026-09-28  
**Focus:** Resume the `$spec` interview and write a machine actor design spec after the remaining material decisions are settled.

## Goal

Replace Zerospin automations with durable machine actors that observe confirmed command occurrences, maintain selected domain state and private work state, issue declared commands, and delegate delayed work to Cloudflare Workflows.

## Done

1. Settled the design direction in chat. No machine actor code, spec, or implementation plan has been written.
2. Agreed on one aggregate machine instance per `{ systemId, aggregateName, aggregateId, machineName }`, independent of aggregate versions. Its definition lives at the aggregate family level and authors an explicit VAC version pin; a deployment can change that pin without replacing the machine instance.
3. Agreed that an aggregate machine receives every terminal VAC occurrence, including failures and no-ops. It maintains actor-style declared selections as a local domain projection and has its own private state in the same durable object. On a VAC pin change, rebuild the selected projection while preserving private work state.
4. Agreed that machine command authority is limited to explicitly declared aggregate or service contracts. Normal command admission and guards still apply.
5. Agreed to replace all aggregate and service automations under the repository's pre-release hard-cutover policy. The service counterpart is a version-independent service machine actor subscribed to an authored service-version chain.
6. Chose a Zerospin jobs interface over direct application use of Workflow bindings. The favored interface expresses desired jobs by stable business key, allowing a moved or cancelled calendar event to reconcile its pending notification. Workflows own waits and retries; the machine reacts to command occurrences without scheduling its own alarms for those jobs.
7. Verified a source/documentation discrepancy: the current AggregateChain executes against an explicitly supplied aggregate version and has no applied-base cutover. Current architecture pages still describe deprecated `baseAggregateVersion` and cutover behavior. The machine's VAC pin must not derive from that stale design.

## Remaining

1. Resume the `$spec` interview with the open job-state ownership question below. Continue one material decision at a time; do not reopen the settled choices above.
2. Resolve the remaining machine interface, job reconciliation, recovery, version-switch, and testing decisions. Distinguish machine-owned private state from the disposable selected projection.
3. After the user confirms shared understanding, write one numbered design spec under `wiki/dev/specs/`. Do not write a spec or implementation plan during the interview.
4. Include removal of deprecated applied-base/cutover descriptions from current affected documentation in the eventual implementation scope. Preserve historical archived documents and unrelated working-tree changes.

## Suggested skills

1. `$spec` — continue the one-question-at-a-time design interview, then write the spec once aligned.
2. `$rubber-duck` — use for a terse first-principles check if a proposed machine or jobs interface becomes too elaborate.
3. `$patterns` and the local `wiki/patterns/index.md` — consult relevant repository conventions before specifying implementation seams.
4. `nx-workspace` — use before exploring Nx projects or targets for later verification planning.

## Pointers

1. `AGENTS.md` — hard-cutover and working rules.
2. `wiki/glossary.md` — current actor, automation, chain, and selection vocabulary.
3. `examples/tic-tac-toe/src/computerTurn.ts` — current aggregate automation to replace.
4. `packages/system-worker/src/AggregateChain/executeAggregateCommand/executeAggregateCommand.ts` — current explicit aggregate-version execution.
5. `wiki/architecture/server/admitCommands.md` — contains stale applied-base/cutover text; verify against source before using it.
6. [Cloudflare Workflows Workers API](https://developers.cloudflare.com/workflows/build/workers-api/) — instance creation, supplied IDs, lookup, and termination.

## Open decisions

1. Where should durable job decision state live? The recommended answer is the machine's private database: a Workflow sleeps, wakes a machine callback, and that callback reads its job record beside current selected rows. The alternative is to keep decision state in Workflow step results and query the machine from each step. The last question was interrupted without an answer; ask it again.
2. The user suggested that a Workflow callback should weigh Workflow state against the machine's selected database and may update state. Clarify the callback and state ownership before specifying the jobs interface.
