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

`modulesHash` exposes each library module by kebab-case id. `defineModule` owns
identity, catalog, `stateShape`, and `defaultState`. `makeModuleView` attaches the
authored React brick and, when ready, a json-render `generator` (`registry` +
`defaultSpec`). Optional `sm` / `md` / `lg` / `xl` overlays merge onto `default`
(component, generator, declared `w`/`h`). Grid sizing is measured at preview/drag
time unless both `w` and `h` are declared on that overlay.

`Layout` owns `createLibraryMockSession({ wallId })` +
`useInitializeMockSession`, with a hardcoded `WALL_ID` of
`prefixId(wall, "library")` → `wal_library`. Studio `EditorLayout` does the same
for its ephemeral editor wall (separate in-memory db). Committed layout is
Wall → Brick → Placement via aggregate contracts (`addBrick`,
layout/visibility/remove/compact, `updateBrickState`, and per-module
spec-at-breakpoint). Shared state lives on the brick row; each placement stores a
complete Spec, grid item, and visibility. `BrickWall` uses `noCompactor`
(collision resolve without auto-gap-closing); **Compact layout** runs an explicit
command. Reset remounts the mock session. Viewport preference may persist in
localStorage (`qrk-bricks-library-viewport-v1`); bricks do not.

HTML5 catalog drag is a module-level `brickDragStore` (`brickDef` / `setBrickDef`
only). Drop / resize / remove go through contracts on the mock session — not
Zustand `bricksById`.

Placed bricks drag from their entire surface and resize using the grid library's default
bottom-right handle. Module and configuration previews also drag from their entire surface.
