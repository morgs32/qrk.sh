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

Old standalone backups can reject the current SQLite schema. For manual checks
with empty storage, the Portless origin
`https://library.qrk.localhost/` is separate from earlier HTTP origins in the
existing Chrome profile. It preserves backups on `localhost:4100`,
`127.0.0.1:4100`, `qrk-package-cutover.localhost:4100`, and the earlier
`https://library.qrk.localhost:1355` origin; it does not migrate
their rows. Once used, the HTTPS origin retains its own storage between runs.

The development UI routes are
`/`, `/modules`, `/modules/$moduleId`, `/bricks/$brickId`, and
`/bricks/$brickId/admin`. Typed Router navigation
retains the wall, drawer, standalone session, and viewport providers; route-specific
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

The initializer, wall, and viewport owners sit above the route outlet and stay
mounted across child navigation. Route params keep their Effect Schema
validation and draft keys. A local React measurement error boundary replaces
the Next boundary in admin pre-save measurement; rendering failures reject
Save and cancellation still disposes the pending measurement.

The root layout mounts the shared `ZerospinDevtoolsLoader` in every environment with the panel initially closed. It stays mounted across route navigation and standalone-session resets, and owns cleanup when the application unmounts.

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
increments `stateRevision`, and invalidates measurements and active spec generation.
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

Figma measures all four ready breakpoint renders with the existing rounded,
unconstrained DOM wrapper. Its measurement command checks state and spec revisions
before writing all four dimensions atomically. Admin's raw JSON path retains its
separate real pre-save measurement; it compares both state and placement specs
immediately before staging. Other ordinary form saves have no measurement wait.

Swatch and Icon retains the selected `{ hash, name, svg }` from paged icon search.
SVG data URLs are derived for presentation. Save validates a complete hex color
and stages the selected icon and color directly, including the existing/default
icon when no search runs. There is no Save-time icon request.

The fixed-schema cutover uses `/qrk-library-command-query-v1` for Library's local
backup and a corresponding namespace for standalone preview sessions. Previous
backups remain intact. App also requires fresh isolated storage for the new
state/spec revision fields; no migration or reset is performed automatically.

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
| `/BrickWall`                      | `lib/BrickWall.tsx`                          | Interactive wall                                          |
| `/BrickCardStyleContext`          | `lib/BrickCardStyleContext.ts`               | Local boolean appearance shared by wall and previews      |
| `/GridItemPreview`                | `lib/GridItemPreview.tsx`                    | Preview geometry                                          |
| `/WallViewportProvider`           | `lib/WallViewportProvider.tsx`               | Viewport provider and hooks                               |
| `/WallBreakpointPane`             | `lib/WallBreakpointPane.tsx`                 | Shared fixed-width wall pane with browser chrome          |
| `/breakpoints`                    | `lib/breakpoints.ts`                         | Breakpoint definitions and sizing                         |
| `/brickDragStore`                 | `lib/brickDragStore.ts`                      | Shared drag state                                         |
| `/ImageUploadEnvironment`         | `modules/image/ImageUploadEnvironment.ts`    | Host-supplied file upload Effect returning an image URL   |
| `/ImageUploadRuntimeContext`      | `modules/image/ImageUploadRuntimeContext.ts` | Image's runner bound to the existing app session          |
| `/MeasuredBrickWrapper`           | `components/brick/MeasuredBrickWrapper.tsx`  | Content measurement                                       |
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

Library's grid controls float 24px above the open drawer. Closing the drawer
restores their usual position; their desktop movement follows the drawer's
300ms transition and skips animation for reduced motion.

Library and App share `ModuleFilmstrip`, including module previews, four-breakpoint
measurement, and `DraggableBrick`. Each app supplies its own module links through
`renderModuleLink`; the shared catalog has no router dependency. Columns scroll
vertically within a horizontal strip. Module headings span their columns edge
to edge and stick to the top while previews scroll underneath. Module detail
screens remain app-owned.

## Local card appearance spike

