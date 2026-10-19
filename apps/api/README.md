# API

The `api` Cloudflare Worker owns module RPCs, image uploads, and
asset serving. Its Nx project is `@qrk.sh/api`. The Library package retains
module definitions, catalogs, views, aggregate behavior, and browser RPC
declarations; API imports its catalog registry from
`@qrk.sh/library/backendLibrary` for spec generation.

## Local development

From the repository root:

```sh
pnpm dev
```

Root Portless startup runs all five apps, including API at
`https://api.qrk.localhost`. To start only API, run `pnpm --dir apps/api dev`;
its `dev` script invokes Portless, which runs the Wrangler command in `dev:app`.
Package metadata retains the hostname and internal port. Wrangler listens at
`http://127.0.0.1:8787`, with an automatically allocated inspector port.
Library runs separately on a Portless-allocated internal port (direct fallback
10004) and forwards `/rpc`, `/upload`, `/image/upload`, and `/assets/*` to
API. Consumers compile Library source directly; development startup needs no
Library build. These commands do not deploy it.

Put private provider credentials in `apps/api/.env.local`:

- `GITHUB_TOKEN`
- `APIFY_API_TOKEN`
- `FIGMA_TOKEN`
- `GOOGLE_PLACES_API_KEY`
- `OPENAI_API_KEY`

Wrangler loads these as Worker bindings. App upload authentication additionally uses
`CLERK_SECRET_KEY` and `CLERK_AUTHORIZED_PARTY`. The authorized party must match
the App browser origin. Set
`CLERK_AUTHORIZED_PARTY=https://app.qrk.localhost` in `apps/api/.env.local`, matching
Wrangler's local default. `R2_PUBLIC_BASE_URL` defaults to
`https://api.qrk.localhost/assets` for local serving. Public Mapbox settings
remain in Library's `.env.local`. Do not expose provider or Clerk secrets in
browser configuration.

Instagram's normal lookup uses the server-side `APIFY_API_TOKEN` from the existing
ignored `apps/api/.env.local`. Restart API after changing local credentials.
The historical `BrowserHost`, `BROWSER` binding, and migration registrations remain
intact, but normal Instagram lookups do not invoke them. `BROWSER` retains
`remote: true`; no Instagram login is configured.

## Production

Cloudflare account **Morgan at Work** hosts `qrk-api` at
`https://api.qrk.sh`. Its Custom Domain supplies managed DNS and HTTPS;
`https://qrk-api.morganatwork.workers.dev` remains available. App's production
build uses the custom origin as `NEXT_PUBLIC_API_URL`, both for direct authenticated uploads and for
its same-origin `/rpc` forwarding. App targets `https://app.qrk.sh`
directly; Web retains sign-in and redirects back to App.

`wrangler.jsonc` has a `production` environment with the explicit Worker name,
an `api.qrk.sh` route with `custom_domain: true`,
`CLERK_AUTHORIZED_PARTY=https://app.qrk.sh`, and
`R2_PUBLIC_BASE_URL=https://api.qrk.sh/assets`. It binds the
existing `qrksh` R2 bucket and the `assets` bucket created for this deployment.
The Worker serves public asset URLs; no public R2 hostname is enabled or needed.
Local uploads and local R2 state were not copied or changed.
The configured authorized party and API CORS origin must be deployed alongside
the standalone App rollout; editing this configuration does not update the
live Worker. Token verification still uses `verifyToken` with the configured
authorized party.

