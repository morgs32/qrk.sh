# IEncodedCommand at boundary only

## Smell

Encoded command shapes or stringified payloads leak into domain logic and finalize paths.

## Pattern

See `contracts/iencoded-command-at-boundary-only.ts`.

## When to apply

AccountRepo finalize, command table mappers, any JSON.parse on command payload inside repo DOs.
