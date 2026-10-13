# API

The `api` Cloudflare Worker owns module RPCs, image uploads, and
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
port 4100 and forwards `/rpc`, `/upload`, `/image/upload`, and `/assets/*` to API.
The root development command starts the same API Worker. These commands do not deploy it.

Put private provider credentials in `apps/api/.env.local`:

- `GITHUB_TOKEN`
- `FIGMA_TOKEN`
- `GOOGLE_PLACES_API_KEY`
- `STREAMLINE_API_KEY`
- `OPENAI_API_KEY`

Wrangler loads these as Worker bindings. Studio upload authentication additionally uses
`CLERK_SECRET_KEY` and `CLERK_AUTHORIZED_PARTY`. The authorized party must match
the browser origin. For Studio through the web frontend at `http://localhost:3000`,
set `CLERK_AUTHORIZED_PARTY=http://localhost:3000` in `apps/api/.env.local`;
Wrangler's default `http://127.0.0.1:3001` supports direct Studio access when that
origin is configured as the authorized party. `R2_PUBLIC_BASE_URL` defaults to
`/assets` for local serving; production configuration can supply the public R2
origin. Public Mapbox settings
remain in Library's `.env.local`. Do not expose provider or Clerk secrets in
browser configuration.

Instagram's `BROWSER` binding uses `remote: true` for live local scraping, as
documented by [Cloudflare](https://developers.cloudflare.com/browser-run/reference/wrangler/).
Wrangler must be authenticated to an account with Browser Run access. The Worker,
Durable Objects, and both R2 buckets remain local; this setting only sends browser
work to Cloudflare. No Instagram login is configured.

## Routes and ownership

| Route                | Behavior                                                  |
| -------------------- | --------------------------------------------------------- |
| `/rpc`               | Existing `LibraryApi` methods and authentication behavior |
| `POST /upload`       | Studio: Clerk bearer-token authentication; writes to `QRKSH` |
| `POST /image/upload` | Library: anonymous image uploads; writes to `QRKSH`       |
| `/assets/library/*`  | Reads original Library image keys from `ASSETS`           |
| Other `/assets/*`    | Reads API upload keys from `QRKSH`                        |

`OPTIONS` retains API preflight handling. CORS allows the existing application
origins, Studio's web frontend at `http://localhost:3000`, and Library's localhost
and loopback origins on port 4100. Uploads
retain the existing multipart `file` contract, PNG/JPEG/WebP/SVG support, 5 MiB limit,
error responses, and returned asset URL. Studio keys are
`<verified Clerk subject>/<siteId or _>/<uuid>.<ext>`; Library Image uploads
omit `siteId` and use `image/_/<uuid>.<ext>`. Both routes return
`{ key, url, contentType }` and use the same validation and asset serving.
Completed objects remain stored when an editor cancels or replaces an image.
The Library Article upload controls remain disabled.

`LibraryApi` and generation live in API. `getGitHubProfile(url)` and
`getGitHubRepo(url)` fetch upstream on every call. GitHub module programs own URL
normalization, provider calls, validation, and retention. Profiles keep their
existing fields and contribution calendar; repositories return the existing five
fields. Only a fully successful response is retained. Upstream errors return the
existing error and leave the previous response untouched.

`getInstagramProfile(url)` also fetches fresh data on every call. The Instagram
module normalizes HTTPS profile URLs, delegates scraping to `BrowserHost`, and
validates required username, avatar, and follower data plus an ordered array of
zero to four supported post images from the public page's embedded profile feed.
Image posts and video thumbnails use their feed image URLs in feed order.
An empty feed succeeds; malformed feed data fails validation.
It downloads the avatar and selected posts,
requires successful nonempty image responses, and awaits writes to `QRKSH` with
their content types. Each fetch uses immutable
`instagram/<username>/<fetch-uuid>/…` keys. Returned image URLs use
`R2_PUBLIC_BASE_URL`; relative `/assets` configuration resolves against the RPC
request's API origin. A scrape, download, or write failure returns an error before
retaining a response. Older and partially uploaded objects are retained; cleanup
is outside this flow.

Spec generation accepts a full spec or JSONL patches. Edits apply patches to a
copy of the supplied current spec, retaining its root and unchanged elements;
the resulting spec must pass the module catalog's validation before returning.

`BACKEND_REPO` binds the storage-only `BackendRepo` singleton named `global`.
Its initial SQL migration creates `responses(key TEXT NOT NULL UNIQUE, payload
TEXT NOT NULL)`. `storeResponse` validates JSON, encodes through the table codec,
and synchronously upserts one row. Keys are `github-profile:${canonicalUrl}`,
`github-repo:${canonicalUrl}`, and `instagram-profile:${canonicalUrl}`. Instagram
retains only the completed payload with its R2 image URLs. The last successful
write wins, including overlapping requests. Requests await retention; envelope failures and transport
rejections log `backend-response-retention-failed` and still return fetched data.
Stored responses never satisfy a fetch request, and have no TTL or timestamps.

Other provider Backends retain their existing methods and caching behavior in
their matching `modules` folders. `BrowserHost` stays with Instagram's browser
scraping; the former `InstagramBackend` cache and binding are removed. The other
providers' consolidation follows separate migrations.
Linktree scraping continues in `@qrk.sh/scraper`.

Wrangler configuration, generated `Env`, browser binding, both R2 bindings, and
Durable Object migrations belong to API. The local `v1` bootstrap replaces
`GitHubBackend` with SQLite `BackendRepo`; old GitHub cache entries are not copied.
Instagram is also removed from this local bootstrap's class list. Rewriting this
local baseline does not reset a deployed namespace: Cloudflare applies each migration tag once
per environment ([migration reference](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/#migration-wrangler-configuration)).
Existing local state directories and uploaded R2 bytes are preserved.
Local Library `ASSETS` data is copied into API's `.wrangler/state/v3/r2` using
SQLite backup and blob copies; its original state remains intact. API's existing
`QRKSH` data stays in place. Documents containing absolute
`http://127.0.0.1:4101` asset URLs require their origin updated separately; this
move does not rewrite authored documents.

## Checks and builds

```sh
pnpm nx run @qrk.sh/api:types
pnpm nx run @qrk.sh/api:ts
pnpm nx run @qrk.sh/api:lint
pnpm nx run @qrk.sh/api:build
pnpm nx run @qrk.sh/api:test:workerd
```

`types` regenerates Worker bindings. `build` checks Wrangler bundling without
deployment. API's Workerd tests cover uploads, GitHub fetch/retention, and
Instagram's image persistence, asset retrieval, fresh fetches, and failure paths.
The owning system-worker `repo-lifecycle:check` uses disposable Workerd state for
standalone migrations, restarts, rollback, and fixed-repo admission. Library's tests
are not written, modified, or run as part of this migration.
