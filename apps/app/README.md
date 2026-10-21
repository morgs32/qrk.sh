# App

App uses TanStack Start `1.169.3` and TanStack Router `1.170.45` in SPA mode,
with Vite Plus `1.0.0`. The separate Next.js application in `apps/web` owns
marketing and authentication routes.

## Local commands

Run from the repository root:

```sh
pnpm dev
```

Open [app.qrk.localhost](https://app.qrk.localhost/); sign-in and sign-up
take place on [Web](https://qrk.localhost/). Root Portless startup runs all four
apps, registers their HTTPS hostnames, and removes their routes when the
processes stop. Production App targets `https://app.qrk.sh`. See the
[root startup instructions](../../README.md#getting-started)
for the shared wildcard proxy and service URLs.

To start only App through Portless:

```sh
pnpm --dir apps/app dev
```

Its `dev` script invokes Portless, which runs `vp dev` in `dev:app`.
Package metadata retains its hostname; Portless allocates an unused internal
port and passes it through `PORT`. Direct startup defaults to 10001. This does not start
Web, API, or Zerospin; root `pnpm dev` starts the full stack.

Other Nx targets remain available:

```sh
pnpm nx run @qrk.sh/app:build
pnpm nx run @qrk.sh/app:preview
pnpm nx run @qrk.sh/app:storybook
pnpm nx run @qrk.sh/app:build-storybook
```

Storybook's **App / CSS Grid Background Generator / Default** shows the
generator body without its branding header. Color and square-width controls
update a local preview and CSS output; **Copy CSS** copies the generated styles.
The story has no session or backend dependencies. App Storybook defaults to
port 10020; `PORT` overrides it.

**App / Studio / Wall Editor / Default** mounts the production wall editor and
Brick form with a real in-memory mock session. It uses `MockInitializer`, the same
`UserUI` context, queries, and commands as App. Complete resources seed the
User/Site/Page ownership graph and four breakpoint layouts. Storybook provides
memory routing and viewport context; it needs no Clerk credentials, API connection,
or SharedWorker. Add, move, edit and delete use production behavior rather than
fixture-array mutations. Width selects the active breakpoint; row-height affects
presentation only. Empty Wall and Zoomed Out scenarios use the same editor.
Zoom/pan gestures remain disabled in the 50% presentation study.

Module development playgrounds live in App Storybook under `modules/`. They
reuse production module forms/renderers and show metadata, local configuration,
live Generate spec/input, Component/JsonRender comparisons at all four widths,
and Brick Definition JSON. App owns the UI source; Zerospin owns shared definitions and schemas.
The Library package is removed. See [Modules](./modules/README.md).

App and Web run independently behind their own Portless hostnames. Direct
startup defaults to 10001 for App and 10000 for Web; Portless allocates their
proxied ports. `vite.config.ts` configures Start's SPA mode,
application bundling, and development proxies. Storybook uses an independent
Vite configuration without the Start server plugin.

Vite uses its default `/` base for application routes and assets. Development
modules, chunks, fonts, workers, WASM, and HMR all use App's origin. There is
no Web-to-App proxy, static prefix, query-flag repair, or special HMR host.
Start uses its default root SPA shell and writes `index.html`. The `/` route's
`beforeLoad` replaces the browser document with Web's `/replace` URL for account
routing before an index component needs to render.
Installed Zerospin packages use `ssr.noExternal` so Vite resolves
their extensionless ESM imports. Referenced `/assets/` public files retain
explicit legacy mappings.

App resolves the SharedWorker and browser SQLite WASM from installed
`24.0.1` package exports. `userSessionDefinition` is shared by
`Initializer` and the authored `node.worker.ts` entrypoint.
It owns the complete revision `1` declaration with explicit canonical model and
public contract imports. The worker imports that single defining module.
`makeApplicationSharedWorker` binds that emitted worker artifact to the session.
The host imports `node.worker.ts` through Vite's `?sharedworker&url` query;
the worker imports `@zerospin/browser/sqlite.wasm?url`. Vite emits both assets
from the installed package and application source. The worker owns its IndexedDB-backed SQLite namespace;
no separate backup-worker asset is served. App compiles shared module definitions directly from Zerospin source.
It never builds or changes installed Zerospin artifacts. Fresh
checkout installation requires the populated local registry described in the
[root README](../../README.md#zerospin-packages).

The historical phase-1 cutover removed grid contracts against fresh local content.
That separately approved one-time cutover deleted the local `sys_qrk_sh_1` backend store and only the
matching App `qrk-sh` / `user` / `userSession` node databases and discovery records,
without backups. Library's then-active standalone database was reset separately;
authentication, cookies, localStorage preferences, unrelated databases, uploads,
and deployed storage remain outside that deletion. This does not authorize future resets.

[Plan 031](../../wiki/archive/plans/031-plan-component-jsonrender-previews.md) removes preview
sizing and persisted measurements. Its separately approved local discard covers
the affected Library/App browser databases and local `sys_qrk_sh_1` backend store,
with no backup, migration, or authored namespace change. The implementation is
complete. Chrome Library/App data and local backend storage were reset; the backend
accepted the system spec and App initialized with the existing authenticated user.
At that cutover, an old SharedWorker initially blocked the in-app browser Library
reset. After the desktop app was restarted, the exact legacy database was already
absent; an explicit deletion completed successfully, and Library reopened its
current 19.0.0 partition without deleting it or the unrelated debug database.
The 19.0.0 cleanup adoption preserves storage and did not require that legacy
deletion. Library generation passed after an API-only restart with
the refreshed credential: JsonRender and generated JSON changed while authored
markup stayed unchanged. Connected browser identity includes the exact session
lock; at that historical cutover, matching local nodes and their discovery
entries were explicitly deleted. Earlier origins, unrelated identities,
authentication, preferences, uploads, and production storage were preserved.

The current [Plan 036](../../wiki/archive/plans/036-plan-wall-tree-editor.md) cutover uses the approved backend backup procedure instead:
move only the affected `dev-worker/sys_qrk_sh_1` directory aside before restarting
matching current declarations. Changed App session locks open new partitions;
previous App/Library partitions, authentication, preferences, uploads, unrelated
stores, and production data remain preserved. Retirement does not itself delete
the old standalone Library browser databases.

`build` writes static output to `dist/client`, with `index.html` as the SPA
shell. `preview` serves that output on port 10010 (`PORT` overrides it) using
`vite.preview.config.ts`, without the Start server plugin. It replaces the old
`start` target. The static Vercel configuration resolves terminal asset
mappings and RPC forwarding before filesystem lookup and the SPA deep-link
fallback. Preview keeps the legacy public asset aliases and checks `/assets/`
files before bypassing to its static server, returning 404 when they are absent.
Vercel's existing App project is
[qrk-studio.vercel.app](https://qrk-studio.vercel.app); the standalone rollout
must attach `app.qrk.sh` to that project. See the [local prebuilt deployment
procedure](../../README.md#deployment); hosted dependency installation remains
unconfigured. Deployment is outside the framework migration.

Existing module stylesheet imports retain their order; `/article-editor.css`
resolves directly to Article's plain CSS source. App globals and the shared
Article stylesheet declare `@layer theme, base, components, meowdown, utilities`
before their imports, matching the module styles. Tailwind Preflight precedes Meowdown's
native rules, including its list marker gutter; utilities retain the final named
layer.

## Environment

Place local values in `apps/app/.env.local`:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_ZEROSPIN_API_URL`
- `NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY`
- `PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_API_URL` (Image and Site Settings upload API URL)
- `NEXT_PUBLIC_WEB_ORIGIN` (optional; defaults to `https://qrk.localhost` in development and `https://qrk.sh` in production)

Vite explicitly defines these public names for browser code; their names do
not change to `VITE_*`. Other environment values are not exposed by prefix.

`APP_WORKER_ORIGIN` is an optional server-only override for the development
and static-preview RPC proxy. It defaults to `http://127.0.0.1:8787`, keeping
Node's local proxy requests separate from the browser's HTTPS
`NEXT_PUBLIC_API_URL`. This avoids requiring Node to trust Portless's local
TLS certificate and does not disable certificate verification.

For Portless development, set
`NEXT_PUBLIC_API_URL=https://api.qrk.localhost` and
`NEXT_PUBLIC_ZEROSPIN_API_URL=https://zerospin.qrk.localhost`. Worker
authorized parties use `https://app.qrk.localhost`, where App obtains its
session token; Web still owns the sign-in UI.

Clerk uses `@clerk/react@6.17.8`, including its `ClerkOfflineError` export.
The unused nuqs provider and dependency are removed. Sign-in and sign-up remain
Web-owned routes and retain `/replace` as their fallback destination. Completed
sign-outs return to `/` on the configured Web origin. App uses absolute
Web-owned authentication URLs so direct App-host navigation cannot enter
a sign-in redirect loop. Authentication and `/replace`
cross the application boundary through document navigation. Web performs
signed-out redirects, App retains its client guard, and Zerospin retains
backend authorization. No server-side Zerospin queries or new authentication
rules are introduced.
Web resolves optional `NEXT_PUBLIC_APP_ORIGIN` to
`https://app.qrk.localhost` in development and `https://app.qrk.sh` in
production, permits that exact redirect origin, and redirects `/replace` to
the authenticated username there. Explicit App return URLs take precedence
over the sign-in fallback. App enables Clerk satellite synchronization only
in development to share Web's development session across the local hostnames;
production uses the common `qrk.sh` Clerk domain without this development mode.
The `QRK.SH` header link and not-found view's **Go home** link also use native
anchors to the configured Web origin.

QRK-owned content fields use `autocomplete="off"` and `data-1p-ignore="true"`
to suppress browser and 1Password autofill suggestions. Shared Input/Textarea
controls enforce these attributes after forwarded props, and QRK-owned forms
disable autocomplete. Clerk login, signup, account, and password flows retain
autofill. Private Meowdown popup fields, including link editing and code-language
search, remain unchanged. These attributes are hints whose behavior depends on
the browser or extension; application-owned place and icon suggestions remain
available.

App uses `clerkUserId` directly as the user `aggregateId`, matching the backend's verified Clerk token subject.

Production builds use `NEXT_PUBLIC_ZEROSPIN_API_URL=https://zerospin.qrk.sh`
and a `NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY` matching that Worker's
`ZEROSPIN_PUBLISHABLE_KEY`. Vercel's production variables and the isolated build
environment supply both values; local development settings remain separate.
The backend retains logical system `qrk-sh`, system ID `sys_qrk_sh_1`, and
`CLERK_AUTHORIZED_PARTY=https://app.qrk.sh` for the standalone rollout. Its
specification is accepted and the production system is initialized. Production
`NEXT_PUBLIC_API_URL` is
`https://api.qrk.sh`, supplying direct uploads and App's
`/rpc` forwarding. API CORS allows `https://app.qrk.sh`. Apply the production
Worker bindings alongside the frontend rollout; the hostname configuration
does not deploy the backends.

QRK.SH's Clerk development and production instances have **Sign-up with username** and **Require username** enabled under **User & authentication → Username**, and **Allow users to change their username** disabled under **User model**. The existing web `<SignUp />` collects the required username, including during social sign-up completion; `/replace` then redirects to `/<username>` on App's configured origin. Users choose their username once. Clerk owns this username; the setting does not populate QRK's currently null backend username field. Production uses `clerk.qrk.sh`; its DNS/certificates and Google OAuth credentials are configured. Google is published to an External production audience, and both deployed frontends use production Clerk keys. The support email is `me@morganatwork.com`; see the [production authentication setup](../../README.md#production-authentication) for legal links and Google's restricted support-email exception.

`lib/getClerkToken.ts` retrieves tokens through the current Clerk hook getter. It maps `ClerkOfflineError` to a typed `ZerospinError` with code `clerk-offline-error`, preserves other rejections as defects, and returns `null` unchanged for signed-out callers. Session credentials and Image/Site Settings uploads use this helper.

## Static shell and browser state

The hostname change is a hard cutover, with no storage bridge or compatibility
route for Web-hosted App paths. Old-origin browser stores, including those at
the retired `studio.qrk.localhost` and `studio.qrk.sh` origins, remain untouched.
App initializes an origin-scoped Node and synchronizes accepted backend
data for the same Clerk identity. Old-origin local-only drafts, preferences,
and unsent commands remain there and are not migrated. The origin change does
not reset backend storage or alter the existing aggregate/session definitions.

`routes/__root.tsx` owns the document, global/reset styles, metadata, and
App's module article stylesheet. `router.tsx` registers the generated file
routes. App's global CSS loads Fragment Mono through its Google Fonts
import and uses it for UI text and controls. The dashboard's `QRK.SH` wordmark
matches the homepage: Silkscreen 400 at 18px, loaded from installed
`@fontsource/silkscreen` CSS. The article stylesheet owns the system font for
article titles and subtitles and Spectral for body text and headings. App
adds no heading font override. Storybook imports the same global and article
styles. `App` holds the client providers and the React Speed Insights
integration. The username layout keeps one session initializer mounted across
App navigation; `UserLayout` gates only data-dependent content.

Standalone `Initializer` owns construction and descendant error boundaries.
Its `{ session, isLoaded }` callback explicitly gates the session-dependent subtree,
then provides the session with `<UserUI session={session}>`. `UserUI.useSession()`
is a synchronous context lookup with a missing-provider guard; readiness does not
use Suspense. Pure declarations, UI context, and connected configuration live in
separate, consistently named modules. `renderError` displays terminal failures;
retry is owned by the initializer. `UserSessionWork` scopes background work and
one nonterminal failure subscription to the ready session. Command-result guards
still prevent follow-up actions after local refusal.

The root layout mounts the shared `ZerospinDevtoolsLoader` in development with the panel initially closed. Its lifetime spans route navigation and authentication changes; the loader owns cleanup when the application unmounts.

The dashboard layout renders the fixed 64 px `QRK.SH` header and reserves a
40 px account slot with a shadcn skeleton while credentials load. The static
SPA shell does not prerender authenticated route data. The header is a query
container; its inner flex element uses the module `qrk-responsive-insets`
class and `--qrk-inset-inline`: 16px gutters become 30px when both the document
viewport and header reach 720px. The editor appears once the browser session is
ready. Its four browser frames render the Page's independent breakpoint Walls.
App owns optimistic session editing and form drafts; commands materialize the
same saved models authoritatively in the user aggregate. The active preview includes
the restored 64px site navbar below its browser chrome and above Wall content.
Its wordmark shows the saved site name, or the current name draft while Site
Settings is open. Cancel restores the saved name. Public website rendering remains deferred.

## Routes and transitions

The dashboard's **Create site** dialog requires Name, Description, and Subdomain.
Description must contain non-whitespace text and is trimmed before being saved
through `createSite`. The Subdomain
uses shadcn's Input Group to edit the slug before a fixed `.qrk.sh` text addon.
An empty input
uses its name-derived lowercase ASCII kebab-case placeholder; accents are
removed and spaces/punctuation become hyphens. If that suggestion is already
used by this user, the first available `-1`, `-2`, etc. suffix is suggested.
Custom slugs are preserved and must use lowercase letters/digits separated by
single internal hyphens. Beside the Subdomain label, the user's live sites drive a
checkmark for an available slug or a red X for an invalid or taken slug, with
descriptive feedback for screen readers; the creation contract enforces the same
format and ownership-scoped
uniqueness. Another user may use the same slug. Local refusals keep the dialog's
values; later creation failures show a toast. Closing or cancelling resets all
inputs. Creation stages `createSite` followed by `createPage` with `slug: null`
for the site's index page. Page creation requires an explicit string slug or
`null`, with at most one null-slug page per site; Site slugs retain their existing
rules. Staging, admission and execution refusals for either creation command show a toast.
The dashboard opens the null-slug page when present, otherwise its existing
first-page fallback. Existing `"home"` rows retain their string slug; no backfill
or storage reset is performed. Folders and published pathname resolution remain
outside this change.

Generated file routes preserve dashboards, base editors, module catalogs,
module details, brick details, breakpoints, page settings, and site settings.
Router links, params, location, and matched route IDs replace Next navigation.
Effect Schema validation, form keys, and navigation without scroll resets are
retained. Unknown paths render the Router not-found screen. The local error
boundary preserves client diagnostics and reload behavior.

Site Settings includes a **Sticky navbar** checkbox, enabled by default. It
previews the draft while settings are open, persists through Save, and restores
its opening value on Cancel. The navbar's containing element spans the whole
scrolling page so sticky positioning remains effective through page content.

The page layout keeps site/page settings drafts, `MainColumns`, `PagePreview`,
and the authenticated user session mounted. `PagePreview` owns responsive preview
frames, breakpoint transitions, and scrolling; `WallEditorProvider` supplies the
saved Wall contents. `EditorLayout` owns the persistent bottom drawer shell.
Matched route IDs determine its `open` state through a pathless drawer layout;
catalog and module-detail routes are sibling leaves. `EditorLayout` supplies
`DrawerHeader` through the shared Drawer's `persistentHeader` slot. It owns catalog breadcrumbs, the brick-detail
heading **Update your {collectionName} brick**, the left-side underlined
**← Bricks** catalog link and **/** separator, publication actions, and
Close or settings Save/Cancel. The fixed 56px navigation remains visible when
closed, stays on one line, and scrolls horizontally on narrow screens. Bricks
opens the catalog; Close/Cancel appears only while the drawer is open.
`Toolbars` retains the separate floating Page controls and breakpoint controls.

The drawer occupies the bottom `50dvh` on desktop and mobile. Opening it keeps
the browser frame's height and adds `50dvh` of trailing scroll space, so the
frame bottom remains reachable above the drawer. Closed state reserves 56px
for persistent navigation. Scroll position is preserved
on opening and clamped on closing; an already bottom-anchored preview stays at
the end during resizing. Shared Wall controls own drag gestures in the active pane.

On browsing/editor routes, **sm / md / lg / xl** sit on the
right side of the drawer header beside **Cards** and publication controls.
Cards remains usable while closed, starts from the saved Site style, and changes
the Wall/catalog preview without saving Site Settings. Its state survives drawer
navigation in the mounted editor. Catalog previews always display configured
examples; module placeholders remain available in the Unconfigured brick stories.
Breakpoints select **360 / 720 / 1080 / 1440px** browser frames;
widths larger than the available composition are disabled. Four frames stay
mounted around one editor session on every editor route. Page and Site Settings
display no breakpoint selector. The separate `/breakpoints` route retains its
floating controls and close action. The selected breakpoint returns when it fits;
otherwise the largest fitting frame is displayed. Below 360px, the
insufficient-width message appears. Catalog previews follow the active width.

`WallBreakpointPane` adds a 48px muted-gray browser header and thin inset frame.
sm/md show a Safari-like mobile address pill; lg/xl show desktop window dots and a
centered address bar. Both display static `qrk.sh`, remain noninteractive, and
are hidden from assistive technology. Chrome slides with its breakpoint pane;
reduced motion skips the slide. The active frame body renders the site navbar and its Wall's Sections,
Stacks, Rows, and placed Bricks through the shared controlled components. Only
the active pane registers drag targets and interactions. Placement cells use the
Wall's logical breakpoint and fill their Row cell; catalog `defaultWidth` is
not applied to placed content. Cells respect the selected variant's `minWidth`: 320px for
every module except Swatch and Icon at 160px, at every breakpoint. Each Row
scrolls horizontally when its minimums exceed the available width, preserving
neighboring Stack widths and saved arrangement.
Wall, Section, Stack, and Row layout has no outer padding or inter-item gutters.
Stack controls overlay content rather than reserving a toolbar row. The Wall has
no Add/plus buttons; drop indicators appear during dragging. Empty saved Rows
and Stacks show drop placeholders, including the initial Page scaffold. A move
or Brick deletion removes empty containers in the affected Walls.

App consumes shared `WallPreviewViewport` and `WallPreviewToolbar` source. The
viewport adds 32px above the frame and 43px below it, making every frame
`calc(100dvh - 75px)` high, including its 48px browser header. Frame dimensions
stay fixed while the 38px floating toolbar sits 24px above the persistent
bar when closed, or above the open drawer;
toolbar controls are 28px high. App's floating toolbar remains visible only on
the editor index and `/breakpoints` routes, while drawer routes show none.

App imports the shared `Drawer` from `modules/lib/Drawer.tsx` and passes
`open` and `persistentHeader`. Its shell slides with a 300ms CSS transform; editor height and padding
do not animate. TanStack Router's `defaultViewTransition` owns native document
transitions during regular and history navigation. The drawer route marks its
DOM with `viewTransitionName: "app-drawer"`; CSS animates only an outgoing
drawer snapshot without a new sibling, sliding it down over 300ms. Root and
matched drawer snapshots have no animation, so opening and navigation between
drawer routes have no snapshot entrance. This preserves the existing React
`19.2.7` version without relying on an unavailable React `ViewTransition`
export. Browsers without native View Transitions close immediately. Reduced
motion skips positional animation. The shared Drawer keeps its closed body
inert and hidden from assistive technology, releases it after exit, and
restores focus to the opener when appropriate. The transition overlay allows
pointer events through. This supersedes plan 007's animated grid-row
reservation and snapshot entrance; its unrelated verification items remain
separate.

One persistent `DrawerHeader` serves brick browsing/editing
and Page/Site Settings; the route layout renders only its body. Settings Save/Cancel keep their opening baselines and
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

The production modules catalog keeps `modules/lib/ModuleFilmstrip.tsx`. Each module column scrolls vertically beneath its full-width
sticky heading. Catalogs show the default variant's authored Component at its
`defaultWidth`, capped at the active canonical breakpoint width, with content
supplying its height and `minWidth` providing its minimum width. All ten modules
declare one flat `default` variant. Variant `defaultHeight` uses
`45 | 90 | 180 | 360 | 720 | null`, with Article alone using `null`. The shared
height floor is 45px; optional `minHeight` is reserved for higher floors and is
omitted by every current variant. Heights remain metadata only in this phase.
App supplies typed Router links to its
`/modules/$moduleId` detail routes. The catalog lives at `/modules` under the
page editor, with a **Bricks** breadcrumb and **Bricks** toolbar action.
Normal catalog links remain browsing actions, with separate module drag grips.
Drag a module grip from the catalog into the Wall to create its Brick. There are
no Add controls in the Wall. Existing query-encoded targeted catalog URLs retain
their + action in the drawer while preview content stays live.
Closing, leaving the chooser, or changing breakpoint cancels insertion without a
saved reservation. The previous catalog URLs remain retired without redirects.

Module details show **Component** and **JsonRender** side by side for all four
breakpoints. Each pair uses the default variant's `defaultWidth`, capped at 360,
720, 1080, and 1440px respectively. Each preview has content height; wide rows
scroll horizontally. Saved-brick fallback previews use the same width rule and
content height. Widths come directly from the selected variant, without
breakpoint overrides; browser frames retain their canonical widths.
All preview surfaces also respect the variant's `minWidth`.
No preview renders a grid-item comparison, intrinsic probe, or
pixel/grid-unit sizing diagnostic. App Storybook hosts the developer Generate spec
controls, which affect only its JsonRender previews.

Module definitions retain per-page limit metadata: Article declares one and
Instagram two. Catalog and module detail previews display that metadata without
querying page counts or gating ordinary browsing. The canonical `addBrick`
command enforces limits against shared Page Bricks, counting each Brick once.
App's insertion, movement, and deletion commands use the new container hierarchy;
obsolete grid compaction/visibility APIs remain retired.

## Verification

Repository tests and standalone automated checks are deferred until a test
structure is agreed (see root `AGENTS.md`). Storybook and the running app remain
available for manual review.

The App rename was verified on 2026-10-19. App, Web, and API Nx builds and
App's Storybook build passed. At `app.qrk.localhost`, Web-owned Google sign-in
returned to the authenticated dashboard; the existing **Autofill verification**
site, editor, and module drawer loaded, including a direct drawer reload.
The API and Zerospin backend reached readiness with the existing system spec
accepted. API CORS accepted `https://app.qrk.sh`.

App's separate static preview served deep-link HTML, CSS, worker JavaScript,
and SQLite WASM with the expected MIME types. Its `/rpc` response matched the
direct API. Session definitions, worker registrations, and the draft-store key
were preserved; old-origin browser stores were untouched. Production deployment,
App DNS/domain attachment, the remote Vercel root setting, and production Clerk
origin settings remain outside this local rename.

The final `/` entry redirects through route `beforeLoad` to Web's `/replace`
with history replacement. Its build passed; the final browser check of that
root entry remains pending Mac unlock. Dashboard, editor, and drawer checks
above do not establish that final root-redirect check.

The earlier recorded checks below predate the Studio-to-App rename and retain the
names and origins used at verification time.

The standalone-origin cutover passed the Studio, Web, and API Nx builds; Web's
React types were aligned to `19.2.17`. Studio's `/` route delegates account and
username routing to Web's `/replace`. The live local flow reached Web sign-in,
used the existing Google login, and returned to the authenticated
`studio.qrk.localhost/morgs32` dashboard. The existing **Autofill verification**
site and editor loaded, and a direct `/modules` drawer reload passed. Vite's
default HMR connection reported connected.

Static preview served deep-link HTML and root-based JS, CSS, worker, and WASM
assets with 200 responses and the expected MIME types. Missing `/assets/` files
returned 404; `/rpc` returned 400, matching the direct API. The API CORS preflight
with `Origin: https://studio.qrk.sh` returned 204 and that exact allowed origin.
At verification, `studio.qrk.sh` did not resolve. DNS/domain attachment,
production deployment, and live production Worker binding changes were not
performed; they remain outside this local cutover's scope.

The following evidence records the initial TanStack migration in Plan 029.
Its Web proxy and prefixed-asset arrangement was superseded by the standalone
Studio origin described above; the original verification remains historical.

The migration's Studio build and both existing Storybook builds passed. Root
Portless startup reached all five development processes, including Zerospin's
`system spec accepted` readiness. In the existing Chrome session, Studio's
dashboard, editor, catalog, module detail, brick detail, and Back/Forward
rendered successfully. Cards and breakpoint selection persisted across
settings and drawers; Page Settings Save/Cancel and Site Settings Cancel
preserved the expected values. A direct brick deep-link reload initialized
with the final inner Suspense boundary. Temporary edits were restored, and no
browser storage or cookies were reset.

Static preview served deep-link HTML and built worker/WASM assets with the
expected MIME types, returned 404 for missing prefixed and unprefixed assets,
and returned the same `/rpc` status as the direct API. The final Studio build
after the inner Suspense change passed. Chrome confirmed the direct Studio
HMR socket connected and received actual source/style hot updates. All four
legacy public asset aliases returned 200 with image MIME types through Web,
and the final diff check passed. Opening Studio's own HTTPS origin redirected
to Web's sign-in form with the original Studio target preserved, without a
relative redirect loop, credential entry, or session reset. The completed
evidence is recorded in
[Plan 029](../../wiki/archive/plans/029-plan-tanstack-start.md).

## Article editing in the detail drawer

App retains the brick-detail route and renders the selected module's `Form` without an enclosing form. All ten registered bricks expose a form: Image, Article, GitHub Profile, GitHub Repo, GitHub Activity, Figma Thumbnail, Instagram, Link, Map Place, and Swatch and Icon. Shared forms receive decoded `state` or `null`, synchronous `onSave`/module-specific configuration callbacks, and `onCancel`; the standalone session/Brick identity props are removed. App supplies real command callbacks; Storybook supplies local example behavior. Unconfigured provider bricks receive genuine `null` and show blank source inputs. Image provides a dropzone and file picker above its Image URL and Title fields. Article uses Meowdown in Hybrid mode with native shortcuts, slash/link controls, and block handles in the existing centered writing column; it has no formatting toolbar or mode switcher. Article state has separate required title/subtitle strings and nullable Markdown content; generated ArticleBrick specs bind all three fields. This hard cutover adds no JSON conversion or compatibility reader. Catalog previews use Meowdown's read-only MarkdownView without an editor.

Modules own unsaved drafts and validation. Provider forms invoke their module's configuration callback and render resolution status/error from the Brick query; App stages the canonical command synchronously. The user-session owner composes module-owned local executors, which call the existing same-origin API and stage revision-guarded completions. Closing an editor discards its draft while accepted work continues for the session lifetime; session replacement ignores late results. No server durability guarantee is added. Ordinary Article/Image/Swatch saves preserve the actual local staging result, clear drafts only on success, and render optimism/rollback through the query. Article remounts its editor on Cancel; its portaled link form does not submit the Article form. Page and Site Settings retain their existing commands.

The detail drawer provides one centered column around the module-owned form and Save/Cancel.
Image uses stacked shadcn inputs that fill that column; its actions sit below
the fields at the same left edge and wrap when needed.

Each Page owns four Walls, one per `sm`/`md`/`lg`/`xl` breakpoint. The normal
`createPage` command creates each Wall with one Section and an empty Stack.
Sections contain ordered Stacks, Stacks contain vertical Rows, and Rows contain
ordered horizontal Placements. Shared content lives once on Page-owned Brick;
each Brick has a deterministic Placement at every breakpoint. Each Placement
persists its own required `variantId`, currently `"default"`, alongside its spec;
published snapshots retain it. The field uses the fresh development baseline
without a missing-field fallback. No storage reset is part of this source change.
Wall and Brick
reference the final App Page directly. Canonical declarations/commands live in
QRK's user aggregate; no second persisted Library host or declaration-binding
factory exists.

`WallEditorProvider` uses the initialized App session to query the Page's layouts
and supplies shared `WallTree` presentation and action callbacks. Selected means
the Brick form is open; active means DOM focus. Grip/menu controls stay separate
from live module content. Adding at a stable insertion target creates the Brick,
all four Placements, and required parent containers atomically, then opens its
form after local staging succeeds. Other widths append a new Row to their last
Stack. Cancelling the chooser creates nothing; cancelling a created Brick's
form leaves its unconfigured null content. Query-encoded destinations are decoded
and validated again by the command; stale/cross-Wall destinations refuse.

Move commands preserve identity/specs and call internal `cleanupWall` on the
affected Wall's post-edit hierarchy. Deleting a Brick confirms removal at all
four breakpoints and cleans every Page Wall. Cleanup removes empty Rows, then
Stacks, then Sections, and compacts all surviving sibling positions, including
Placements, in the same command. Empty Walls remain usable drop targets.
Sections allow 1/2/3/4 surviving Stacks at sm/md/lg/xl after move cleanup; drag
eligibility uses that final count. Catalog additions retain their existing
capacity rules. Rows have no artificial Placement cap. Whole-Row dragging,
Section dragging, container deletion, hiding,
and user resizing remain deferred. Placement's old grid geometry, visibility,
and duplicated breakpoint fields are removed; the containing Wall supplies its
breakpoint.

The existing user initializer owns initialization, disposal, and failure
presentation across Page/drawer navigation. App's session work composes module
provider algorithms and spec generation for that lifetime. Later completion
commands enforce request/revision guards and safely ignore deleted Bricks.
Local staging Success remains optimistic; finalized canonical command outcomes
are separate evidence. Publication snapshots include shared Bricks once and all
four ordered Wall hierarchies, so layout changes participate in dirty comparison.

## Image uploads

Drop or choose one nonempty PNG, JPEG, WebP, or SVG up to 5 MiB in the Image drawer. Upload starts immediately and updates only the module-owned draft Image URL on success; Save persists the brick state. Image retains file validation, picker/drop behavior, drafts, pending/error feedback, Save gating, and cancellation. Fields and Save are disabled during upload; Cancel stays available, restores saved state, and aborts unfinished requests. Switching bricks or leaving the drawer also aborts pending uploads and ignores late results. Breakpoint switches retain the draft and its upload.

`EditorLayout` supplies `ImageUploadEnvironment.upload(file): Effect.Effect<string, Error>` through the existing Layer, session runner, and `ImageUploadRuntimeContext`. App owns the HTTP request: each invocation retrieves fresh Clerk credentials through `getClerkToken`, sends multipart file and current site ID to `/upload`, and decodes the untrusted success/error response before returning the image URL. A signed-out result fails visibly. Effect interruption reaches `fetch` through its AbortSignal. Image passes only its validated file and receives the URL, without knowing the endpoint, site ID, authorization header, multipart protocol, or response shape. The shared form contract carries no Image-specific upload props.

Set `NEXT_PUBLIC_API_URL` to the unified API Worker origin; production uses `https://api.qrk.sh`, and local development uses `https://api.qrk.localhost`. Root `pnpm dev` starts API alongside App. The API Worker verifies the Clerk bearer token using `CLERK_SECRET_KEY` and `CLERK_AUTHORIZED_PARTY`, stores the bytes in its `QRKSH` R2 binding, and returns a URL built from `R2_PUBLIC_BASE_URL`. The configured authorized party and CORS origins must match the browser origin: `https://app.qrk.localhost` locally and `https://app.qrk.sh` in production. New local upload URLs use `https://api.qrk.localhost/assets`; production uses `https://api.qrk.sh/assets`. `/assets/library/*` uses its `ASSETS` bucket. No public R2 bucket hostname is required. Clerk secrets stay on the Worker.

Uploads write assets to R2 immediately. Cancel after an upload completes, or removing an image, does not delete the R2 object. File bytes and upload status are not part of the local brick backup. Article uploads remain disabled because its editor has no file-persistence handler; HTTP(S) Markdown images render and native resizing saves dimensions in Markdown comments. Automatic YouTube/X embeds and provider requests are disabled. Article documents are not converted.
