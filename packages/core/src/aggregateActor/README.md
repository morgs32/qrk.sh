# Aggregate actors

Browser actors use `makeAggregateActorVersion` and register under an aggregate's
`actors`. Each version declares its actor database, identity schema and explicit authentication policy,
selections, contracts, optional authorization, and guards. Contracts must use
models from the actor database and accept its identity shape.
Construction validates the declaration, then retains the original typed
database, identity, selections, contracts, and callbacks.

`makeActorDbVersion` supplies the `selections` used to compile actor selections. The actor's
identity schema requires a string `aggregateId`; its actor schema supplies
the identity fields used by selection placeholders. Sessions obtain server-accepted identity and
resolve the exact actor name and version before accessing selected resources or
submitting commands.

`updateAggregateActorVersion` inherits omitted declaration fields and merges
selections, contracts, and guards by key. Supplied entries replace
matching keys; empty maps preserve inherited entries. Database, identity,
and authorization overrides replace their inherited values. The complete merged
declaration is validated, including that selections belong to the selected database.
Deployed historical versions retain their own declarations.

Actor lock metadata records identity schemas, models, selections, and
contracts. Fixed schema changes require empty storage during pre-release.
System-only aggregate actors use `authentication: 'system'`. Application
identity admission and aggregate-session authorization reject them before any
ordinary authorizer runs. Studio sessions use a full-view admin actor with
aggregate-only claims/path. Browser-safe session declarations bind ordinary
contracts whose exact originals are registered on that actor. The secret-key
SystemApi broker resolves the declaration and grants a bounded snapshot/stream
and command ticket; private async continuations remain excluded.
