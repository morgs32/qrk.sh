# Figma file variants design

**Date:** 2026-07-18
**Status:** Approved for planning

## Problem Statement

The Figma collection exposes one static `default` variant whose hard-coded White Bay image duplicates the Image brick. It does not accept a Figma URL, load Figma metadata, distinguish Figma file types, or open the represented file. The scraper likewise has no explicit Figma capability or server-side Figma credential boundary.

## Solution

Replace the static Figma variant with four data-backed collection variants: `design`, `board`, `slides`, and `prototype`. Each variant accepts its matching Figma file URL and calls a matching named method on a new `FigmaRepo`. The repository uses a server-side Figma token to request authenticated oEmbed metadata, canonicalizes the file-level URL, caches successful metadata, and returns the decoded preview data.

Each variant has one 4x4 brick with a distinct presentation. Loaded cards show the current thumbnail and title and open the canonical Figma file in a new tab. Before data is loaded, or when a loaded file has no usable thumbnail, the card uses its own local branded presentation.

## User Stories

1. As a brick author, I want to configure a Figma Design URL so that its current file preview appears in a canvas-focused card.
2. As a brick author, I want a FigJam board to have a presentation that reads as a collaborative whiteboard rather than a generic image.
3. As a brick author, I want a Figma Slides deck to appear in a presentation-oriented card.
4. As a brick author, I want a Figma prototype to appear in a device-oriented card with an obvious play affordance.
5. As a workbench user, I want each variant to reject URLs belonging to a different Figma file type so that configuration mistakes are explicit.
6. As a visitor, I want a configured Figma card to open the represented file in a new tab.
7. As a developer, I want Figma credentials to remain inside the scraper Worker rather than entering variant payloads or browser code.
8. As a developer, I want cached Figma metadata to remain available during temporary upstream failures.

## Implementation Decisions

1. Replace `default` in the Figma collection with exactly four variants:
   1. `design` for `figma.com/design/<file-key>/...`.
   2. `board` for `figma.com/board/<file-key>/...`.
   3. `slides` for both `figma.com/slides/<file-key>/...` editor URLs and `figma.com/deck/<file-key>/...` presentation URLs, canonicalizing both to `https://www.figma.com/slides/<file-key>`.
   4. `prototype` for `figma.com/proto/<file-key>/...`.
2. Do not add a Figma Make variant. Published Make and `figma.site` resources are outside this Figma file collection design.
3. Each variant has exactly one `4x4` brick. Do not add other sizes in this change.
4. Each variant declares the same single payload field, `url`, using the existing text primitive and a generic example URL for its own file family.
5. Each variant declares the oEmbed fields consumed by its card through `dataShape`:
   1. `title` as text.
   2. `url` as the canonical file URL.
   3. `thumbnail_url` as nullable text.
   4. `thumbnail_width` as a nullable integer.
   5. `thumbnail_height` as a nullable integer.
6. Preserve additional JSON-safe oEmbed fields in loaded results and in the workbench Data pane, following the existing variant-data contract.
7. Each variant supplies generic placeholder `defaultData`, not captured data from a real user file:
   1. The title identifies the variant.
   2. The canonical URL is empty.
   3. Thumbnail fields are null.
   4. A default card with no canonical URL is not interactive.
8. Loaded cards with a canonical URL wrap their primary interactive surface in an external link using a new tab and `noopener noreferrer` protection.
9. The four visual presentations are intentionally separate components with no shared card component or render helper:
   1. `design` uses an almost edge-to-edge canvas preview with a compact white title strip and Figma mark.
   2. `board` frames its preview as a playful FigJam canvas with colored sticky-note accents and a compact title badge.
   3. `slides` places its preview in a widescreen presentation frame on a dark stage with a title and Slides indicator.
   4. `prototype` places its preview in a device-like viewport with a visible play affordance and title below it. The play affordance is presentational; clicking opens the canonical file.
