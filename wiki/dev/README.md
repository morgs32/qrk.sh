# `wiki/dev`

Human-authored development documents for this repo live here.

| Path                 | Contents                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `wiki/dev/plans/`    | Implementation plans (`XXX-plan-<topic>.md`)                                                                 |
| `wiki/dev/specs/`    | Design specs (`XXX-spec-<topic>.md`)                                                                         |
| `wiki/dev/handoffs/` | New-thread handoffs (`XXX-handoff-<topic>.md` for numbered work, otherwise `YYYY-MM-DD-handoff-<topic>.md`)  |
| `wiki/dev/diagrams/` | Standalone development diagrams                                                                              |
| `wiki/dev/rfcs/`     | Requests for Comments                                                                                        |
| `wiki/dev/archived/` | Fully implemented and verified plans, plus completed specs and handoffs that no longer carry actionable work |

Allocate the next three-digit `XXX` for every new spec/plan pair or standalone
plan by finding the highest three-digit filename prefix anywhere under
`wiki/dev/` and incrementing it. A plan derived from a spec reuses the spec's
exact `XXX` and topic.

A handoff tied to a numbered spec or plan reuses that number. A standalone
handoff uses a date prefix and does not allocate or consume a spec/plan number.
Writing a handoff does not change or archive its source plan.
