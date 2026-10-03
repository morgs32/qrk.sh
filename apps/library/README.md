# Library

This package owns the reusable brick library and Next.js App Router UI. Next
uses webpack, matching Studio. The Cloudflare Worker backend lives in
[`apps/api`](../api/README.md); Nx starts both development servers and builds
their dependencies.

From the repository root:

```sh
pnpm nx run @qrk.sh/library:dev
```

Open `http://127.0.0.1:4100`. Next forwards `/rpc`, `/upload`, and `/assets/*` to
the API Worker at `http://127.0.0.1:8787`; its inspector listens on port 9231.
Browser callers keep their same-origin URLs. This command runs locally and does
not deploy anything. `pnpm nx run @qrk.sh/api:dev` runs the backend alone.

## Configuration

Put local settings in `apps/library/.env.local`:

- `PUBLIC_MAPBOX_TOKEN` is required for the library app and is exposed to the browser.
- `LIBRARY_WORKER_ORIGIN` optionally changes Next's backend destination; it defaults
  to `http://127.0.0.1:8787` and is server-only. Set it before building the app when
  using a different backend origin in production.

Private provider credentials belong in `apps/api/.env.local`, where Wrangler
loads them as Worker bindings. Only the Mapbox token is explicitly included in
the Library browser build.

Module definitions, catalogs, views, aggregate behavior, and browser RPC
declarations stay here. API owns `LibraryApi`, `BrowserHost`, generation,
provider helpers, and module backend Durable Objects. GitHub uses direct
`getGitHubProfile` and `getGitHubRepo` methods, with successful upstream responses
retained by API's storage-only `BackendRepo`. Client imports retain the
existing `worker/*.public.d.ts` paths, so Worker implementation types do not
become part of the brick library's public declarations. Linktree scraping stays
in the separate `@qrk.sh/scraper` Worker (`apps/scraper`).

API retains the `ASSETS` bucket for `/assets/library/*` and serves other asset
keys from `QRKSH`. Uploads now require Clerk authentication. Existing image bytes
and local state directories remain preserved, with local `ASSETS` data copied
to API's state. Saved absolute port-4101 URLs need their origin updated
separately; authored documents are not rewritten.

## Checks and builds

```sh
pnpm nx run @qrk.sh/library:tsc
pnpm nx run @qrk.sh/library:lint
pnpm nx run @qrk.sh/library:build:app
pnpm nx run @qrk.sh/library:build
```

`tsc` checks Library browser and shared module code. API checks its Worker code
separately. Library tests are intentionally not maintained or run (see root
`AGENTS.md`).

`build:app` produces the Next app in `.next`.
`build` produces the reusable brick library in `dist`, including its public
Worker/RPC declarations. Neither build deploys the app.

After `build:app`, run `pnpm nx run @qrk.sh/library:preview` to serve the built
Next app on port 4100 alongside the local API Worker. The UI routes are
`/`, `/modules`, `/modules/[moduleId]`, `/bricks/[brickId]`, and
`/bricks/[brickId]/admin`. App Router navigation
retains the wall, drawer, standalone session, and viewport providers; route-specific
module and brick drafts keep their existing remount boundaries. The document title
remains `QRK.SH Library`, with diagnostic error and not-found screens.

## Public exports and shared UI

`package.json` lists the public subpaths and `vite.lib.config.ts` maps each one to
its defining source. `build` emits their JavaScript and declaration files; `app/`
contains the Library-only routes and layout, not exported application screens.

