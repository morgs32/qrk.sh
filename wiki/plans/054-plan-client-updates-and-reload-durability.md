# 054 — Client updates and reload durability

**Status:** Planned; implementation and runtime verification have not started.

**Date:** 2026-11-06

## Outcome and ownership

QRK depends on Vite PWA for offline loading and update notifications. Zerospin's command durability must work across an ordinary reload without that plugin.

1. **Zerospin** preserves persisted commands, manages Node ownership, performs supported forward storage upgrades, and exposes readiness and failures through its existing session interface.
2. **Vite PWA / Workbox** downloads and caches complete client builds and reports an available update. QRK supplies the visible Reload/Later notification.
3. **QRK** decides whether interrupting its unsaved forms and uploads requires user confirmation. Each form owns that decision; the update component does not inspect sessions or commands.
4. **Deletion test:** remove Vite PWA registration and caching from the exercised application. Offline app delivery and the update notification disappear. Persisted commands still survive an ordinary document reload into a newer supported Node executable.

This plan extends [Plan 053](../archive/plans/053-plan-offline-loading-and-update-prompts.md) and consumes [Zerospin's connected Node storage lifecycle](../../../zerospin/wiki/adrs/027-connected-browser-node-storage-upgrades.md). It does not introduce a Zerospin Vite integration. Such an optional package needs demonstrated repeated configuration across consumers before it is justified.

## Current implementation

1. QRK uses installed `vite-plugin-pwa` 2.0.0 with `workbox-window` 7.4.1. [AppUpdatePrompt](../../apps/app/app/AppUpdatePrompt.tsx) registers in production, checks for updates on focus/online/visibility, offers Reload/Later, and reloads only a document whose user approved the update. Its Reload handler has no draft protection, and its approval flag currently survives a canceled navigation.
2. [The Vite configuration](../../apps/app/vite.config.ts) creates a separate precache per build, generates the worker after the SPA shell, and disables automatic outdated-cache cleanup. [offline-cache.js](../../apps/app/public/offline-cache.js) serves old immutable asset URLs and conservatively retires old QRK asset caches. These caches include executable resources, not Node databases or command journals.
3. Forms own raw React drafts and prerequisite requests. There is no installed form-state library or existing unload guard. The common module Form contract exposes only `state`, `onSave`, and `onCancel`; the host cannot infer each module's actual dirty or busy state.
4. Zerospin 43.0.0 uses stable authenticated connected namespaces. A compatible layout reopens without a migration drain. A pending supported SQL upgrade imports persisted journals, freezes the command prefix, retains contiguous canonical outcomes, applies forward SQL atomically with its ledger entry, validates, and becomes ready. The initial SQL 22 / ledger 0 history has no production ALTER edge.
5. Zerospin already fences a disposed facade, joins its local work, detects abrupt document loss with document-owned Web Locks, and retains namespace exclusion until shared-owner cleanup succeeds. `dispose()` does not acknowledge complete shared-owner closure or remote command outcomes. Ordinary reload must remain safe without cooperative async unload cleanup.
6. Aggregate and Service namespace lease waits are bounded, but currently become the generic `node-local-preparation-timeout`. This hides the useful instruction to close another document using the same local session and retry.
7. Development skips registration but does not retire a previously installed production worker. New development bootstrap code alone cannot repair a navigation intercepted by an older cached shell.

## Decisions

1. Preserve the exact durability boundary: commands already retained by the Node, or originals successfully persisted in the tab journal, survive supported reloads. Journal writes are currently best effort; a successful in-memory staging result is not proof that a browser storage write succeeded. This plan does not silently strengthen that contract or add a consumer persistence waiter.
2. Keep runtime handoff entirely upstream. QRK adds no journal flush, Node-log polling, lease inspection, cross-tab acknowledgements, staging fence, authentication clearing, or shared-owner shutdown protocol. Normal session lifetime and abrupt document loss remain framework responsibilities. A verified teardown defect found during the deletion test must be fixed in Zerospin before adoption.
3. Introduce one actionable upstream failure, proposed code `node-storage-owner-busy`, through the existing Node failure schema and `session.store` / managed readiness path. Emit it only when the namespace lease wait expires. Keep other local-preparation timeouts distinct. Use a generic framework message such as: "Another tab or window is still using this local session. Close it, then retry." Do not claim to know an executable version or enumerate tabs without evidence.
4. Keep the existing bounded wait and cancellation semantics. A live old-runtime document may delay a newer executable, even with a compatible SQL layout. Preserve storage and expose the supplied error with ordinary Retry. Closing the old document and retrying creates a fresh facade. Add no takeover, forced close, new lifecycle status, or automatic retry loop.
5. Use native `beforeunload` confirmation for unsaved UI work. Staying keeps the current document, drafts, and uploads running; explicitly leaving allows their loss. Saving or canceling through the existing form clears its warning. This is a warning policy, not mandatory Save/Cancel, automatic Save All, or draft persistence.
6. Install unload listeners only while actual unsaved input or a nonrecoverable upload/prerequisite operation exists. Compare raw input with its saved baseline: `canSave` may be false for invalid unsaved input, or true for a pristine unconfigured form. Do not warn for background command delivery, canonical outcomes, or disposable lookup requests.
7. Native confirmation is a browser feature with a generic message and interaction requirements; it is not a durability mechanism or a guarantee against mobile process termination. This plan adds no route-transition blocker or crash-safe UI draft store. See [MDN's beforeunload guidance](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).
8. Preserve mixed-build asset availability. A waiting worker can activate before a user cancels the subsequent document reload; the old JavaScript must remain usable. Activation can change fetch handling for existing documents without replacing their JavaScript. Retain the existing conservative cache policy and no involuntary tab reload. See [the service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle#skip_the_waiting_phase).
9. Keep supported Node SQL upgrades separate from authored model, contract, Actor, command-wire, or session-binding changes. Retaining old assets is not an automatic database downgrade policy. Pre-baseline adoption remains a separate drain-and-retire operation; it is not performed by the update button.

## QRK guard proposal for review

Propose one reusable browser hook, `useWarnBeforeUnload(hasUnsavedWork: boolean)`, defined in `apps/app/lib/useWarnBeforeUnload.ts`. It installs/removes one native listener and owns no state registry, session, module behavior, router, or PWA dependency. Its repeated call sites below justify sharing this platform behavior. Introduce no named type/interface, provider, Form prop, wrapper around command submission, or barrel export.

1. `apps/app/app/[username]/(dashboard)/page.tsx`: the Create Site dialog is open and its name, description, or slug differs from the empty opening fields.
2. `apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx`: existing `isDirty || isUploading`; logo and favicon uploads use the existing upload owner.
3. `apps/app/app/[username]/site/[siteId]/page/[pageId]/PageSettings/PageSettings.tsx`: existing `isDirty`.
4. `apps/app/app/[username]/site/[siteId]/page/[pageId]/StackDetails/StackDetails.tsx`: a rename draft exists and its raw name differs from the saved name, including invalid or whitespace-only edits.
5. `apps/app/app/[username]/site/[siteId]/page/[pageId]/(drawer)/PublishSiteDialog.tsx`: the open dialog's selected Page ID set differs from its opening snapshot. Capture that snapshot beside the existing opening initialization; do not compare against a changing live query. Mere opening is clean.
6. `apps/app/modules/article/ArticleForm.tsx`: the actual Article draft differs from saved state.
7. `apps/app/modules/image/ImageForm.tsx`: the actual image draft differs from `initialState`, or the existing upload/mutation is active. A pristine `state === null` is not itself a draft. Preserve existing Cancel/unmount upload cancellation.
8. `apps/app/modules/swatchAndIcon/SwatchAndIconForm.tsx`: draft color/icon differs from saved state.
9. `apps/app/modules/link/LinkForm.tsx`, `instagram/InstagramForm.tsx`, `githubProfile/GitHubProfileForm.tsx`, `githubActivity/GitHubActivityForm.tsx`, `githubRepo/GitHubRepoForm.tsx`, `figmaThumbnail/FigmaThumbnailForm.tsx`, and `mapPlace/MapPlaceForm.tsx`: each module's raw URL/profile/repository/place input differs from its saved input, or its existing save prerequisite is active. Each path after the first is relative to `apps/app/modules/`.

The module Forms retain ownership of those comparisons and their upload/provider behavior. The shared hook only consumes a boolean. Successful synchronous staging may clear the draft through the existing save flow; no form waits for Node persistence or remote execution.

## Annotated examples

```text
1. PWA absent, app delivered over the network:
   persisted original command -> ordinary reload -> newer supported runtime
   -> existing Node recovery -> same original identity -> canonical outcome

2. Update downloaded, unsaved Page title:
   Reload -> native confirmation -> Stay
   -> old document remains editable; update remains available
   -> Save -> Reload -> normal Node initialization

3. Another document retains the older Node executable:
   new session initializes -> bounded namespace wait -> supplied owner-busy error
   -> user closes the old document -> ordinary Retry -> retained storage reopens
```

Illustrative hook shape; the implementation remains subject to plan review:

```ts
export function useWarnBeforeUnload(hasUnsavedWork: boolean) {
  useEffect(() => {
    // 1. Clean forms install no listener.
    if (!hasUnsavedWork) return;
    const warn = (event: BeforeUnloadEvent) => {
      // 2. The browser asks the user; no asynchronous persistence runs here.
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    // 3. Saving, cancellation, or unmount removes this owner's warning.
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedWork]);
}
```

Illustrative changes in the existing update handlers:

```ts
// 1. Sonner otherwise dismisses the toast before a canceled reload can return.
event.preventDefault();

// 2. When the approved controlling event requests the actual navigation,
// consume approval before calling reload. A canceled reload must not approve
// an unrelated future worker activation.
if (reloadApproved) {
  reloadApproved = false;
  window.location.reload();
}
// Apply the same approval consumption to the already-activated-worker branch.
// No session.dispose(), command flush, or authentication operation belongs here.
```

## Ordered implementation

1. **Establish upstream evidence.** Use an isolated Zerospin branch, current installed Intent skills, and the existing Browser/Core test seams. Confirm ordinary document reload recovery with no HTTP service worker controlling the document. Exercise a successfully persisted journal original before Node retention and a Node-retained original before canonical finalization. Keep exact authored bindings unchanged; do not introduce a production migration solely for verification.
2. **Fix the verified upstream signal.** Declare `node-storage-owner-busy` in the existing browser Node error definitions/failure schema. Use it for the exact Aggregate and Service namespace acquisition deadline, preserve it through existing error encoding and session readiness, and explicitly exclude it from connected storage replacement. Keep generic preparation deadlines elsewhere. Extend existing error/namespace cases to prove cancellation while waiting opens no storage, failure preserves retained work, and closing the old owner permits fresh-facade retry. Change teardown code only if step 1 exposes a specific defect; do not add a speculative shutdown API.
3. **Publish and adopt when upstream verification passes.** Build and publish one coherent Zerospin fixed-group release to the configured local registry, using the next available version at execution time. Update QRK's exact package pins and lockfile through the package manager, refresh/check the installed managed agent rule, and reload installed Intent guidance. Do not edit installed packages, use workspace/file links, or touch handwritten canonical selections/registrations. No public publication or production deployment is included.
4. **Add QRK's UI warning.** Implement the reviewed hook and all listed owner call sites. Keep native Stay/Leave behavior, existing save/cancel flows, and raw-draft comparisons. Do not change module Form contracts or move provider/upload logic into App. Verify pristine, changed, invalid, saved, canceled, and active-upload states using representative existing UI seams.
5. **Make update approval one-shot.** In `AppUpdatePrompt`, prevent Sonner's Reload action from auto-dismissing the notification. Consume `reloadApproved` immediately before each actual reload, including the already-activated-worker branch. A canceled native confirmation leaves the update notification usable. Later dismisses only the notification and records no future reload approval. Keep registration, update checks, and the per-build asset-cache policy. Surface the upstream supplied readiness error through the existing `SessionReady` / `AppError` path; add no QRK lease classifier or tab coordinator.
6. **Retire stale production interception in development.** In the existing Vite development middleware, serve an exact `/sw.js` retirement response with JavaScript content type and `Cache-Control: no-store`, before SPA fallback. Its installation/activation can replace the old worker, release registration, and allow subsequent document navigation to reach the dev server. While it still controls old documents, the retirement worker must continue the narrow cache fallback for exact immutable `/assets/` URLs from existing `qrk-app-*` caches; retaining caches without a fetch handler is insufficient. Navigation uses the network. Do not force documents to navigate or delete caches still needed by old documents. Do not touch Node storage, localStorage journals, Clerk state, or use `Clear-Site-Data`. Keep the production preview configuration serving its generated worker. Verify the stale-shell case before relying on any new dev bootstrap code.
7. **Verify the combined behavior and document it.** Update App's offline/update documentation and Zerospin's session/error guidance with the measured guarantees. Repair any ownership wording in research/live docs without claiming unexecuted evidence. Do not rewrite archived Plan 053. Record checks and browser evidence, publish ready-for-review upstream and consumer PRs, and archive this plan only when all required implementation/adoption evidence is complete.

## Verification and acceptance

1. **Plugin deletion test:** use the configured `app.qrk.localhost` origin with PWA registration/build delivery disabled for the exercised configuration and confirm `navigator.serviceWorker.controller === null`. Deliver the app online; stop automatic command pushing through the existing framework seam, stage a reversible command, and establish persisted journal or Node retention evidence before navigation. Reload into a newer supported executable without QRK cleanup RPCs, inspect the unchanged Session submission coordinates and, once allocated, the unchanged Node command identity/producer progress, then reconnect/resume and retain its canonical outcome exactly once. Repeat for journal-before-Node-retention and Node-retained-before-finalization. Do not treat a UI value alone as identity/durability evidence. Restore the normal configuration afterward; add no permanent second app server or production migration.
2. **Upstream tests:** extend existing `packages/browser/tests/node-network-errors.spec.ts`, `aggregate-public.browser.ts`, and `service-public.browser.ts` for owner-busy encoding, non-reset classification, cancellation, release, and retry. Reuse existing `node-subscriber-disposal.spec.ts` and Core `node-history-recovery.spec.ts` evidence; extend them only if those paths change. Create no new tests, fixtures, runners, or configuration. Run affected existing targets through Nx; do not verify Explorer.
3. **Supported SQL upgrade:** retain Plan 293's old-format readers, frozen-prefix finalization, atomic migration ledger, offline finalized upgrade, blocked offline backlog, and failed-edge preservation checks. A compatible executable update must not acquire a new requirement to drain every pending command. No application command/schema migration is inferred from these tests.
4. **UI warning:** clean settings and pristine unconfigured module forms reload without warning; valid and invalid raw edits warn; Stay preserves values; Save/Cancel clears the warning. Exercise a real local image upload/prerequisite in progress and the publication-selection opening baseline. A staged command with no remaining UI draft adds no warning merely because remote execution is pending. Verify ordinary browser reload as well as the update action.
5. **Two-build update flow:** Later leaves the current editor usable. Reload plus native Stay leaves the notification available. Another activation after Stay does not trigger a previously approved reload. Explicit Leave loads the complete new build. An older document can still load its lazy chunks, worker and WASM while retained. An old Node executable produces the actionable upstream failure in the new document; closing it and clicking ordinary Retry succeeds without reset or restaging.
6. **Dev recovery:** first install/control a production build on the existing origin, then restore the configured dev server without clearing site data. An existing registration update receives the retirement script even while the old shell is displayed; a subsequent deliberate navigation reaches dev. Preserve command/journal identities, retained models, authentication, other tabs' drafts, and assets they still require. Returning to production preview restores normal PWA behavior.
7. **Consumer checks:** frozen-lockfile install and exact-version consistency, relevant App typecheck/build through configured Nx targets, and managed agent-rule check. Broaden only for changed consumer packages or an observed failure. Preserve unrelated WIP, existing verification data, and other running services.

## Planned files

1. **Zerospin:** `packages/browser/src/Node/NodeErrors.ts` (including `NodeFailureSchema`) and `shouldResetConnectedNode.ts`; Aggregate/Service `make*SharedWorker.ts`; existing error/namespace test files above; the existing session skill and owning error/lifecycle documentation. Update existing error encoding/recognition only where its declarations require the new code; add no error registry wrapper. Release metadata follows the existing fixed-group workflow.
2. **QRK:** the new `apps/app/lib/useWarnBeforeUnload.ts`; the fifteen UI owners listed above; `apps/app/app/AppUpdatePrompt.tsx`; `apps/app/vite.config.ts` and only a directly required retirement-script resource; `apps/app/README.md`; exact Zerospin dependency manifests and `pnpm-lock.yaml` when adopting the upstream release. Preserve `public/offline-cache.js` policy unless verification establishes a concrete required correction.
3. **Documentation:** this plan, plus affected live ownership/error guidance during implementation. No new architecture spec, ADR, glossary, general PWA package, or framework-specific shutdown abstraction is needed for the settled split.

## Remaining work

All implementation, package release/adoption, and runtime verification above remain pending. Source investigation and planning do not establish the deletion test or a new teardown guarantee.
