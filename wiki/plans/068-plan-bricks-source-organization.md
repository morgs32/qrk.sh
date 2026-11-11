# Plan 068 — Organize Bricks by ownership

Move the Cap’n Web target from `apps/api/modules/LibraryApi.ts` to `apps/bricks/worker/BricksApi.ts`. The existing `apps/api/Worker.ts` mounts it in-process at `/` and owns uploads and asset serving. Move the Brick modules and shared component library into `src/modules/` and `src/components/` under Bricks. [Source ownership research](../research/brick-source-ownership.md)

## 1. Organize the Bricks source and cut over imports

- Move each Brick into `apps/bricks/src/modules/<brick>/` with its existing `definition/` and `react/` trees. Move the concrete catalog to `src/modules/backendLibrary.ts`. Put shared view factories, JSON Render registry bindings, view types, and editor hooks in `src/modules/react/`. Keep `BrickDetailsTrigger` with the shared components.
- Move shared UI primitives, inputs, layout and surface components, tokens, styles, and their stories and examples to `src/components/`. Preserve in-progress changes and story IDs. Keep module-specific UI, stories, and assets with their module.
- Keep the React-free module factories, shared component metadata, and spec schemas in `src/definition/`. Keep client declarations and wire types in `src/rpc/`. Preserve module IDs, catalog entries and versions, schema behavior, and the System registry.
- Replace the explicit Brick export keys with `./modules/<brick>/…`, retaining each existing suffix, and replace shared `./react/…` keys with `./components/…` or `./modules/react/…` according to ownership. Export the catalog as `./modules/backendLibrary` and the CSS as `./components/brickStyles.css`. Cut over App, Web, API, Zerospin, and Storybook together. Shared definition and type-only RPC keys keep their current names.
- Update App Storybook's module story glob to `src/modules/*/react/**` and retarget the Bricks Storybook helper imports and CSS. The existing Tailwind source globs cover the moved files.

```ts
// Runtime-neutral catalog used by validation and generation.
import { backendLibrary } from "@qrk.sh/bricks/modules/backendLibrary";
// React view and design-system control used by rendering hosts.
import { imageView } from "@qrk.sh/bricks/modules/image/view";
import { Input } from "@qrk.sh/bricks/components/Input";
```

## 2. Move the Bricks RPC target and providers

