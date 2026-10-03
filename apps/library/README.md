# Library

The brick library, TanStack Start app, and scraper backend share this package.
Vite+ runs TanStack Start and the Cloudflare Worker together through
`@cloudflare/vite-plugin`, following the
[Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/).

From the repository root:

```sh
pnpm nx run @qrk.sh/library:dev
```

Open `http://127.0.0.1:4100`. The form calls `/rpc` on that same
server. A separate scraper process and `SCRAPER_URL` are no longer needed.
This command runs locally and does not deploy anything.

## Configuration

Put local settings in `apps/library/.env.local`:

- `PUBLIC_MAPBOX_TOKEN` is required for the library app and is exposed to the browser.
- `GITHUB_TOKEN`, `FIGMA_TOKEN`, `GOOGLE_PLACES_API_KEY`, `STREAMLINE_API_KEY`,
  and `OPENAI_API_KEY` are private Worker credentials for their respective
  providers.

The Cloudflare plugin loads the private settings as Worker bindings. Only the
Mapbox token is explicitly included in the browser build.

`wrangler.jsonc` retains the `library` Worker identity, browser binding, Durable
Object bindings, and migrations. Local cache data lives under `.wrangler/state`.
The Worker implementation and its tests live in `worker`, with module-owned
`*Backend` Durable Objects under `modules/<moduleFolder>/`. Client imports
use the existing `*.public.d.ts` contracts so Worker implementation types do not
become part of the brick library's public declarations. Linktree scraping lives
in the separate `@qrk.sh/scraper` Worker (`apps/scraper`).

## Checks and builds

```sh
pnpm nx run @qrk.sh/library:tsc
pnpm nx run @qrk.sh/library:lint
pnpm nx run @qrk.sh/library:build:app
pnpm nx run @qrk.sh/library:build
```

`tsc` checks both browser and Worker code. Library tests are intentionally not
maintained for now (see root `AGENTS.md`).

`build:app` produces the TanStack Start Worker app via the Cloudflare Vite plugin.
`build` produces the reusable brick library in `dist`, including its public
Worker/RPC declarations. Neither build deploys the app.

## Public exports and shared UI

`package.json` lists the public subpaths and `vite.lib.config.ts` maps each one to
its defining source. `build` emits their JavaScript and declaration files; `app/`
contains the Library-only routes and layout, not exported application screens.

| Import under `@qrk.sh/library`    | Defining source                             | Purpose                                                   |
| --------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| package root                      | `lib/index.ts`                              | Small barrel: `modulesHash`, `IModule`, `IModuleBrickDef` |
| `/ModuleFilmstrip`                | `lib/ModuleFilmstrip.tsx`                   | Shared horizontal module catalog                          |
| `/Drawer`                         | `lib/Drawer.tsx`                            | Shared Drawer and existing DrawerPresence                 |
| `/BrickWall`                      | `lib/BrickWall.tsx`                         | Interactive wall                                          |
| `/GridItemPreview`                | `lib/GridItemPreview.tsx`                   | Preview geometry                                          |
| `/WallViewportProvider`           | `lib/WallViewportProvider.tsx`              | Viewport provider and hooks                               |
| `/WallBreakpointPane`             | `lib/WallBreakpointPane.tsx`                | Shared directional fixed-width wall pane                  |
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

Library and Studio share `ModuleFilmstrip`, including module previews, four-breakpoint
measurement, and `DraggableBrick`. Each app supplies its own module links through
`renderModuleLink`; the shared catalog has no router dependency. Columns scroll
vertically within a horizontal strip. Module detail screens remain app-owned.

## Modules and interaction

`modulesHash` exposes each library module by its registered kebab-case id, with
no arbitrary-string index signature. Module URLs decode their ID against the
brick model enum before passing it through route context; unknown IDs remain 404s.
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

Image is the first opt-in. The Library drawer's **Display placeholders** checkbox
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

`Layout` initializes the module-level `librarySession` with
`useInitializeStandaloneSession`. Its `qrk-library` backup key persists the
`wal_library` document across reloads and initialization registers it with DevTools.
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

Library's backup-worker Vite plugin serves `/__zerospin/backup-worker.js` and
`/__zerospin/wa-sqlite-async.wasm` during development and emits them into the
application build. Studio copies the same built assets into its public directory.

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

## Text editing in the brick drawer

Text bricks and previews always display HTML generated in the browser from committed Tiptap JSON, without an editor instance. Serialization errors reach the existing error boundary. Saved image widths are retained and task checkboxes are disabled. Placed Text bricks remain read-only on Library's wall. Double-click or **Edit text** opens the brick-detail drawer, with a Text form as the first root outline section and Shared state JSON as another. Each section has its own draft and Save/Cancel controls. Unsaved Text and JSON edits stay independent and do not change wall content. A section's Save stages one complete `updateBrickState` command and leaves the drawer open; the last successful Save wins if both drafts differ. Its Cancel discards only that section's draft. Invalid JSON remains visible with an error and disables JSON Save, without blocking Text Save. Unchanged content, including the editor's empty-document normalization, cannot be saved.

The toolbar sits above the drawer document. Formatting, selection, undo/redo, block dragging, and image resizing remain available. Escape first dismisses an editor popover; otherwise it closes the drawer. Closing, navigating away, or deleting the brick discards both drafts. Clicking the wall alone does not discard a draft. Reopening starts from committed state. The drawer editor and its drafts survive a breakpoint switch because Text content is shared across breakpoints. Studio no longer exposes inline Text editing or a Text edit button; ordinary brick-detail navigation remains available. `BrickWall.showTextEditAction` defaults to true for Library; Studio sets it to false. `TextEditorControl` is drawer-only.

The HTML display observes Text's natural border-box height after generation, including padding and later image loads, and rounds up to square grid rows at the actual width. Growth resolves collisions without compacting gaps; shrink leaves neighbors in place. Measurements are batched against current geometry, paused during grid gestures, and repeated after the gesture commits. Compact is disabled during a gesture. Only the active pane writes automatic heights.

Text uploads are temporarily disabled inside the Text module. All Tiptap extensions remain registered, Add image is disabled, and existing upload placeholders show “Uploads temporarily disabled” without a file picker or dropzone. Existing images still display and can be resized in the drawer. The application and shared module form contract carry only form state and changes; they no longer provide upload callbacks or track upload progress, cancellation, or Save gating. Upload endpoints remain available for unrelated features. The existing standalone backup lifecycle provides local durability after Save. Consumers of the built package load `@qrk.sh/library/text-editor.css` alongside `bricks.css` for editor and portaled-control styles.
