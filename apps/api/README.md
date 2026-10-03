# API

The `api` Cloudflare Worker owns module RPCs, Clerk-authenticated uploads, and
asset serving. Its Nx project is `@qrk.sh/api`. The Library package retains
module definitions, catalogs, views, aggregate behavior, and browser RPC
declarations; API imports its catalog registry from
`@qrk.sh/library/backendLibrary` for spec generation.

## Local development

From the repository root:

```sh
pnpm nx run @qrk.sh/api:dev
```

Wrangler listens at `http://127.0.0.1:8787`, with its inspector on port 9231.
Nx builds Library's reusable catalog output before starting API. Library's
`dev` and `preview` targets also start this API target; Library Next runs on
port 4100 and forwards `/rpc`, `/upload`, and `/assets/*` to API. The root
development command starts the same API Worker. These commands do not deploy it.

Put private provider credentials in `apps/api/.env.local`:

- `GITHUB_TOKEN`
- `FIGMA_TOKEN`
- `GOOGLE_PLACES_API_KEY`
- `STREAMLINE_API_KEY`
- `OPENAI_API_KEY`

Wrangler loads these as Worker bindings. Upload authentication additionally uses
`CLERK_SECRET_KEY` and `CLERK_AUTHORIZED_PARTY`. The authorized party must match
the browser origin. `R2_PUBLIC_BASE_URL` defaults to `/assets` for local serving;
production configuration can supply the public R2 origin. Public Mapbox settings
remain in Library's `.env.local`. Do not expose provider or Clerk secrets in
browser configuration.

## Routes and ownership

| Route | Behavior |
| --- | --- |
| `/rpc` | Existing `LibraryApi` methods and authentication behavior |
| `POST /upload` | Clerk bearer-token authentication; writes to `QRKSH` |
| `/assets/library/*` | Reads original Library image keys from `ASSETS` |
| Other `/assets/*` | Reads API upload keys from `QRKSH` |

`OPTIONS` retains API preflight handling. CORS allows the existing application
origins plus Library's localhost and loopback origins on port 4100. Uploads
retain the existing multipart contract, supported image types, 5 MiB limit,
error responses, and returned asset URL. Library's former anonymous upload
endpoint is removed; the Library Text upload controls remain disabled.

`LibraryApi` and generation live in API. Backend classes and their provider
helpers live under matching `modules` folders: `instagram`, `githubProfile`,
`figmaThumbnail`, `mapPlace`, `link`, and `swatchAndIcon`. `BrowserHost` stays with
Instagram's browser scraping; GitHub repository fetching and URL normalization
live under `githubRepo`. These implementations keep their class names,
RPC methods, and cache behavior. Their later consolidation is outside this move.
Linktree scraping continues in `@qrk.sh/scraper`.

Wrangler configuration, generated `Env`, browser binding, both R2 bindings, and
Durable Object migrations belong to API. The `api` Worker identity provisions
fresh provider-cache namespaces, retaining the existing classes and storage
kinds. Existing local state directories and uploaded R2 bytes are preserved.
Local Library `ASSETS` data is copied into API's `.wrangler/state/v3/r2` using
SQLite backup and blob copies; its original state remains intact. API's existing
`QRKSH` data stays in place. Documents containing absolute
`http://127.0.0.1:4101` asset URLs require their origin updated separately; this
move does not rewrite authored documents.

## Checks and builds

```sh
pnpm nx run @qrk.sh/api:types
pnpm nx run @qrk.sh/api:tsc
pnpm nx run @qrk.sh/api:lint
pnpm nx run @qrk.sh/api:build
pnpm nx run @qrk.sh/api:test:workerd
```

`types` regenerates Worker bindings. `build` checks Wrangler bundling without
deployment. API's existing upload tests remain its test gate. Library's tests
are not written, modified, or run as part of this migration.
