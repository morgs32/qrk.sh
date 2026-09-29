# Service actor version repository

This Durable Object projects terminal service occurrences for one authored service actor binding. It owns the actor's selected resource tables, source cursor, and publication of selected deltas through the service actor chain. Browser session snapshots and catch-up use its confirmed projection.

Service machine actors are separate system-level Durable Objects. The service version chain retains one ordered terminal occurrence feed and delivers it to each machine through its own subscriber row and fanout queue. The machine repository owns private State, selected projection, and any frozen outgoing command. See [machine repository](../makeMachineRepo/README.md) and [executeTx.ts](execute/executeTx.ts). Changed fixed schemas require empty storage.
