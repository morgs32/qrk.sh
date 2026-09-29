# Aggregate actor version repository

This Durable Object projects terminal aggregate occurrences into one browser actor's selected graph, stages caller commands optimistically, and publishes confirmed actor output. It checks actor contracts and actor guards when staging; the aggregate version repository applies authoritative contract and aggregate guards before execution.

`commands` retains complete source-scoped command rows and lifecycle results. `pendingCommands` stores references to retained rows and prepared replay operations. Unresolved rows reconstruct disposable optimistic state for caller staging. The aggregate command outbox submits retained staged rows to AggregateChain; the actor command outbox publishes confirmed selected deltas. Browser snapshots read confirmed resources and their cursor.

Machine actors have separate system-level owners and source fanout subscribers. Their private State and frozen commands are stored in the machine repository, outside this browser actor projection. See [machine repository](../makeMachineRepo/README.md) and [retainedCommands.ts](retainedCommands.ts). Changed fixed schemas require empty storage.
