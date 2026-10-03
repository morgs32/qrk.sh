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
- `NEXT_PUBLIC_API_URL` (required Article image upload API URL)

Clerk uses its Next.js integration; nuqs uses its Next App Router adapter. Sign-in and sign-up remain web-owned routes and retain `/replace` as their fallback destination. Web performs signed-out redirects, Studio retains its client guard, and Zerospin retains backend authorization. No server-side Zerospin queries or new authentication rules are introduced.

## Server shell and browser state

`app/layout.tsx` owns the document, global/reset styles, metadata, and preloaded local Silkscreen and Space Mono fonts. `App` holds the client providers. The username layout keeps one session initializer mounted across Studio navigation; `UserLayout` gates only data-dependent content.

The dashboard layout renders the `qrk.sh` header in the initial HTML and reserves a 40 px account slot with a shadcn skeleton. The site layout renders its 64 px navbar with a fixed-height site-name skeleton. Once the browser session is ready, the existing `Wordmark` subscribes to site data and preserves settings draft previews. During initialization, `UserLayout` renders no content below the navbar; session-dependent content appears once the session is ready. Site data, drafts, SQLite, and editing remain browser-owned.

## Routes and transitions

Filesystem routes preserve dashboards, base editors, module catalogs, module details, brick details, breakpoints, page settings, and site settings. Unknown paths render Next's not-found screen. The local error boundary preserves client diagnostics and reload behavior.

The page layout keeps site/page drafts, `MainColumns`, the grid, and the library session mounted. `EditorLayout` also owns the persistent bottom drawer shell. Next's `useSelectedLayoutSegments()` supplies its `open` state through membership in the pathless `(drawer)` group. Its `(bricks)` child layout owns brick breadcrumbs and the close link; settings retain their own Save/Cancel headers. `Toolbars` reads selected layout segments to choose the route's controls.

The drawer overlays the bottom `50dvh` on desktop and mobile. The editor stays full-height; a trailing element adds the same amount of real padding without changing the wall's minimum height. On opening, closing, and reserved-height changes, scrollable editors within 1px of the bottom follow the new bottom; other offsets are preserved and clamped. Initial deep links do not force a bottom scroll. Padding and scroll corrections are immediate, and later content growth does not trigger bottom following.

On every `(bricks)` route, a breakpoint-only toolbar sits `1.5rem` above the drawer, centered over the complete wall composition. **sm / md / lg / xl** select **360 / 720 / 1080 / 1440px** fixed-width walls; widths larger than the available composition are disabled. The four walls stay mounted around one editor session on every editor route. Page Settings displays no breakpoint toolbar. The separate `/breakpoints` route retains its close action. Selection survives drawer navigation and returns when it fits again; otherwise the largest fitting wall is displayed. Catalog drags and wall drag/resize gestures defer the displayed change until completion. Below 360px, the insufficient-width message appears after any active gesture ends and a fitting wall returns immediately when space recovers.

The page contains one full-width scroll region and four centered fixed-width walls. Page Settings retains title/description Save/Cancel, and Site Settings keeps its existing persistence. Brick previews follow the active wall width. There is no article, Compose route, or scrolling-mode setting.

The shared `WallBreakpointPane` adds a 48px muted-gray browser header and thin
inset frame. sm/md show a Safari-like mobile address pill; lg/xl show desktop
window dots and a centered address bar. Both display static `qrk.sh` and remain
noninteractive and hidden from assistive technology. Chrome slides and scrolls
with the wall, including scroll compensation while dragging, preserves its
exact 360/720/1080/1440px content width, and allows
drags beyond the frame. The scroll root sets `--wall-top-offset: 4rem` to match
Studio's 64px site header; the pane sets `--wall-chrome-height: 3rem`.
`BrickWall` subtracts both inherited offsets from its viewport minimum height,
with 3.5rem and zero fallbacks respectively, so an empty wall adds no scrolling
and drawer scroll anchoring is preserved.