The production environment creates all five current Durable Object classes with
a SQLite `v1` migration. The default environment retains its historical local
`v1`/`v2` migrations. Production's first namespace creation uses SQLite because
this account cannot create legacy key-value namespaces; see
[Cloudflare's storage-backend requirement](https://developers.cloudflare.com/changelog/post/2026-07-09-restrict-new-kv-backed-namespaces/).
No production `StreamlineBackend` namespace is created or deleted.

The ignored, mode-`0600` `.env.production` holds the production Clerk secret and
the five active provider secrets listed above. `STREAMLINE_API_KEY` is unused
and was not uploaded. Deploy from an isolated copy of the current source:

```sh
pnpm exec wrangler deploy --env production \
  --env-file <empty-env-file> --secrets-file <protected-secrets.json>
```

The protected JSON file supplies `CLERK_SECRET_KEY`, `GITHUB_TOKEN`,
`APIFY_API_TOKEN`, `FIGMA_TOKEN`, `GOOGLE_PLACES_API_KEY`, and `OPENAI_API_KEY`.
The explicit empty environment file prevents local development credentials
from entering the production deployment. Regenerate bindings with the existing
Nx `types` target after changing configuration. Rebuild and redeploy App
after changing its production API URL; retain its other production variables.

Deployment verification used the bundled, read-only icon lookup directly and
through App's `/rpc` rewrite, QRK's upload preflight, missing-authorization
rejection, and an R2 missing-object read. No user account, uploaded fixture, or
provider request was created. Provider credential validity and quota, and a
signed-in upload, were not exercised by these probes.

## Routes and ownership

| Route                | Behavior                                                     |
| -------------------- | ------------------------------------------------------------ |
| `/rpc`               | Existing `LibraryApi` methods and authentication behavior    |
| `POST /upload`       | App: Clerk bearer-token authentication; writes to `QRKSH` |
| `POST /image/upload` | Library: anonymous image uploads; writes to `QRKSH`          |
| `/assets/library/*`  | Reads original Library image keys from `ASSETS`              |
| Other `/assets/*`    | Reads API upload keys from `QRKSH`                           |

`OPTIONS` retains API preflight handling. CORS allows the existing application
origins, including production `https://app.qrk.sh`, Portless's Web, App,
and Library HTTPS origins on standard port 443,
and the existing localhost and loopback origins. Uploads
retain the existing multipart `file` contract, PNG/JPEG/WebP/SVG support, 5 MiB limit,
error responses, and returned asset URL. App keys are
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
module normalizes HTTPS profile URLs and makes one authenticated POST to Apify's
maintained `apify/instagram-profile-scraper` synchronous dataset endpoint, using
the normalized username and `includeAboutSection: false`. The actor's
`timeout=20` and a 20-second HTTP deadline bound provider execution, fetching,
and response-body reading. There are no automatic retries or browser fallback;
this deadline does not bound the subsequent image downloads and R2 writes.

The provider response must identify the requested username, supply an explicit
`private` flag, a nonnegative integer follower count, a usable avatar, and a
present `latestPosts` array. Explicitly private profiles fail; an empty public
feed succeeds. The module prefers `profilePicUrlHD`, falls back to
`profilePicUrl`, formats followers with English compact notation and up to one
decimal place, and validates the first four `displayUrl` thumbnails in provider
order. Video posts use their image covers. Configuration, authentication, and
billing failures are distinct from transport, timeout, rate-limit, malformed
payload, and identity failures; provider errors do not imply a private profile.
Raw provider errors and credentials are excluded from messages and logs.

The existing importer downloads the avatar and selected posts sequentially,
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

### Material Symbols

`searchIcons(query, offset, limit)` serves Google's bundled
Material Symbols Sharp Line catalog through `/rpc`. The icon module owns input
validation and lookup; these operations make no provider requests, need no API
key, and write no storage. Search matches every word in the icon name, treating
case, spaces, and underscores consistently. Exact matches precede prefixes and
then alphabetical matches. Queries shorter than two characters return no icons;
pagination requires an integer offset of zero or greater and a limit of 1–100.
Search results contain `{ hash, name, svg }`; browser presentation derives SVG
data URLs from that field and retains the selected SVG for synchronous saving.
The Google icon slug is `hash`. Invalid search input returns
`invalid-scrape-request` through the existing RPC envelope.

The checked-in catalog uses the standard 24px unfilled Sharp SVGs from pinned
Google revision `49d4db35df873165d6bd6ba09b063c7dafbac2f4`. Its generated header
records the imported count and source; the adjacent `LICENSE` retains Google's
Apache 2.0 license. Regenerate the snapshot without additional dependencies:

```sh
python3 apps/api/modules/swatchAndIcon/downloadMaterialSymbols.py
```

The downloader validates every SVG and only replaces the generated catalog after
the complete pinned snapshot succeeds. Catalog updates are manual. The catalog
is bundled into API, not Library's browser output. Existing bricks render their
saved SVGs, including historical Streamline icons, without a provider lookup.

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
their matching `modules` folders. Historical Instagram browser scraping and
`BrowserHost` remain registered but are bypassed by the normal Apify path;
the former `InstagramBackend` cache and binding are removed. The other
providers' consolidation follows separate migrations.
Linktree scraping continues in `@qrk.sh/scraper`.

Wrangler configuration, generated `Env`, browser binding, both R2 bindings, and
Durable Object migrations belong to API. The local `v1` bootstrap replaces
`GitHubBackend` with SQLite `BackendRepo`; old GitHub cache entries are not copied.
Instagram is also removed from this local bootstrap's class list. Rewriting this
local baseline does not reset a deployed namespace: Cloudflare applies each migration tag once
per environment ([migration reference](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/#migration-wrangler-configuration)).
Existing local state directories and uploaded R2 bytes are preserved.
The append-only `v2` migration retires the stateless `StreamlineBackend`; its
binding and implementation are removed. Deployment would apply that deletion;
local development and dry-run builds do not deploy it. Historical `v1` remains
unchanged. Ignored credentials are preserved; `STREAMLINE_API_KEY` is no longer
used even if it remains in locally generated environment declarations.
Local Library `ASSETS` data is copied into API's `.wrangler/state/v3/r2` using
SQLite backup and blob copies; its original state remains intact. API's existing
`QRKSH` data stays in place. Documents containing absolute
`http://127.0.0.1:4101` asset URLs require their origin updated separately; this
move does not rewrite authored documents.

## Bindings and builds

```sh
pnpm nx run @qrk.sh/api:types
pnpm nx run @qrk.sh/api:build
```

`types` regenerates Worker bindings. `build` bundles the Worker without
deployment. Repository tests and standalone automated checks are deferred until
a test structure is agreed (see root `AGENTS.md`).
