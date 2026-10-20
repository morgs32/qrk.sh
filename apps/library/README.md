# Library

This private package owns the reusable brick library and a TanStack Start
`1.169.3` SPA with TanStack Router `1.170.45`, using Vite Plus `1.0.0`.
The Cloudflare Worker backend lives in
[`apps/api`](../api/README.md). Consumers
compile Library source directly, without a package build.

From the repository root:

```sh
pnpm dev
```

Open [https://library.qrk.localhost/](https://library.qrk.localhost/).
Portless starts all five apps through their `dev:app` scripts, registering
HTTPS hostnames on the shared wildcard proxy. It removes each app's route when
that process stops; leave the shared proxy and other projects running. See the
[root startup instructions](../../README.md#getting-started) for proxy setup.

Portless allocates Library's internal port; direct startup defaults to 10004
and honors `PORT`. Vite forwards `/rpc`, `/upload`, and `/assets/*` to
the API Worker at `http://127.0.0.1:8787`; its inspector uses an automatically allocated port.
Browser callers keep their same-origin URLs. New public asset URLs use
`https://api.qrk.localhost/assets`.
To start only Library through Portless, run `pnpm --dir apps/library dev`.
Its `dev` script invokes Portless, which runs `vp dev` in `dev:app`;
package metadata retains its hostname and port. API starts separately with
`pnpm --dir apps/api dev`, or alongside Library through root `pnpm dev`.

## Configuration

Put local settings in `apps/library/.env.local`:

- `PUBLIC_MAPBOX_TOKEN` is required for the library app and is exposed to the browser.
- `LIBRARY_WORKER_ORIGIN` optionally changes Vite's backend destination; it defaults
  to `http://127.0.0.1:8787` and is server-only. Set it before starting development
  when using a different backend origin.

Private provider credentials belong in `apps/api/.env.local`, where Wrangler
loads them as Worker bindings. Vite explicitly defines `PUBLIC_MAPBOX_TOKEN`
for the Library browser bundle; its name is retained rather than converted to
`VITE_*`. Other environment values are not exposed by prefix.

Module definitions, catalogs, views, aggregate behavior, and browser RPC
declarations stay here. API owns `LibraryApi`, `BrowserHost`, generation,
provider helpers, and module backend Durable Objects. GitHub uses direct
`getGitHubProfile` and `getGitHubRepo` methods, with successful upstream responses
retained by API's storage-only `BackendRepo`. Client imports retain the
existing `worker/*.public.d.ts` paths, so Worker implementation types do not
become part of the brick library's public declarations. Linktree scraping stays
in the separate `@qrk.sh/scraper` Worker (`apps/scraper`).

API retains the `ASSETS` bucket for `/assets/library/*` and serves other asset
keys from `QRKSH`. App uploads require Clerk authentication; standalone Library
Image forms use the anonymous `/image/upload` endpoint. Existing image bytes
and local state directories remain preserved, with local `ASSETS` data copied
to API's state. Saved absolute port-4101 URLs need their origin updated
separately; authored documents are not rewritten.

## Development

Repository tests and standalone automated checks are deferred until a test
structure is agreed (see root `AGENTS.md`).

Library has no package build, production build, or production preview target.
Its development server and Storybook remain available. `vite.config.ts`
enables Start's SPA mode; `router.tsx` registers generated file routes from
`routes/`. Its Vite configuration bundles installed Zerospin packages through
`ssr.noExternal` so their extensionless ESM imports resolve through the
bundler. Fresh checkout
installation requires the populated local registry described in the
[root README](../../README.md#zerospin-packages).

The migration's Library Storybook build passed, and the standalone catalog
and module-detail routes initialized in the existing Chrome session without
resetting browser storage or cookies. A migration-created Swatch saved a
color change, Cancel restored its saved state, reload retained the saved
color, and removing that temporary brick succeeded. A scoped temporary
measurement render fault displayed its error, rejected Save while retaining
the draft, and cleared on Cancel; the injection was immediately removed.
Both migration-created Swatch and Figma bricks were removed, restoring the
empty wall. Query-only draft keys and cancellation on unmount were reviewed
in source. Completed migration verification is recorded in
[Plan 029](../../wiki/archive/plans/029-plan-tanstack-start.md).

Before Zerospin 18.0.0, Phase 1 removed the grid contracts against fresh local
content. Its approved one-time local cutover covered only the standalone IndexedDB database derived
from `/qrk-library-command-query-v1`, without a backup or a backup-path change.
App's matching local session databases and backend state were covered separately.
Earlier origins, unrelated databases, cookies, localStorage preferences, uploads,
and deployed storage are preserved. This does not authorize future resets.

The development UI routes are
`/`, `/modules`, `/modules/$moduleId`, `/bricks/$brickId`, and
`/bricks/$brickId/admin`. Typed Router navigation
retains the empty browser frames, drawer, standalone session, and viewport providers; route-specific
module and brick drafts keep their existing remount boundaries. The document title
remains `QRK.SH Library`, with diagnostic error and not-found screens.

`LibraryApp.Initializer` owns session construction and descendant error
boundaries. Its `renderError` uses the shared diagnostic presentation for a
terminal session failure; `session.store.getState().status === 'failed'`
controls replacement of the content. The route error view rethrows
`SessionQueryError` so the owning Initializer receives query failures. Missing
query rows remain normal data. `InitializedLibraryLayout` scopes its store
subscription to the session lifetime, displaying a changed non-null `failure`
only while status is not `failed`; remounting does not replay a previous error.
Unexpected spec-generation executor failures report through
`session.reportFailure`.

The initializer, browser frames, and viewport owners sit above the route outlet and stay
mounted across child navigation. Route params keep their Effect Schema
validation and draft keys. Admin stages state saves synchronously; it mounts no
hidden measurement render or measurement error boundary.

The root layout mounts the shared `ZerospinDevtoolsLoader` in every environment with the panel initially closed. It stays mounted across route navigation, and owns cleanup when the application unmounts.

## Brick forms

QRK-owned forms set `autoComplete="off"`. The shared Input and native article
title/subtitle, hex color, and State JSON fields also set `autoComplete="off"`
and `data-1p-ignore="true"` to suppress browser and 1Password suggestions. The
shared Input applies these attributes after forwarded props. These are opt-out
hints; browsers and extensions control whether they honor them. Clerk-owned
login, signup, account, and password flows retain autofill. Private Meowdown popup
fields, including link editing and code-language search, remain unchanged. The
application's place and icon search suggestions remain available.

All ten modules own their form. The shared form receives the queried state,
initialized session, brick identity, synchronous `onSave(state): IResult`, and
Cancel. Hosts render forms directly; saved presentation always comes from the
brick query, including optimism and rejection rollback. Forms retain only unsaved
drafts. Article and Image saves call `updateBrick` synchronously; image upload
remains a separate cancellable browser prerequisite.

Instagram, GitHub Profile/Activity/Repo, Figma Thumbnail, Link and Map Place stage
their module's `configure…` command synchronously. The transaction records canonical
input, request identity and `resolution: resolving`, clears old computed data,
increments `stateRevision`, and supersedes active spec generation.
The query displays resolving, ready or failed state. Input correction stays
available while resolving; an identical resolving input is refused. Failed input
can be retried with a new request identity. Cancel discards only the unsaved draft.

`startLibrarySessionWork` composes module-owned provider executors at the Library
session lifetime and App's authenticated user-session lifetime. Each executor
observes its module's retained intents, calls the existing same-origin API, decodes
module data and stages a guarded completion. Brick/module/request/revision checks
make stale or duplicate completions harmless. Closing an editor leaves submitted
work running; disposing or replacing its session closes requests and rejects late
results. A browser reload can rediscover resolving work in retained local state.
This is local execution while an editing session is open; no new backend owner or
server durability guarantee is introduced. Existing API provider credentials,
caches and identity validation retain their ownership.

GitHub accounts accept URLs or usernames. Repository input accepts an HTTPS URL
or owner/repository, strips `.git`, lowercases the owner and preserves repository
spelling. Figma normalizes supported document kinds and file identity. Instagram
normalizes usernames/profile URLs. Link removes fragments and retains its submitted
URL separately from resolved redirect metadata. Map Place keeps autocomplete as
transient search and stages the selected nonempty place ID.

Figma provider completion persists its resolved state without rendering hidden
breakpoint probes. Admin's raw JSON path stages the same synchronous state-update
command as ordinary state saves. Neither path captures or persists preview dimensions.

Swatch and Icon retains the selected `{ hash, name, svg }` from paged icon search.
SVG data URLs are derived for presentation. Save validates a complete hex color
and stages the selected icon and color directly, including the existing/default
icon when no search runs. There is no Save-time icon request.

Library retains `/qrk-library-command-query-v1` as its standalone backup path.
Zerospin 18.0.0 derives its storage key from that path, the existing authored
session scope and the complete canonical `aggregateSessionLock`, including
locked models, public contracts and the claims schema. Incidental claims values
outside the resolved path and runtime/build identity do not split storage. First
adoption changes every existing standalone key and initializes a fresh partition
from configured seeds, leaving old databases untouched without lookup, migration,
deletion or fallback. Later, the same scope, path and lock reopen their retained
partition; changing the lock selects separate storage.

[Plan 031](../../wiki/plans/031-plan-component-jsonrender-previews.md) records the
preceding 15.0.1 cutover: explicit deletion of only affected local Library/App node
databases and local `sys_qrk_sh_1` backend state, without backups or an authored
namespace change. Chrome Library/App and local backend reset/initialization
succeeded. Its in-app browser legacy deletion was blocked by an old SharedWorker,
and Library was paused at that time. That legacy deletion and pause are not
prerequisites for initializing the new 18.0.0 partition; this adoption does not
delete the legacy database or resolve its owner's lifecycle. Earlier successful
generation verification followed an API-key refresh and API restart: generated
JSON appeared, JsonRender changed, and authored markup stayed unchanged. These
are preceding-cutover observations, not verification of the 18.0.0 adoption.
Earlier origins, unrelated data, cookies, preferences, uploads, and deployed
storage remain outside the cutover. No compatibility reader is added.

## Storybook

```sh
pnpm nx run @qrk.sh/library:storybook
pnpm nx run @qrk.sh/library:build-storybook
```

Open `http://127.0.0.1:10021`; App's Storybook uses port 10020.
`PORT` overrides either default. Library Storybook
runs independently of the Start app and API Worker, using Vite and the Library
app's global styles and fonts. Stories live alongside their components in
`components/`, `lib/`, and `modules/`. The static build goes to
`apps/library/storybook-static/`.

**Library / Article / Meowdown spike** pairs an editable Markdown fixture with
live Markdown output. Its **Hide / Hybrid / Show** radio control changes syntax
visibility while preserving edits. This story uses local state only.
It shares Article's production typography and ordered/nested-list spacing.

**Library / Article / Renderer comparison** shows the current Meowdown article
view beside HTML returned by `@tanstack/markdown/html`'s `renderHtml`. A shared
Meowdown editor updates both previews; expandable panels expose the Markdown
source and generated HTML. The fixture includes ordinary article syntax,
image-size comments, raw HTML, and Meowdown extensions so rendering differences
remain visible. TanStack uses escaped raw HTML, with frontmatter extraction and
heading IDs disabled. Storybook invokes the synchronous HTML API in the browser;
the same API can generate body HTML in a server process without React or a DOM.
This comparison retains the production Meowdown editor and article renderer.

To generate the comparison fixture's body HTML in Node, without React or a DOM:

```sh
cd apps/library
node --input-type=module <<'JS'
import { renderHtml } from '@tanstack/markdown/html';
import { articleRendererComparisonMarkdown } from './modules/article/articleRendererComparisonMarkdown.ts';
process.stdout.write(renderHtml(articleRendererComparisonMarkdown, {
  allowHtml: false,
  frontmatter: false,
  headingIds: false,
  headingAnchors: false,
}));
JS
```

This command uses Node's native TypeScript support (verified with Node 24).
The result is a body fragment; full page composition and publication are separate.

**Library / Brick hover transitions** compares background tint with five hard-shadow
options: the original, tight, bold, tinted, and position-aware shadows. Hover or
focus a preview, or enable **Hold hover state** to compare the emphasis. The
position-aware option casts its shadow away from the viewport center and moves
the surface toward it; direction updates on scroll, resize, layout changes, and
pointer entry or focus. Each option has browser chrome around a clipped viewport,
with the bricks flush against its edges. Reduced motion removes lift and
animation. These treatments remain available for comparison; the shared brick
UI uses an immediate dark border.

## Public exports and shared UI

`package.json` maps every existing public subpath directly to its defining
TypeScript, TSX, or stylesheet source. App, API, and Zerospin compile their
reachable imports without generated `dist` files. `app/` contains the
Library-only routes and layout, not exported application screens.

Consumers bundle Meowdown and React with their own dependencies. The retained
`/article-editor.css` import maps to Article's plain CSS, including Meowdown styles;
`/bricks.css` maps to the existing brick stylesheet. Keep stylesheet import order
and Article components' font imports. Article state and form callbacks exchange
Markdown strings; consumers share no editor instances.

Article's stylesheet and both Library and App globals declare
`@layer theme, base, components, meowdown, utilities` before their imports.
This places Tailwind Preflight before Meowdown's native rules and keeps utilities
in the final named layer.

| Import under `@qrk.sh/library`    | Defining source                              | Purpose                                                   |
| --------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| package root                      | `lib/index.ts`                               | Small barrel: `modulesHash`, `IModule`, `IModuleBrickDef` |
| `/backendLibrary`                 | `backendLibrary.ts`                          | Module catalog registry used by API generation            |
| `/ModuleFilmstrip`                | `lib/ModuleFilmstrip.tsx`                    | Shared horizontal module catalog                          |
| `/Drawer`                         | `lib/Drawer.tsx`                             | Shared Drawer and existing DrawerPresence                 |
| `/BrickCardStyleContext`          | `lib/BrickCardStyleContext.ts`               | Local boolean catalog-preview appearance                  |
| `/WallViewportProvider`           | `lib/WallViewportProvider.tsx`               | Viewport provider and hooks                               |
| `/WallBreakpointPane`             | `lib/WallBreakpointPane.tsx`                 | Shared fixed-width browser frame                          |
| `/WallPreviewViewport`            | `lib/WallPreviewViewport.tsx`                | Shared frame spacing, scrolling, and toolbar placement     |
| `/WallPreviewToolbar`             | `lib/WallPreviewToolbar.tsx`                 | Shared 38px toolbar shell with 28px controls                |
| `/breakpoints`                    | `lib/breakpoints.ts`                         | Breakpoint IDs and canonical preview widths                |
| `/ImageUploadEnvironment`         | `modules/image/ImageUploadEnvironment.ts`    | Host-supplied file upload Effect returning an image URL   |
| `/ImageUploadRuntimeContext`      | `modules/image/ImageUploadRuntimeContext.ts` | Image's runner bound to the existing app session          |
| `/libraryModule`                  | `libraryModule/libraryModule.ts`             | Models and command contracts                              |
| `/createLibraryStandaloneSession` | `session/createLibraryStandaloneSession.ts`  | Session factory, context, hook, and type                  |
| `/bricks.css`                     | `bricks.css`                                 | Shared brick styles                                       |
| `/article-editor.css`             | `modules/article/article-editor.css`         | Meowdown, Article typography, and portaled controls       |

App imports `Drawer` directly from `@qrk.sh/library/Drawer`; Library's own app
imports `../lib/Drawer`. Supplying `open` keeps the shared shell mounted and uses a
300ms CSS transform for visibility. Library passes its existing local open state,
including closing without changing the URL. The bottom drawer overlays `50dvh`;
the editor remains full-height with matching trailing padding. Padding changes
preserve the current offset, or follow the new bottom when already within 1px of
it, with clamping on close. Initial deep links do not force a bottom scroll.
Viewport-height changes use the same rule; ordinary content growth does not.

Library retains live drawer content through exit, then releases it. Reopening
interrupts cleanup. Closed shells are inert and hidden from assistive technology;
reduced motion skips the animation. App preserves outgoing route pixels with
its exit-only native View Transition managed by TanStack Router. Existing Drawer callers without `open` retain the
optional Motion/flow behavior. Drawer does not own routing, breadcrumbs, or
settings actions. This replaces plan 007's animated grid-row reservation.

Library's preview controls float 24px above the open drawer at every screen width.
Closing the drawer restores their position 24px above the viewport bottom; movement follows the drawer's
300ms transition and skips animation for reduced motion.

Library and App share `ModuleFilmstrip` and browse-only module previews. Each app
supplies its own module links through `renderModuleLink`; the shared catalog has
no router dependency. Columns scroll vertically within a horizontal strip.
Module headings span their columns and stick to the top while previews scroll
underneath. Catalogs render only the authored Component at the active breakpoint's
canonical width, with height supplied by its content. They have no grid sizing,
dimension probes, drag sources, payloads, or insertion gating. Module detail screens
remain app-owned. Their catalog label is **Bricks**.

Both hosts' module details show **Component** and **JsonRender** side by side for
`sm`, `md`, `lg`, and `xl`, at 360, 720, 1080, and 1440px respectively. Each preview
has content height; a row scrolls horizontally when needed. Library retains its
Generate spec controls and generated JSON display. Generation changes only the
JsonRender previews; the authored Component remains independent of the spec.

## Local card appearance spike

The **Cards** button in Library's preview controls and App's upper-right corner
toggles one local boolean through `BrickCardStyleContext`. It affects catalog
previews without adding module catalog or registry props. The flag starts
`false`, survives drawer navigation while its layout stays mounted, and is not
persisted on Site, Page, or in localStorage.

Cards use an 8px radius, white background, and preview shadow. This decoration
does not alter a preview's canonical width or derive grid spans or dimensions.
Historical grid-border and card-layout research remains under `wiki/research/`;
no placed-brick wall or React Grid Layout renderer remains.

## Modules and interaction

Catalog previews render authored module content at the active canonical width.
They do not insert, select, drag, or resize placed bricks. Ordinary links, forms, image
upload drag/drop, and module-owned interactions remain available.

Link's copy column uses CSS half width and ordinary URL/title wrapping; no
font-size or column-width fitting runs. Map Place owns a 200px CSS minimum height
and keeps Mapbox's container-resize observer. These module styles do not measure
or update Placement geometry.

GitHub Activity constrains its calendar to the brick shell's available width.
Only the contribution grid and month labels scroll horizontally; Mon/Wed/Fri
and the color legend stay fixed. Edge fades apply only to the scrolling grid:
the left fade appears while older activity is offscreen, and the right fade appears
while newer activity is offscreen. Both disappear when the full grid fits.
The scrollbar stays hidden while horizontal scrolling remains available.
The calendar initially scrolls to the rightmost, most recent activity; subsequent
manual scrolling keeps the chosen position.

`modulesHash` exposes each library module by its registered kebab-case id, with
no arbitrary-string index signature. Module URLs decode their ID against the
brick model enum before rendering the module page; unknown IDs remain 404s.
Internal previews and state updates retain the registered ID union.
`defineModule` declares identity; `makeModuleVersion` owns the catalog, `stateShape`,
and `defaultState`. `makeModuleView` infers authored callback props from that state
shape and decodes incoming state before rendering, discarding undeclared fields.
Its authored wrappers are created once and reused by module rendering and previews.
It also attaches a json-render `generator` (`registry` + `defaultSpec`).

Every module view supplies a required `LineIcon`, exposed on its `modulesHash`
entry. Each module owns its SVG component, sourced from
[Untitled UI's free icons](https://www.untitledui.com/free-icons), with the source
linked beside the component. Icons default to 24×24, use `currentColor`, and accept
native SVG props for sizing, styling, and accessibility. Registering an icon does
not render it; consumers can use `<brickModule.LineIcon className="size-5" />`.
Icons belong to the React view declaration and stay out of backend module identity
and persisted brick state.

`defineModule` retains optional `maxPerPage` metadata, a positive integer;
omission means unlimited. Article declares `1` and Instagram declares `2`.
Catalog and module detail previews display the limit. Phase 1 has no insertion
path, page-count query, or limit-based interaction gating.

Modules can opt into unconfigured bricks with `hasPlaceholder: true` in
`makeModuleVersion` and a matching display-only `default.placeholder` in
`makeModuleView`. Omitting the flag defaults it to false. View construction rejects
both mismatches, so the backend declaration and markup must agree. The returned
module exposes `hasPlaceholder` and `placeholder`; one placeholder is shared across
all breakpoints and receives no props.

```tsx
// In imageV1: the backend accepts null as an unconfigured Image brick.
hasPlaceholder: true,

// In imageView.default: display the sample image until state is supplied.
placeholder() {
  return (
    <imageCardView.Component>
      <imageCoverView.Component
        imagePosition="center"
        imageUrl={imageV1.defaultState.imageUrl}
        title={imageV1.defaultState.title}
      />
    </imageCardView.Component>
  );
},
```

Image, GitHub Activity, GitHub Profile, GitHub Repo, Instagram, Link, and Figma
Thumbnail opt in. Figma Thumbnail uses its module-owned
`FigmaThumbnailPlaceholder` with skeleton thumbnail and title, keeping the Figma
icon and label visible. Null state uses this placeholder, while its populated
`defaultState` remains for catalog previews. Its skeleton respects reduced motion
and contains no outbound link.
Link uses its module-owned `LinkPlaceholder` with skeleton icon, URL, title,
and hero image. Null state uses this placeholder, while its populated `defaultState`
remains for catalog previews. Its skeleton respects reduced motion and contains
no outbound link.
Instagram uses its module-owned `InstagramPlaceholder` with a skeleton four-post
grid, icon, username, follower count, and follow button. Null state uses the
placeholder, while its populated `defaultState` remains for catalog previews.
Its skeleton respects reduced motion and contains no outbound link.
GitHub Repo uses
its module-owned `GitHubRepoPlaceholder` with skeleton repository name,
description, stars, forks, and language. Null state uses the placeholder, while its
populated `defaultState` remains for catalog previews. Its skeleton respects
reduced motion.
GitHub Profile uses its
module-owned `GitHubProfilePlaceholder` with skeleton avatar, username, profile
details, and statistics. Null state uses this placeholder, while its populated
`defaultState` remains for catalog previews. Its skeleton respects reduced motion.
GitHub Activity uses its module-owned
`GitHubActivityPlaceholder` with skeleton month and weekday labels, contribution
squares, and legend. Null state has no payload or contribution data until
configured; its populated `defaultState` remains for
catalog previews. The skeleton respects reduced motion.

The Library drawer's **Display placeholders** checkbox
starts unchecked and switches eligible catalog previews between their example state
and placeholder at the same canonical width. The choice lasts until
reload. The shared renderer selects the placeholder only for exact null, before
state decoding or JSON-render execution. Empty strings, objects, and collections
still take the normal rendering path. Valid empty specs do not hide placeholders.
Existing configured bricks are not reset.

`makeComponentView` binds display markup to a `defineComponent` descriptor. Its
`.Component` accepts inferred flat props; its `.RegistryComponent` decodes resolved
JSON-render props against the same descriptor before rendering `.Component` through
JSX and forwarding children. Missing or invalid props surface schema errors rather
than handwritten fallback values. Both components retain stable identities. Use
member expressions directly so no file-scope component aliases are needed:

```tsx
export const bioView = makeComponentView(bioComponent, {
  component(props) {
    const { bio } = props;
    return bio ? <p>{bio}</p> : null;
  },
});

// Authored markup: <bioView.Component bio={state.data.bio} />
// Registry entry: Bio: bioView.RegistryComponent
```

Descriptors stay separate from React implementations so backend module imports
remain independent of view code. Optional `sm` / `md` / `lg` / `xl` overlays
select authored components and generators on top of `default`. View declarations
and `viewFor` expose no `w`, `h`, `minW`, `minH`, or measurement flags. Canonical
preview widths belong to `BREAKPOINTS`; modules own their ordinary CSS layout.
Retained Placement geometry is independent of those previews and is not rewritten
when content or preview dimensions change.

Module defaults, preview state, and authored rendering discard undeclared fields
during decoding. `updateBrick` validates declared state fields while ignoring
extras, then persists decoded state. It accepts null only for modules declaring
`hasPlaceholder: true`. The Library JSON state editor can save valid state to
replace a placeholder, or null to restore it. Invalid declared fields and null
for other modules reject the command before mutation. Spec validation remains strict.
`updateBrick` requires `moduleId`, checked against the stored brick before decoding.
Pending updates without it must be resubmitted against the current `1.0.0` baseline.
Existing bricks are normalized on their next state update; there is no bulk migration.

`useUpdateBrick({ brickId })` returns synchronous `updateBrick(state)`. It checks
the mounted editor, initialized session, and current brick before staging. The
brick drawer and Admin render no hidden measurement host and have no measurement
wait or measurement-only pending controls. Forms retain their own validation,
provider resolution, uploads, and draft/error handling.

`updateBrick` accepts `{ brickId, moduleId, state }`, persists decoded shared state,
increments its revision, and supersedes active placement spec generations. It
preserves each placement's `gridItem`, visibility, and Spec. Placement has no
`measured` field, and no command accepts or stores a pixel-measurement map.

```ts
{
  // Retained placement geometry remains in grid units, independent of previews.
  gridItem: { i: brickId, x: 0, y: 0, w: 4, h: 3 },
}
```

`LibraryApp` is created from `libraryBrowserDefinition`. `LibraryLayout` mounts
its `Initializer`, which owns a fresh browser facade and starts it after commit.
The initialized content suspends until SQLite is ready. The SPA shell contains
no initialized session data. The standalone session persists seeded `wal_library`
through the SharedWorker's owned IndexedDB VFS. Its storage namespace and namespace
lease are derived from the authored scope, `/qrk-library-command-query-v1` path
and complete canonical session lock. Changed locked definitions open separate
partitions; the same lock and path reopen their retained data. Reset acts only
within the current definition's partition. The fresh 18.0.0 partition needs no
legacy deletion, and the backup path remains unchanged.

The 18.0.0 browser check displayed seeded `wal_library` before and after reload,
while an independent browser document held the legacy namespace lease and an open
legacy IndexedDB handle. Read-only before/after fingerprints matched; the legacy
database was preserved, and the temporary inspection handle and lease were released.

The authored worker is imported through Vite's `?sharedworker&url` query and
bound through `makeApplicationSharedWorker`. Its entrypoint imports
`@zerospin/browser/sqlite.wasm?url` from the installed `18.0.0` browser package
and registers the existing session definition with `makeSharedWorker`.
The worker name includes the session-lock storage key. Backup paths, source
exports, and backend contracts are unchanged by this adoption.

Session disposal detaches that facade. The standalone worker owner's `close()`
path drains its Node and closes SQLite before releasing the namespace lease;
last-attachment cleanup does not currently invoke that owner close. Automatic
last-client shutdown and abrupt tab-death handling remain separate Plan 2 work.
Within a retained partition, restored resources take precedence over the initial
seed. DevTools defaults to closed and retains its visibility preference.
App uses its authenticated `UserApp` initialized session, with a separate wall
referenced by each Page.

Shared consumers (`LibrarySessionContext` and `useLibrarySession`)
use `ILibrarySession`, the aggregate-session surface with Library models and contracts.
It accepts both the standalone Library session and App's larger live user session,
without requiring standalone initialization or reset methods. The shared
`libraryModule` exports only models and flat command contracts. Session construction
owns identity, claims, initialization, and disposal.

Command execution belongs to each app's session lifecycle. Retained forms stage
`updateBrick`, module configuration/completion, and spec generation
commands through the owning session. Library executes locally; App stages
optimism and synchronizes with the authenticated owner. Local staging durability
and server finalization are distinct.

`useLiveQuery` returns model-decoded `state`, `spec`, and `gridItem`
values. Explicit writes and backups use encoded SQLite values. Wall, Brick, and
Placement relationships are retained: shared state lives on Brick; each Placement
stores breakpoint-specific Spec, generation/revisions, geometry, and
visibility. The old add, remove, layout-update, compact, and visibility contracts
are deleted without replacement geometry or insertion APIs.

Four browser frames (360, 720, 1080, and 1440px) remain mounted around one
session. The selected breakpoint returns when it fits; otherwise the largest
fitting frame is displayed. Below 360px, the insufficient-width message appears.
Catalog drags and grid gestures no longer defer breakpoint changes. Library's
localStorage viewport preference (`qrk-bricks-library-viewport-v1`) is retained;
the grid reset control is removed.

`WallBreakpointPane` provides decorative browser chrome: sm/md use a Safari-like
mobile address pill; lg/xl use desktop window dots and a centered address bar.
Both display static `qrk.sh`, remain noninteractive, and are hidden from
assistive technology. The 48px muted-gray header and thin inset frame preserve
the 360/720/1080/1440px widths. Breakpoint transitions and reduced-motion behavior
remain. Every frame body is an empty white region. There is no site navbar,
placed-brick renderer, Tree, placeholder, or page-name node.

Library and App use `WallPreviewViewport` for a 32px top gap and a 43px bottom
gap. The frame's fixed `calc(100dvh - 75px)` height includes its 48px browser
header. Its bottom edge bisects `WallPreviewToolbar`, whose shared 38px shell
contains 28px controls and sits 24px above the viewport bottom on desktop and
mobile. Each host retains its toolbar actions and shape.

Opening the `50dvh` bottom drawer preserves the frame height and adds `50dvh`
of trailing scroll space. Both apps preserve the current scroll position or
follow the end when already bottom-anchored, with clamping on close. Library's
toolbar moves 24px above its open drawer; scrolling the preview to the end
aligns the frame bottom with the raised toolbar's center. App retains its
route-based toolbar visibility, with no floating toolbar on drawer routes.

Library and App resolve browser SQLite WASM from the installed Zerospin
`18.0.0` package exports. The Library standalone worker imports the same pure
`librarySessionDefinition` as its host definition. App authors its connected
`node.worker.ts` entrypoint, and both hosts use `makeApplicationSharedWorker`
to identify the emitted executable artifact. Vite emits each worker from its
`?sharedworker&url` import and its SQLite WASM from the installed package's
`?url` import. Persistent Node
storage belongs to the SharedWorker's IndexedDB-backed SQLite namespace;
no separate backup worker or public backup-worker assets remain.

## Image editing in the brick drawer

Image exposes its module-owned `ImageForm` through the shared module registry.
The form owns its Image URL and Title drafts, pending state, errors, Save, and
Cancel. Unconfigured bricks initialize from the module's
default state. Save stages the complete state through `updateBrick`. App
reuses this same Form in its authenticated brick detail drawer.
Both drawers provide one centered column around the module form; Image's
field groups fill that column, with Save/Cancel aligned to the fields' left edge.

Image also offers a single-file dropzone and picker for nonempty PNG, JPEG,
WebP, or SVG images up to 5 MiB. Selection uploads immediately; success changes
only the draft Image URL until Save. `ImageUploadEnvironment` supplies one
host-owned operation, `upload(file): Effect.Effect<string, Error>`, returning the
uploaded URL. Each app binds that operation through the existing Effect Layer,
session runner, and `ImageUploadRuntimeContext`; the shared form contract has no
Image-specific upload props.

Each host owns HTTP, endpoint configuration, multipart fields, credentials, and
response decoding. Library's standalone host performs anonymous
`POST /image/upload`; App's host performs `/upload` with its current site ID
and fresh Clerk authorization. Both forward Effect interruption into `fetch`.
Image retains file validation, picker/drop behavior, drafts, pending/error
feedback, Save gating, and cancellation. Fields and Save stay disabled during
upload. Cancel or leaving the brick aborts unfinished requests and ignores late
results; completed R2 objects remain stored. File bytes are not included in the
local backup.

## Article editing in the brick drawer

The Markdown module uses **Article** and the `article` module ID.
Its default size is 8 columns by 8 rows on sm, 6 columns by 6 rows on md, and
4 columns by 4 rows on lg/xl.
Article titles and subtitles use the platform system sans-serif font (San
Francisco on macOS). Body text uses Spectral at 19px with 1.6 line spacing in
brick previews and the drawer editor, loaded through the module's stylesheet.
Code blocks retain their monospace font.
Its catalog example starts with “Actually good advice,” including
the introductory paragraphs and numbered criteria. This is a hard rename without
legacy aliases or data migration; old `text` bricks,
`TextBrick` specs, and Text command history may no longer load.

Article state stores required `title` and `subtitle` strings separately from the
nullable Markdown body `content`. The module form uses plain text title/subtitle
inputs in a centered writing column. Meowdown runs in Hybrid (`focus`) mode,
revealing Markdown syntax near the cursor. Native shortcuts, slash menus, link
controls, and block handles replace the formatting toolbar; there is no mode switcher.
Article content has no horizontal padding. Read-only documents use the shared
`qrk-responsive-insets` class from `bricks.css`: `--qrk-inset-inline` supplies
16px outer gutters and `--qrk-inset-block` supplies 16px vertical padding.
When both the document viewport and nearest query container reach 720px, those
values become 30px and 32px respectively.
The drawer retains its separate viewport-based insets and existing 660px
desktop text measure.
Titles use 32px/36px bold text; subtitles use 18px/24px muted text, with a 12px
title-to-subtitle gap and 36px before the body. The drawer retains its smaller
mobile title. These fonts and spacing follow the
[Experimental History article](https://www.experimental-history.com/p/the-strangest-idea-in-the-world).
The body supports Meowdown's native Markdown headings, lists, tasks, quotes,
code, tables, links, images, and inline formatting. Meowdown's native
`margin-inline-start: 1lh` reserves the list marker gutter in previews and the
editor; the shared layer order gives it priority over Tailwind Preflight.
Underline, colored highlights, and text alignment are not retained. Standard HTML
form validation blocks Save when either
metadata field is empty or contains only whitespace; Admin retains schema-based
JSON validation. This is a hard schema change without migration or fallback:
old Tiptap Article state, specs, and command history may no longer load. The approved
local phase-1 cutover uses fresh affected storage as described above. There is
no JSON converter or compatibility reader.
The bundled example uses “Actually good advice” as its title and the introductory
paragraph as its subtitle, retaining all four numbered criteria and the closing
paragraph in its body. Generated `ArticleBrick` specs bind `/title`, `/subtitle`,
and `/content` separately.

Article bricks and previews render their title and subtitle above a client-mounted
Meowdown MarkdownView in Hide mode. They mount no editor. Links open in a new tab,
saved image dimensions are retained, and task checkboxes are disabled. Raw HTML
remains literal Markdown content; arbitrary Markdown round trips can normalize
source. The retained `/bricks/<brickId>` route shows only the module form and
Save/Cancel controls, without headings or an outline.
Modules without forms have an empty drawer body.

The **Admin** breadcrumb links to `/bricks/<brickId>/admin`, containing Generate
spec, Shared state JSON, and Brick Definition. The Hide/Show Options are removed.
Admin's brick-ID breadcrumb returns to the form page. Both routes retain the empty
browser frames and persistent drawer shell.
Admin is a UI route, not an authorization boundary.

Module forms own their drafts and Save/Cancel controls; Admin's JSON draft belongs
to its route. Save stages one complete
`updateBrick` command synchronously and leaves the current page open; Cancel discards
that draft and errors. Save captures no dimensions. Failed saves retain the draft and
show an error. Article validates Markdown strings and the complete state, keeps
unsaved drafts across session echoes, and follows saved props when clean. Cancel
remounts its editor to discard Markdown edits and canceled undo history. Article's Admin JSON
editor validates state, disables Save for invalid or unchanged values, and keeps
invalid input visible. Placeholder-capable modules still accept null. Closing,
navigating between form and Admin, changing brick, or deleting the brick discards
unsaved drafts. Breakpoint switches retain the form draft.

Native Meowdown controls retain formatting, selection, undo/redo, block dragging,
and image resizing. Resizing writes width/height into a trailing Markdown comment.
Portaled menus appear above the drawer; their link form cannot submit Article.
Escape first dismisses an editor control or selection, then closes the drawer.
`ArticleEditorControl` remains drawer-only.

Article module rendering retains its white shell and clips overflowing content;
the editor surface does not paint the background. Content changes, image loads,
and width changes do not update retained Placement geometry. Phase 1 has no
placed-brick display or grid resize handles.

Article uploads remain disabled: Meowdown receives no file-persistence handler,
so it exposes no attachment picker or upload slash command. HTTP(S) images display
and can be resized in the drawer. Automatic YouTube/X paste conversion and provider
resolution are disabled in both editor and viewer; ordinary URL pastes remain links.
Explicit media syntax can display native placeholders. `ArticleForm` owns drafts
and Save/Cancel. Image's upload environment does not enable Article uploads; Image
and Site Settings retain their endpoints. The standalone backup lifecycle provides
local durability after Save. Consumers load `@qrk.sh/library/article-editor.css`
alongside `bricks.css` for editor and portaled-control styles.

## Wall publication snapshots

QRK owns publication serialization in its existing `PageSnapshotSchema` and
`makePageSnapshot` files under `apps/zerospin/src/aggregates/user/snapshots/`.
Those files select saved page metadata, brick IDs/module state, and placement
breakpoint/spec/geometry/visibility; they exclude editing bookkeeping and define
stable array ordering.

Library owns editable Brick/Placement models and their field codecs, exposed
through `libraryModule`. It exposes no publication snapshot schema/projection API
and stores no separate WallSnapshot model. Editing reads live models, and
standalone durability uses the regular session backup mechanism.
QRK owns site/page publication flags, current snapshot pointers, and history.
