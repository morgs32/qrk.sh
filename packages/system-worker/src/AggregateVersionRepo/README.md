# AggregateVersionRepo

VAR executes AC's admitted commands for one aggregate version. An execution permit serializes preparation and commit. [Preparation](executeCommands/executeCommands.ts) runs the selected contract against owned state; another version replays the command using its own program and guards.

[Commit](executeCommands/executeCommandsTx.ts) applies owned operations in order under a business savepoint inside the synchronous terminal-result transaction. Domain rejection rolls back owned writes and output rows while retaining a failed terminal command; infrastructure failure aborts the transaction. Resource state, terminal result, disposition head and delivery work commit together.

Original execution enqueues `executedCommandOutbox` for AVC and `executedAggregateCommandOutbox` for AC. Both pending rows share complete output reconstructed from `modelOperations` and `asyncOperations` by `(commandId, operationIndex)`. Either receiver may acknowledge first; [cleanup](deleteDeliveredAggregateMaterial.ts) deletes command rows and model publication material only after both pending deliveries are gone. Async rows retain frozen arguments, original authority, observations and recovery deadlines independently of source publication. Alarms recover interrupted delivery.

Mapped programs run the base first, validate its result, then append mapper output and validate the authoritative result before application. Original execution initializes each async child inside the successful savepoint. Replay retains emissions with null lifecycle and applies model operations only. Producers start after commit through [asyncOperations](../asyncOperations/README.md). Aggregates retain aggregate commands only.

Post-commit retries recover saved results. [Flush](flush/flush.ts) catches up an admitted checkpoint and awaits version-history publication through its execution position.

Changed fixed schemas require empty storage. No translation or fallback decoder is supplied. Existing checks: `system-worker:contract-programs:check` and `system-worker:command-history:restart:check`.
