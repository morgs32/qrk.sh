# Zerospin Studio

`zerospin studio` starts a local inspection UI and a server-side broker. The
broker obtains deployment-scoped SystemApi access using the configured secret;
the browser receives decoded data and single-use stream tickets.

## Aggregate agent query preview

From the home page, select an aggregate type/version, an existing aggregate ID,
then a declared agent. IDs come from AggregateChain registrations. Each agent
pins an exact aggregate version and a dedicated aggregate actor version with
`authentication: 'system'`, no contracts, and aggregate-only claims/path. Ordinary
application authentication and session authorization reject system-only actors.

Declare an agent in the System's named `agents` registry:

```ts
agents: {
  purchaseItems: makeAgent({
    aggregate: userAggregateV1,
    actor: purchaseItemPreviewV1,
    query: { modelName: 'purchaseItem', where: { quantity: { gt: 0 } } },
  }),
}
```

Queries return complete model rows. Filters use literal column comparisons
`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `isNull`, and `isNotNull`. Column filters and
operators combine with AND. Dates use ISO string literals; booleans support
`eq`/`ne`. Callbacks, SQL, joins and computed results are excluded. System
composition validates exact registered bindings, projected models and filter
fields/types. The manifest includes encoded projected model metadata; Studio
imports no authored server declarations.

Each mounted preview synchronously constructs a `makeAgentSession`, then
initializes main-thread in-memory SQLite from an actor snapshot. A transient
client identity resumes the existing actor stream at that snapshot's cursor.
Stream replay covers updates between snapshot capture and connection. Resource
deltas and checkpoints commit in one synchronous transaction; duplicates are
ignored. Gaps, invalid frames/checkpoints and interrupted transport recover
with fresh snapshots/tickets. Retained rows remain visible with stale/error
status during reconnection.

`useLiveQuery` subscribes to committed table changes and reruns the declared
Drizzle query. Switching selections or unmounting disposes the previous session,
invalidates pending callbacks, aborts bootstrap requests, closes transport and
SQLite, and removes view/query subscriptions. Reopening starts from a new
snapshot. There is no durable Node, backup, SharedWorker, command journal,
command-submission API, additional agent projection Repo or Chain, or execution
of instructions. Service attachments, commands, payment processing, durable
execution and upgrades remain deferred.

## Focused verification

1. `pnpm nx run @zerospin/core:agent-preview:check` checks declarations, manifest serialization and application rejection.
2. `pnpm nx run @zerospin/browser:agent-preview:check` uses real in-memory SQLite with an independent stream fixture for lifecycle, replay, recovery and isolation.
3. `pnpm nx run @zerospin/studio:agent-fixture:serve`, then open `/src/fixtures/agentPreview.html`, exercises the actual React view and `useLiveQuery` with independent data. It reports assertion results on the page and never connects to Shopping.
4. `pnpm nx run @zerospin/studio:preview:build` verifies the browser bundle.