The **Cards** button in Library's grid controls and App's upper-right corner
toggles one local boolean through `BrickCardStyleContext`. Its provider covers
the wall and drawer previews; no module catalog or registry appearance props are
added. The flag starts `false`, survives drawer navigation while its layout stays
mounted, and is not persisted on Site, Page, or in localStorage.

The default mode draws touching bricks with one shared 1px `var(--border)` rule,
matching the site navbar's bottom border color.
Overlapping strokes use the same pixels; the wall's right/bottom perimeter and
standalone preview frames stay inside their boxes. Card mode uses RGL's native
16px margins and 16px container padding, producing one 16px gap between cards
and at the wall perimeter. Each card surface fills its RGL slot, with no extra
inset. Cards use an 8px radius, white background, and the preview shadow on the
surface. Module content retains its own padding, backgrounds, and media layout.
See [the shared-border research](../../wiki/research/react-grid-layout-shared-borders.md)
and [card geometry](../../wiki/research/page-brick-card-styling.md).

For wall width `W`, card-mode pitch is `(W - 16) / 8` and row height is
`pitch - 16`, keeping unit cards square. Fixed previews use
`round(w * pitch - 16)` by `round(h * pitch - 16)`; default mode retains `W / 8`
pitch with zero margins/padding. Drag hit targets, resize outlines, and handles
follow the native RGL card slot. Stored logical coordinates and dimensions,
minimum-unit conversion, and measurement callbacks remain unchanged. Intrinsic
previews measure the original content root with no extra decorative padding.
Existing fixed-size content can clip in the smaller card-mode slot. This remains
a local visual spike.

## Modules and interaction

Wall bricks and fixed-size catalog/detail previews show a 2px dark border
immediately on pointer hover or keyboard focus. Flat wall hover outlines follow
the shared grid border's 1px right/bottom extension, keeping the wall perimeter
inside its box. Cards and standalone previews keep their inset outline. Their
cells, surfaces, and resize handles stay stationary, with no hover lift, outward
shadow, or transition.
Wall hover pauses during grid dragging or resizing. The active brick keeps its
black outline; resize handles stay hidden during dragging, and only the resizing
brick keeps its handles until the gesture ends.
Reduced motion uses the same immediate border.
Intrinsic measurement hosts retain their existing sizing behavior.

A successful catalog drop calls `BrickWall.onBrickActivate` for the new brick,
opening the consuming app's detail drawer. Failed drops do not activate a brick.

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
Internal previews, state updates, and drag callbacks retain the registered ID union.
`defineModule` declares identity; `makeModuleVersion` owns the catalog, `stateShape`,
and `defaultState`. `makeModuleView` infers authored callback props from that state
shape and decodes incoming state before rendering, discarding undeclared fields.
Its authored wrappers are created once and reused by previews and placed bricks.
It also attaches a json-render `generator` (`registry` + `defaultSpec`).

`defineModule` accepts optional `maxPerPage`, a positive integer; omission means
unlimited. Article declares `1` and Instagram declares `2`. The limit counts brick
records with the same `wallId` and module ID, including hidden and unconfigured
bricks, once across all breakpoints. Catalog and module detail previews show the
limit and disable dragging when it is reached; the wall also refuses excess
drops. `addBrick` enforces the same rule with
`add-brick-module-limit-reached` (409). Removing a brick frees capacity. Existing
over-limit pages keep their content and cannot add that module until below its
limit.

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
icon and label visible. New drops store `state: null`, while its populated
`defaultState` remains for catalog previews. Its skeleton respects reduced motion
and contains no outbound link.
Link uses its module-owned `LinkPlaceholder` with skeleton icon, URL, title,
and hero image. New drops store `state: null`, while its populated `defaultState`
remains for catalog previews. Its skeleton respects reduced motion and contains
no outbound link.
Instagram uses its module-owned `InstagramPlaceholder` with a skeleton four-post
grid, icon, username, follower count, and follow button. New drops store
`state: null`, while its populated `defaultState` remains for catalog previews.
Its skeleton respects reduced motion and contains no outbound link.
GitHub Repo uses
its module-owned `GitHubRepoPlaceholder` with skeleton repository name,
description, stars, forks, and language. New drops store `state: null`, while its
populated `defaultState` remains for catalog previews. Its skeleton respects
reduced motion.
GitHub Profile uses its
module-owned `GitHubProfilePlaceholder` with skeleton avatar, username, profile
details, and statistics. New drops store `state: null`, while its populated
`defaultState` remains for catalog previews. Its skeleton respects reduced motion.
GitHub Activity uses its module-owned
`GitHubActivityPlaceholder` with skeleton month and weekday labels, contribution
squares, and legend. New GitHub Activity drops store `state: null`, with no payload
or contribution data until configured; its populated `defaultState` remains for
catalog previews. The skeleton respects reduced motion.

