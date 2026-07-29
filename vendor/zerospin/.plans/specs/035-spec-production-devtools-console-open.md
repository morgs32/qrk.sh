# Production DevTools console open design

**Date:** 2026-07-22
**Status:** Approved for planning

## Problem Statement

Production applications must eagerly import and render `ZerospinDevtools` to make the DevTools shell available. That puts the complete DevTools UI in the initial application bundle and makes availability depend on application-specific mounting. Operators need one consistent console command that can open DevTools for an active browser session without eagerly loading the shell.

The existing URL flag is only a discoverability gate. It is not authorization, it duplicates the proposed console entry point, and it can prevent an explicit console open from rendering the shell.

## Solution

Have an active `ZerospinConfig` install a narrow browser console API at `window.zerospin.devtools.open`. The first call dynamically imports and renders `ZerospinDevtools` inside the existing `ZerospinConfig` React tree, while an application that already rendered the shell continues to use that mounted instance. Remove the URL gate completely and retain the existing trigger, hotkey, routing, settings, and session registration behavior after the shell has loaded.

## User Stories

1. As an operator inspecting a production Zerospin application, I want to run `await zerospin.devtools.open()` in the browser console, so that I can inspect the active browser session without an application-specific DevTools mount.
2. As an application author, I want the DevTools shell excluded from the initial application bundle, so that production users do not download the complete DevTools UI unless it is opened.
3. As an application author with an explicit `ZerospinDevtools` mount, I want the console command to open that existing shell, so that the application never renders duplicate DevTools roots.
4. As an operator who has opened DevTools once, I want the ordinary trigger and hotkey to remain available for the active configuration lifetime, so that I can close and reopen the mounted shell without returning to the console.
5. As a DevTools user, I want URL-gate settings removed, so that an explicit console open cannot be blocked by a non-authorizing availability flag.

## Implementation Decisions

1. An active `ZerospinConfig` installs `window.zerospin.devtools.open(): Promise<void>`. The runtime object exposes no session registry, close, toggle, status, configuration, or push methods.
2. The browser API has an ambient `Window` declaration. It does not introduce a separately exported controller type.
3. `ZerospinConfig` statically imports only a lightweight DevTools controller. It dynamically imports the module defining `ZerospinDevtools` after the first `open()` call.
4. A lazily loaded shell renders inside the owning `ZerospinConfig` React tree. The implementation does not create a second React root.
5. `ZerospinDevtools` registers its imperative open capability with the lightweight controller while mounted. The console command uses that registration before requesting a lazy shell, preserving explicit mounts.
6. Concurrent `open()` calls share one in-flight operation. The Promise resolves after the mounted panel is visible.
7. An import or mount failure rejects the in-flight Promise, clears the failed attempt, and allows a later call to retry.
8. Unmounting the owning `ZerospinConfig` removes its DevTools API and lazily rendered shell. Cleanup changes only the exact `devtools` property installed by that configuration and preserves unrelated `window.zerospin` properties.
9. After the first lazy open, closing the panel retains the mounted shell. Its existing trigger and hotkey remain available subject to persisted settings, and reopening retains the current in-memory route.
10. Lazy mounting uses existing DevTools defaults and persisted settings. `ZerospinConfig` gains no DevTools configuration prop.
11. `requireUrlFlag` and `urlFlag` are removed from DevTools configuration, store state, defaults, rendering, and Settings. Stale local-storage properties receive no migration and have no behavior.
12. Shopping no longer eagerly renders `AppDevtools`; its browser tests open DevTools through the production console contract.
13. The console hook adds no application authorization decision. It exposes only client-side data and capabilities already available to the active browser session.
14. No compatibility aliases, barrel exports, or broader global API are added.

## Testing Decisions

1. Shopping Playwright is the consumer acceptance seam. Before the console call it verifies that neither the panel nor trigger is rendered. It then calls `window.zerospin.devtools.open()`, verifies the initialized session shell, closes the panel, reopens it through the trigger, and confirms route memory is preserved.
2. Focused React and controller tests cover global installation and cleanup, one dynamic load for concurrent calls, direct-shell reuse, visible completion, import or mount rejection, retry, and Strict Mode lifecycle behavior.
3. Existing Settings and store tests verify that URL-gate fields and controls are absent.
4. React typechecking verifies the ambient `Window` contract and the `Promise<void>` open result.
5. DevTools, React, and Shopping library, typecheck, lint, unit, and browser targets run through Nx.

## Out of Scope

1. Exposing DevTools sessions or stores on `window`.
2. Console methods for close, toggle, detach, navigation, manual push, or state inspection.
3. A new DevTools configuration prop on `ZerospinConfig`.
4. A URL flag replacement, client-secret gate, or new application authorization policy.
5. A second React root or non-React DevTools mounting API.
6. Supporting more than one account-level `ZerospinConfig` owner in the same browser window.

## Further Notes

1. The bare console command works because browser window properties are global bindings; application TypeScript should use the ambient `window.zerospin` declaration.
2. Before `ZerospinConfig` mounts and after it unmounts, the DevTools console hook is unavailable.
3. Existing unrelated workspace and vendor changes remain untouched.
