# Inline one-consumer helper

## Smell

Module-level Effect.fn or wrapper used at a single DO method call site with no reuse or isolated tests.

## Pattern

See `system-worker/inline-small-repo-logic-into-do-method.ts`.

## When to apply

User asks to inline repo logic into the DO class file; only one RPC method consumes the helper.
