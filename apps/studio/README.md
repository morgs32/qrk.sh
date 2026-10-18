# Dashboard and editor

Studio is a Next.js App Router application. The separate Next.js application in `apps/web` owns marketing and authentication routes.

## Local commands

Run from the repository root:

```sh
pnpm nx run @qrk.sh/studio:dev
pnpm nx run @qrk.sh/studio:build
pnpm nx run @qrk.sh/studio:start
pnpm nx run @qrk.sh/studio:storybook
pnpm nx run @qrk.sh/studio:build-storybook
```

Storybook's **Studio / CSS Grid Background Generator / Default** shows the
generator body without its branding header. Color and square-width controls
update a local preview and CSS output; **Copy CSS** copies the generated styles.
The story has no session or backend dependencies.

Web listens on port 3000 and proxies Studio routes to `APP_ORIGIN` (default `http://localhost:3001`). Studio runs on port 3001. Development and production builds use Webpack to bundle the framework's connected SharedWorker and its SQLite WASM. Vite is retained only for Storybook.

Studio's Next chunks, fonts, worker, and WASM use `/studio-static/_next/`. Web excludes that namespace from authentication and proxies it to Studio. Referenced `/assets/` public files have explicit mappings in Studio's Next configuration; missing files return 404. There is no Vite module or HMR routing.