The Library drawer's **Display placeholders** checkbox
starts unchecked and switches eligible catalog previews between their example state
and placeholder without changing preview measurements or drag data. The choice lasts
until reload. On a new drop, `BrickWall` stores null for modules with a placeholder
while preserving the dragged spec and placement sizes; other modules copy the
dragged state. The shared renderer selects the placeholder only for exact null, before
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
remain independent of view code. Optional `sm` / `md` / `lg` / `xl` overlays merge onto `default`
(component, generator, declared `w`/`h`). Grid sizing is measured at preview/drag
time unless both `w` and `h` are declared on that overlay. Each overlay also accepts
independently optional `minW` and `minH` in grid units:

```ts
sm: { w: 8, h: 4, minW: 4, minH: 2 }, // Initial size and resize minimums.
md: { minW: 3 }, // Measured width starts at three columns or wider.
```

Minimums apply to measured initial sizes and wall resizing, with a one-unit floor
when omitted. They do not inherit between breakpoints. Minimums must be positive
integers, `minW` cannot exceed eight columns, and declared `w`/`h` cannot be below
their corresponding minimum. Invalid configuration throws during view construction.
All Library and App previews apply the same sizing rules. The wall derives
resize constraints from the active module view. Placement grid geometry remains
separate from its saved pixel measurements.
Link's default width is six columns on sm/md and four on lg/xl. Its heights
remain four rows on sm/md, two on lg, and one on xl.
Map Place defaults to four rows at every breakpoint. Article defaults to 8×8
on sm, 6×6 on md, and 4×4 on lg/xl.
Existing saved sizes remain unchanged until the user resizes; configuring minimums
does not automatically enlarge or migrate saved bricks.

A new drag waits for
all four breakpoint defaults; measured widths are limited to the wall's eight
columns. `addBrick.program` resolves all four layouts using the drop X/Y and each
breakpoint's own size. The caller supplies `dropPosition`, `placementSizes`, and
`visibleLayouts` snapshots from session placements; grid-proposed neighbor positions
are ignored. The guard requires snapshots to match stored visible geometry exactly,
regardless of array order, and rejects stale snapshots with conflict 409 before mutation.
The program resolves collisions and vertically compacts each breakpoint before
validating its output, then creates the brick and four placements and updates only
visible neighbors whose geometry changed. Hidden and unaffected placements retain
their geometry. This is a fresh `addBrick` version `1.0.0` baseline with no historical adapter;
old payloads and pending commands require the authorized document reset. Module defaults,
preview state, and authored rendering discard undeclared fields during decoding.
`addBrick` and `updateBrick` validate declared state fields while ignoring extras;
their programs decode again and persist the decoded state. Both accept and persist
null only for modules declaring `hasPlaceholder: true`. The existing Library JSON
state editor can save valid state to replace a placeholder, or null to restore it.
Invalid declared fields and null for other modules still reject the command before
mutation. Spec validation remains strict.
`updateBrick` requires `moduleId`, checked against the stored brick before decoding.
Pending updates without it must be resubmitted against the current `1.0.0` baseline.
Existing bricks are normalized on their next state update; there is no bulk migration.

