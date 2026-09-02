# Variant data rendering

**Date:** 2026-07-18
**Status:** Approved for planning

## Problem Statement

The variant data pane can load validated scraper data, but that data stops at the JSON display. Brick components still fetch independently or render static content, creating two data paths and preventing previews from reflecting configured data.

## Solution

Data-backed variants declare request and response contracts through `payloadShape` and `dataShape`, provide `defaultData`, and require every size component to accept the decoded data through a `data` prop.

The variant configuration page renders `loadedData ?? defaultData`. Other catalog renderers use `defaultData`.

## User Stories

1. As a brick author, I want request and response shapes declared on the variant so that factories enforce the complete data contract.
2. As a workbench user, I want a successful `Get data` request to update the brick preview immediately.
3. As a catalog user, I want data-backed bricks to render meaningful default content before configuration.
4. As a developer, I want one GitHub data path rather than an independent client-side fetch inside the card.

## Implementation Decisions

1. Rename the existing data-backed variant property `payload` to `payloadShape` without a compatibility alias.
2. Data-backed variants require all four properties:
   1. `payloadShape`.
   2. `dataShape`.
   3. `defaultData`.
   4. `getData`.
3. Static variants omit all four properties.
4. `makeVariant` behavior:
   1. Decode submitted request values through `payloadShape` with excess properties rejected.
   2. Decode `defaultData` during catalog construction; invalid defaults throw immediately.
   3. Pass scraper `Left` results through unchanged.
   4. Decode successful `Right` values through `dataShape`.
   5. Reject the wrapped request if successful data fails `dataShape`.
   6. Preserve undeclared data properties so the Data pane retains the complete provider response.
5. The factory generics tie `dataShape` to:
   1. The decoded `defaultData`.
   2. The wrapped `getData` success value.
   3. A required `data` prop on every size component in that data-backed variant.
6. Do not introduce compatibility aliases, new named data types, render helpers, wrappers, barrels, or re-exports. Extend the existing factory and catalog types directly and keep render-boundary branching explicit.
7. The GitHub profile `dataShape` declares only fields consumed by the 4x4 card:
   1. `login`.
   2. `avatar_url`.
   3. Nullable `name`.
   4. Nullable `bio`.
   5. Nullable `location`.
   6. `blog`.
   7. `public_repos`.
   8. `followers`.
   9. `following`.
8. The complete public `morgs32` response supplied during the design discussion becomes `defaultData`; fields outside `dataShape` remain preserved but are not available as typed component fields.
9. Every catalog renderer passes a data-backed variant's `defaultData`, including the Bricks catalog, collection page, direct preview, Grid, brick detail, and the corresponding `apps/web` renderers.
10. The variant configuration page uses `loadedData ?? defaultData` for every size preview and displays that same effective data as formatted JSON.
11. Submission behavior:
    1. A successful request replaces `loadedData`.
    2. Loading does not clear the existing successful data.
    3. A failed request displays its error while retaining the last successful data.
    4. Before any successful request, the preview and Data pane use `defaultData`.
12. The GitHub 4x4 card removes SWR, its hard-coded API URL, and its independent loading or retry states. It renders avatar, identity, biography, location, website, and counts exclusively from its required `data` prop.
13. The activity calendar remains static inside the 4x4 card.
14. The GitHub 4x2 size remains activity-only. It participates in the required data-component contract but does not render the supplied data.
15. Loaded data remains local to the variant configuration page. Dragging or persisting a Grid brick does not store that loaded data.
16. This specification supersedes specification 011 where it:
    1. Renames `payload` to `payloadShape`.
    2. Adds `dataShape` and `defaultData`.
    3. Passes loaded data into brick components.
    4. Removes the GitHub profile card's independent SWR path.

## Testing Decisions

1. Extend the existing `makeVariant` unit and type seam to prove:
   1. Static variants omit all data-contract fields.
   2. Data-backed variants require the complete four-property contract.
   3. Invalid `defaultData` throws during construction.
   4. Request payloads reject missing, invalid, and excess fields.
   5. Valid successful data is decoded and preserves undeclared properties.
   6. Invalid successful data rejects.
   7. Scraper `Left` results pass through unchanged.
   8. Size components must accept the inferred required `data` prop.
2. Extend the existing Bricks Playwright seam to prove:
   1. The GitHub 4x4 initially renders the `morgs32` default.
   2. The Data pane initially displays the same complete default data.
   3. Loading a stable alternate profile such as `octocat` updates both the JSON and 4x4 card.
   4. The 4x2 activity preview remains present.
   5. A later invalid request displays its error while retaining the last successful profile.
   6. Default data renders through catalog and direct-preview boundaries.
3. Run Nx lint, typecheck, unit, and relevant browser targets for Bricks and affected `apps/web` projects, followed by formatting checks and `git diff --check`.

## Out of Scope

1. Scraping or loading real GitHub contribution activity.
2. Persisting loaded data with Grid bricks.
3. Passing profile data into the activity-only 4x2 presentation.
4. Changing the GitHub repository variant.
5. Production credential management.
6. Compatibility support for the old `payload` property.

## Further Notes

1. The PAT pasted into chat must be revoked and must never be written into source or this specification.
2. Live verification requires a new replacement token stored only as `GITHUB_TOKEN` in the ignored `packages/scraper/.dev.vars`.
3. The allocated filename is `012-spec-variant-data-rendering.md`.
