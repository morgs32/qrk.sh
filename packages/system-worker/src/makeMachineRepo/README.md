# Durable machine repository

`makeMachineRepo` runs each registered machine in a SQLite Durable Object. Aggregate machines are addressed by system, aggregate family, aggregate ID, and machine name; service machines by system, service family, and machine name. The source version is a persisted pin, separate from the owner identity.

First creation captures a source frontier, builds its selected projection without historical reactions, and calls `onBootstrap` once. Each later source occurrence updates the projection, calls the current State's `onCommand`, and advances the cursor in one transaction; a callback failure rolls that transaction back. Fanout acknowledgement follows the commit. Activation catches up unseen occurrences. A changed source pin rebuilds disposable model tables and calls `onVersionChange`, preserving private State unless the callback replaces it. Changed fixed schemas require empty storage.

State entry validates and persists the value and revision, then schedules a deadline, starts an activation, or freezes an outgoing command. Activation runs outside the storage gate. A new revision interrupts the old Fiber and rejects its late result. `push` requests durable handoff; `execute` waits for the terminal result. Recovery reuses the frozen command bytes and identity. `getState()` returns the State, revision, and source cursor; `getOperation({ revision })` returns the durable operation record.

The declaration interface lives in [Core](../../../core/src/machine/README.md). The dedicated machine Workerd suite uses `tests/workerd/machines/` fixtures through System Worker's `test:workerd` target.
