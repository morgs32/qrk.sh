# 054 — Client updates and reload durability

**Status:** In progress; QRK and upstream source changes are implemented and checked. Native browser acceptance and local release/adoption remain pending.

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
6. Aggregate and Service namespace lease waits are bounded, but currently become the generic `node-local-preparation-timeout`. This hides storage contention behind a general preparation failure.
7. Development skips registration but does not retire a previously installed production worker. New development bootstrap code alone cannot repair a navigation intercepted by an older cached shell.

## Decisions

1. Preserve the exact durability boundary: commands already retained by the Node, or originals successfully persisted in the tab journal, survive supported reloads. Journal writes are currently best effort; a successful in-memory staging result is not proof that a browser storage write succeeded. This plan does not silently strengthen that contract or add a consumer persistence waiter.
2. Keep runtime handoff entirely upstream. QRK adds no journal flush, Node-log polling, lease inspection, cross-tab acknowledgements, staging fence, authentication clearing, or shared-owner shutdown protocol. Normal session lifetime and abrupt document loss remain framework responsibilities. A verified teardown defect found during the deletion test must be fixed in Zerospin before adoption.
3. Introduce one actionable upstream failure, proposed code `node-storage-owner-busy`, through the existing Node failure schema and `session.store` / managed readiness path. Emit it only when the namespace lease wait expires. Keep other local-preparation timeouts distinct. Use the framework message: "Local session storage is still in use. Close other tabs or windows using this app, then retry." Contention can also outlive a document when owner cleanup fails; do not assert that another live tab exists, identify an executable version, or add owner-discovery machinery.
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

