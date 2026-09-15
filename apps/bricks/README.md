# Bricks workbench

The brick library, React workbench, and scraper backend share this package.
Vite+ runs the frontend and Cloudflare Worker together through
`@cloudflare/vite-plugin`.

From the repository root:

```sh
pnpm nx run @qrk.sh/bricks:dev
```

Open `http://127.0.0.1:4100`. The form calls `/scraper-rpc` on that same
server. A separate scraper process and `SCRAPER_URL` are no longer needed.
This command runs locally and does not deploy anything.

## Configuration

Put local settings in `apps/bricks/.env.local`:

- `PUBLIC_MAPBOX_TOKEN` is required for the workbench and is exposed to the browser.
- `GITHUB_TOKEN`, `FIGMA_TOKEN`, `GOOGLE_PLACES_API_KEY`, and `STREAMLINE_API_KEY`
  are private Worker credentials for their respective providers.

The Cloudflare plugin loads the private settings as Worker bindings. Only the
Mapbox token is explicitly included in the browser build.

`wrangler.jsonc` retains the `scraper` Worker identity, browser binding, Durable
Object bindings, and migrations. Local cache data lives under `.wrangler/state`.
The scraper implementation and its tests live in `scraper`. Client imports
use the existing `*.public.d.ts` contracts so Worker implementation types do not
become part of the brick library's public declarations.

## Checks and builds

```sh
pnpm nx run @qrk.sh/bricks:tsc
pnpm nx run @qrk.sh/bricks:lint
pnpm nx run @qrk.sh/bricks:test
pnpm nx run @qrk.sh/bricks:test:workerd
pnpm nx run @qrk.sh/bricks:test:e2e
pnpm nx run @qrk.sh/bricks:build:app
pnpm nx run @qrk.sh/bricks:build
```

`tsc` checks both browser and Worker code. `test` runs the brick unit tests;
`test:workerd` runs the scraper integration tests with deterministic provider
credentials. `test:e2e` retains the real-token Playwright checks and requires all
four private provider credentials plus the Mapbox token. `test:live` runs the
existing opt-in live scraper suite.

`build:app` produces the combined app in `build/client` and `build/scraper`.
`build` produces the reusable brick library in `dist`, including its public
scraper declarations. Neither build deploys the app.

## Catalogs and interaction

Groups expose `catalogs[catalog]`. `makeCatalog` combines data and configuration
with responsive presentations and an optional appearance form. Each breakpoint entry is
`{ component, w, h }`; `xs` is required. Omitted `sm`, `lg`, and `xl` entries inherit
the nearest smaller entry, including both its component and initial dimensions.
Catalog definitions expose resolved `xs`/`sm`/`lg`/`xl` dimensions for previews and
new placements. Saved placement dimensions take precedence over catalog defaults.
Appearance settings, layout, and visibility retain their separate breakpoint inheritance.

Placed bricks drag from their entire surface and resize using the grid library's default
bottom-right handle. Rendered content ignores pointer events; the edit icon remains clickable.
Group and configuration previews also drag from their entire surface.

The Group → Catalog terminology cutover uses persistence version 2. Older workbench
brick drafts reset on hydration while preserving the selected grid width. The site
editor also resets older drafts when it hydrates.
