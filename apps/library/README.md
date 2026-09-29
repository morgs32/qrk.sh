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

## Modules and interaction

`modulesHash` exposes each library module by its registered kebab-case id, with
no arbitrary-string index signature. Module URLs decode their ID against the
brick model enum before passing it through route context; unknown IDs remain 404s.
Internal previews, state updates, and drag callbacks retain the registered ID union.
`defineModule` declares identity; `makeModuleVersion` owns the catalog, `stateShape`,
and `defaultState`. `makeModuleView` infers authored callback props from that state
shape and decodes incoming state before rendering, preserving extra provider fields.
Its authored wrappers are created once and reused by previews and placed bricks.
It also attaches a json-render `generator` (`registry` + `defaultSpec`).

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
time unless both `w` and `h` are declared on that overlay. A new drag waits for
all four breakpoint defaults; measured widths are limited to the wall's eight
columns. `addBrick.program` resolves all four layouts using the drop X/Y and each
breakpoint's own size. The caller supplies `dropPosition`, `placementSizes`, and
`visibleLayouts` snapshots from session placements; grid-proposed neighbor positions
are ignored. The guard requires snapshots to match stored visible geometry exactly,
regardless of array order, and rejects stale snapshots with conflict 409 before mutation.
The program validates all resolved outputs, then creates the brick and four placements
and updates displaced visible neighbors. Hidden and unaffected placements retain their
geometry. This is a fresh `addBrick` version `1.0.0` baseline with no historical adapter;
old payloads and pending commands require the authorized document reset. Dragged state
reaches the strict `addBrick` guard without projection; extra provider fields are
rejected there even when they were retained by preview state decoding.

`Layout` initializes the module-level `librarySession` with
`useInitializeStandaloneSession`. Its `qrk-library` backup key persists the
`wal_library` document across reloads and initialization registers it with DevTools.
Restored resources take precedence over the initial seed. Studio retains
`createLibraryStandaloneSession({ key, wallId })` and
`useInitializeStandaloneSession`, using
`JSON.stringify(["studio", user.id, siteId, pageId])` to isolate each document's
IndexedDB backup. Restored Studio resources take precedence over its seed.

Shared consumers (`LibrarySessionContext`, `useLibrarySession`, and `BrickWall`)
use `ILibrarySession`, inferred from `createLibraryStandaloneSession`. The shared
`libraryModule` exports only models and flat command contracts. Session construction
owns identity, claims, initialization, and disposal.

`useLiveQuery` reads the session's `queryDb`, returning model-decoded `state`,
`spec`, and `gridItem` values. Components consume these values directly. The
session's `db` remains the encoded persistence interface used by commands and
backup; both handles share the same SQLite connection.

Committed layout is Wall → Brick → Placement via aggregate contracts
(`addBrick`, layout/visibility/remove/compact, `updateBrickState`, and per-module
spec-at-breakpoint). Commands commit synchronously; Studio
`backupState: ready` confirms backup durability. Shared state lives on the brick row; each placement stores a
complete Spec, grid item, and visibility. `BrickWall` uses `noCompactor` to avoid
closing gaps automatically. Dropping a brick displaces overlapping visible neighbors
downward, including collisions caused by that displacement. **Compact layout** runs
an explicit command. Library reset calls the standalone session's `reset()` to replace its
backup with the original seed and remounts the viewport. Viewport preference persists in
localStorage (`qrk-bricks-library-viewport-v1`).

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
