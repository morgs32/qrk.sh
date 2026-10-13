# Dashboard and editor

Studio is a Next.js App Router application. The separate Next.js application in `apps/web` owns marketing and authentication routes.

## Local commands

Run from the repository root:

```sh
pnpm nx run @qrk.sh/studio:dev
pnpm nx run @qrk.sh/studio:build
pnpm nx run @qrk.sh/studio:ts
pnpm nx run @qrk.sh/studio:lint
pnpm nx run @qrk.sh/studio:start
pnpm nx run @qrk.sh/studio:storybook
pnpm nx run @qrk.sh/studio:build-storybook
```

Web listens on port 3000 and proxies Studio routes to `APP_ORIGIN` (default `http://localhost:3001`). Studio runs on port 3001. Development and production builds use webpack so the existing native `SharedWorker(new URL(...))` factory retains its identity and bundles its SQLite WASM. Vite is retained only for Storybook.

Studio's Next chunks, fonts, worker, and WASM use `/studio-static/_next/`. Web excludes that namespace from authentication and proxies it to Studio. Referenced `/assets/` public files have explicit mappings in Studio's Next configuration; missing files return 404. There is no Vite module or HMR routing.

Studio resolves the SharedWorker and browser SQLite WASM from installed
`5.0.1` package exports. The worker owns its IndexedDB-backed SQLite namespace;
no separate backup-worker asset is served. Its Nx builds and checks build QRK's reusable
Library first; they never build or change installed Zerospin artifacts. Fresh
checkout installation requires the populated local registry described in the
[root README](../../README.md#zerospin-packages).

Superseded retained command rows require empty backend storage. Preserve the old
directory using the quarantine procedure in the [backend README](../zerospin/README.md)
before starting the current runtime. Existing browser backups remain untouched.

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

`app/layout.tsx` owns the document, global/reset styles, metadata, and Library's shared article stylesheet. Studio's global CSS loads Fragment Mono through Library's Google Fonts import and uses it for UI text, controls, and the dashboard wordmark. The article stylesheet owns the system font for article titles and subtitles and Spectral for body text and headings. Studio adds no heading font override. Storybook imports the same global and article styles. `App` holds the client providers. The username layout keeps one session initializer mounted across Studio navigation; `UserLayout` gates only data-dependent content.

The root layout mounts the shared `ZerospinDevtoolsLoader` in development with the panel initially closed. Its lifetime spans route navigation and authentication changes; the loader owns cleanup when the application unmounts.

The dashboard layout renders the fixed 64 px `qrk.sh` header in the initial HTML and reserves a 40 px account slot with a shadcn skeleton. The header is a query container; its inner flex element uses Library's shared `qrk-responsive-insets` class and `--qrk-inset-inline`: 16px gutters become 30px when both the document viewport and header reach 720px. The site editor, including its 64 px navbar, appears only once the browser session is ready; the initial HTML has no site navbar or site-name skeleton. Each breakpoint pane owns the complete navbar inside its browser frame, beneath the address bar and above `BrickWall`. `Grid` makes the existing navbar wrapper a query container. `SiteHeader` uses the same shared responsive gutters when both the document viewport and wrapper reach 720px, preserving its 64px height and chrome offset. The existing `Wordmark` subscribes to site data and preserves settings draft previews. Site data, drafts, SQLite, and editing remain browser-owned.

## Routes and transitions

Filesystem routes preserve dashboards, base editors, module catalogs, module details, brick details, breakpoints, page settings, and site settings. Unknown paths render Next's not-found screen. The local error boundary preserves client diagnostics and reload behavior.

The brick-detail route keeps its brick selected in the active wall, with the existing outline and resize handles visible while focus or the pointer moves into the drawer. A successful catalog drop activates the new brick and opens its detail drawer for editing. Selection follows the route across refresh and breakpoint changes, and clears when leaving brick detail.

The page layout keeps site/page drafts, `MainColumns`, the grid, and the library session mounted. `EditorLayout` also owns the persistent bottom drawer shell. Next's `useSelectedLayoutSegments()` supplies its `open` state through membership in the pathless `(drawer)` group. Its `(bricks)` child layout owns catalog breadcrumbs, the brick-detail heading **Update your {collectionName} brick**, a left-side underlined **← New brick** link returning to the catalog with a **/** separator before the heading, and the close link; settings retain their own Save/Cancel headers. `Toolbars` reads selected layout segments to choose the route's controls.

The drawer overlays the bottom `50dvh` on desktop and mobile. The editor stays full-height; a trailing element adds the same amount of real padding without changing the wall's minimum height. On opening, closing, and reserved-height changes, scrollable editors within 1px of the bottom follow the new bottom; other offsets are preserved and clamped. Initial deep links do not force a bottom scroll. Padding and scroll corrections are immediate, and later content growth does not trigger bottom following.

On every `(bricks)` route, a breakpoint-only toolbar sits `1.5rem` above the drawer, centered over the complete wall composition. **sm / md / lg / xl** select **360 / 720 / 1080 / 1440px** fixed-width walls; widths larger than the available composition are disabled. The four walls stay mounted around one editor session on every editor route. Page Settings displays no breakpoint toolbar. The separate `/breakpoints` route retains its close action. Selection survives drawer navigation and returns when it fits again; otherwise the largest fitting wall is displayed. Catalog drags and wall drag/resize gestures defer the displayed change until completion. Below 360px, the insufficient-width message appears after any active gesture ends and a fitting wall returns immediately when space recovers.

The page contains one full-width scroll region and four centered fixed-width walls. Page Settings retains title/description Save/Cancel, and Site Settings keeps its existing persistence. Brick previews follow the active wall width. There is no article, Compose route, or scrolling-mode setting.

The shared `WallBreakpointPane` adds a 48px muted-gray browser header and thin
inset frame. sm/md show a Safari-like mobile address pill; lg/xl show desktop
window dots and a centered address bar. Both display static `qrk.sh` and remain
noninteractive and hidden from assistive technology. Chrome slides and scrolls
with the wall, including scroll compensation while dragging, preserves its
exact 360/720/1080/1440px content width, and clips horizontal hover and drag
overflow while leaving vertical overflow visible. Drag gestures can still
continue beyond the frame. The 64px site navbar slides and scrolls with the
frame, including drag-scroll compensation. Inactive panes keep their navbar
copies hidden or inert with the rest of the pane. The scroll root adds 32px
above the frame and 86px below it, leaving 24px between the frame and the 38px
toolbar, matching the toolbar's 24px bottom gap. It sets
`--wall-top-offset: calc(7.25rem + 2px)` to account for the combined padding;
Studio overrides the pane's default
`--wall-chrome-height: 3rem` to `7rem` around the navbar and wall, accounting for
the 48px browser bar and 64px navbar.
`BrickWall` subtracts both inherited offsets from its viewport minimum height,
with 3.5rem and zero fallbacks respectively, so an empty wall adds no scrolling
and drawer scroll anchoring is preserved.

Studio imports the shared `Drawer` from `@qrk.sh/library/Drawer` and passes `open`. Its shell slides with a 300ms CSS transform; editor height and padding do not animate. The route-level React `ViewTransition` preserves only outgoing content for exit, with matching translation and easing. Opening and navigation between drawer routes have no snapshot entrance. Browsers without native View Transitions close immediately. Reduced motion skips positional animation. Closed drawers are inert, hidden from assistive technology, and release their content after exit; focus returns to the opener when it is still appropriate. The transition overlay allows pointer events through. This supersedes plan 007's animated grid-row reservation and snapshot entrance; its unrelated verification items remain separate.

The modules catalog uses `@qrk.sh/library/ModuleFilmstrip`, the same horizontal
filmstrip as Library. Each module column scrolls vertically beneath its full-width
sticky heading; previews use the active breakpoint and shared drag payload.
Studio supplies Next links to its
`/modules/[moduleId]` detail routes. The catalog lives at `/modules` under the
page editor, with a **Drag a brick onto your page** breadcrumb and the **Add bricks** toolbar action.
The previous catalog URLs are removed without redirects.

## Browser checks

Playwright builds and starts Next on port 3333 by default. The shell checks disable JavaScript to verify the initial dashboard navbar, the absence of the session-dependent site navbar, deep links, refresh, not-found behavior, styles, and asset MIME types in Chromium, Firefox, and WebKit:

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

Studio routes brick activation to the detail drawer and renders the selected Library module's `Form` when available. Image provides Image URL and Title fields; Article provides its shared editor with a flat toolbar, centered writing column, and block reordering. Unconfigured bricks initialize their form from the module's default state. Modules without a Form retain their read-only detail preview. Studio still suppresses the shared **Edit article** wall action and has no brick visibility control. Article state has separate required title and subtitle strings and a Tiptap body; generated ArticleBrick specs bind all three fields. This hard schema change does not migrate existing content-only articles. Catalog previews remain read-only.

Form edits remain local until Save stages `updateBrick` through Studio's authenticated `UserApp` initialized session and its live push and synchronization lifecycle. Failed staging retains the draft and shows an error; Cancel restores the committed state. Closing or changing the selected brick discards unsaved edits, while breakpoint switches retain the draft. Page and Site Settings continue to save through their existing commands.

The detail form owns one centered column around module fields and Save/Cancel.
Image uses stacked shadcn inputs that fill that column; its actions sit below
the fields at the same left edge and wrap when needed.

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
