# Delete stale type files

## Smell

Consumers import symbols renamed in source but still present in stale dist; local type files paper over drift.

## Pattern

See `typescript/dont-match-stale-dist.ts`, `typescript/rebuild-worker-declarations-before-patch.ts`.

## When to apply

Missing export errors after package rename; temptation to add parallel local interfaces instead of rebuilding lib.