Keep all fifteen hook calls as derived booleans from existing raw drafts, saved props, and busy flags. Add no separate dirty state, copied saved-state baselines, generic serializers, or form registry. For example, LinkForm's displayed `url` already falls back to its saved input, so its warning can use `url !== (state?.payload.url ?? "") || isSaving`. Only PublishSiteDialog needs a new opening-selection snapshot.

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
// Later and failed activation also clear reloadApproved. In particular,
// Reload -> Later -> activation must leave the document in place.
// No session.dispose(), command flush, or authentication operation belongs here.
```

## Ordered implementation

QRK's warning/update work (steps 1–2), dev recovery (step 3), and upstream work (steps 4–5) are independently reviewable. The QRK changes work against 43.0.0 and need not wait for a framework release. Only adoption of the new upstream error requires step 6; step 7 verifies the combined result.

1. **Add QRK's UI warning.** Implement the reviewed hook and all listed owner call sites using derived draft/busy booleans. Keep native Stay/Leave behavior and existing save/cancel flows. Add only the publication dialog's required opening snapshot. Do not change module Form contracts or move provider/upload logic into App. Verify pristine, changed, invalid, saved, canceled, and active-upload states using representative existing UI seams.
2. **Make update approval one-shot.** In `AppUpdatePrompt`, prevent Sonner's Reload action from auto-dismissing the notification. Consume `reloadApproved` immediately before each actual reload, including the already-activated-worker branch. Clear it on failed activation and in Later's handler, including when activation is still pending. A canceled native confirmation leaves the update notification usable. Later dismisses the notification and revokes pending reload approval without stopping editing or synchronization. Keep registration, update checks, and the per-build asset-cache policy. Use the existing boolean; add no update state machine or session handoff code.
3. **Retire stale production interception in development.** In the existing Vite development middleware, serve an exact `/sw.js` retirement response with JavaScript content type and `Cache-Control: no-store`, before SPA fallback. Keep the retirement behavior small: activate, relinquish registration, let navigation use the network, and reuse the existing narrow cache fallback for exact immutable `/assets/` URLs from `qrk-app-*` caches while old documents remain controlled. Retaining caches without that fetch behavior is insufficient. Add no second cache manager, new cleanup policy, or client bookkeeping. Do not force navigation, delete caches still needed by old documents, touch Node storage/localStorage journals/Clerk state, or use `Clear-Site-Data`. Keep production preview serving its generated worker. Verify this independently against 43.0.0, including the stale-shell case before relying on new dev bootstrap code.
4. **Establish upstream journal-recovery evidence.** Use an isolated Zerospin branch, current installed Intent skills, and an existing browser verification seam. Deliberately withhold session-to-Node handoff before retention; establish a successfully persisted journal original and its absence from Node retention, then abruptly reload with no HTTP service worker controlling the document. Verify recovery under its original submission coordinates. Pausing outgoing network pushes alone cannot establish this journal-only window. Keep this delicate interruption check upstream; QRK exercises one Node-retained pending command after adoption. Keep exact authored bindings unchanged and add no production test hook or migration solely for verification.
5. **Fix the verified upstream signal.** Declare `node-storage-owner-busy` in the existing browser Node error definitions/failure schema. Use it for the exact Aggregate and Service namespace acquisition deadline, preserve it through existing error encoding and session readiness, and explicitly exclude it from connected storage replacement. Keep generic preparation deadlines elsewhere and use the factual message in decision 3. Extend existing error/namespace cases to prove cancellation while waiting opens no storage, failure preserves retained work, and closing the old owner permits fresh-facade retry. Change teardown code only if step 4 exposes a specific defect; do not add a speculative shutdown API.
6. **Publish and adopt when upstream verification passes.** Build and publish one coherent Zerospin fixed-group release to the configured local registry, using the next available version at execution time. Update QRK's exact package pins and lockfile through the package manager, refresh/check the installed managed agent rule, and reload installed Intent guidance. Existing `SessionReady` / `AppError` presentation carries the supplied owner-busy failure; add no QRK lease classifier or tab coordinator. Do not edit installed packages, use workspace/file links, or touch handwritten canonical selections/registrations. No public publication or production deployment is included.
7. **Verify the combined behavior and document it.** Update App's offline/update documentation and Zerospin's session/error guidance with the measured guarantees. Repair any ownership wording in research/live docs without claiming unexecuted evidence. Do not rewrite archived Plan 053. Record checks and browser evidence, publish ready-for-review upstream and consumer PRs, and archive this plan only when all required implementation/adoption evidence is complete.

## Verification and acceptance

1. **Plugin deletion test, two owned checks:** upstream, use an existing Zerospin browser seam to withhold session-to-Node handoff before retention, prove the original is persisted in the journal but not the Node, then abruptly reload into a newer supported executable without an HTTP service worker. Recover the same submission coordinates and retain the eventual canonical outcome once. In QRK after adoption, use the configured `app.qrk.localhost` origin with PWA registration/build delivery disabled and `navigator.serviceWorker.controller === null`. Deliver the app online; pause network pushing, stage one reversible command, and prove Node retention before canonical finalization. Reload into a newer supported executable without QRK cleanup RPCs, preserve the original Node command identity/producer progress, then reconnect/resume and retain its canonical outcome once. Network-push pause is sufficient only for the Node-retained check. Do not treat a UI value alone as durability evidence. Restore normal configuration afterward; add no permanent second app server, production test hook, or production migration.
2. **Upstream tests:** extend existing `packages/browser/tests/node-network-errors.spec.ts`, `aggregate-public.browser.ts`, and `service-public.browser.ts` for owner-busy encoding, non-reset classification, cancellation, release, and retry. Reuse existing `node-subscriber-disposal.spec.ts` and Core `node-history-recovery.spec.ts` evidence; extend them only if those paths change. Create no new tests, fixtures, runners, or configuration. Run affected existing targets through Nx; do not verify Explorer.
3. **Supported SQL upgrade:** retain Plan 293's old-format readers, frozen-prefix finalization, atomic migration ledger, offline finalized upgrade, blocked offline backlog, and failed-edge preservation checks. A compatible executable update must not acquire a new requirement to drain every pending command. No application command/schema migration is inferred from these tests.
4. **UI warning:** clean settings and pristine unconfigured module forms reload without warning; valid and invalid raw edits warn; Stay preserves values; Save/Cancel clears the warning. Exercise a real local image upload/prerequisite in progress and the publication-selection opening baseline. A staged command with no remaining UI draft adds no warning merely because remote execution is pending. Verify ordinary browser reload as well as the update action.
5. **Two-build update flow:** Later leaves the current editor usable. Explicitly exercise Reload -> Later before activation completes -> controlling event: the document must not reload; a fresh offer may appear. Reload plus native Stay leaves the notification available. Another activation after Stay does not trigger a previously approved reload. Explicit Leave loads the complete new build. An older document can still load its lazy chunks, worker and WASM while retained. An old Node executable produces the factual upstream storage-busy failure in the new document; closing it and clicking ordinary Retry succeeds without reset or restaging.
6. **Dev recovery:** first install/control a production build on the existing origin, then restore the configured dev server without clearing site data. An existing registration update receives the retirement script even while the old shell is displayed; a subsequent deliberate navigation reaches dev. Preserve command/journal identities, retained models, authentication, other tabs' drafts, and assets they still require. Returning to production preview restores normal PWA behavior.
7. **Consumer checks:** frozen-lockfile install and exact-version consistency, relevant App typecheck/build through configured Nx targets, and managed agent-rule check. Broaden only for changed consumer packages or an observed failure. Preserve unrelated WIP, existing verification data, and other running services.

## Planned files

1. **Zerospin:** `packages/browser/src/Node/NodeErrors.ts` (including `NodeFailureSchema`) and `shouldResetConnectedNode.ts`; Aggregate/Service `make*SharedWorker.ts`; existing error/namespace test files above; the existing session skill and owning error/lifecycle documentation. Update existing error encoding/recognition only where its declarations require the new code; add no error registry wrapper. Release metadata follows the existing fixed-group workflow.
2. **QRK:** the new `apps/app/lib/useWarnBeforeUnload.ts`; the fifteen UI owners listed above; `apps/app/app/AppUpdatePrompt.tsx`; `apps/app/vite.config.ts` and only a directly required retirement-script resource; `apps/app/README.md`; exact Zerospin dependency manifests and `pnpm-lock.yaml` when adopting the upstream release. Preserve `public/offline-cache.js` policy unless verification establishes a concrete required correction.
3. **Documentation:** this plan, plus affected live ownership/error guidance during implementation. No new architecture spec, ADR, glossary, general PWA package, or framework-specific shutdown abstraction is needed for the settled split.

## Implementation evidence — 2026-11-06

1. QRK implements the boolean native unload hook in all fifteen owners. Existing drafts/busy state supply its predicates; only the publication dialog adds an opening-selection snapshot. Reload approval is consumed before navigation and revoked by Later or failed activation. The dev `/sw.js` response reuses `offline-cache.js` with cleanup disabled, then activates, claims and unregisters without navigation or deletion.
2. App TypeScript and the cache-bypassed Nx production build pass. Scoped formatter checks and `git diff --check` pass for the authored changes. The full Vite config retains pre-existing formatting outside the new middleware block.
3. Six in-memory scenario groups against the actual prompt/hook source pass with mocked browser/PWA/Sonner boundaries: pending Later, one-shot approved/already-active reload, failed activation, unapproved/disposed callbacks, toast retention, and dirty-listener cleanup. Inline retirement checks pass for lifecycle order, old asset lookup, network navigation, and disabled cache cleanup. These are callback checks, not native-dialog or real PWA/browser acceptance evidence. No test/fixture/runner files were created.
4. [Zerospin PR 129](https://github.com/morgs32/zerospin/pull/129) implements the exact namespace owner-busy failure, schema/RPC preservation, and explicit non-reset classification. Three existing test files pass with 29 tests and whole-test TypeScript compilation; Browser type/lint checks pass with zero warnings, as do formatting/diff checks. Existing browser fixtures include owner-busy/retry assertions and journal-only reload helpers. Their exact test-owned gate keeps the same worker URL across reloads and never releases the old held request; CacheStorage controls only the interruption, not command durability. Native execution is pending.
5. [QRK PR 80](https://github.com/morgs32/qrk.sh/pull/80) contains separate commits for draft/reload approval and dev retirement. Both PRs are open for review. QRK remains on 43.0.0; no new local publication or adoption has occurred.

## Remaining work

1. Start the configured HTTPS proxy on port 443, which requires the user's sudo password. Startup was requested while independent work continued. Then run the upstream native namespace/cancellation/retry and journal-only abrupt-reload checks. Preserve the same worker URL for both journal phases; that fixture check uses the same compiled runtime hash.
2. After required upstream verification passes, publish/adopt the checked local release and verify exact pins/frozen installation. Run QRK's real cross-runtime-hash Node-retained reload, native confirmation/upload, two-build update, and dev-recovery acceptance checks. The retained 43.0.0 client build is preserved outside the repository for that cross-runtime comparison.
3. Record measured runtime evidence, finish affected documentation and PR descriptions, and archive only after required verification is complete. No native browser result or new teardown guarantee is implied by passing builds, types, lint, or boundary mocks.