10. Every card retains its title and unique composition when `thumbnail_url` is null or the remote image fails. Its image region falls back to local CSS/SVG presentation; remote failure does not change loaded data into an error.
11. Accept `https://figma.com` and `https://www.figma.com` input hosts. Reject other schemes, hosts, missing file keys, unsupported file families, and a file family that does not match the invoked method.
12. Normalize accepted input to the whole file:
13. Remove query and fragment state including `node-id`, `starting-point-node-id`, and dev-mode parameters.
14. Normalize the host and path form.
15. Use the resulting file URL as the cache key, Figma oEmbed request URL, returned `url`, and card click target.
16. Add `figmaRepo()` to `ScraperApi` with four explicit public methods:
17. `getDesign(url)`.
18. `getBoard(url)`.
19. `getSlides(url)`.
20. `getPrototype(url)`.
21. Add a `FigmaRepo` SQLite Durable Object and one `FIGMA_REPO` binding. The four public methods delegate to one private `getFile(url, expectedType)` path inside the class. This is the only approved server loading abstraction for the four capabilities.
22. The private path owns explicit URL normalization, cache lookup, in-flight request coalescing, oEmbed loading, decoding, persistence, and stale refresh. Do not introduce a dynamic provider registry, queue, generic cache service, barrel, or re-export.
23. Add the approved `IFigmaFilePreviewPayload` named type. Its declared fields are the five fields in decision 5 plus preserved JSON-safe response fields. Use it for the Figma response parser, Figma cache payload, and four RPC return values; do not add another named Figma file-type or props type.
24. Use a named `Effect.fn` program for the Figma oEmbed request and response decoding, following existing scraper provider code. The private repository method remains the Durable Object/runtime boundary.
25. Send the server-only `FIGMA_TOKEN` to Figma in the `X-Figma-Token` request header. Never accept the token from a variant payload, return it through RPC, log it, or add it to committed fixtures.
26. Use Figma's authenticated `GET /v1/oembed` endpoint with the normalized file URL. Do not request the full Figma document, node tree, iframe HTML for rendering, or file-content scope.
27. Decode the required card fields and preserve extra JSON-safe response fields. Treat absent thumbnail fields as null. Reject a response without a non-empty title or canonical URL as an unsupported response shape.
28. Cache successful responses for one hour, matching Figma's documented oEmbed `cache_age` value. After expiry, return stale data immediately and start at most one background refresh for that canonical URL.
29. A successful refresh replaces the cached payload and expiry. A failed refresh logs the structured failure without the token or response body and retains stale data indefinitely. Failed first loads are not cached, and concurrent first loads for one canonical URL share one request.
30. Add `file-unavailable` and `file-type-mismatch` to the existing scraper error codes:
31. Use `file-type-mismatch` when a valid Figma URL belongs to a different named capability.
32. Use `file-unavailable` for missing files and access failures that should not expose credential details.
33. Continue using `invalid-scrape-request` for malformed or unsupported URLs, `unsupported-page-shape` for malformed successful responses, and `scrape-transient-failure` for rate limits, network failures, and upstream server failures.
34. Register `FigmaRepo` through the Worker exports, Wrangler Durable Object binding and migration, scraper environment type, generated public declarations, and local test bindings. Do not alter the existing origin repositories.
35. Point each collection variant's `getData` directly at its matching named RPC method. Keep the four mappings explicit; do not loop over variant definitions or generate the collection from a configuration array.
36. Generic placeholders remain the catalog, Grid, direct-preview, and site default. Successfully loaded Figma data remains local to the variant configuration page under the existing variant-data behavior; it is not persisted with a Grid brick.

## Testing Decisions

1. Use the existing scraper Durable Object integration suite as the primary server seam with mocked Figma HTTP responses.
2. At the scraper seam, prove:
   1. Each named method accepts its own URL family and rejects all three other families with `file-type-mismatch`.
   2. Host, path, query, and fragment normalization produce one file-level canonical URL and cache key.
   3. The request authenticates server-side and does not expose the token in results or errors.
   4. Valid oEmbed metadata is decoded, optional thumbnail fields become null, and additional JSON fields are preserved.
   5. Missing, inaccessible, rate-limited, malformed, and transient upstream responses map to the settled error codes.
   6. Concurrent first requests coalesce, fresh results use the cache, one-hour expiry serves stale data while one refresh runs, successful refresh replaces data, and failed refresh retains stale data.
   7. All four capabilities work through a real `ScraperApi` RPC session and the `FIGMA_REPO` binding.
3. Extend the catalog invariant seam to prove the Figma collection contains exactly `design`, `board`, `slides`, and `prototype`, each with one `4x4` data-backed brick and the matching named RPC callback.
4. Use the existing Bricks Playwright workbench as the primary user-visible seam and prove:
   1. The Figma collection exposes all four variant tabs/routes and unique default cards.
   2. Each default card is non-interactive and displays its branded fallback.
   3. A successful request replaces the fallback with the returned title and thumbnail and makes the card link to the canonical URL in a new tab.
   4. A null or failed thumbnail retains the loaded title and uses the variant's branded fallback.
   5. A later request failure displays the existing workbench error while retaining the last successful card and Data-pane result.
   6. The four loaded cards preserve their distinct canvas, sticky-note, presentation-stage, and device-preview compositions.
5. Keep live Figma verification optional and environment-gated with `FIGMA_TOKEN` plus explicit live URLs. It should cover at least one accessible resource for each file family when those fixtures are available, but deterministic test completion must not depend on external files or Figma availability.
6. Run the affected Nx lint, typecheck, unit, workerd integration, and Playwright targets for `scraper`, `bricks`, and affected web consumers, followed by formatting checks and `git diff --check`.

## Out of Scope

1. Per-user Figma OAuth or user-managed credentials.
2. Figma Make, published `figma.site` resources, team projects, and library components.
3. Full file documents, node trees, node-specific thumbnails, or component extraction.
4. Interactive Figma embeds, iframe rendering, panning, zooming, or Embed API events.
5. Preserving node, starting-point, dev-mode, or other query state in the card target.
6. Additional brick sizes or responsive layouts beyond the four 4x4 cards.
7. Persisting loaded Figma metadata on Grid bricks.
8. Sharing UI presentation code among the four deliberately distinct cards.

## Further Notes

1. The server credential must have `file_metadata:read` and should be stored only as the `FIGMA_TOKEN` Worker secret or in ignored local development variables.
2. The implementation plan must reuse prefix and topic `013-figma-file-variants`.