A module view may set `measureOnSave: true`; the default is false, and Figma
Thumbnail opts in. `useUpdateBrick({ brickId })` owns an explicit SWR mutation and
returns `updateBrick(state)`, `measurementHost`, `isMutating`, and `cancelSave`. The brick drawer
and Admin render the hidden host and await the mutation. It renders proposed state
against each placement's actual Spec and breakpoint, including hidden placements,
using the existing `MeasuredBrickWrapper` and unconstrained CSS. It captures the
wrapper's rounded dimensions without adding image-specific sizing or load waits.
Before staging it rereads the brick and placement specs, rejecting changed specs
or deleted bricks. Cancel and closing invalidate pending measurement. The forms keep their
module-specific fetching and state schemas; their Save handlers await this shared Save.

Each placement stores nullable `measured: { widthPx, heightPx }`, with positive
integer CSS-pixel values and a null default. The brick stores shared state rather
than a breakpoint map. `updateBrick` accepts `measurements: null` or a complete
`sm`/`md`/`lg`/`xl` map; the map is transport-only. One command atomically writes
the decoded brick state and each placement's measurement, preserving `gridItem`,
visibility, and Spec. A null map clears all four measurements. New placements start
with null, and spec-at-breakpoint commands clear the affected placement's measurement.

```ts
{
  // Measured content size in CSS pixels.
  measured: { widthPx: 320, heightPx: 268 },
  // Placement geometry remains in grid units.
  gridItem: { i: brickId, x: 0, y: 0, w: 4, h: 3 },
}
```

`LibraryApp` is created from `libraryBrowserDefinition`. `LibraryLayout` mounts
its `Initializer`, which owns a fresh browser facade and starts it after commit.
The initialized content suspends until SQLite is ready. The SPA shell contains
no initialized session data. The `qrk-library` namespace
persists the seeded `wal_library` through the SharedWorker's owned IndexedDB VFS.
Worker identity includes the exact session definition; changed fixed schemas require
empty storage and do not read or translate deprecated rows. Preserve earlier
origins and use the fresh-origin check above before the first current start.

The authored worker is imported through Vite's `?sharedworker&url` query and
bound through `makeApplicationSharedWorker`. Its entrypoint imports
`@zerospin/browser/sqlite.wasm?url` from the installed `15.0.1` browser package
and registers the existing session definition with `makeSharedWorker`.
Worker identity, backup paths, source exports, and backend contracts are
unchanged by the framework migration.

Closing the last connection drains the owned Node and closes its SQLite storage
before releasing the namespace lease. Restored resources take precedence over
the initial seed. DevTools defaults to closed and retains its visibility preference.
App uses its authenticated `UserApp` initialized session, with a separate wall
referenced by each Page.

Shared consumers (`LibrarySessionContext`, `useLibrarySession`, and `BrickWall`)
use `ILibrarySession`, the aggregate-session surface with Library models and contracts.
It accepts both the standalone Library session and App's larger live user session,
without requiring standalone initialization or reset methods. The shared
`libraryModule` exports only models and flat command contracts. Session construction
owns identity, claims, initialization, and disposal.

Command execution belongs to each app's session lifecycle. Both apps pass
`stageAggregateSessionCommand` into the shared `BrickWall`. The wall calls that required
`executeCommand` prop directly. The Library worker executes staged originals locally;
App's worker admits and synchronizes them with the authenticated owner.

`useLiveQuery` reads the session's `initialized.db`, returning model-decoded `state`,
`spec`, `measured`, and `gridItem` values. Components consume these values directly. Explicit writes and backups use encoded SQLite values; relational queries decode model fields.

Committed layout is Wall → Brick → Placement via aggregate contracts
(`addBrick`, layout/visibility/remove/compact, `updateBrick`, and per-module
spec-at-breakpoint). Commands run synchronously: Library commits completed local
execution, while App stages optimism and pushes through its live user session.
Local staging durability and server finalization are distinct. Shared state lives
on the brick row; each placement stores a
complete Spec, nullable pixel measurement, grid item, and visibility. `BrickWall` uses `verticalCompactor` for
packed drag/resize feedback. Module contracts compact before persisting geometry:
add/show resolve collisions first, layout updates compact their payload, hide compacts
visible survivors at its breakpoint, and remove compacts survivors at all four
breakpoints. Hide/remove read stored rows and explicitly exclude the target because
emitted operations are not applied during the contract program. Geometry updates skip
unchanged placements; hiding retains the hidden brick's saved geometry and Spec.

