# 053 — Offline loading and update prompts

**Status:** Complete — implemented and locally verified on 2026-11-03. Supersedes the research-only pickup in [the offline-loading handoff](../handoffs/2026-10-19-handoff-offline-loading-and-update-prompts.md).

## Agreed behavior

1. After a successful online visit has populated the application cache, open the requested URL offline. Do not require bookmarks or choose a different last-opened Page. Preserve Web's authentication/routing ownership.
2. Previously signed-in users may open and edit Pages already saved on this device while offline. Use only the eligible previously verified identity and existing Zerospin command-derived local models. Local sign-out invalidates that identity. No new credential cache, model writer, outbox or offline data system is included.
3. Recheck sign-in and authoritative admission before syncing pending commands after reconnection. Explicit authentication/identity rejection must not silently use a remembered identity. Remote revocation cannot be discovered while offline.
4. Cache the actual App shell, chunks, fonts, SharedWorker, SQLite WASM and required authentication SDK static resources. Do not cache authentication API responses, credentials or domain RPC responses in the resource cache. No manifest/installability feature is included.
5. When an updated application has downloaded, use the existing notification UI to offer Reload and Later. Reload is deliberate; Later leaves the current page usable. Use normal browser update checks plus a check when the tab regains focus; add no polling or push system.
6. Keep framework fixes in Zerospin source and consume an exact coherent fixed-group local release. Preserve all registered releases/canonical selections and local data. No public publication or deployment is included.

## Implementation

1. Repair Zerospin Aggregate/Service offline identity resolution so a known offline attachment can reopen its eligible exact retained identity without waiting for online credentials. Keep missing/invalidated/ambiguous identities rejected and SQLite opening read-only with respect to partition creation.
2. Keep offline synchronization nonterminal and avoid credential acquisition/pushes while the browser is offline. Reconnection uses the existing authenticated snapshot/ticket path before any pending command is sent. Preserve transport, provider and explicit rejection distinctions.
3. Verify the framework change through scoped existing Browser/Core checks and existing relevant tests; create no test files or runners. Publish the checked revision only to the existing local registry and adopt exact coherent pins in QRK.
4. Add `vite-plugin-pwa` to App's existing Vite+ build. Generate a worker for the actual SPA output; inspect its complete precache and file-size limits. Keep manifest generation disabled and registration browser-only.
5. Add an App-owned registration/update component, using existing toast actions for Reload/Later. Cache authentication SDK static assets without caching its API; verify initial installation/control actually populates everything needed by offline startup.
6. Build through the existing Nx targets. Serve the built App behind the existing `app.qrk.localhost` URL, using Web's documented `__dev` sign-in. Verify an existing saved editor URL with the backend and browser network unavailable, an offline edit, cold reopen, reconnection with successful authentication and rejection without delivery, and the two-build update/Later/Reload flow. Preserve the local verification Site and existing stores.
7. Reconcile the handoff and App documentation with measured behavior. Update the glossary only for implemented domain terminology; create an ADR only if an implemented decision is hard to reverse, surprising and a real trade-off. Archive after all required verification passes.

## Annotated examples

```text
Previously verified device + exact saved identity + offline
  -> reopen the existing local model; stage commands locally
Connectivity returns
  -> authenticate with the backend first
  -> only then admit queued commands for canonical execution
```

```ts
// 1. Offline resource loading preserves the address the user requested.
// 2. Resource caching does not write domain rows or grant backend authority.
// 3. A downloaded update waits for an explicit Reload action.
```

## Planned hierarchy

Legend: `+` create; `~` modify. Framework paths are rooted in the sibling checkout.

```text
qrk.sh/
├── + wiki/plans/053-plan-offline-loading-and-update-prompts.md
├── ~ wiki/handoffs/2026-10-19-handoff-offline-loading-and-update-prompts.md
├── ~ pnpm-lock.yaml
├── ~ README.md
├── ~ apps/{admin,api,scraper,zerospin}/package.json
└── apps/app/
    ├── ~ package.json
    ├── ~ vite.config.ts
    ├── ~ tsconfig.json
    ├── ~ README.md
    ├── + public/offline-cache.js
    └── app/
        ├── ~ App.tsx
        ├── ~ [username]/Header.tsx
        └── + AppUpdatePrompt.tsx
zerospin/
├── packages/react/
│   ├── + src/useClearSessionAuthentication.ts
│   ├── ~ src/index.ts
│   └── ~ skills/zerospin-react/SKILL.md
└── packages/browser/src/
    ├── AggregateNode/
    │   ├── ~ resolveAggregateNode.ts
    │   └── ~ AggregateNodeSynchronization.ts
    └── ServiceNode/
        ├── ~ resolveServiceNode.ts
        └── ~ ServiceNodeSynchronization.ts
```

## Implementation evidence — 2026-11-03

1. Zerospin repair is committed in isolated branch `codex/offline-session-restore`.
   Browser TypeScript/lint checks and the two existing authentication/disposal
   files passed (9 tests). Local fixed-group 42.0.2 builds and publication passed:
   20 actual publications, zero skipped packages. QRK installs exact 42.0.2 pins.
   The initial 42.0.1 attempt collided with an already published concurrent release;
   Nx skipped publication and the first runtime attempt used the old source. The
   installed 42.0.2 source was checked before the repeated browser verification.
