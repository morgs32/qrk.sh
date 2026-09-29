# Dashboard and editor

Studio is a Next.js App Router application. The separate Next.js application in `apps/web` owns marketing and authentication routes.

## Local commands

Run from the repository root:

```sh
pnpm nx run @qrk.sh/studio:dev
pnpm nx run @qrk.sh/studio:build
pnpm nx run @qrk.sh/studio:typecheck
pnpm nx run @qrk.sh/studio:lint
pnpm nx run @qrk.sh/studio:start
pnpm nx run @qrk.sh/studio:storybook
pnpm nx run @qrk.sh/studio:build-storybook
```

Web listens on port 3000 and proxies Studio routes to `APP_ORIGIN` (default `http://localhost:3001`). Studio runs on port 3001. Development and production builds use webpack so the existing native `SharedWorker(new URL(...))` factory retains its identity and bundles its SQLite WASM. Vite is retained only for Storybook.

Studio's Next chunks, fonts, worker, and WASM use `/studio-static/_next/`. Web excludes that namespace from authentication and proxies it to Studio. The existing backup-worker and WASM artifacts remain at `/__zerospin/`. Referenced `/assets/` public files have explicit mappings in Studio's Next configuration; missing files return 404. There is no Vite module or HMR routing.

`build` writes `.next`; `start` runs the Next production server on port 3001 (`PORT` overrides it). Production must run both Next applications and preserve these proxy routes. Deployment is not configured here.

## Environment

Place local values in `apps/studio/.env.local`:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_ZEROSPIN_API_URL`
- `NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY`
- `PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_API_URL` (article upload API; defaults to `http://127.0.0.1:8787`)

Clerk uses its Next.js integration; nuqs uses its Next App Router adapter. Sign-in and sign-up remain web-owned routes and retain `/replace` as their fallback destination. Web performs signed-out redirects, Studio retains its client guard, and Zerospin retains backend authorization. No server-side Zerospin queries or new authentication rules are introduced.

## Server shell and browser state

`app/layout.tsx` owns the document, global/reset styles, metadata, and preloaded local Silkscreen and Space Mono fonts. `App` holds the client providers. The username layout keeps one session initializer mounted across Studio navigation; `UserLayout` gates only data-dependent content.

The dashboard layout renders the `qrk.sh` header in the initial HTML and reserves a 40 px account slot with a shadcn skeleton. The site layout renders its 64 px navbar with a fixed-height site-name skeleton. Once the browser session is ready, the existing `Wordmark` subscribes to site data and preserves settings draft previews. `LoadingWorkspace` stays below the navbar during initialization. Site data, drafts, SQLite, and editing remain browser-owned.

## Routes and transitions

Filesystem routes preserve dashboards, base editors, brick catalogs, group details, brick details, breakpoints, page settings, and site settings. `/compose` and unknown paths render Next's not-found screen. The local error boundary preserves client diagnostics and reload behavior.

The page layout keeps site/page drafts, `MainColumns`, the grid, and the library session above the drawers. Pathless `(left)` and `(bottom)` layouts retain their drawer shells during same-group navigation. `Toolbars` reads selected layout segments to preserve the existing toolbar mapping.

React `ViewTransition` boundaries animate only drawer insertion/removal, sliding left or bottom for 300 ms. Exits use snapshots; rapid navigation may batch updates. Unsupported browsers navigate immediately. Reduced motion disables positional animations, and the transition overlay allows pointer events through. The navbar and persistent editor are not named snapshot participants. Studio disables the shared Drawer's Motion animation; other consumers retain it, as do unrelated component interactions.

## Browser checks

Playwright builds and starts Next on port 3333 by default. The shell checks disable JavaScript to verify initial navbar HTML, deep links, refresh, not-found behavior, styles, and asset MIME types in Chromium, Firefox, and WebKit:

```sh
pnpm nx run @qrk.sh/studio:test:e2e -- tests/shell.playwright.spec.ts
```

For an already running Studio server:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 pnpm nx run @qrk.sh/studio:test:e2e -- tests/shell.playwright.spec.ts
```

Authenticated drawer checks require `PLAYWRIGHT_STORAGE_STATE` pointing to a valid Clerk storage-state file, `PLAYWRIGHT_EDITOR_PATH` pointing to an existing editor, and a working Zerospin backend. Keep session files outside version control. Through web, also set `PLAYWRIGHT_BASE_URL=http://localhost:3000` and `PLAYWRIGHT_EXTERNAL_SERVER=1`. Run `Drawers.playwright.spec.ts` with `--workers=1` when sharing one editor across browser projects. The checks cover shell identity, persistent editor state, history, interrupted navigation, and reduced motion; snapshot exits need not retain outgoing DOM. The older brick group checks require a populated group.

The separate React Router/Motion example remains an independent example, not an acceptance gate for Studio's Next navigation.

## Article images

The article toolbar's **Add image** button inserts an upload placeholder at the cursor in the article body. Choose or drop one PNG, JPEG, WebP, or SVG file, up to 5 MiB. Upload progress is reported by the request; cancel an upload with its close button. On failure, remove the failed file and choose it again. Removing the placeholder or leaving the editor cancels pending uploads.

Set `NEXT_PUBLIC_API_URL` to the upload API origin; local development uses `http://127.0.0.1:8787`. Run `pnpm nx run @qrk.sh/api:dev` separately. The existing API Worker verifies the Clerk bearer token using `CLERK_SECRET_KEY` and `CLERK_AUTHORIZED_PARTY`, stores the bytes in its `QRKSH` R2 binding, and returns a URL built from `R2_PUBLIC_BASE_URL`. The configured authorized party and CORS origins must match the browser origin. `/assets` serves local R2 objects through the Worker; production can use the configured public R2 host. Clerk secrets stay on the Worker.

Completed uploads replace the placeholder with an `image` node. Its `src`, `width`, `containerStyle`, and `wrapperStyle` persist inside `page.article` through `updatePageArticle`. Select an image to resize it or align it left, center, or right. Images remain block elements and shrink to fit narrower article columns. Existing `image` nodes continue to load.

Empty placeholders are autosaved, but file bytes and in-flight upload state are not. Reloading leaves an empty placeholder for another attempt. Removing an image does not delete its R2 object. Captions, wrapping, and free placement are not enabled.
