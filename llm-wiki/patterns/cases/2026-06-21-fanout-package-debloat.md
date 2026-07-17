# Fanout package debloat

## Smell

Fanout factory subscriberMap carries success callbacks, spread passthrough into repo utils, or hidden shell composition.

## Pattern

See `fanout/subscriber-owned-downstream-publish.ts`, `fanout/subscriber-shell-composition-explicit.ts`.

## When to apply

makeFanoutRepo subscriberMap edits; new publishing subscriber DO wiring.