2. Production App build generates 186 precache entries, including `index.html`,
   worker and WASM. Browser inspection confirmed an activated controller and
   Clerk static-script cache. No manifest is generated. Existing QRK backend
   tests passed before the corrected publication; the final adoption checks remain
   listed below until rerun. No tests, fixtures or test runners were created.
3. Recreated a disposable Site/Page through normal App commands after the separately
   authorized local 42 schema reset. Saved Page `pag_VAgYfU7_QTc93vjuL_6pq` in Site
   `sit_S_P40KaqkJ9ovFbLEVFTA` on the existing App origin. With browser offline and
   the QRK backend stopped, reloaded its exact Page Settings URL, saved description
   `Saved offline with the QRK backend stopped.`, and reloaded again. The description
   survived and the session remained usable. Initial offline Clerk startup was
   noticeably delayed; this is not an instant-render guarantee.
4. A read-only `AggregateVersionRepo.page` query still showed the earlier description
   while offline. After restoring networking and the same backend without a reset,
   it showed the offline description. Backend log recorded a new snapshot/ticket
   exchange and WebSocket; authoritative rejection has not yet been exercised.
5. Between the initial and corrected builds, the browser displayed Reload/Later.
   Later dismissed the notification and left Page Settings editable. On a subsequent
   load the waiting update was offered again; Reload activated the new build.

6. Closed the only App tab, opened a same-origin static resource without starting
   the App, enabled offline emulation, stopped the backend, then navigated to the
   exact saved URL. Page Settings restored its saved title and description. No
   older App tab remained to retain its SharedWorker. Restored networking and
   restarted the configured backend afterward.
7. Final 42.0.2 adoption: frozen install, App TypeScript and the managed AGENTS
   rule check passed. Existing backend tests passed (5 files, 20 tests). The
   framework branch is pushed and open as ready [PR 125](https://github.com/morgs32/zerospin/pull/125).

## Final verification and outcome

1. The user approved `useClearSessionAuthentication(definition)` after reviewing
   the call site. The ready-only action captures its matching session and delegates
   to its public `clearAuthentication()` capability. QRK's existing account panel
   retains one Sign out action; it awaits revocation before Clerk signs out.
2. React TypeScript/lint passed. Its existing session-provider file passed all
   4 tests, including identity rotation and stale-publication isolation. No test
   files, fixtures or runners were created. Framework local fixed-group 42.0.3
   builds and publication passed: 20 actual publications, zero skipped packages.
   QRK adopted exact 42.0.3 pins. Framework source/API documentation is in ready
   [PR 125](https://github.com/morgs32/zerospin/pull/125).
3. Sign out returned to Web. A read-only check of the current runtime's discovery
   catalog recorded `eligible: false` and an invalidation marker. An offline
   attempt to reopen the saved editor URL redirected to Web sign-in, which was
   unavailable offline, instead of reopening the editor. A fresh online `__dev`
   sign-in restored access to the retained Page.
4. Queued description `Queued edit must wait for successful reauthentication.`
   while browser offline and canonical backend execution was paused. Stopped
   that backend before restarting, preserving SQLite. A read-only
   `AggregateVersionRepo.page` query still showed the previous description.
   Restarted with the original local keys and only `CLERK_AUTHORIZED_PARTY`
   temporarily restricted to the existing Admin origin. Retry returned
   `aggregate-authentication-failed`; the canonical description remained unchanged.
   Removed the worktree-only `.dev.vars`, restored the configured backend and
   retried. The same queued description then appeared in `AggregateVersionRepo.page`.
   The initial override omitted base bindings and produced a configuration error;
   it was corrected and is excluded from authentication-refusal evidence.
5. Two-tab verification caught obsolete precache deletion forcing a deferred tab
   to reload on later navigation. Each build now has its own App resource cache;
   the imported `offline-cache.js` serves retained immutable chunks across builds.
   A second update preserved unsaved text in the tab that chose Later, accepted
   Reload in the other tab, and left subsequent drawer navigation on the same
   document (`performance.timeOrigin` unchanged). An old route chunk returned
   HTTP 200 from the active worker. The obsolete prototype-cache path was removed.
6. Resource cleanup is deliberately conservative: multiple controlled App tabs
   retain old builds. A lone current tab reports its entry module; with no
   installing/waiting worker, only then may obsolete App precaches be deleted.
   This never includes Clerk's static cache or domain storage. The retained
   earlier tab could not be reclaimed by this browser controller, so the
   single-client deletion branch was reviewed in source rather than exercised
   in this profile. The verified multi-tab invariant is retention and usability.
7. Final consumer App build, TypeScript, frozen-lockfile install, managed AGENTS
   rule check and existing backend tests passed (5 files, 20 tests). The normal
   configured preview/backend remain running. Temporary authentication overrides
   are removed; original keys and environment files are unchanged. The only
   storage reset was the expressly authorized local QRK 42 schema cutover.

## Limits

1. Offline initial rendering can wait for Clerk's cached startup path; it is not
   instant. Missing local identity/data cannot be obtained offline. Remote access
   revocation cannot be discovered until reconnecting. Different Clerk-account
   switching and Service offline startup were not exercised in this QRK browser;
   existing framework checks cover identity binding and React identity rotation.
2. No production deployment or public npm publication occurred. Packages are
   available through the existing local registry. Screenshots are local artifacts,
   including `/private/tmp/qrk-offline-final-proof.jpg` and
   `/private/tmp/qrk-offline-authentication-rejected.jpg`; they are not PR uploads.

## Remaining work

None.
