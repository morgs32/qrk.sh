# Map collection and custom payload controls design

**Date:** 2026-07-18
**Status:** Approved for planning

## Problem Statement

The Bricks catalog can declare validated payload and data shapes, but its workbench can render only non-null text payloads through a standard input. A place-backed Map brick needs Google Places autocomplete to produce a validated place ID before loading coordinates, and it needs one map implementation that renders consistently in the public Bricks package, its Vite workbench, and the Next application.

## Solution

Allow data-backed variants to provide a typed React control for selected payload fields while the workbench continues to own labels, decoded payload state, submission, and errors. Add an explicit Google Places scraper repository for autocomplete and cached place details. Register a Map collection whose place variant uses the custom lookup control and renders one interactive Mapbox marker.

## User Stories

1. As a brick author, I want a payload field to provide a custom React control, so that provider-specific identifiers can be selected without exposing raw IDs as the primary input experience.
2. As a brick author, I want custom control values inferred from the payload shape, so that the renderer and submitted payload cannot drift.
3. As a workbench user, I want to search all Google place categories with keyboard or pointer interaction, so that I can select an address, landmark, business, or city.
4. As a workbench user, I want the selected place to update a map preview after I request its data, so that I can verify the configured brick before placing it.
5. As a catalog user, I want the Map brick to render a useful Chicago default before configuration, so that every catalog boundary has deterministic content.
6. As an operator, I want provider credentials loaded only from package-local `.env.local` files, so that secrets do not enter source or browser bundles.

## Implementation Decisions

1. `makeVariant` accepts optional `payloadForm` only on data-backed variants.
2. `payloadForm` is keyed by fields declared in the same `payloadShape`; unknown keys are compile-time errors.
3. Each payload form entry is a React component receiving `value` and `onChange`. The value and callback argument use that field's decoded primitive type.
4. A field with a custom renderer must declare `defaultValue` in its primitive descriptor. Undefined is not added to the renderer contract.
5. Custom components replace only the control. The workbench retains the standard field label, layout, loading state, submission button, and request/data error presentation.
6. The workbench initializes one controlled payload object from descriptor defaults using one explicit iteration. It submits that object directly instead of reconstructing values from `FormData`.
7. A non-null text field without a custom renderer continues to use the package-owned shadcn `Input`. Other fields without custom renderers retain the explicit unsupported-field state and disable submission.
8. `makeCollection` preserves `payloadForm` alongside the payload shape, data shape, default data, callback, and sizes.
9. Add exactly two named Google Places result types:
   1. `IGooglePlaceSuggestion` contains `placeId`, `description`, `mainText`, and `secondaryText`.
   2. `IGooglePlaceDetails` contains `googlePlaceId`, `name`, `address`, `latitude`, and `longitude`.
10. `ScraperApi.googlePlacesRepo()` exposes one explicit `GooglePlacesRepo` Durable Object named `global`.
11. `GooglePlacesRepo.autocomplete(query)`:
12. Returns an empty successful list for trimmed queries shorter than two characters.
13. Requests Google Places autocomplete without a category restriction.
14. Maps only provider place predictions into the public suggestion shape.
15. Does not persist autocomplete results.
16. `GooglePlacesRepo.getPlace(googlePlaceId)` requests only the fields used by the brick and returns the flat details shape.
17. Successful place details are cached by Google place ID for 24 hours. Fresh values return immediately; expired values are served while one background refresh runs; a failed refresh retains the last success; a failed first request is not cached.
18. Google Places calls use only the server-side `GOOGLE_PLACES_API_KEY`. Missing configuration, invalid inputs, malformed provider responses, and transient upstream failures return explicit `IRpcEither` errors.
19. The ported place lookup retains the Red Rope input/dropdown behavior: 300 millisecond debounce, two-character threshold, keyboard navigation, pointer selection, clear action, loading and error states, empty results, outside-click dismissal, and Google attribution.
20. The lookup accepts all Google place categories and omits business-status filtering, ratings, hours, phone, website, photos, and the selected-place details card.
21. The lookup owns its autocomplete RPC calls. Selecting a suggestion calls the payload renderer's `onChange` with its place ID. The variant's existing `Get data` flow calls `getPlace` and updates loaded data.
22. Register collection `map`, variant `place`, and size `4x4`.
23. The place payload contains one defaulted `googlePlaceId`. Its data shape contains `googlePlaceId`, `name`, `address`, `latitude`, and `longitude`.
24. Committed default data represents Downtown Chicago and agrees with the committed default place ID.
25. The Map brick uses Mapbox GL, centers on the supplied coordinates, renders one standard marker, permits pan and zoom, and shows compact navigation and attribution controls. It has no popup or place card.
26. Mapbox GL is a Bricks runtime dependency and its stylesheet is included through the package stylesheet.
27. `PUBLIC_MAPBOX_TOKEN` is required in both `packages/bricks/.env.local` and `apps/web/.env.local`. The Bricks build, workbench startup, and Next configuration fail at configuration load when it is absent.
28. `GOOGLE_PLACES_API_KEY` is required in `packages/scraper/.env.local`. Wrangler development receives it with `--env-file .env.local`.
29. Credentialed Playwright and live-test configuration load the relevant package-local `.env.local` files and fail at configuration load when required values are absent.
30. No `.dev.vars` path, package configuration API, compatibility alias, barrel, or re-export is added.

## Testing Decisions

1. Extend the existing `makeVariant` unit and compile-time seam to prove key validity, decoded value inference, required defaults, collection preservation, controlled defaults, and unchanged static/text fallback behavior.
2. Extend the existing workerd repository seam with mocked Google responses to prove autocomplete mapping, no suggestion caching, details mapping, fresh and stale cache behavior, failed refresh retention, uncached first failures, missing configuration, invalid input, malformed data, provider errors, bindings, and public RPC declarations.
3. Extend the existing credentialed Bricks Playwright seam to prove the Chicago default, live autocomplete keyboard selection, controlled place ID, successful `Get data`, updated JSON, updated map marker, clear/no-results/error states, and rendering through catalog, preview, Grid, and detail boundaries.
4. Run the affected scraper, Bricks, and Next targets through Nx, then run formatting checks and `git diff --check`.

## Out of Scope

1. Persisting configured payload or loaded place data with a placed Grid brick.
2. Multiple markers, marker popups, place cards, photos, ratings, business status, opening hours, phone numbers, or websites.
3. Category-specific or proximity-biased autocomplete.
4. Autocomplete persistence.
5. A general Bricks runtime configuration API.
6. Google Maps rendering or MapLibre rendering.
7. An implementation plan or issue-tracker publication.

## Further Notes

1. This design uses prefix `014` because an existing user-authored Figma design already owns prefix `013`.
2. Secret values in `.env.local` files must never be copied into source, fixtures, logs, generated types, or this specification.