Each mounted wall, including inactive breakpoint panes, normalizes existing gaps
through `compactLayoutAtBreakpoint`. It compares stored geometry by brick ID, defers
during grid gestures or catalog drags, and stages only changed layouts. Failed attempts
use the existing command error callback and do not repeatedly retry unchanged input.
The Library toolbar no longer has a **Compact layout** button. Library reset calls the
standalone session's `reset()` to replace its
backup with the original seed and remounts the viewport. Viewport preference persists in
localStorage (`qrk-bricks-library-viewport-v1`).

Four fixed-width walls (360, 720, 1080, and 1440px) remain mounted around one
session. The selected breakpoint returns when it fits again; otherwise the
largest fitting wall is displayed. During catalog drags and grid drag/resize
gestures, selection and available width update while the displayed wall waits
for completion. Below 360px, the insufficient-width message appears as soon as
the gesture ends; a fitting wall returns immediately when space recovers.

Library and App use a white wall canvas at all four breakpoints. `BrickWall`
uses zero margins/padding in default mode, so placement boxes meet both wall
edges; row height is the full width divided by eight. Card mode uses equal 16px
interior/perimeter gaps and the square-cell formula described above.
Its optional `selectedBrickId` keeps the matching brick's outline and resize handles
visible in the idle active wall. App supplies the brick-detail route ID; hover,
focus, and drag/resize suppression retain their existing behavior.
Shared `bricks.css` styles the grid placeholder during brick dragging, catalog drops,
and resizing with a light-gray background, square corners, and a subtle
inset shadow. Placeholder dimensions, positioning, and transitions retain the
grid's existing behavior. During resizing, the active brick and its anchors stay
above the placeholder.

`WallBreakpointPane` frames each wall with decorative browser chrome: sm/md use
a Safari-like mobile address pill; lg/xl use desktop window dots and a centered
address bar. Both display static `qrk.sh` and remain noninteractive and hidden
from assistive technology. The 48px muted-gray header and thin inset frame leave
the 360/720/1080/1440px frame widths unchanged. The frame allows resize handles
and dragged surfaces to overflow into surrounding gutters; each brick's content
remains clipped by its own wrapper. Editor boundaries still clip overflow when
a wall fills the available width; breakpoint fitting reserves no extra gutters.
Library adds a decorative 64px navbar below the address bar, matching App's
complete page navbar in the same position above `BrickWall` and showing a static
`qrk.sh` label. Library's navbar is noninteractive and hidden from assistive
technology; App's appears with the initialized editor and preserves its
navigation and site-name draft previews. Library's chrome and navbar slide and
scroll with their wall, including the existing scroll compensation while dragging.
App keeps the chrome outside an inner page scroller with a hidden scrollbar;
its navbar scrolls with the wall, and the complete frame slides between breakpoints.
Library reserves 6rem above the
wall below lg, keeping wrapped controls clear of the chrome, and 3.5rem at lg.
The scroll root uses inherited `--wall-top-offset` for this padding; the pane
sets `--wall-chrome-height: 3rem`. Both apps override that value to `7rem` around
their navbar and wall to account for both bars; App adds 32px above the frame
and, with its drawer closed, 43px below it, so the frame bottom bisects the 38px
toolbar (which remains 24px from the viewport bottom). Its external
`--wall-top-offset: calc(2rem + 1.5rem + (1.75rem + 0.5rem + 2px) / 2)` accounts for both
padding amounts. Opening App's drawer changes the offset to
`calc(50dvh + 4rem)`, shortening the frame to keep a matching 32px gap above the
drawer.
`BrickWall` subtracts both offsets
from its viewport minimum height, with 3.5rem and zero fallbacks respectively, so an
empty wall remains one viewport tall without extra scrolling.

