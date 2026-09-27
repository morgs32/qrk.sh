# Aggregate actor version repository

This Durable Object projects confirmed aggregate occurrences into one actor's selected graph, stages caller and automation commands optimistically, and publishes confirmed actor output. It owns actor contract and actor guard checks at staging. Aggregate guards run later in the authoritative aggregate version repository transaction.

`commands` retains the full source-scoped encoded command and lifecycle results. Saved automation outputs occupy rows before confirmation; confirmation fills the same row. `pendingCommands` stores an internal command-row reference plus prepared replay operations. Open automation groups wait for sibling results and output staging before the next confirmed occurrence is projected. Siblings use isolated snapshots of the same selected state. Recovery interrupts started runs without a saved result and stages saved outputs without invoking their programs again.

The aggregate command outbox submits retained staged rows to the aggregate chain. The actor command outbox publishes confirmed selected deltas. It retains acknowledged command rows, and browser snapshots read confirmed resources and their cursor.

Actor scratch snapshots instantiate the bundled sql.js WASM module with its browser loader, which supports workerd's missing `self.location`. They do not fetch WASM from a URL.

See [AggregateActorVersionRepo.ts](AggregateActorVersionRepo.ts), [retainedCommands.ts](retainedCommands.ts), and [automation lifecycle](automations/README.md). Fixed-schema changes require empty storage.
