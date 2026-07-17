# Fanout repo directory and lifecycle

## Smell

Fanout delivery callbacks on factory map; subscriber DO lifecycle mixed with FanoutRepo store/publish; catchup treated as delivery.

## Pattern

See `fanout/subscriber-owned-downstream-publish.ts`, `fanout/catchup-read-only-cbor-stream.ts`, `fanout/sqlite-queue-queue-wake-runner.ts`.

## When to apply

FanoutRepo directory layout; DO initialize/migrate/bootstrap for fanout subscribers.
