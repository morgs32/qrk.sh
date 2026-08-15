# Fanout repo directory and lifecycle

## Smell

AggregateFrontendRepo initialization copied a materialized AggregateRepo snapshot, then
treated history catch-up as subscriber delivery by synchronously draining the
live fanout queue and comparing against a separately captured moving bound. A
later path rebuilt targets omitted from frozen projection bounds only to return
read-only state that could neither subscribe nor accept commands.

## Pattern

Before opening a projection repo, reject a target omitted from the projection
bounds once generation freeze is durable; the caller must regain a capability
for an active generation. For a projection admitted before freeze, initialize
it empty, pull ordered AggregateBlockRepo batches until the applied tail cursor
equals the batch's advertised last-available cursor, then subscribe from the
applied cursor/index pair. Fanout owns only later live delivery. See
`system-worker/direct-aggregate-frontend-fanout.ts`.

## When to apply

Materialized projection bootstrap; archive replay; Durable Object subscriber
registration; history/live handoff; post-freeze projection acquisition.