Library and App resolve browser SQLite WASM from the installed Zerospin
`15.0.1` package exports. The Library standalone worker imports the same pure
`librarySessionDefinition` as its host definition. App authors its connected
`node.worker.ts` entrypoint, and both hosts use `makeApplicationSharedWorker`
to identify the emitted executable artifact. Vite emits each worker from its
`?sharedworker&url` import and its SQLite WASM from the installed package's
`?url` import. Persistent Node
storage belongs to the SharedWorker's IndexedDB-backed SQLite namespace;
no separate backup worker or public backup-worker assets remain.

HTML5 catalog drag is a module-level `brickDragStore` (`brickDef` / `setBrickDef`
only). Its shared `IDraggedBrick` payload preserves the registered module ID
from both Library previews and both App drawer views through to `addBrick`.
`makeModuleViewLibrary` ties each registry key to its module and definition IDs;
known keys return a module, while arbitrary route strings can return `undefined`.
The wall uses this trusted identity directly; the contract validates the dragged state.
Drop / resize / remove go through contracts on the owning session — not
Zustand `bricksById`.

Placed bricks drag from their entire surface and resize using white pill anchors
with a thin black border at the four edge midpoints, aligned parallel to each edge.
The anchors remain visible during resizing and on idle touch devices. Dragging
hides all anchors; resizing hides other bricks' anchors.
The square outline stays visible during dragging and resizing; hover uses the
surface's border. Every edge keeps its anchor, including at the grid boundaries.
Resizing clamps to the grid's left, right, and top boundaries and the module's
minimum width and height; the bottom edge can grow the wall. These controls belong
to the active wall and retain grid snapping, module minimum sizes, vertical
compaction, and the existing layout persistence. Module and configuration previews
also drag from their entire surface.

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
Placed bricks expose a small pencil icon button labelled **Edit article**.
Its catalog example and new drops start with “Actually good advice,” including
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
values become 30px and 32px respectively. App's site navbar consumes the
inline inset only; Library's decorative navbar keeps its existing spacing.
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
local cutover backs up backend storage and uses fresh browser origins, leaving old
origin databases and Clerk cookies untouched. The installed browser runtime can
reset incompatible node tables during initialization; preserve old stores before
opening a rebuilt application. There is no JSON converter or compatibility reader.
The bundled example uses “Actually good advice” as its title and the introductory
paragraph as its subtitle, retaining all four numbered criteria and the closing
paragraph in its body. Generated `ArticleBrick` specs bind `/title`, `/subtitle`,
and `/content` separately.

Article bricks and previews render their title and subtitle above a client-mounted
Meowdown MarkdownView in Hide mode. They mount no editor. Links open in a new tab,
saved image dimensions are retained, and task checkboxes are disabled. Placed bricks
remain read-only. Raw HTML remains literal Markdown content; arbitrary Markdown
round trips can normalize source.
Double-click or the **Edit article** pencil opens `/bricks/<brickId>`, which shows
only the module form and Save/Cancel controls, without headings or an outline.
Modules without forms have an empty drawer body.

The **Admin** breadcrumb links to `/bricks/<brickId>/admin`, containing Generate
spec, Options, Shared state JSON, and Brick Definition. Admin's brick-ID breadcrumb
returns to the form page. Both routes retain the persistent wall and drawer shell.
Admin is a UI route, not an authorization boundary.

Module forms own their drafts and Save/Cancel controls; Admin's JSON draft belongs
to its route. Save stages one complete
`updateBrick` command and leaves the current page open; Cancel discards that
draft and errors, and invalidates pending submissions. Save awaits optional
placement measurements through the host before staging;
its pending controls cover the whole operation. Failed saves retain the draft and
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
App suppresses the shared edit action with `BrickWall.showArticleEditAction`;
`ArticleEditorControl` remains drawer-only.

Article brick height stays at its saved placement size. Content changes, image loads,
and width changes do not measure or update grid height. Users resize bricks through
the normal grid handles. The module-owned shell fills the brick with a white
background and clips overflowing content; the editor surface does not paint the
background.

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
and stores no separate WallSnapshot model. Its shared wall renderer reads live
models, and standalone durability uses the regular session backup mechanism.
QRK owns site/page publication flags, current snapshot pointers, and history.