Studio imports the shared `Drawer` from `@qrk.sh/library/Drawer` and passes `open`. Its shell slides with a 300ms CSS transform; editor height and padding do not animate. The route-level React `ViewTransition` preserves only outgoing content for exit, with matching translation and easing. Opening and navigation between drawer routes have no snapshot entrance. Browsers without native View Transitions close immediately. Reduced motion skips positional animation. Closed drawers are inert, hidden from assistive technology, and release their content after exit; focus returns to the opener when it is still appropriate. The transition overlay allows pointer events through. This supersedes plan 007's animated grid-row reservation and snapshot entrance; its unrelated verification items remain separate.

The modules catalog uses `@qrk.sh/library/ModuleFilmstrip`, the same horizontal
filmstrip as Library. Each module column scrolls vertically; previews use the
active breakpoint and shared drag payload. Studio supplies Next links to its
`/modules/[moduleId]` detail routes. The catalog lives at `/modules` under the
page editor, with a **Bricks** breadcrumb and the **Add bricks** toolbar action.
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

## Inline Article editing

Studio currently routes brick activation to the read-only detail drawer and suppresses the shared **Edit article** action. Article state has separate required title and subtitle strings and a Tiptap body; generated ArticleBrick specs bind all three fields. This hard schema change does not migrate existing content-only articles. The shared Library drawer editor uses a flat toolbar and centered writing column, supports block reordering, and saves local drafts explicitly, but Studio does not currently expose its editing entry point or a brick visibility control. Catalog and detail previews are read-only.

Library drawer edits remain local until Save stages `updateBrickState`; failed saves retain the draft and show an error. Studio currently exposes Article previews only. Studio wall, brick, and placement commands use the authenticated `userSession` and its existing live push and synchronization lifecycle. Page and Site Settings continue to save through their existing commands.

Each Page references its own Library wall, created atomically by `createPage` with ID `prefixId(libraryModule.models.wall, pageId)`. The grid and brick drawer scope queries to that wall. `ZerospinUserProvider` owns session initialization and disposal, and `UserLayout` waits for initialization before mounting the editor. Changing pages does not dispose the user session.

This is a fresh-content cutover: legacy grid/brick rows and standalone Studio backups are not migrated. Old standalone backups remain untouched. Incompatible development backend and live-session storage must be reset separately; no automatic reset or lazy wall creation is performed.

Article bricks use normal grid resizing and keep their saved height regardless of
content, image loads, or width changes. Their module-owned white shell fills the
placement and clips overflowing content. Content remains shared across breakpoints;
placement sizes remain separate per breakpoint.

## Article images

**Add image** inserts an upload placeholder. Choose or drop one PNG, JPEG, WebP, or SVG up to 5 MiB. Progress, cancellation, and errors use the existing upload implementation. Leaving editing, changing breakpoint, deleting the brick, or leaving the editor cancels pending requests; late completion cannot insert content. Completed image nodes, including size and alignment, persist in the Article brick's content. Images shrink to fit the brick width.

Set `NEXT_PUBLIC_API_URL` to the unified `api` Worker origin; local development uses `http://127.0.0.1:8787`. Run `pnpm nx run @qrk.sh/api:dev` separately. The API Worker verifies the Clerk bearer token using `CLERK_SECRET_KEY` and `CLERK_AUTHORIZED_PARTY`, stores the bytes in its `QRKSH` R2 binding, and returns a URL built from `R2_PUBLIC_BASE_URL`. The configured authorized party and CORS origins must match the browser origin. `/assets` serves local R2 objects through the Worker; `/assets/library/*` uses the retained Library `ASSETS` bucket. Production can use the configured public R2 host. Clerk secrets stay on the Worker.

Uploads still write assets to the server immediately. File bytes and upload progress are not part of the local document backup; reloading an unfinished upload restores its empty placeholder. Removing an image does not delete its R2 object. Article documents are not converted, and incompatible existing page storage is reported rather than reset automatically.
