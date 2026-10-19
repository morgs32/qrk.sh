# Migrate Studio and Library to TanStack Start

Status: Complete and archived on 2026-10-19. Studio and both Storybook builds,
development and static-preview checks, and final direct-origin navigation
verification passed. Deployment remains outside scope.

## Summary

Move Studio and Library to TanStack Start `1.169.3` with TanStack Router
`1.170.45` in SPA mode. Keep Vite Plus `1.0.0`, React versions, existing
Portless origins, ports, backend contracts, and persisted session identities.
Web remains on Next.js. This plan prepares and verifies local output;
deployment is outside scope.

## Implementation

1. Replace the two Next framework configurations with Start's Vite plugin,
   file routes in each app's `routes/` directory, and `router.tsx` registration.
   Studio keeps its application base at `/`, emits assets under
   `/studio-static/`, and prerenders `index.html` as its static SPA shell.
   Library enables SPA mode without a production build or preview target.

   ```ts
   // Studio: keep Web's application URLs and isolate emitted assets.
   base: isPreview ? "/" : "/studio-static/",
   plugins: [
     tanstackStart({
       router: { basepath: "/" },
       spa: {
         enabled: true,
         // Match an application route while rendering only the root shell.
         maskPath: "/__studio_shell",
         // Static hosting falls back to this shell for application deep links.
         prerender: { outputPath: "/index.html" },
       },
     }),
     react(),
   ],
   ```

   Start's build-time preview requests application URLs at `/`; the client
   build and development assets retain `/studio-static/`. Both app configs
   bundle installed Zerospin packages through `ssr.noExternal` so Vite resolves
   their extensionless ESM imports.

2. Translate Studio's username dashboard, page editor, breakpoints, catalog,
   module detail, brick detail, Page Settings, and Site Settings routes. Keep
   the username session and page editor mounted across child navigation. A
   pathless drawer layout owns sibling catalog/detail leaves; matched route
   IDs control the drawer and toolbars. Preserve Effect Schema route
   validation, form keys, scroll behavior, Router-managed native View Transitions, reduced
   motion, and focus restoration.

   ```text
   Username session owner                  # Retained across Studio children.
   └─ Page editor owner                    # Keeps drafts, grid, and wall alive.
      ├─ Base editor / breakpoints
      └─ Pathless drawer layout            # Adds no URL path segment.
         ├─ Catalog
         ├─ Module detail                  # Sibling leaf preserves draft boundaries.
         ├─ Brick detail
         └─ Page Settings / Site Settings
   ```

3. Preserve Library routes `/`, `/modules`, `/modules/$moduleId`,
   `/bricks/$brickId`, and `/bricks/$brickId/admin`. Keep its initializer,
   wall, and viewport owners above the outlet. Replace Next links, navigation,
   params, location, and error handling with Router equivalents. Use a React
   boundary for admin measurement so render failure rejects Save and Cancel
   disposes pending work.

4. Use `@clerk/react@6.17.8` throughout Studio, including its offline-error
   export. Keep Web-owned sign-in, sign-up, sign-out destinations, and
   `/replace` as document navigation. Remove unused nuqs. Preserve existing
   public environment names through explicit Vite definitions, use installed
   Silkscreen CSS, and retain Speed Insights through its React integration.
   Add optional `NEXT_PUBLIC_WEB_ORIGIN`, defaulting to
   `https://qrk.localhost` in development and `https://qrk.sh` in production,
   for absolute Web-owned authentication destinations on direct Studio visits.

5. Bundle authored SharedWorkers and installed SQLite with Vite imports.
   Preserve session registrations, fixed identities, backup paths, package
   exports, shared CSS, and installed Zerospin `15.0.1` artifacts.

   ```ts
   // Browser host: pass Vite's emitted URL to makeApplicationSharedWorker.
   import workerUrl from "./node.worker?sharedworker&url";

   // Worker entry: bundle the WASM from the same installed browser release.
   import sqliteWasmUrl from "@zerospin/browser/sqlite.wasm?url";
   // Keep the existing makeSharedWorker session registrations.
   ```

6. Retain RPC/upload proxies and public asset aliases. Web forwards Studio's
   asset namespace and development HMR. Studio's Vercel configuration serves
   `dist/client`, with asset and RPC rules before the `index.html` fallback.
   Replace Studio's old `start` target with `preview` on port 3001 using
   `vite.preview.config.ts` without Start. Library retains development on
   port 4100 and Storybook on 6007; Studio Storybook remains on 6006.
   Keep Storybook independent of the Start plugin and update affected docs.
   Normalize bare Vite query flags at Studio's development boundary after
   Web's Next rewrite serializes them as empty values. Asset mappings are
   terminal in Vercel routing, and preview rejects missing prefixed files
   before its SPA fallback.
   HMR connects directly through Studio's existing Portless HTTPS hostname.
   Development and static-preview RPC proxies use server-only
   `STUDIO_WORKER_ORIGIN` (default `http://127.0.0.1:8787`); browser
   `NEXT_PUBLIC_API_URL` retains its HTTPS origin.