| Import under `@qrk.sh/library`    | Defining source                             | Purpose                                                   |
| --------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| package root                      | `lib/index.ts`                              | Small barrel: `modulesHash`, `IModule`, `IModuleBrickDef` |
| `/backendLibrary`                 | `backendLibrary.ts`                         | Module catalog registry used by API generation            |
| `/ModuleFilmstrip`                | `lib/ModuleFilmstrip.tsx`                   | Shared horizontal module catalog                          |
| `/Drawer`                         | `lib/Drawer.tsx`                            | Shared Drawer and existing DrawerPresence                 |
| `/BrickWall`                      | `lib/BrickWall.tsx`                         | Interactive wall                                          |
| `/GridItemPreview`                | `lib/GridItemPreview.tsx`                   | Preview geometry                                          |
| `/WallViewportProvider`           | `lib/WallViewportProvider.tsx`              | Viewport provider and hooks                               |
| `/WallBreakpointPane`             | `lib/WallBreakpointPane.tsx`                | Shared fixed-width wall pane with browser chrome           |
| `/breakpoints`                    | `lib/breakpoints.ts`                        | Breakpoint definitions and sizing                         |
| `/brickDragStore`                 | `lib/brickDragStore.ts`                     | Shared drag state                                         |
| `/TiptapDocSchema`                | `lib/TiptapDocSchema.ts`                    | Article document schema                                   |
| `/MeasuredBrickWrapper`           | `components/brick/MeasuredBrickWrapper.tsx` | Content measurement                                       |
| `/libraryModule`                  | `libraryModule/libraryModule.ts`            | Models and command contracts                              |
| `/createLibraryStandaloneSession` | `session/createLibraryStandaloneSession.ts` | Session factory, context, hook, and type                  |
| `/bricks.css`                     | `bricks.css`                                | Shared brick styles                                       |

Studio imports `Drawer` directly from `@qrk.sh/library/Drawer`; Library's own app
imports `../lib/Drawer`. Supplying `open` keeps the shared shell mounted and uses a
300ms CSS transform for visibility. Library passes its existing local open state,
including closing without changing the URL. The bottom drawer overlays `50dvh`;
the editor remains full-height with matching trailing padding. Padding changes
preserve the current offset, or follow the new bottom when already within 1px of
it, with clamping on close. Initial deep links do not force a bottom scroll.
Viewport-height changes use the same rule; ordinary content growth does not.

Library retains live drawer content through exit, then releases it. Reopening
interrupts cleanup. Closed shells are inert and hidden from assistive technology;
reduced motion skips the animation. Studio preserves outgoing route pixels with
its exit-only ViewTransition. Existing Drawer callers without `open` retain the
optional Motion/flow behavior. Drawer does not own routing, breadcrumbs, or
settings actions. This replaces plan 007's animated grid-row reservation.

Library's grid controls float 24px above the open drawer. Closing the drawer
restores their usual position; their desktop movement follows the drawer's
300ms transition and skips animation for reduced motion.

Library and Studio share `ModuleFilmstrip`, including module previews, four-breakpoint
measurement, and `DraggableBrick`. Each app supplies its own module links through
`renderModuleLink`; the shared catalog has no router dependency. Columns scroll
vertically within a horizontal strip. Module detail screens remain app-owned.

## Modules and interaction

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

Modules can opt into unconfigured bricks with `hasPlaceholder: true` in
`makeModuleVersion` and a matching display-only `default.placeholder` in
`makeModuleView`. Omitting the flag defaults it to false. View construction rejects
both mismatches, so the backend declaration and markup must agree. The returned
module exposes `hasPlaceholder` and `placeholder`; one placeholder is shared across
all breakpoints and receives no props.

