# Handoff: Offline loading and update prompts

**Date:** 2026-10-19  
**Focus:** Continue QRK's offline app loading and user-controlled update prompt work.  
**Status:** Research complete; application implementation and runtime verification have not started. No implementation plan was created.

## Goal

Make the existing QRK app load or reload offline after a successful online visit has populated its cache. Prompt the user when a downloaded update is ready, allowing them to reload or continue using the current page.

The user explicitly clarified that installability is unnecessary. Do not resume the earlier installation-first recommendation or add web app manifests, home-screen setup, push notifications, or a new offline data system as part of this scope.

## Done

1. Used `$research` with a background agent to investigate TanStack Start and Vite PWA against primary sources and QRK's current frontend.
2. Saved and revised [the research note](../research/tanstack-pwa.md) around the user's clarified scope. It contains the proposed plugin settings, update lifecycle, source citations, QRK integration constraints, and unverified behavior; use that document instead of repeating the investigation.
3. Confirmed the distinction between cached application loading and offline authentication/data/session readiness. The latter has not been demonstrated for QRK.
4. Made documentation changes only in this conversation. No application dependency, configuration, backend, storage, or deployment changes were performed.

## Remaining

1. Read the linked research and current App instructions before continuing. Recheck the integration files because other work is active in this checkout.
2. Resolve the material open decisions below without reopening the settled requirement for offline loading and an update prompt.
3. When implementing, keep changes within App's resource caching, browser registration, navigation fallback, and update UI. Preserve the existing Zerospin session/data ownership and Vite+ wiring.
4. Verify the actual outcome manually: successful online precache/control; offline cold reload and agreed deep links; required worker/WASM loading; and an old-version to update-prompt to accepted-reload flow. Verify that deferring an update leaves the current page usable. Report any Clerk/Zerospin startup limitation separately from cache success. Follow the repository's current testing policy; do not scaffold a test suite or backend integration checks.
5. Update affected documentation to describe the implemented behavior and remaining limits. Archive this handoff only after verified completion or reconciliation into successor work, following `$handoff`.

## Suggested skills

1. `$use-morgs32-wiki-patterns` - apply the repository's runtime, React, ownership, and code-shape conventions.
2. `$nx-workspace` - inspect App's resolved configuration before workspace task discovery.
3. `$implement` - use when proceeding with implementation and its unfinished verification.
4. `$nx-run-tasks` - run applicable existing targets through `pnpm nx`; preserve the repository's restriction on introducing tests/check gates.
5. `$research` - refresh a specific unresolved upstream fact only if the existing note is insufficient or stale.

Before substantial edits, rerun `pnpm exec intent list` and load a matching installed package skill if applicable. The latest check listed only Zerospin skills, with none matching this documentation task. Load session skills if the actual work reaches that boundary.

## Pointers

1. [Research and primary-source citations](../research/tanstack-pwa.md)
2. [Root instructions](../../AGENTS.md)
3. [App instructions](../../apps/app/AGENTS.md)
4. [App README](../../apps/app/README.md)
5. [Vite configuration](../../apps/app/vite.config.ts)
6. [App dependencies](../../apps/app/package.json)
7. [Root redirect](../../apps/app/routes/index.tsx)
8. [Root route](../../apps/app/routes/__root.tsx)
9. [Authentication provider](../../apps/app/app/App.tsx)
10. [Browser session and worker import](../../apps/app/zerospin/userSession.ts)
11. [Worker entry](../../apps/app/zerospin/node.worker.ts)

## Open decisions

1. Which offline entry URLs must work, and what should happen at `/`, which currently redirects to Web's account-routing flow? Do not silently change authentication/routing ownership.
2. How soon must a long-open tab discover an update? The user requested a prompt, but no polling interval, focus check, or push mechanism was selected. A new deployment alone does not immediately notify every tab.
3. Where should the prompt appear in the existing UI? Reload/Later is the proposed interaction, not an implemented component or selected placement.
4. What should users see if the cached app loads but existing authentication/session initialization cannot complete offline? Do not claim offline editing or synchronization readiness based on a cached shell.

At handoff creation, unrelated local modifications existed in `apps/app/README.md`, `apps/app/app/[username]/site/[siteId]/page/[pageId]/MainColumns.tsx`, `apps/library/README.md`, and `apps/library/bricks.css`. Preserve them and recheck `git status` before editing. Do not reset browser or backend storage to make verification pass.
