# Account repo finalization fanout split

## Smell

Monolithic closeAccountBatch; subscribe on every finalize; shared KV flag for multiple archive subscribers; raw mutations on fanout payload.

## Pattern

See `system-worker/aggregate-repo-finalization-fanout.ts` and `system-worker/direct-aggregate-frontend-fanout.ts` for the current direct topology.

## When to apply

FinalizationEventFanout wiring; AccountRepo constructor bootstrap; finalize RPC return shape.
