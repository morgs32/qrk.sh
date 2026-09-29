# Aggregate actors

Browser actors use `makeAggregateActorVersion` and register under an aggregate's
`actors`. Each version declares its actor database, identity schema and explicit authentication policy,
queries, contracts, optional authorization, and guards. Contracts must use
models from the actor database and accept its identity shape.
Construction validates the declaration, then retains the original typed
database, identity, queries, contracts, and callbacks.

`makeActorDbVersion` supplies the `queries` used to compile actor selections. The actor's
identity schema requires a string `aggregateId`; its actor schema supplies
the identity fields used by selection placeholders. Sessions obtain server-accepted identity and
resolve the exact actor name and version before accessing selected resources or
submitting commands.

`updateAggregateActorVersion` inherits omitted declaration fields and merges
queries, contracts, and guards by key. Supplied entries replace
matching keys; empty maps preserve inherited entries. Database, identity,
and authorization overrides replace their inherited values. The complete merged
declaration is validated, including that queries belong to the selected database.
Deployed historical versions retain their own declarations.

Actor lock metadata records identity schemas, models, selections, and
contracts. Fixed schema changes require empty storage during pre-release.

## Durable machine actors

System-level machine declarations observe an aggregate version independently of browser actor instances. A machine owns its source cursor, selected projection, private State, and frozen outgoing command in a separate Durable Object. Its bound contracts do not become browser-callable merely because the machine can submit them. The aggregate contract guard and authoritative command admission still run for machine output.

See [machine runtime](../../../system-worker/src/makeMachineRepo/README.md) and [machine declarations](../machine/README.md) for the current lifecycle. Changed fixed schemas require empty storage during pre-release.