- Move the provider implementations and spec generation into `apps/bricks/worker/`. Rename the Cap’n Web target to `BricksApi` in the implementation and client declaration and update callers. Move `BackendRepo.ts` with the providers because GitHub and Instagram write responses there.
- Material Symbols search belongs to the Swatch and Icon Brick. Move its generated catalog, license, and generator to `apps/bricks/src/modules/swatchAndIcon/catalog/`. Lazy-load the catalog on the first search of at least two characters, then match names and IDs and reveal result pages locally. Replace the picker’s SWR requests and injected search callback with local paging. Remove `searchIcons` from `BricksApi` and its client declaration. Use the catalog in the existing icon selection story and save the same icon fields.
- Carry forward [Plan 070's asset changes](../archive/plans/070-plan-fold-r2-assets-into-api.md). In the moved Instagram provider, build image URLs from the supplied `R2_PUBLIC_BASE_URL` and the existing object keys using the same trailing-slash normalization. API keeps its asset handler and upload URL helper.
- Add explicit `workerd`-only package exports for the six symbols API imports from Bricks. Map `./worker/BricksApi`, `./worker/BackendRepo`, and the four `./worker/<provider>/<Class>` paths directly to their defining files. Add `workerd` to API's TypeScript custom conditions. Typecheck the moved files through API's existing generated Worker environment. Browser and Storybook clients import the renamed declaration from the same type-only `@qrk.sh/bricks/rpc` entry.
- Have API instantiate `BricksApi` directly in its existing `newWorkersRpcResponse` call. The `apps/bricks/worker/` directory contains code for that runtime. API remains the deployment entrypoint and owns Wrangler, CORS, uploads, and asset serving. Preserve the deployment identity, domains, secrets, named Durable Object exports and bindings, object names, R2 buckets and keys, and request and response behavior.
- Update manifests and the lockfile so Bricks declares the dependencies used by the moved source. Keep API's direct dependencies for the entrypoint and upload and asset code. Move existing versions with the code.
- Update the import checker to cover the relocated catalog and all module definitions transitively. Keep its host-dependency and type-only checks. Allow Worker exports only from API's Worker entrypoint and reject imports into Worker implementation from Bricks' browser source and Storybook, including relative paths. Check the Worker source transitively for React runtime dependencies.

```ts
import { BricksApi } from "@qrk.sh/bricks/worker/BricksApi";

// Final route after the temporary alias is removed.
if (url.pathname === "/") {
  return newWorkersRpcResponse(request, new BricksApi(env));
}
```

## 3. Cut over the RPC route

- Make `/` the direct RPC endpoint on the API Worker. Direct callers use `https://api.qrk.localhost/` in development and `https://api.qrk.sh/` in production. API keeps its existing upload and asset paths.
- Keep same-origin `/rpc` in App and Storybook. Rewrite it to the Worker root in App's `vite.config.ts`, `vite.preview.config.ts`, and `vercel.json`, and in both Storybook proxies. Match the exact path with or without a query string, forward `/rpc?probe=1` as `/?probe=1`, and preserve the existing development WebSocket proxy settings.
- Set Zerospin's `QRK_LIBRARY_API_URL` to the Worker root in the checked-in example, local configuration, and test fixture. The existing external contracts already accept an absolute URL.
- During the separately authorized production rollout, first deploy the existing API Worker with both `/` and the temporary `/rpc` alias dispatching directly to `BricksApi`. Retain the old icon search for that deployment so the App can still use its current picker. Verify both paths, then deploy the App rewrite and local icon picker and update Zerospin's `QRK_LIBRARY_API_URL`. Verify App RPC and Zerospin spec generation on the new target. Remove the API alias and old icon search in the follow-up deploy, then check that the old direct URL returns 404 and the App proxy still works.

## 4. Document and verify

1. Describe `src/components/` as the Brick component library within QRK's design system in [Brick layout conventions](../brick-layout-conventions.md). Use a shared input and a module-owned form as examples. Update the Modules README to explain that API hosts the Bricks implementation. Update moved-file references in active implementation plans.
2. Run Bricks' Nx import check, build Bricks and App Storybook, build App and Web, run the API Wrangler dry-run build and API TypeScript check, and run Zerospin's Nx test target. Confirm that a browser import of a Worker entry fails and the API entry resolves. Check for stale source paths and compare moved story IDs against the existing story indexes.
3. Verify RPC at the Worker root and through App development, App static preview, and both Storybook proxies. Exercise a moved Durable Object binding once and check that the upstream request retains `?probe=1`. Verify that icon search loads the catalog on demand, makes no RPC call, and saves the selected icon.
4. The agent verifies an input story, a module preview, and an RPC-backed lookup or spec generation through the local App and Storybook proxies. Include an upload and its asset URL in the smoke check.

## Verification

- Bricks import checks and Bricks and API TypeScript checks passed. The API Wrangler dry-run build and both Storybook builds passed. The Storybook indexes retained all existing story IDs. Zerospin passed all 22 tests.
- App built successfully. Its Material Symbols catalog is a separate chunk outside the initial HTML and service-worker precache. Web built with `--webpack`. The default Turbopack build was blocked while binding a CSS worker socket.
- An isolated Miniflare run of the API build reached the moved Google Places Durable Object at `/` and `/?probe=1` without calling the provider. Direct `/rpc` returned 404, and `searchIcons` was unavailable at the root. App development, static preview, and both Storybook proxy configurations mapped `/rpc?probe=1` to `/?probe=1`.
- Headless Chrome rendered the built Number Input example and Link module preview. The scripted icon picker loaded one catalog chunk on demand, paged results, and selected an icon by keyboard. The Swatch form saved the selection into the Storybook preview state. Both icon checks made zero RPC requests.
- An isolated HTTP batch check applied the configured App development, static preview, and Storybook rewrites, then called the built Worker and moved Durable Object with the query string intact. Isolated authenticated and anonymous uploads returned asset URLs that served the original bytes. Instagram RPC returned working asset URLs with mocked provider responses.
- Live Cap’n Web calls reached the moved Google Places Durable Object through the API root, App development, App static preview, and both Storybooks, with and without `?probe=1`. Direct API `POST /rpc` returned 404. The App was restored to development mode on the same hostname after testing static preview.
- The configured development sign-in opened the App after a QRK service restart refreshed Web's package exports. On a disposable local site, an icon selected in a placed Swatch Brick survived reload. A generated PNG uploaded through signed-in Site Settings, saved, and loaded from its API asset URL after reload. The live Bricks Storybook also selected the star through the scripted picker.

## Remaining work

1. After separate production authorization, carry out the staged rollout in section 3.
