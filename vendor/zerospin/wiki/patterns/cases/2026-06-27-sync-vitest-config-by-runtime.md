# Sync vitest config by runtime

## Smell

cloudflareTest in node vitest config; \*.spec.ts mixing node and workerd; browser tests in wrong config lane.

## Pattern

See `system-worker/vitest-runtime-boundaries.ts`.

## When to apply

New system-worker or e2e spec files; vitest config splits for node / workerd / playwright lanes.