Studio resolves the SharedWorker and browser SQLite WASM from installed
`14.0.0` package exports. `userSessionDeclaration` is shared by
`makeAggregateBrowserRelease` and the authored `node.worker.ts` entrypoint.
`makeApplicationSharedWorker` binds that emitted worker artifact to the session.
The Next configuration recognizes the local `applicationWorker.create` method
as a worker entrypoint, compiling its full dependency graph. The method binds
`makeApplicationSharedWorker` so Webpack can also supply the worker type. The worker owns its IndexedDB-backed SQLite namespace;
no separate backup-worker asset is served. Studio compiles the private Library
package's source exports directly; no Library build runs before Studio targets.
It never builds or changes installed Zerospin artifacts. Fresh
checkout installation requires the populated local registry described in the
[root README](../../README.md#zerospin-packages).

Superseded retained command rows require empty backend storage. Preserve the old
directory using the quarantine procedure in the [backend README](../zerospin/README.md)
before starting the current runtime. Existing browser backups remain untouched.

`build` writes `.next`; `start` runs the Next production server on port 3001 (`PORT` overrides it). Vercel hosts Studio at [qrk-studio.vercel.app](https://qrk-studio.vercel.app), with Web forwarding application and asset routes to it. Follow the [local prebuilt deployment procedure](../../README.md#deployment); hosted dependency installation remains unconfigured. The production API and Zerospin backends are deployed as described below.

Keep `.next` between development runs so Webpack can reuse its filesystem cache.
Existing Library stylesheet imports retain their order; `/article-editor.css`
resolves directly to Article's SCSS source.

## Environment

Place local values in `apps/studio/.env.local`:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_ZEROSPIN_API_URL`
- `NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY`
- `PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_API_URL` (Image and Site Settings upload API URL)

Clerk uses its Next.js integration; nuqs uses its Next App Router adapter. Sign-in and sign-up remain web-owned routes and retain `/replace` as their fallback destination. Studio's Clerk provider sets `afterSignOutUrl="/"` as the public homepage destination for completed sign-outs on the current Web origin. Web and Studio use distinct development deployment IDs so Next performs a full document navigation between the two apps, including after sign-out. Web performs signed-out redirects, Studio retains its client guard, and Zerospin retains backend authorization. No server-side Zerospin queries or new authentication rules are introduced.

QRK-owned content fields use `autocomplete="off"` and `data-1p-ignore="true"`
to suppress browser and 1Password autofill suggestions. Shared Input/Textarea
controls enforce these attributes after forwarded props, and QRK-owned forms
disable autocomplete. Clerk login, signup, account, and password flows retain
autofill. Private Meowdown popup fields, including link editing and code-language
search, remain unchanged. These attributes are hints whose behavior depends on
the browser or extension; application-owned place and icon suggestions remain
available.

Studio uses `clerkUserId` directly as the user `aggregateId`, matching the backend's verified Clerk token subject.

Production builds use `NEXT_PUBLIC_ZEROSPIN_API_URL=https://zerospin.qrk.sh`
and a `NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY` matching that Worker's
`ZEROSPIN_PUBLISHABLE_KEY`. Vercel's production variables and the isolated build
environment supply both values; local development settings remain separate.
The backend retains logical system `qrk-sh`, system ID `sys_qrk_sh_1`, and
`CLERK_AUTHORIZED_PARTY=https://qrk.sh`. Its specification is accepted and the
production system is initialized. Production `NEXT_PUBLIC_API_URL` is
`https://api.qrk.sh`, supplying direct uploads and Studio's
`/rpc` rewrite. Web continues forwarding to the stable Studio alias. Local
development API settings remain unchanged.

QRK.SH's Clerk development and production instances have **Sign-up with username** and **Require username** enabled under **User & authentication → Username**, and **Allow users to change their username** disabled under **User model**. The existing web `<SignUp />` collects the required username, including during social sign-up completion; `/replace` then redirects to `/<username>`. Users choose their username once. Clerk owns this username; the setting does not populate QRK's currently null backend username field. Production uses `clerk.qrk.sh`; its DNS/certificates and Google OAuth credentials are configured. Google is published to an External production audience, and both deployed frontends use production Clerk keys. The support email is `me@morganatwork.com`; see the [production authentication setup](../../README.md#production-authentication) for legal links and Google's restricted support-email exception.

`lib/getClerkToken.ts` retrieves tokens through the current Clerk hook getter. It maps `ClerkOfflineError` to a typed `ZerospinError` with code `clerk-offline-error`, preserves other rejections as defects, and returns `null` unchanged for signed-out callers. Session credentials and Image/Site Settings uploads use this helper.

## Server shell and browser state

`app/layout.tsx` owns the document, global/reset styles, metadata, and Library's shared article stylesheet. Studio's global CSS loads Fragment Mono through Library's Google Fonts import and uses it for UI text and controls. The dashboard's `QRK.SH` wordmark matches the homepage: Silkscreen 400 at 18px, loaded through `next/font/google` in `Header`. The article stylesheet owns the system font for article titles and subtitles and Spectral for body text and headings. Studio adds no heading font override. Storybook imports the same global and article styles. `App` holds the client providers. The username layout keeps one session initializer mounted across Studio navigation; `UserLayout` gates only data-dependent content.

`UserApp.Initializer` owns construction and descendant error boundaries. Its `renderError` displays the session error when `session.store.getState().status` is `failed`; live-query failures stop that owning session. `UserSessionWork` scopes one store subscription to the mounted session and displays nonterminal reported failures when `failure` changes by reference. Staging, admission and execution refusals share that notification path; command-result guards still prevent follow-up actions.

The root layout mounts the shared `ZerospinDevtoolsLoader` in development with the panel initially closed. Its lifetime spans route navigation and authentication changes; the loader owns cleanup when the application unmounts.

The dashboard layout renders the fixed 64 px `QRK.SH` header in the initial HTML and reserves a 40 px account slot with a shadcn skeleton. The header is a query container; its inner flex element uses Library's shared `qrk-responsive-insets` class and `--qrk-inset-inline`: 16px gutters become 30px when both the document viewport and header reach 720px. The site editor, including its 64 px navbar, appears only once the browser session is ready; the initial HTML has no site navbar or site-name skeleton. Each breakpoint pane owns the complete navbar inside its browser frame, beneath the address bar and above `BrickWall`. `Grid` makes the existing navbar wrapper a query container. `SiteHeader` uses the same shared responsive gutters when both the document viewport and wrapper reach 720px, preserving its 64px height and chrome offset. The existing `Wordmark` subscribes to site data and preserves settings draft previews. Site data, drafts, SQLite, and editing remain browser-owned.

## Routes and transitions

The dashboard's **Create site** dialog includes Name and Slug. An empty Slug
uses its name-derived lowercase ASCII kebab-case placeholder; accents are
removed and spaces/punctuation become hyphens. If that suggestion is already
used by this user, the first available `-1`, `-2`, etc. suffix is suggested.
Custom slugs are preserved and must use lowercase letters/digits separated by
single internal hyphens. The user's live sites provide inline availability
feedback; the creation contract enforces the same format and ownership-scoped
uniqueness. Another user may use the same slug. Local refusals keep the dialog's
values; later creation failures show a toast. Closing or cancelling resets both
inputs. Creation stages `createSite` followed by `createPage` with `slug: null`
for the site's index page. Page creation requires an explicit string slug or
`null`, with at most one null-slug page per site; Site slugs retain their existing
rules. Staging, admission and execution refusals for either creation command show a toast.
The dashboard opens the null-slug page when present, otherwise its existing
first-page fallback. Existing `"home"` rows retain their string slug; no backfill
or storage reset is performed. Folders and published pathname resolution remain
outside this change.

Filesystem routes preserve dashboards, base editors, module catalogs, module details, brick details, breakpoints, page settings, and site settings. Unknown paths render Next's not-found screen. The local error boundary preserves client diagnostics and reload behavior.

The brick-detail route keeps its brick selected in the active wall, with the existing outline and resize handles visible while focus or the pointer moves into the drawer. A successful catalog drop activates the new brick and opens its detail drawer for editing. Selection follows the route across refresh and breakpoint changes, and clears when leaving brick detail.

The page layout keeps site/page drafts, `MainColumns`, the grid, and the library session mounted. `EditorLayout` also owns the persistent bottom drawer shell. Next's `useSelectedLayoutSegments()` supplies its `open` state through membership in the pathless `(drawer)` group. The common drawer layout renders `DrawerHeader`, which owns catalog breadcrumbs, the brick-detail heading **Update your {collectionName} brick**, the left-side underlined **← New brick** catalog link and **/** separator, publication actions, and Close or settings Save/Cancel. `Toolbars` reads selected layout segments to choose the route's controls.

The drawer overlays the bottom `50dvh` on desktop and mobile. The editor stays full-height; a trailing element adds the same amount of real padding without changing the wall's minimum height. On opening, closing, and reserved-height changes, scrollable editors within 1px of the bottom follow the new bottom; other offsets are preserved and clamped. Initial deep links do not force a bottom scroll. Padding and scroll corrections are immediate, and later content growth does not trigger bottom following.

On every `(bricks)` route, a breakpoint-only toolbar sits `1.5rem` above the drawer, centered over the complete wall composition. **sm / md / lg / xl** select **360 / 720 / 1080 / 1440px** fixed-width walls; widths larger than the available composition are disabled. The four walls stay mounted around one editor session on every editor route. Page Settings displays no breakpoint toolbar. The separate `/breakpoints` route retains its close action. Selection survives drawer navigation and returns when it fits again; otherwise the largest fitting wall is displayed. Catalog drags and wall drag/resize gestures defer the displayed change until completion. Below 360px, the insufficient-width message appears after any active gesture ends and a fitting wall returns immediately when space recovers.

The page contains one full-width scroll region and four centered fixed-width walls. Page Settings retains title/description Save/Cancel, and Site Settings keeps its existing persistence. Brick previews follow the active wall width. There is no article, Compose route, or scrolling-mode setting.

The shared `WallBreakpointPane` adds a 48px muted-gray browser header and thin
inset frame. sm/md show a Safari-like mobile address pill; lg/xl show desktop
window dots and a centered address bar. Both display static `qrk.sh` and remain
noninteractive and hidden from assistive technology. Chrome slides and scrolls
with the wall, including scroll compensation while dragging, preserves its
exact 360/720/1080/1440px content width, and allows resize handles and dragged
surfaces to overflow into surrounding gutters. Brick content stays clipped by
its own wrapper. Editor boundaries still clip overflow at exact-fit widths;
breakpoint fitting reserves no extra gutters. The 64px site navbar slides and scrolls with the
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

The common drawer layout renders one `DrawerHeader` for brick browsing/editing
and Page/Site Settings. Settings Save/Cancel keep their opening baselines and
discard behavior. Publication status comes from live models rather than settings
draft stores.

**Publish Site** appears immediately before the page action and Close/Cancel
while the site is unpublished. Its modal reuses `SiteTree` with checkboxes,
preselecting previously published pages and locking the index page at `/`.
One command publishes the checked set and enables the site. Unchecked pages keep
their previous snapshots but become unpublished.

Within a published site, an unpublished page offers **Publish Page**. A published
page offers **Publish Updates** only when its saved metadata, bricks, or layouts
differ from its current snapshot. Unsaved forms still require Save. Every page
publication retains a new historical snapshot. **Unpublish Site** belongs only
in Site Settings and preserves page flags/history. Site Settings changes remain
immediate on Save. Staging is optimistic; immediate and later originating-command
failures show their actual errors without a premature server-success message.
Public website rendering and history browsing/restoration are deferred.

The modules catalog uses `@qrk.sh/library/ModuleFilmstrip`, the same horizontal
filmstrip as Library. Each module column scrolls vertically beneath its full-width
sticky heading; previews use the active breakpoint and shared drag payload.
Studio supplies Next links to its
`/modules/[moduleId]` detail routes. The catalog lives at `/modules` under the
page editor, with a **Drag a brick onto your page** breadcrumb and the **Add bricks** toolbar action.
The previous catalog URLs are removed without redirects.

Module definitions own per-page brick limits: Article allows one and Instagram
allows two. Catalog and module detail previews show the maximum and disable new
drags when reached. Counts use all bricks on the page's wall, including hidden
and unconfigured bricks, independently of the active breakpoint. Removing a
brick frees capacity; the shared `addBrick` guard also rejects excess additions.

## Verification

Repository tests and standalone automated checks are deferred until a test
structure is agreed (see root `AGENTS.md`). Storybook and the running app remain
available for manual review.

## Article editing in the detail drawer

Studio routes brick activation to the detail drawer and renders the selected Library module's `Form` without an enclosing form. All ten registered bricks expose a form: Image, Article, GitHub Profile, GitHub Repo, GitHub Activity, Figma Thumbnail, Instagram, Link, Map Place, and Swatch and Icon. The shared contract supplies decoded `state` or `null`, initialized session and brick identity, synchronous `onSave(state): IResult`, and `onCancel(): void`. Unconfigured provider bricks receive genuine `null` and show blank source inputs. Image provides a dropzone and file picker above its Image URL and Title fields. Article uses Meowdown in Hybrid mode with native shortcuts, slash/link controls, and block handles in the existing centered writing column; it has no formatting toolbar or mode switcher. Studio still suppresses the shared **Edit article** wall action and has no brick visibility control. Article state has separate required title/subtitle strings and nullable Markdown content; generated ArticleBrick specs bind all three fields. This hard cutover adds no JSON conversion or compatibility reader. Catalog previews use Meowdown's read-only MarkdownView without an editor.

Modules own unsaved drafts and validation. Provider forms stage their module's configuration command synchronously and render resolution status/error from the brick query. The user-session owner composes module-owned local executors, which call the existing same-origin API and stage revision-guarded completions. Closing an editor discards its draft while accepted work continues for the session lifetime; session replacement ignores late results. No server durability guarantee is added. Ordinary Article/Image/Swatch saves preserve the actual local staging result, clear drafts only on success, and render optimism/rollback through the query. Article remounts its editor on Cancel; its portaled link form does not submit the Article form. Page and Site Settings retain their existing commands.

The detail drawer provides one centered column around the module-owned form and Save/Cancel.
Image uses stacked shadcn inputs that fill that column; its actions sit below
the fields at the same left edge and wrap when needed.

Each Page references its own Library wall, created atomically by `createPage` with ID `prefixId(libraryModule.models.wall, pageId)`. The grid and brick drawer scope queries to that wall. `ZerospinUserProvider` owns session initialization and disposal. Its inner Suspense boundary encloses every session reader so the initializer can commit and start while readers wait; `UserLayout` also gates editor content. Changing pages does not dispose the user session.

This is a fresh-content cutover: legacy grid/brick rows and old Article JSON are
not migrated. Back up local backend storage before starting current declarations;
use a fresh local browser origin while preserving existing origin databases and
Clerk cookies. Installed Zerospin browser runtimes can reset incompatible node
tables during initialization, so do not reopen rebuilt apps on preserved origins.

Article bricks use normal grid resizing and keep their saved height regardless of
content, image loads, or width changes. Their module-owned white shell fills the
placement and clips overflowing content. Content remains shared across breakpoints;
placement sizes remain separate per breakpoint.

Provider forms edit sources rather than fetched metadata. Link retains submitted input separately from the resolved URL. Map Place stages a chosen suggestion ID while autocomplete remains transient. Swatch and Icon saves the selected search result's SVG and hex color with no additional lookup. Figma measures ready content at all four breakpoints and writes dimensions only when captured state/spec revisions still match.

## Image uploads

Drop or choose one nonempty PNG, JPEG, WebP, or SVG up to 5 MiB in the Image drawer. Upload starts immediately and updates only the module-owned draft Image URL on success; Save persists the brick state. Image retains file validation, picker/drop behavior, drafts, pending/error feedback, Save gating, and cancellation. Fields and Save are disabled during upload; Cancel stays available, restores saved state, and aborts unfinished requests. Switching bricks or leaving the drawer also aborts pending uploads and ignores late results. Breakpoint switches retain the draft and its upload.

`EditorLayout` supplies `ImageUploadEnvironment.upload(file): Effect.Effect<string, Error>` through the existing Layer, session runner, and `ImageUploadRuntimeContext`. Studio owns the HTTP request: each invocation retrieves fresh Clerk credentials through `getClerkToken`, sends multipart file and current site ID to `/upload`, and decodes the untrusted success/error response before returning the image URL. A signed-out result fails visibly. Effect interruption reaches `fetch` through its AbortSignal. Image passes only its validated file and receives the URL, without knowing the endpoint, site ID, authorization header, multipart protocol, or response shape. The shared form contract carries no Image-specific upload props.

Set `NEXT_PUBLIC_API_URL` to the unified API Worker origin; production uses `https://api.qrk.sh`, and local development uses `http://127.0.0.1:8787`. Run `pnpm nx run @qrk.sh/api:dev` separately for local development. The API Worker verifies the Clerk bearer token using `CLERK_SECRET_KEY` and `CLERK_AUTHORIZED_PARTY`, stores the bytes in its `QRKSH` R2 binding, and returns a URL built from `R2_PUBLIC_BASE_URL`. The configured authorized party and CORS origins must match the browser origin; production uses `https://qrk.sh`. Production upload URLs use `https://api.qrk.sh/assets`; `/assets/library/*` uses its `ASSETS` bucket. No public R2 bucket hostname is required. Clerk secrets stay on the Worker.

Uploads write assets to R2 immediately. Cancel after an upload completes, or removing an image, does not delete the R2 object. File bytes and upload status are not part of the local brick backup. Article uploads remain disabled because its editor has no file-persistence handler; HTTP(S) Markdown images render and native resizing saves dimensions in Markdown comments. Automatic YouTube/X embeds and provider requests are disabled. Article documents are not converted; preserve old browser stores before the approved fresh-origin cutover.
