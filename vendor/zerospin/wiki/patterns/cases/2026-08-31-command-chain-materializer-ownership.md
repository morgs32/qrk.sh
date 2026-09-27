# Command chain and materializer ownership

## Smell

The history owner executes authored code, or the Repo assigns the
source index and owns admission order.

## Pattern

Keep ordered admission and retained terminal history in the named command
chain. Execute one occurrence in the selected Repo and return its
command-local delta. See
`system-worker/aggregate-chain-materialization.ts`.

## When to apply

Aggregate, service, or pushed command admission; one-time authored execution;
terminal history and subscriber fanout.
