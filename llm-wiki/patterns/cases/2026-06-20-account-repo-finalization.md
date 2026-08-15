# Account repo finalization

## Smell

Account finalize scans service contracts, uses wrong command mode branch, or treats service commands as account commands.

## Pattern

See `system-worker/aggregate-repo-contract-lookup.ts`, `system-worker/effect-partition-batch-finalization.ts` for the current aggregate-named guidance.

## When to apply

AccountRepo.finalizeAccountBlock and account-scoped contract.program execution.
