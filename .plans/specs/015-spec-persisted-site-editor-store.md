# Persisted site editor store design

**Date:** 2026-07-20
**Status:** Approved for planning

## Problem Statement

The site editor currently splits authored data across four Zustand stores and component-local state. Settings disappear when drawers remount, stores leak state between routes, and reloads lose the draft.

## Solution

Create one persisted authored-data store named `useSiteStore`, organized as `userId → siteId → pageId`. Persist changes immediately to localStorage while keeping navigation and transient interaction state outside this store.

## User Stories

1. As an owner, I want site and page edits to survive drawer navigation and reloads.
2. As an owner, I want site settings shared by pages belonging to that site.
3. As an owner, I want page settings, layout, content, and breakpoints isolated by page.
4. As an owner, I want drafts isolated between Clerk accounts using the same browser.
5. As an owner, I want each breakpoint to retain its own column-count setting.
6. As an owner, I want invalid persisted data reset safely to the current mock defaults.

## Implementation Decisions

1. Add route-local `siteStore.ts`, exporting only `useSiteStore`; add no barrel, generic setter, helper layer, or new cast marker.
2. Add the approved module-local interfaces:
   1. `IComposeBlock`: `id` and HTML `content`.
   2. `IPageDraft`: title, description, page type, `ILayout`, compose blocks, and explicit `sm`, `md`, `lg`, `xl`, and `2xl` column counts.
   3. `ISiteDraft`: name, description, and pages keyed by `pageId`.
   4. `IOwnerDraft`: sites keyed by `siteId`.
   5. `ISiteStoreState`: owners keyed by Clerk `userId` plus the approved actions.
3. Provide only these explicit actions: `initializePageDraft`, `setSiteDescription`, `setPageTitle`, `setPageDescription`, `setGridLayout`, `addComposeBlock`, `updateComposeBlock`, `removeComposeBlock`, and `setBreakpointGridColumnCount`.
4. Keep the approved direct `map` and `filter` passes inside compose update/removal actions; extract no loop helper.
5. Persist only `owners` under localStorage key `qrk-site-editor-drafts`, version `1`, using Zustand `persist` with `skipHydration`.
6. Validate the persisted payload with one module-local Effect schema. Invalid JSON, invalid structure, or incompatible versions clear the entire key and restore current defaults.
7. Initialize unseen routes with the current Make it Rainey text, split-scroll page type, seeded grid, one empty UUID compose block, and one-column values for every breakpoint.
8. Gate the existing site layout until hydration and route initialization finish. Keep readiness in layout-local React state and hide stale drafts immediately during account or route changes.
9. Rewire page settings, site settings, MainColumns, Grid, Compose, and Breakpoints directly to `useSiteStore`. Save buttons become Done controls because changes persist immediately.
10. Keep selected breakpoint, editor controls, carousel/copy feedback, URL drawer state, and `useBrickDrawerStore` transient.
11. Remove the obsolete page, grid-layout, compose, and breakpoint authored stores. Remove the dead zoom state and nonfunctional Zoom out control.
12. Update the component/file naming guide where it currently points to the removed grid store.

## Testing Decisions

1. Add no test dependency or authentication seam.
2. Run the existing Nx app typecheck, lint, format check, and production build.
3. Manually verify settings, compose content, grid movement, and independent breakpoint values survive drawer closure and full reload.
4. Manually verify page, site, and Clerk-account isolation.
5. Manually corrupt the localStorage payload and verify the editor restores defaults without crashing.
6. Confirm the persisted JSON excludes actions and transient UI state.

## Out of Scope

1. Zerospin or server persistence, cross-device synchronization, and cross-tab synchronization.
2. Activating Upload, Unpublish, Undo, or the currently empty catalog wiring.
3. Making breakpoint column counts affect rendered layout.
4. Persisting files, image data, derived URLs, QR codes, carousel position, copy feedback, drawer routes, or drag state.
5. Migrating older payload versions; incompatible data resets wholesale.
6. Changing unrelated WIP or the separate bricks-package sandbox store.

## Further Notes

1. `useBrickDrawerStore` remains a separate transient bridge for native drag events because it is not authored or persisted state.
2. The localStorage payload is intentionally browser-local and scoped by Clerk user, site route, and page route.
