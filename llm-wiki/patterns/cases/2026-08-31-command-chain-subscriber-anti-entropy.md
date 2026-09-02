# Command chain subscriber anti-entropy

## Smell

A materialized Repo treats the latest-tip notification as complete history or
acknowledges before its state and output outbox commit.

## Pattern

Subscribe first, pull every contiguous terminal command page, and acknowledge
only after the local transaction commits. Catch-up applies retained outcomes;
it never re-executes authored code. See
`system-worker/command-chain-subscriber-anti-entropy.ts`.

## When to apply

Materializer startup, coalesced subscriber notifications, history gaps, and
source-frontier repair.
