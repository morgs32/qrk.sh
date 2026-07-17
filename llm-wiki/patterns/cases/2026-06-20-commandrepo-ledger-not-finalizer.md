# CommandRepo ledger not finalizer

## Smell

Ledger/archive DOs own finalization, fanout cursors, or command execution instead of archive-only storage.

## Pattern

See `system-worker/account-repo-finalization-fanout.ts`.

## When to apply

Ledger archive surface area reviews; batch close paths that write ledger from non-AccountRepo callers.
