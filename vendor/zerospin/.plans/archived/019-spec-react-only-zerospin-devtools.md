# React-only Zerospin DevTools design

**Date:** 2026-07-12
**Status:** Approved for planning

## Problem Statement

Zerospin DevTools is split between a framework-agnostic Solid shell and React-specific panels connected through a plugin adapter. Sessions, Profiler, and Shared Worker are modeled as separate plugins even though they are fixed Zerospin tools, and inherited generic features occupy a second native tab system. The split creates unnecessary framework and package boundaries, duplicated router ownership, and a potential package cycle when the React panels move into DevTools.

## Solution

Make `@zerospin/devtools` one React-only Zerospin application with a single memory router. Extract the reusable SQLite live-query engine into a React-independent `@zerospin/live-query` package so React and DevTools can own small local hooks without importing each other. Replace plugin selection with explicit Sessions, Profiler, Shared Worker, and Settings routes, and place the retained native controls in the top-right toolbar.

## User Stories

1. As a developer inspecting a Zerospin application, I want Sessions, Profiler, and Shared Worker in one predictable navigation bar, so that I can move between Zerospin tools without understanding a plugin system.
2. As a React application author, I want to mount one `ZerospinDevtools` component from `@zerospin/devtools`, so that there is no framework adapter package surface.
3. As a developer using live queries, I want React and DevTools to share the same invalidation engine without a package cycle, so that query behavior stays consistent.
4. As a developer using the panel, I want Settings, PiP, and Close in the top-right toolbar with smaller controls, so that the primary tool navigation and shell actions share one top bar.

## Implementation Decisions

1. `@zerospin/live-query/makeLiveQuery` is the only new shared abstraction. It accepts a SQLite client, built synchronous Drizzle query, and explicit fallback table names; it returns a vanilla Zustand result store and a subscription function whose return value cleans up the database listener.
2. The live-query store exposes `data`, `error`, and `updatedAt`. Initial synchronous execution seeds `data`; table-inference and subsequent execution failures are recorded as `error`; successful reruns clear the error and update `updatedAt`.
3. `@zerospin/react` and `@zerospin/devtools` each retain a local `useLiveQueryOnDb` React hook around the vanilla factory. Neither package imports the other for live-query behavior.
4. `@zerospin/devtools` remains the owning package. It exports `ZerospinDevtools` and `zerospinDevtoolsStore`; `@zerospin/react` writes initialized sessions and SharedWorker API state into that store.
5. The plugin API, React plugin adapter, imperative DevTools class, and `ReactZerospinDevtools` surface are removed without compatibility aliases.
6. One memory router owns explicit `/sessions`, `/profiler`, `/shared-worker`, and `/settings` routes. Existing nested session and profile routes remain below their new top-level prefixes; unknown routes redirect to Sessions.
7. Every component mount starts at Sessions. Closing and reopening the same mounted panel retains its in-memory route; remounting or reloading starts at Sessions.
8. Sessions, Profiler, and Shared Worker render as text navigation on the top-left. Settings, PiP, and Close render on the top-right as 32 by 32 pixel controls with 18 pixel icons.
9. Plugins, SEO, Source Inspector, `inspectHotkey`, and `customTrigger` are removed. Default-open, trigger visibility, theme, URL flag, open/close hotkey, trigger position, panel position, resizing, and PiP behavior remain.
10. No local-storage migration or cleanup path is added. Obsolete persisted fields may remain ignored.
11. Delivery has two mergeable phases: live-query extraction first, then one atomic DevTools consolidation including consumers, cleanup, tests, and documentation.
12. The generated live-query barrel is removed immediately. Public imports use direct defining modules; no new named type assignments are introduced.

## Testing Decisions

1. A vanilla live-query suite covers initial data, relevant-table invalidation, unrelated-table suppression, table inference and explicit-table errors, query failures, and unsubscribe cleanup.
2. The existing React `useLiveQuery` suite remains the consumer contract for callback identity, dependency changes, relation inference, and explicit table names.
3. Existing focused Sessions and Profiler tests move with their components.
4. Shopping Playwright is the highest DevTools seam. It verifies the initial Sessions route, navigation order, Shared Worker status, Settings navigation, top-right placement and control sizing, and close/reopen behavior.
5. Library, typecheck, lint, and test targets run through Nx for live-query, DevTools, and React; Shopping typecheck, lint, build, and Playwright targets also run through Nx.
6. The final Nx project graph must contain no package cycle.

## Out of Scope

1. A replacement extension or plugin API.
2. Browser-URL routing for DevTools.
3. New Profiler data collection or SharedWorker inspection features.
4. SEO tooling, Source Inspector, custom trigger rendering, or compatibility aliases.
5. Persisting or migrating the active DevTools route.

## Further Notes

1. Existing panel styling and behavior should be ported directly to React. This migration does not authorize a visual redesign beyond the approved unified top bar and smaller native controls.
2. Existing unrelated workspace changes remain untouched.
3. Remaining post-implementation verification covers PiP window behavior, resizing, theme application, top-panel positioning, unknown-route redirection, and remount initialization at Sessions. These are verification of this approved design, not new product scope.
4. The moved command column picker retains one accessibility warning for a `listbox` role on a non-native element. Resolve it with native semantics when that preserves the existing multi-select interaction; otherwise specify and test the approved accessible composite-widget behavior before changing the control.
5. After the separate LogRepo binding-type and Shopping seed-check blockers are resolved, rerun the full Shopping build and Playwright suite as the final consumer seam for this design.