```tsx
// In imageV1: the backend accepts null as an unconfigured Image brick.
hasPlaceholder: true,

// In imageView.default: render a shadcn Skeleton until state is supplied.
placeholder() {
  return <Skeleton className="size-full" />;
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
All Library and Studio previews apply the same sizing rules. The wall derives
resize constraints from the active module view; placements persist only geometry.
Existing saved sizes remain unchanged until the user resizes; configuring minimums
does not automatically enlarge or migrate saved bricks.

A new drag waits for
all four breakpoint defaults; measured widths are limited to the wall's eight
columns. `addBrick.program` resolves all four layouts using the drop X/Y and each
breakpoint's own size. The caller supplies `dropPosition`, `placementSizes`, and
`visibleLayouts` snapshots from session placements; grid-proposed neighbor positions
are ignored. The guard requires snapshots to match stored visible geometry exactly,
regardless of array order, and rejects stale snapshots with conflict 409 before mutation.
The program validates all resolved outputs, then creates the brick and four placements
and updates displaced visible neighbors. Hidden and unaffected placements retain their
geometry. This is a fresh `addBrick` version `1.0.0` baseline with no historical adapter;
old payloads and pending commands require the authorized document reset. Module defaults,
preview state, and authored rendering discard undeclared fields during decoding.
`addBrick` and `updateBrickState` validate declared state fields while ignoring extras;
their programs decode again and persist the decoded state. Both accept and persist
null only for modules declaring `hasPlaceholder: true`. The existing Library JSON
state editor can save valid state to replace a placeholder, or null to restore it.
Invalid declared fields and null for other modules still reject the command before
mutation. Spec validation remains strict.
`updateBrickState` requires `moduleId`, checked against the stored brick before decoding.
Pending updates without it must be resubmitted against the current `1.0.0` baseline.
Existing bricks are normalized on their next state update; there is no bulk migration.

`LibraryLayout` initializes the module-level `librarySession` with
`useInitializeStandaloneSession`. Its `qrk-library` backup key persists the
`wal_library` document across reloads and initialization registers it with DevTools.
Navigation releases backup ownership on `pagehide`; a visible `pageshow`
reacquires it when returning through browser history. Saved bricks are retained.
DevTools defaults to closed; its trigger remains available and saved DevTools
visibility preferences still apply.
Restored resources take precedence over the initial seed. Studio uses its authenticated
`userSession`, with a separate wall referenced by each page. It no longer constructs
standalone sessions or reads their per-page IndexedDB backups.

Shared consumers (`LibrarySessionContext`, `useLibrarySession`, and `BrickWall`)
use `ILibrarySession`, the aggregate-session surface with Library models and contracts.
It accepts both the standalone Library session and Studio's larger live user session,
without requiring standalone initialization or reset methods. The shared
`libraryModule` exports only models and flat command contracts. Session construction
owns identity, claims, initialization, and disposal.

`useLiveQuery` reads the session's `db`, returning model-decoded `state`,
`spec`, and `gridItem` values. Components consume these values directly. Explicit writes and backups use encoded SQLite values; relational queries decode model fields.

Committed layout is Wall → Brick → Placement via aggregate contracts
(`addBrick`, layout/visibility/remove/compact, `updateBrickState`, and per-module
spec-at-breakpoint). Commands stage synchronously. Studio pushes through its live
user session; `backupState: ready` describes local backup durability, not server acknowledgement. Shared state lives on the brick row; each placement stores a
complete Spec, grid item, and visibility. `BrickWall` uses `noCompactor` to avoid
closing gaps automatically. Dropping a brick displaces overlapping visible neighbors
downward, including collisions caused by that displacement. **Compact layout** runs
an explicit command. Library reset calls the standalone session's `reset()` to replace its
backup with the original seed and remounts the viewport. Viewport preference persists in
localStorage (`qrk-bricks-library-viewport-v1`).

Four fixed-width walls (360, 720, 1080, and 1440px) remain mounted around one
session. The selected breakpoint returns when it fits again; otherwise the
largest fitting wall is displayed. During catalog drags and grid drag/resize
gestures, selection and available width update while the displayed wall waits
for completion. Below 360px, the insufficient-width message appears as soon as
the gesture ends; a fitting wall returns immediately when space recovers.

`WallBreakpointPane` frames each wall with decorative browser chrome: sm/md use
a Safari-like mobile address pill; lg/xl use desktop window dots and a centered
address bar. Both display static `qrk.sh` and remain noninteractive and hidden
from assistive technology. The 48px muted-gray header and thin inset frame leave
the 360/720/1080/1440px content widths unchanged and allow drags beyond the frame.
The chrome slides and scrolls with its wall, including the existing scroll
compensation while dragging. Library reserves 6rem above the
wall below lg, keeping wrapped controls clear of the chrome, and 3.5rem at lg.
The scroll root uses inherited `--wall-top-offset` for this padding; the pane
sets `--wall-chrome-height: 3rem`. `BrickWall` subtracts both offsets from its
viewport minimum height, with 3.5rem and zero fallbacks respectively, so an
empty wall remains one viewport tall without extra scrolling.

Library and Studio copy the same built backup assets into their public directories:
`/__zerospin/backup-worker.js` and `/__zerospin/wa-sqlite-async.wasm`. Next's webpack
build also emits the standalone session's separate synchronous SQLite WASM asset.

HTML5 catalog drag is a module-level `brickDragStore` (`brickDef` / `setBrickDef`
only). Its shared `IDraggedBrick` payload preserves the registered module ID
from both Library previews and both Studio drawer views through to `addBrick`.
`makeModuleViewLibrary` ties each registry key to its module and definition IDs;
known keys return a module, while arbitrary route strings can return `undefined`.
The wall uses this trusted identity directly; the contract validates the dragged state.
Drop / resize / remove go through contracts on the owning session — not
Zustand `bricksById`.

Placed bricks drag from their entire surface and resize using the grid library's default
bottom-right handle. Module and configuration previews also drag from their entire surface.

## Article editing in the brick drawer

The rich text module uses **Article** and the `article` module ID.
Its default width is 8 grid columns on sm/md and 4 on lg/xl.
Article content uses Open Sans in brick previews and the drawer editor, loaded
through the module's stylesheet. Code blocks retain their monospace font.
Placed bricks expose a small pencil icon button labelled **Edit article**.
Its catalog example and new drops start with “Actually good advice,” including
the introductory paragraphs and numbered criteria. This is a hard rename without
legacy aliases or data migration; old `text` bricks,
`TextBrick` specs, and Text command history may no longer load.

Article state stores required `title` and `subtitle` strings separately from the
nullable Tiptap body `content`. The module form uses plain text title/subtitle
inputs above a writing column capped at 720px, with a flat, centered toolbar.
Brick title/subtitle/body spacing matches the form's text spacing.
Body headings are H2–H4. Standard HTML form validation blocks Save when either
metadata field is empty or contains only whitespace; Admin retains schema-based
JSON validation. This is a hard schema change without migration or fallback:
old content-only Article state and specs may no longer load. No saved data is reset.
The bundled example uses “Actually good advice” as its title and the introductory
paragraph as its subtitle, retaining all four numbered criteria and the closing
paragraph in its body. Generated `ArticleBrick` specs bind `/title`, `/subtitle`,
and `/content` separately.

Article bricks and previews render their title and subtitle above HTML generated
in the browser from committed Tiptap JSON. Serialization errors reach the existing error boundary, saved image
widths are retained, and task checkboxes are disabled. Placed bricks remain read-only.
Double-click or the **Edit article** pencil opens `/bricks/<brickId>`, which shows
only the module form and Save/Cancel controls, without headings or an outline.
Modules without forms have an empty drawer body.

The **Admin** breadcrumb links to `/bricks/<brickId>/admin`, containing Generate
spec, Options, Shared state JSON, and Brick Definition. Admin's brick-ID breadcrumb
returns to the form page. Both routes retain the persistent wall and drawer shell.
Admin is a UI route, not an authorization boundary.

Form and JSON drafts belong to their respective routes. Save stages one complete
`updateBrickState` command and leaves the current page open; Cancel discards that
page's draft. Failed saves retain the draft and show an error. Article's Admin JSON
editor validates state, disables Save for invalid or unchanged values, and keeps
invalid input visible. Placeholder-capable modules still accept null. Closing,
navigating between form and Admin, changing brick, or deleting the brick discards
unsaved drafts. Breakpoint switches retain the form draft.

The drawer toolbar sticks to the top of the scrolling form and retains formatting,
selection, undo/redo, block dragging, and image resizing. Escape first dismisses
an editor popover, then closes the drawer.
Studio suppresses the shared edit action with `BrickWall.showArticleEditAction`;
`ArticleEditorControl` remains drawer-only.

Article brick height stays at its saved placement size. Content changes, image loads,
and width changes do not measure or update grid height. Users resize bricks through
the normal grid handles. The module-owned shell fills the brick with a white
background and clips overflowing content; the editor surface does not paint the
background.

Article uploads are temporarily disabled inside the Article module. All Tiptap extensions remain registered, Add image is disabled, and existing upload placeholders show “Uploads temporarily disabled” without a file picker or dropzone. Existing images still display and can be resized in the drawer. The application and shared module form contract carry only form state and changes; they no longer provide upload callbacks or track upload progress, cancellation, or Save gating. Upload endpoints remain available for unrelated features. The existing standalone backup lifecycle provides local durability after Save. Consumers of the built package load `@qrk.sh/library/article-editor.css` alongside `bricks.css` for editor and portaled-control styles.
