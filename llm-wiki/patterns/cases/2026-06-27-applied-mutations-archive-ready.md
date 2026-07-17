# Applied mutations archive ready

## Smell

Fanout events carry raw mutation fields; subscribers re-parse JSON; ledger rows missing commandId/mutationIndex/inverse encoding.

## Pattern

See `system-worker/fanout-inline-payload-shape.ts`, `contracts/iencoded-command-at-boundary-only.ts`.

## When to apply

AccountRepo block publish; ledger archive rows; encodeAppliedMutation at finalize.
