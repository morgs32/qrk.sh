# Read-only Drizzle on db, not makeTx

## Smell

Read-only cursor/watermark queries wrapped in makeTx when no writes share the unit of work.

## Pattern

See `system-worker/read-only-drizzle-on-db-not-maketx.ts`.

## When to apply

lastAccountCursor, lastPushedCursor, paginated fanout reads inside \*Repo DOs.
