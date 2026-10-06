# Studio homepage with the shared Fragment outline

Status: Complete. Approved, implemented, and verified in chat on 2026-10-03.

## Agreed behavior

1. Style only the Studio homepage with Fragment's typography, monochrome palette, and documentation-sidebar outline. Keep the Admin/Repos hierarchy, authored metadata, routes, and aggregate-ID searches.
2. Use one shared appearance and outline module under `fragment/ui`, consumed by the Fragment documentation sidebar and Studio homepage. Callers retain numbering, links, expansion, routing, and fetching.
3. Add Fragment's Light/Dark/System selector below the homepage outline. Default to System, follow device changes, and remember a separate Studio preference. Search popups use the same appearance. Other Studio screens keep their current appearance.
4. Retain Studio's centered 768px homepage column and 24px horizontal/64px vertical padding; replace list indentation and rhythm with Fragment's 2ch tiers, 24px topic gaps, and muted leaf styling.

## Implementation

1. Add publishable `@zerospin/fragment-ui` with package exports for `FragmentAppearance`, `Outline`, and its stylesheet/font assets. Use compositional `Outline`/`OutlineItem` elements with caller-supplied React labels and children; share palette and font declarations without importing application routing.
2. Wire both consumers through pnpm workspace dependencies and include the library in the root TypeScript reference list, removing the obsolete missing fixtures reference. Keep the shared package's React peer and compiled declarations/JavaScript separate from the private Fragment application.
3. Adopt the shared outline in `DocumentationPage`, retaining its active-topic and navigation behavior. Move Fragment font assets and palette definitions into the shared package and remove superseded sidebar styling. Keep sticky positioning and page layout in the documentation caller.
4. Extract Studio homepage rendering into `StudioHome`. Scope shared appearance, Tailwind token mappings, and control styling to its wrapper. Resolve preference synchronously at mount, tolerate unavailable storage, and subscribe to device appearance changes. Keep selector state separate from resolved light/dark appearance.
5. Render homepage combobox portals inside the appearance wrapper through Base UI's native portal-container option. Preserve existing picker request sharing, filtering, retry, encoded navigation, and keyboard behavior.
6. Extend the independent Studio fixture to exercise the actual homepage with mock metadata and requests, and update module/Studio documentation. No new domain terms or qualifying ADR are expected; reconcile that conclusion with the implemented result.

## Verification

1. Run the shared package, Fragment, and Studio's relevant Nx type, lint, build, and formatting checks in one scoped task graph. Diagnose unrelated worktree blockers without expanding scope.
2. Verify the Fragment sidebar preserves current labels, active-topic expansion, anchor navigation, desktop sticky positioning, and mobile flow.
3. Use the independent Studio fixture to check both palettes, System changes, explicit preference and reload persistence, unavailable storage, keyboard focus, and themed popups. Theme changes must preserve search state and avoid extra ID requests.
4. Check homepage outline/search loading, empty, error/retry, long/encoded IDs, 390px and desktop widths, and reduced motion. Verify non-homepage Studio styling stays unchanged. Do not drive Shopping in the browser.
5. Inspect package contents to confirm component exports, styles, and relative font assets are included; archive this plan after implementation and verification are complete.

## Outcome

1. Added publishable `@zerospin/fragment-ui` with compiled appearance/outline exports and shared stylesheet/font assets. Fragment's documentation sidebar and Studio's homepage consume it through workspace dependencies.
2. Studio retains its centered column and metadata/search behavior, with the shared outline and remembered Light/Dark/System preference. Its search popups inherit the homepage appearance; other Studio screens retain their existing styles.
3. Removed duplicate Fragment foundations and the obsolete root TypeScript reference to the missing fixtures configuration. No new domain terms or qualifying architectural decisions were introduced.

## Verification results

- Passed `CI=true pnpm nx run-many -t ts lint format:check build preview:build -p @zerospin/fragment-ui fragment @zerospin/studio`, including the available consumer checks and 14 dependency tasks. Rechecked Studio's type/lint/format/preview build after fixture changes, and format/preview build after the final stylesheet change.
- Verified package contents with `pnpm pack --dry-run --json`: component JavaScript/declarations, stylesheet, and both relative font assets are included.
- Verified Fragment's active branches, labels, links, anchor navigation, loaded fonts, exact outline indentation/rhythm, desktop sticky positioning, and mobile flow.
- Verified the independent Studio homepage fixture at desktop, 390px, and 280px widths: both palettes, device appearance changes, explicit preference and reload persistence, blocked storage, keyboard selection/focus, themed popup containment, independent search filters, unchanged request counts when switching themes, loading/empty/error/retry states, unmatched/long/encoded IDs, and reduced motion. Confirmed non-homepage screens do not inherit the homepage wrapper. A fresh final reload produced no browser errors.
- Scoped checks retain three existing Fragment lint warnings, existing bundle-size warnings, and a non-blocking Nx Cloud remote-cache access failure. No repository-wide validation is claimed for concurrent unrelated work.

## Remaining work

None.
