# Handoff: Offline loading and update prompts

**Date:** 2026-10-19  
**Focus:** Continue QRK's offline app loading and user-controlled update prompt work.  
**Status:** Complete — implementation and local verification are recorded in [Plan 053](../plans/053-plan-offline-loading-and-update-prompts.md). The baseline below is historical.

## Goal

Make the existing QRK app load or reload offline after a successful online visit has populated its cache. Prompt the user when a downloaded update is ready, allowing them to reload or continue using the current page.

The user explicitly clarified that installability is unnecessary. Do not resume the earlier installation-first recommendation or add web app manifests, home-screen setup, push notifications, or a new offline data system as part of this scope.

## Done

1. Used `$research` with a background agent to investigate TanStack Start and Vite PWA against primary sources and QRK's current frontend.
2. Saved and revised [the research note](../../research/tanstack-pwa.md) around the user's clarified scope. It contains the proposed plugin settings, update lifecycle, source citations, QRK integration constraints, and unverified behavior; use that document instead of repeating the investigation.
3. Confirmed the distinction between cached application loading and offline authentication/data/session readiness. Full offline startup remains unverified; the bounded baseline observations below do not establish it.
4. The original research changed documentation only. Later local verification and its explicitly authorized storage reset are recorded below; no caching implementation or deployment occurred during that baseline stage. The completed implementation is recorded below.

## Baseline verification — 2026-11-03

1. Load the requested URL; no bookmark or automatic last-page selection is
   required. Preserve existing routing ownership while implementing caching.
2. The user explicitly authorized resetting only the local QRK Zerospin store.
   Read-only inspection found one pre-registry SystemSpec and zero aggregates or
   registered Repos. The existing CLI's `--clean` rebuilt that store; the backend
   accepted the current SystemSpec. Other stores, Clerk accounts and keys were
   preserved. Subsequent restarts omitted `--clean`.
3. Existing `__dev` sign-in reached a working dashboard. Blocking Clerk's `/v1/`
   API requests while application assets and the backend remained reachable still
   allowed that remembered dashboard session to reopen. This is short-term
   cached-sign-in evidence, not indefinite offline authentication or cold reload.
4. Created the local `Offline verification` Site and its Page through App. Saved
   the title `Offline verification page` and verified it after an online reload.
   With browser offline emulation enabled and the QRK backend stopped, normal
   Page Settings Save staged the description `Saved while offline during local
   verification.` The session later failed with `node-credentials-timeout`
   (five-second credential acquisition deadline). After restoring networking and
   restarting the same backend without another reset, Retry and reload retained
   the edit. A read-only `AggregateVersionRepo.page` query confirmed that exact
   description on `pag_3ItCZZWBSq2ZHUHSkElQH`.
5. Full offline document reload currently fails with
   `ERR_INTERNET_DISCONNECTED`. Retrying session initialization while the App is
   loaded but offline also failed fetching SQLite WASM in `openAggregateReplica`.
   Cache the worker/WASM dependencies as well as App resources; separately
   investigate why offline credential acquisition can terminate a remembered
   session. These observations do not establish a new authentication design.
6. Restored normal browser networking and the backend, then verified the saved
   page again. No automated test files, application code or provider integrations
   changed. Editor-content verification is no longer blocked on fixture approval:
   the user's local-development authorization is recorded in root `AGENTS.md`.
   The initial baseline used SDK 41.0.0. A concurrent 42.0.0 upgrade began
   during follow-up; the final browser bundle revision was not captured. Recheck
   these observations on the finalized upgrade rather than claiming SDK 42 proof.

## Completed implementation

[Plan 053](../plans/053-plan-offline-loading-and-update-prompts.md) records the final
42.0.3 framework/API adoption, requested-URL offline loading, offline editing and
reopening, real backend authentication refusal without queued-command delivery,
recovery, local sign-out invalidation, and deliberate two-tab Reload/Later flow.
App's README owns the implemented resource-cache and sign-out behavior.

## Remaining

None.

## Suggested skills

1. `$use-morgs32-wiki-patterns` - apply the repository's runtime, React, ownership, and code-shape conventions.
2. `$nx-workspace` - inspect App's resolved configuration before workspace task discovery.
3. `$implement` - use when proceeding with implementation and its unfinished verification.
4. `$nx-run-tasks` - run applicable existing targets through `pnpm nx`; preserve the repository's restriction on introducing tests/check gates.
5. `$research` - refresh a specific unresolved upstream fact only if the existing note is insufficient or stale.

Before substantial edits, rerun `pnpm exec intent list` and load a matching installed package skill if applicable. The latest check listed only Zerospin skills, with none matching this documentation task. Load session skills if the actual work reaches that boundary.

## Pointers

1. [Research and primary-source citations](../../research/tanstack-pwa.md)
2. [Root instructions](../../../AGENTS.md)
3. [App instructions](../../../apps/app/AGENTS.md)
4. [App README](../../../apps/app/README.md)
5. [Vite configuration](../../../apps/app/vite.config.ts)
6. [App dependencies](../../../apps/app/package.json)
7. [Root redirect](../../../apps/app/routes/index.tsx)
8. [Root route](../../../apps/app/routes/__root.tsx)
9. [Authentication provider](../../../apps/app/app/App.tsx)
10. [Session ownership and worker import](../../../apps/app/app/[username]/layout.tsx)
11. [Worker entry](../../../apps/app/zerospin/node.worker.ts)

At handoff creation, unrelated local modifications existed in `apps/app/README.md`, `apps/app/app/[username]/site/[siteId]/page/[pageId]/MainColumns.tsx`, `apps/library/README.md`, and `apps/library/bricks.css`. Preserve them and recheck `git status` before editing. The one local Zerospin reset above was expressly authorized. Follow the current local-development authorization in root `AGENTS.md`; preserve other stores and projects.
