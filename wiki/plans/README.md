# Plans and decision records

`wiki/plans/` is the shared queue of work for people and agents.

As of 2026-10-02, [plan 011](../archive/plans/011-plan-actor-staging-and-gated-listener-execution.md) records supersession of the listener scheduler and completion of the surviving actor staging, delivery, snapshot and Node recovery verification. Its legacy specs [008](../archive/specs/008-spec-durable-actor-listeners.md) and [010](../archive/specs/010-spec-command-lifecycle-results.md) are archived; no active legacy specs remain. The concurrent [visualizer plan 032](032-plan-react-flow-visualizer.md) and [Shopping fulfillment handoff](../handoffs/2026-10-02-handoff-shopping-fulfillment-studio.md) remain active. Governing ADRs remain active.

| Path                     | Contents                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `wiki/plans/`            | Implementation plans (`XXX-plan-<topic>.md`)                                                                |
| `wiki/adrs/`             | Decisions that are hard to reverse, surprising without context, and the result of a real trade-off          |
| `wiki/handoffs/`         | New-thread handoffs (`XXX-handoff-<topic>.md` for numbered work, otherwise `YYYY-MM-DD-handoff-<topic>.md`) |
| `wiki/diagrams/`         | Standalone development diagrams                                                                             |
| `wiki/rfcs/`             | Requests for Comments                                                                                       |
| `wiki/archive/plans/`    | Completed, cancelled, or superseded plans with no remaining work                                            |
| `wiki/archive/adrs/`     | Optional archive for decisions that no longer govern anything                                               |
| `wiki/archive/handoffs/` | Completed or superseded handoffs                                                                            |
| `wiki/archive/specs/`    | Previously archived design specs                                                                            |
| `wiki/specs/`            | Existing design specs; do not create new spec files                                                         |

Allocate the next three-digit `XXX` for a new plan by finding the highest
three-digit plan or legacy spec filename prefix anywhere under `wiki/` and
incrementing it. Do not count ADRs. Reuse an existing number and topic when
continuing the same numbered work. Number ADRs independently within
`wiki/adrs/` and `wiki/archive/adrs/` and link them from related plans.

Capture qualifying ADRs when the decision settles, then amend them if
implementation changes the decision or its consequences. Keep settled domain
terms in `wiki/glossary.md`. Archive a plan when no work remains: full
implementation and verification, or user-approved cancellation/supersession.
Record the outcome and link any continuing work.

Keep an ADR in `wiki/adrs/` while it still governs anything, even after its
plan is complete. Mark a replaced ADR **Superseded** and link its successor.
Move it to `wiki/archive/adrs/` only when it no longer governs anything and
archival is wanted; age or completed implementation alone is not a reason.

A handoff tied to a numbered plan or legacy spec reuses that number. A
standalone handoff uses a date prefix and does not allocate or consume a plan
number. Writing a handoff does not change or archive its source plan.
