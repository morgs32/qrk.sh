# Shopping decoded service-query seed check design

**Date:** 2026-07-12
**Status:** Approved for planning

## Problem Statement

Shopping Playwright authentication checks whether the product catalog is already seeded by calling the direct `getProducts` service query. `decodeRpc` returns that query's domain values, including `Date` instances for resource timestamps. The setup then applies the encoded side of `Product.resourceSchema`, which expects timestamp strings and rejects those already-decoded dates before authentication or DevTools browser tests can run.

The failure is in the test's schema-side choice, not in seed command construction, service finalization, persisted product rows, or the public RPC transport. Adding a union that accepts both strings and dates would blur the encoded/decoded contract and hide the misuse.

## Solution

Keep the direct service-query RPC and its decoded result unchanged. Validate the returned unknown value against the decoded side of the product resource schema before checking whether the canonical seed product exists. Preserve the existing conditional seed behavior: an existing catalog skips finalization, while a missing catalog finalizes the configured seed commands and requires an empty failure list.

## User Stories

1. As a developer running Shopping Playwright locally, I want authentication setup to accept decoded product rows, so that existing seeded state does not block the suite.
2. As a test author, I want direct service-query results validated on the correct schema side, so that encoded and decoded resource contracts remain explicit.
3. As a Shopping developer starting from empty state, I want the setup to continue finalizing the configured product seeds, so that browser tests have the catalog they require.
4. As a Shopping developer reusing existing state, I want the setup to skip duplicate seed finalization, so that repeated test runs remain idempotent.
5. As a DevTools maintainer, I want the full authenticated browser suite to reach the DevTools route assertions, so that the consolidation is verified through its intended top-level seam.

## Implementation Decisions

1. Preserve `SystemApi.executeServiceQuery`, `SystemWorker.executeServiceQuery`, and `ServiceRepo.executeServiceQuery` behavior.
2. Treat the successful `decodeRpc` result as domain data. Validate it with the decoded side of `Schema.Array(Product.resourceSchema)` rather than decoding the encoded side again.
3. Do not add a schema union, fallback conversion, nullable timestamp path, or compatibility branch accepting both encoded strings and decoded dates.
4. Keep the existing `Basic T-Shirt` presence check as the idempotency signal for whether the product seed batch must run.
5. Keep seed commands sourced from the Shopping `seeds` Effect and keep `finalizeServiceCommands` as the seed-write boundary.
6. Preserve the assertion that service seed finalization returns no failed commands.
7. Do not wipe persisted Shopping state as the normal fix; both empty and already-seeded states must work.

## Testing Decisions

1. Use the Shopping Playwright auth project as the highest seam. It must complete against an already-seeded catalog containing decoded `Date` values.
2. Verify the empty-catalog branch still runs seed finalization and produces the expected products.
3. Run the authenticated Shopping home suite after auth setup so the DevTools route, control sizing, Shared Worker status, Settings, and close/reopen assertions execute through the normal dependency chain.
4. Run Shopping TypeScript, lint, build, and full Playwright targets through Nx.
5. Keep failures at the schema boundary descriptive; do not suppress parse failures or skip the auth prerequisite.

## Out of Scope

1. Changing resource timestamp encoding across RPC boundaries.
2. Changing product models, seed contents, service contracts, or product-query behavior.
3. Adding persisted-state compatibility schemas or alternate runtime paths.
4. Fixing the separate `LogRepo` binding RPC type failure.
5. Expanding the Playwright authentication model beyond restoring the existing suite.

## Further Notes

1. The observed parse failure identifies `createdAt` as a `Date` supplied to `DateFromString`; this is direct evidence that the test is applying the encoded side after RPC decoding.
2. Full Shopping build verification still depends on the separate `LogRepo` binding RPC type repair.
