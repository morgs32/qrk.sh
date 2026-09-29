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
- `NEXT_PUBLIC_API_URL` (required Text image upload API URL)

Clerk uses its Next.js integration; nuqs uses its Next App Router adapter. Sign-in and sign-up remain web-owned routes and retain `/replace` as their fallback destination. Web performs signed-out redirects, Studio retains its client guard, and Zerospin retains backend authorization. No server-side Zerospin queries or new authentication rules are introduced.

## Server shell and browser state

`app/layout.tsx` owns the document, global/reset styles, metadata, and preloaded local Silkscreen and Space Mono fonts. `App` holds the client providers. The username layout keeps one session initializer mounted across Studio navigation; `UserLayout` gates only data-dependent content.

The dashboard layout renders the `qrk.sh` header in the initial HTML and reserves a 40 px account slot with a shadcn skeleton. The site layout renders its 64 px navbar with a fixed-height site-name skeleton. Once the browser session is ready, the existing `Wordmark` subscribes to site data and preserves settings draft previews. During initialization, `UserLayout` renders no content below the navbar; session-dependent content appears once the session is ready. Site data, drafts, SQLite, and editing remain browser-owned.

## Routes and transitions

Filesystem routes preserve dashboards, base editors, module catalogs, module details, brick details, breakpoints, page settings, and site settings. Unknown paths render Next's not-found screen. The local error boundary preserves client diagnostics and reload behavior.

The page layout keeps site/page drafts, `MainColumns`, the grid, and the library session above the drawers. One pathless `(drawer)` layout retains the bottom drawer shell across brick catalog, module, placed-brick, page-settings, and site-settings navigation. Its `(bricks)` child layout owns brick breadcrumbs and the close link; settings retain their own Save/Cancel headers. The editor reserves `50dvh` for the drawer on desktop and mobile and keeps its session and grid mounted above it. `Toolbars` reads selected layout segments to choose the route's controls.

On every `(bricks)` and Page Settings route, a breakpoint-only toolbar sits `1.5rem` above the drawer, centered over the complete wall composition. **sm / md / lg / xl** select **360 / 720 / 1080 / 1440px** page previews; widths larger than the available composition are disabled. Below 360px, the page shows its insufficient-width message. Selection survives preview-route navigation in the mounted editor session. Leaving preview routes restores fluid page sizing without replacing the wall; returning to a preview route reuses the selection when it fits. The separate `/breakpoints` route retains its close action.

The page contains one full-width wall and one vertical scroll region. Page Settings retains title/description Save/Cancel, and Site Settings keeps its existing persistence. The selected preview sizes the entire wall; brick previews follow its actual rendered width. There is no article, Compose route, or scrolling-mode setting.

React `ViewTransition` boundaries animate only drawer insertion/removal, sliding from the bottom for 300 ms. Exits use snapshots; rapid navigation may batch updates. Unsupported browsers navigate immediately. Reduced motion disables positional animations, and the transition overlay allows pointer events through. The navbar and persistent editor are not named snapshot participants. Studio's client drawer layout imports `Drawer` from `@qrk.sh/library/Drawer` in flow mode with Motion animation disabled. Library's app imports that same component from its defining source. Each app owns its surrounding grid-row animation; Studio additionally owns its route view transitions. Reduced motion also disables the grid-row transition.

The modules catalog uses `@qrk.sh/library/ModuleFilmstrip`, the same horizontal
filmstrip as Library. Each module column scrolls vertically; previews use the
active breakpoint and shared drag payload. Studio supplies Next links to its
`/modules/[moduleId]` detail routes. The catalog lives at `/modules` under the
page editor, with a **Modules** breadcrumb and the **Add bricks** toolbar action.
The previous catalog URLs are removed without redirects.

## Browser checks

Playwright builds and starts Next on port 3333 by default. The shell checks disable JavaScript to verify initial navbar HTML, deep links, refresh, not-found behavior, styles, and asset MIME types in Chromium, Firefox, and WebKit:

```sh
pnpm nx run @qrk.sh/studio:test:e2e -- tests/shell.playwright.spec.ts
```

For an already running Studio server:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 pnpm nx run @qrk.sh/studio:test:e2e -- tests/shell.playwright.spec.ts
```

Authenticated drawer checks require `PLAYWRIGHT_STORAGE_STATE` pointing to a valid Clerk storage-state file, `PLAYWRIGHT_EDITOR_PATH` pointing to an existing editor, and a working Zerospin backend. Keep session files outside version control. Through web, also set `PLAYWRIGHT_BASE_URL=http://localhost:3000` and `PLAYWRIGHT_EXTERNAL_SERVER=1`. Run `Drawers.playwright.spec.ts` with `--workers=1` when sharing one editor across browser projects. The checks cover shell identity, persistent editor state, history, interrupted navigation, and reduced motion; snapshot exits need not retain outgoing DOM. The module catalog checks require the Library module registry to be available.

The separate React Router/Motion example remains an independent example, not an acceptance gate for Studio's Next navigation.

## Inline Text editing

Double-click a placed Text brick or use **Edit text** to edit it. Opening the editor closes the drawer through the base page route. The local floating toolbar provides headings, lists and nested tasks, marks, links, highlighting, alignment, images, and undo/redo. Block grips reorder document blocks; wall drag/drop/resize is disabled while editing. Click outside the editor and its controls, move focus outside, or press Escape to finish; an open popover consumes Escape first. The native file picker does not finish editing. Catalog and detail previews are read-only.

Each document change stages `updateBrickState` immediately in the page's existing standalone session. There is no throttle or server wall autosave. The session's IndexedDB backup restores local edits after reload; `backupState: ready` confirms durability. Failed staging is reported and the editor retains its document while mounted, retrying on the next edit or editing exit. Server-side wall Save remains future work. Page and Site Settings continue to save through their existing server commands.

Text bricks resize horizontally outside editing; their height follows natural content. Browser measurements round up to whole grid rows, displace overlapping neighbors on growth, and preserve gaps on shrink. Measurement writes pause during wall gestures and resume from the completed layout. Content is shared across breakpoints; placement and measured height are separate per breakpoint. Changing breakpoint finishes editing without recreating the wall session.

## Text images

**Add image** inserts an upload placeholder. Choose or drop one PNG, JPEG, WebP, or SVG up to 5 MiB. Progress, cancellation, and errors use the existing upload implementation. Leaving editing, changing breakpoint, deleting the brick, or leaving the editor cancels pending requests; late completion cannot insert content. Completed image nodes, including size and alignment, persist in the Text brick's content. Images shrink to fit the brick width.

Set `NEXT_PUBLIC_API_URL` to the upload API origin; local development uses `http://127.0.0.1:8787`. Run `pnpm nx run @qrk.sh/api:dev` separately. The existing API Worker verifies the Clerk bearer token using `CLERK_SECRET_KEY` and `CLERK_AUTHORIZED_PARTY`, stores the bytes in its `QRKSH` R2 binding, and returns a URL built from `R2_PUBLIC_BASE_URL`. The configured authorized party and CORS origins must match the browser origin. `/assets` serves local R2 objects through the Worker; production can use the configured public R2 host. Clerk secrets stay on the Worker.

Uploads still write assets to the server immediately. File bytes and upload progress are not part of the local document backup; reloading an unfinished upload restores its empty placeholder. Removing an image does not delete its R2 object. Article documents are not converted, and incompatible existing page storage is reported rather than reset automatically.