## Verification

1. Build Studio and both existing Storybooks through their Nx targets. Add no
   test suites or standalone automated check gates.
2. Run the existing HTTPS development origins, including Studio through Web.
   Inspect worker/WASM responses, MIME types, and HMR; verify Studio assets
   reach Studio rather than Web's Next runtime.
3. Manually exercise direct links, reload, Back/Forward, drawers, settings
   Save/Cancel, breakpoints, and retained editor state. Verify Library's
   standalone startup, query-driven module drafts, measurement failures, and
   cleanup without resetting existing browser storage or login state.
4. Exercise Studio's static preview, application deep-link fallback, assets,
   and RPC forwarding. Do not deploy as part of this migration.

## Verification progress

1. Studio static build passed after separating build-time preview route paths
   from its asset prefix and selecting a valid username shell mask.
2. Both existing Storybook builds passed through one scoped Nx graph.
3. Root Portless development starts all five QRK processes. Zerospin reported
   `Ready on http://127.0.0.1:8788/ (system spec accepted)`.
4. Library initialized and catalog-to-detail navigation rendered in Chrome.
   Its installed browser packages require `ssr.noExternal` in Vite development.
5. Web's Next rewrite normalizes bare Vite query flags to empty values. Studio
   now normalizes those flags at its development boundary. Its worker module
   and SQLite WASM return HTTP 200 with JavaScript and application/wasm MIME.
6. The authenticated Studio dashboard and Library catalog/detail initialized
   after closing only migration-created tabs holding stale development
   SharedWorkers. Existing browser storage, cookies, and backend stores were
   preserved.
7. Documentation records the shell mask, build-time preview base, bundled
   Zerospin packages, development query normalization, Web-owned
   authentication origin, direct Studio HMR socket, and server-only local RPC
   origin. These preserve browser HTTPS without disabling Node TLS checks.
8. A migration-created Library Swatch saved a color change; Cancel restored
   the saved value, and stable reload retained it. The temporary brick was
   removed successfully. No browser or backend storage reset was performed.
9. Temporary development diagnostics have been removed.
10. Studio retains React `19.2.7`, whose installed export surface lacks
    `ViewTransition`. Router now owns native document transitions through
    `defaultViewTransition`; the drawer's named DOM snapshot animates only
    outgoing content on close for 300ms. Root, opening, and matched drawer
    snapshots do not animate. The shared Drawer retains focus restoration,
    inert/hidden state, reduced motion, and immediate close without native
    View Transition support. These transition fallback details were reviewed
    in source; browser history and drawer navigation rendered successfully.
11. Studio's authenticated dashboard, editor, catalog, module detail, and
    brick detail rendered. Back/Forward worked. Cards retained value `1`
    across settings, drawers, and breakpoints before restoration to its
    original disabled value. `sm`/`lg` selection worked and was restored to
    `lg`. Page Settings Cancel restored the title; Save accepted a temporary
    title, then another Save restored the original. Site Settings draft
    cancellation restored the original values.
12. Direct brick deep-link reload initialized after adding a separate inner
    Suspense boundary around route children inside `UserApp.Initializer`, so
    cold lazy route loading does not prevent session startup.
13. A scoped hidden Library measurement render fault displayed
    `Temporary measurement verification failure`; Save rejected the draft
    while retaining it, and Cancel cleared it. The temporary injection was
    immediately removed. Migration-created Swatch and Figma bricks were both
    removed, returning the wall to empty.
14. Query-only module draft keys were reviewed in source because the current
    UI has no query-only navigation link. Cancellation on unmount was also
    source-reviewed; neither is claimed as manual runtime verification.
15. Static preview deep links, assets, worker JavaScript, and SQLite WASM
    returned HTTP 200 with expected MIME types. Missing prefixed and
    unprefixed assets returned 404. Preview `/rpc` returned HTTP 400, matching
    the same direct API request. Both Storybook builds passed, and the final
    Studio rebuild after the inner Suspense change passed in 5.3 seconds.
16. Chrome reported `[vite] connected.` through Studio's direct HMR socket
    and received actual hot updates to the global stylesheet, user session
    provider, route layout, site layout, and drawer header.
17. All four legacy public asset aliases returned HTTP 200 with image MIME
    types through Web. Exact dependency pins were reviewed in source; Web has
    no changed files. The final diff check passed. Temporary preview processes
    were stopped while the existing development stack is retained;
    migration-created browser tabs clean up independently.
18. In the existing Chrome profile, opening
    `https://studio.qrk.localhost/morgs32` redirected to
    `https://qrk.localhost/sign-in?redirect_url=https%3A%2F%2Fstudio.qrk.localhost%2Fmorgs32`
    and rendered the Web-owned **Sign in to QRK.SH** email/username form.
    The original Studio target remained in the redirect URL, and no relative
    redirect loop occurred. No credentials were entered, and no login session,
    cookie, or browser storage reset was performed.
19. Archived this plan without changing its filename and repaired both
    Studio and Library README links. No internal document-relative links
    required changes.

## Remaining work

None.
