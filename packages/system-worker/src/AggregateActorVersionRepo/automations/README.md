# Actor automation execution

AAVR projects one confirmed occurrence at a time. Its projection transaction also
enrolls matching automation runs as pending. Snapshot capture marks them
started before their programs run. A later
confirmed occurrence waits until that group's saved outputs have completed actor
staging. The gate does not wait for AC admission or aggregate execution.

Each sibling receives its own database built from the same captured selected graph.
Siblings run concurrently. Their returned command, explicit `null`, or failure is
saved independently. A projected pending group is recaptured after restart; a started invocation
without a saved result becomes
`interrupted` on recovery and is never invoked again. Saved successful commands
are staged together in stable automation order; a business rejection of one output
does not discard other accepted outputs.

AAVR resource tables and `actorState` are authoritative. Pending commands retain
references to retained command rows and prepared replay operations. A disposable database copies
the authoritative graph and replays unresolved operations for staging guards and
automation selection. The successful staging transaction retains those operations
and submission work without changing authoritative resources. Confirmed entries
resolve matching pending contributions before the next optimistic rebuild.

The live actor socket, secret-key execution, and provisioning stage through AAVR.
One actor-owned `aggregateCommandsOutbox` submits saved commands to AC in staged
order. It never invokes an automation or prepares mutations. Automation submissions
use the saved-output reference through `executeAutomationCommand`; ordinary callers
cannot submit automation provenance. AC owns admission, AVR owns aggregate guards
and execution, and AAVR owns contract and actor guards at staging. Recognized AC admission refusal is saved on the pending row, resolves that
optimistic contribution without an aggregate index, and returns the same failure
on caller retry. Transport failures remain delivery retries.

`automationState` preserves first registration after activation catch-up. Group and
run records preserve gate progress across restart; the alarm retries saved
work. Browser snapshots and publications read authoritative resources and the
matching confirmed cursor, excluding pending optimism.

Fixed-schema changes require empty storage; there is no compatibility migration.
