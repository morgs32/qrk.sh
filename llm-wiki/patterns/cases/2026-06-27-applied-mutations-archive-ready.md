# Applied mutations archive ready

## Smell

Fanout events carry raw mutation fields; subscribers re-parse JSON; ledger rows missing commandId/mutationIndex/inverse encoding.

## Pattern

See `system-worker/aggregate-repo-finalization-fanout.ts` and `contracts/iencoded-command-at-boundary-only.ts` for the current aggregate block guidance.

## When to apply

AccountRepo block publish; ledger archive rows; encodeAppliedMutation at finalize.
