# Shared Worker DevTools Status design

**Date:** 2026-07-12
**Status:** Approved for planning

## Problem Statement

The browser session already supports an optional SharedWorker connection, but React consumers cannot enable it through `ZerospinConfig`, and Zerospin DevTools does not expose whether the user-scoped SharedWorker RPC connection completed. The shopping example therefore cannot demonstrate the existing SharedWorker path or confirm its live status in DevTools.

## Solution

Add an optional SharedWorker flag to the React `ZerospinConfig`, carry that mount-time value through the existing browser user controller into each React-created session, and opt the shopping example into the feature. Register a built-in `Shared Worker` DevTools tab that reads the existing user-scoped RPC handle and reports whether that connection is live.

## User Stories

1. As a React application author, I want to opt into SharedWorker mode beside the configured browser user id, so that browser sessions initialize the existing SharedWorker path.
2. As a developer inspecting Zerospin, I want a built-in Shared Worker tab, so that I can see whether the user-scoped SharedWorker RPC connection completed.
3. As a shopping example developer, I want SharedWorker mode enabled in the example, so that the DevTools status can be exercised through the real browser bootstrap path.

## Implementation Decisions

1. React `ZerospinConfig` accepts `isSharedWorkerEnabled?: boolean` and defaults it to `false`.
2. The existing browser user controller carries the configured flag into `makeSession`; no new configuration service or store is added.
3. The flag is mount-time configuration. Changing it after active Providers have bootstrapped does not trigger live teardown or re-bootstrap behavior.
4. The built-in plugin order is Sessions, Profiler, Shared Worker, followed by caller-provided plugins.
5. One Shared Worker plugin module exports `sharedWorkerPlugin` and keeps `SharedWorkerPluginPanel` file-local.
6. The panel reads the existing `zerospinPluginsStore.sharedWorkerUserApi` value.
7. A `null` handle renders `Shared Worker is disabled`; a non-null handle renders `Shared Worker is enabled`.
8. Only the shopping example opts into SharedWorker mode.
9. The deployment `ZerospinConfigSchema` is unchanged; this design affects only the React component named `ZerospinConfig`.

## Testing Decisions

1. A focused React plugin test starts with the existing handle set to `null`, asserts the disabled message, installs a non-null user API handle, and asserts the enabled message.
2. The focused test resets the global plugin store during cleanup.
3. Shopping's signed-in Playwright home test confirms the Shared Worker tab follows Profiler, opens it, and observes the enabled message through the real browser path.
4. Existing SharedWorker session tests remain the coverage seam for browser support checks, RPC construction, URL identity, and cleanup.
5. Affected React tests, typecheck, lint, and shopping Playwright coverage run through Nx targets.

## Out of Scope

1. A literal greeting RPC.
2. Connecting, unsupported-browser, or connection-error UI states.
3. SharedWorker replica or database inspection.
4. Enabling parking or other consumers.
5. Runtime prop toggling or active-session re-bootstrap.
6. Multi-provider SharedWorker connection reference counting.

## Further Notes

1. The enabled message proves that bootstrap received the existing user-scoped RPC handle; it is not merely an echo of configured intent.
