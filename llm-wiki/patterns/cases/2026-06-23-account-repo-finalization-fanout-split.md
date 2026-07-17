# Account repo finalization fanout split

## Smell

Monolithic closeAccountBatch; subscribe on every finalize; shared KV flag for multiple archive subscribers; raw mutations on fanout payload.

## Pattern

See `system-worker/account-repo-finalization-fanout.ts`, `system-worker/fanout-inline-payload-shape.ts`.

## When to apply

FinalizationEventFanout wiring; AccountRepo constructor bootstrap; finalize RPC return shape.
