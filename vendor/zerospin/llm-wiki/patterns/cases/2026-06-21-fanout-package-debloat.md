# Fanout package debloat

## Smell

Fanout factory subscriberMap carries success callbacks, spread passthrough into repo utils, or hidden shell composition.

## Pattern

See `system-worker/direct-aggregate-frontend-fanout.ts` for the current explicit subscriber-delivery shape.

## When to apply

makeFanoutRepo subscriberMap edits; new publishing subscriber DO wiring.
