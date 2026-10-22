# qrk.sh

## Zerospin packages

Zerospin owns its source, builds, and releases in the sibling `../zerospin`
checkout. QRK installs exact `26.0.2` packages from the local Verdaccio registry;
there is no vendored Zerospin source or consumer-side Zerospin build.
Actor and agent selection identity uses the authored definition rather than
generated SQL. Existing direct Drizzle dependencies use the same exact local
fork as Zerospin: `npm:@zerospin/drizzle-orm@1.0.0-rc.5-qrk.3`.

The credential-free project `.npmrc` routes all dependencies through
`http://127.0.0.1:4873/`, including the unscoped `system-worker`. The registry
serves Zerospin packages locally and proxies ordinary third-party packages to
npm. The framework supplies its SQL.js runtime.
Cloudflare Worker types and Zod peers match across App and the backend so
they resolve the same Core and Drizzle package instances.
The workspace pins Effect and `@effect/platform-node-shared` to `4.0.2` for the
Zerospin CLI.
Effect is installed from the registry; no Effect source is vendored.

Repository tests and standalone automated checks are deferred until a test
structure is agreed. See [Testing and checks](./AGENTS.md#testing-and-checks).

The installed SDK package supplies six consumer skills: parallel-model data
ownership, feature authoring, actor authorization, declaration evolution,
external work, and command submission.
The browser and React packages supply session ownership and React integration skills. Intent `0.5.5` is pinned in this workspace; the
root permission policy enables those packages and the managed `AGENTS.md` block
discovers the available guidance.
After a dependency upgrade, use `pnpm exec intent install` to refresh guidance.
Inspect available skills with `pnpm exec intent list` and load task guidance with
`pnpm exec intent load '@zerospin/sdk#zerospin-author-feature'` (or another listed
SDK skill ID). Skill content follows the installed package version.

The frontends have separate framework owners:

- `apps/web` uses Next.js App Router at `qrk.sh` and owns the public homepage at `/` and the `/sign-in`, `/sign-up`, `/replace`, and `/ordered-outline` routes.
- `apps/app` uses TanStack Start in SPA mode at `app.qrk.sh` and owns dashboards at `/:username` and site workspaces under `/:username/site`.
- `apps/app/modules` owns module UI and playground stories. `apps/zerospin/src/modules` owns shared module definitions and schemas. The Library package is removed.

## Editor model and ownership

App owns the persisted editor. The user aggregate defines Page, Wall, Section,
Stack, Row, Placement, and Brick directly. A Page has four breakpoint Walls;
Sections hold ordered Stacks, Stacks hold vertical Rows, and Rows hold side-by-side
Placements. Each Placement references a shared Page-owned Brick. Layout changes
belong to one Wall; Brick content is shared across widths.

App owns module forms, renderers, React generators, and controlled wall components.
Zerospin owns module versions, schemas, default specs, catalogs, and model factories.
API owns provider operations and browser RPC declarations. App supplies the initialized
user session and command callbacks; its consolidated Storybook supplies local fixtures.
See [Modules](apps/app/modules/README.md) and [App](apps/app/README.md).

## Tech Stack

- [TanStack Start 1.169.3](https://tanstack.com/start/latest) and [TanStack Router 1.170.45](https://tanstack.com/router/latest) for App
- [Next.js 16.3.4](https://nextjs.org/) with App Router for Web
- Vite Plus `1.0.0` for App and the App/Web Storybooks
- [React 19](https://react.dev/)
- [Tailwind 4](https://tailwindcss.com/) for styling
- [shadcn/ui](https://ui.shadcn.com/) for the design system

## Getting Started

### Prerequisites

- Node.js 24 or later (required by Portless)
- pnpm `10.33.0`, as pinned by the root `packageManager`

### Installation

1. Start the populated local registry from the Zerospin checkout, then install
   QRK dependencies from the QRK root:

   ```bash
   # In ../zerospin; leave this process running.
   pnpm nx run zerospin:local-registry

   # In QRK; the registry must already contain the locked release.
   pnpm install --frozen-lockfile
   ```

   On the first registry bootstrap, install, build, verify, and publish the
   release in Zerospin before installing QRK. Follow Zerospin's package release
   instructions. Existing registry storage survives restarts. A fresh checkout
   requires the running registry with the locked `26.0.2` packages; hosted
   distribution and deployment-machine bootstrap are not configured here.

2. Start the four application development servers through Portless:

   ```bash
   pnpm dev
   ```

3. Open [https://qrk.localhost/](https://qrk.localhost/).

The root `portless.json` uses Portless's native monorepo discovery with the
`dev:app` script. Only Web, App, API, and Zerospin expose that
script, so Storybooks do not start. Each app's `dev` script runs
`portless`; `dev:app` holds its server command. Package-level `portless` metadata
owns its hostname. Portless selects an unused internal frontend port; API and
Zerospin keep ports 8787 and 8788. Portless starts the four processes;
Nx development targets have no startup dependencies.

| App      | Development URL                                           | Direct fallback port |
| -------- | --------------------------------------------------------- | -------------------- |
| Web      | [qrk.localhost](https://qrk.localhost/)                   | 10000                |
| App      | [app.qrk.localhost](https://app.qrk.localhost/)           | 10001                |
| API      | [api.qrk.localhost](https://api.qrk.localhost/)           | 8787                 |
| Zerospin | [zerospin.qrk.localhost](https://zerospin.qrk.localhost/) | 8788                 |

Web has no `web.` prefix. Sign in through Web; `/replace` redirects to the
authenticated username at `https://app.qrk.localhost`. App is served
directly on its own hostname. The trusted HTTPS wildcard proxy on port 443 is
shared with other projects. The root command pins HTTPS on port 443 and
auto-starts that listener if needed; an explicit start uses
`pnpm exec portless proxy start --port 443 --https --wildcard`. Portless's first
HTTPS setup trusts its local CA; binding port 443 may prompt for administrator
authentication. Inspect registrations with
`pnpm run list`. App routes belong to their processes and are removed
when `pnpm dev` stops; leave the shared proxy and other projects' routes running.

Use `pnpm dev` for the complete HTTPS setup. To start one app through Portless,
run `pnpm --dir apps/<app> dev`; this starts only that app. Its `dev:app` script
runs the underlying HTTP server directly when needed. Frontend scripts honor
`PORT`; direct defaults are listed above. Storybooks use 10020 for App and 10022 for Web, also overridable with `PORT`.

The current integer-version baseline starts every authored declaration at `1`.
Older release declarations and browser session registrations are removed.
Development and production storage must be empty for this cutover, and the
maintainer has authorized erasing this system's obsolete data. Source migration
and storage reset completion are tracked separately.

App's `Initializer` receives its pure `userSessionDefinition` and
`userConnection`. The connection uses `makeApplicationSharedWorker` to bind the
authored `node.worker.ts` artifact to the connected session.
Zerospin chooses its name from the runtime version and persistent session identity.
App uses Vite's `?sharedworker&url` import for the authored worker
and `@zerospin/browser/sqlite.wasm?url` for the matching installed SQLite asset.
App and Web use independently allocated internal ports at their existing HTTPS
hostnames. Direct `dev:app` startup defaults to 10001 for App and 10000 for Web. Application routes and assets use Vite's default root base;
development modules, workers, WASM, and HMR use App's origin through Portless.
Web has no App proxy or asset-prefix routing. Existing `/assets/` public-file
URLs retain explicit App mappings.
App and API compile shared module definitions directly from Zerospin source. Storybook uses its own Vite configuration
without the Start server plugin.
App bundles installed Zerospin packages with
`ssr.noExternal` so their extensionless ESM imports resolve through Vite.

App prerenders a static document shell and initializes its routes in the
browser. `UserApp.Initializer` owns a fresh facade for its Clerk binding; ready
readers suspend until that facade publishes its initialized database. The
dashboard uses the installed Silkscreen font for its `QRK.SH` wordmark.
Browser-owned data and editor drafts stay under the content readiness gate.
Persistent Router layouts retain the editor across drawers; the drawer shell
and Router-managed native View Transitions retain their 300 ms exit, reduced-motion behavior,
and focus restoration.
See [App's README](apps/app/README.md) for routes and browser checks.

The signed-in Clerk user supplies its Clerk user ID directly as `aggregateId`,
matching the verified token subject on the server. Zerospin verifies those
expectations online before attachment. Offline reopening requires that exact
previously verified identity and session lock. Runtime versions use separate
storage; pending commands in an older version are not migrated or deleted.

The App hostname change is a hard cutover. Browser stores on previous
origins remain untouched; App initializes its own origin-scoped Node and
synchronizes accepted backend data for the same Clerk identity. Old-origin
local-only drafts, preferences, and unsent commands are not migrated. There is
no storage bridge, backend reset, or compatibility route for the former
Web-hosted App paths.

The `api` Worker runs on port 8787 with an automatically allocated inspector
port, and Zerospin runs on port 8788. API
owns module RPCs, Clerk-authenticated uploads, and asset serving. See
[API's README](apps/api/README.md) for bindings and private provider settings. Set
`NEXT_PUBLIC_API_URL=https://api.qrk.localhost` and
`NEXT_PUBLIC_ZEROSPIN_API_URL=https://zerospin.qrk.localhost` in
`apps/app/.env.local`. Worker authorized-party settings use
`https://app.qrk.localhost`, matching App's browser origin. New public
asset URLs use `https://api.qrk.localhost/assets`.
App's optional `NEXT_PUBLIC_WEB_ORIGIN` defaults to `https://qrk.localhost`
in development and `https://qrk.sh` in production. Its authentication links use
that absolute Web origin, including when App is opened on its own hostname.
Web's optional `NEXT_PUBLIC_APP_ORIGIN` defaults to
`https://app.qrk.localhost` in development and `https://app.qrk.sh` in
production. Web permits this exact redirect origin and `/replace` sends the
authenticated username there. Explicit App return URLs survive the Web
sign-in flow. App enables Clerk satellite synchronization only in development;
production uses the shared `qrk.sh` Clerk domain without the development satellite.
App's development and static-preview RPC proxies use the server-only
`APP_WORKER_ORIGIN` override, defaulting to `http://127.0.0.1:8787`.
`NEXT_PUBLIC_API_URL` remains the browser's HTTPS API origin; local Node proxy
requests do not depend on trusting Portless's TLS certificate.

To open the module playgrounds in App Storybook:

```bash
pnpm nx run @qrk.sh/app:storybook
```

Open `http://127.0.0.1:10020`. Each module story includes metadata, local
configuration, live Generate spec input, four breakpoint Component/JsonRender
previews, and Brick Definition JSON. Fixture previews need no persisted user
session; live generation/lookups/uploads use the API Worker through Storybook's
same-origin proxies. See [Modules README](apps/app/modules/README.md) for its public
Mapbox setting and server-only `API_WORKER_ORIGIN` override.
The Library package and its separate Storybook target are removed.

To run only App through Portless:

```bash
pnpm --dir apps/app dev
```

This does not start Web, API, or Zerospin; use root `pnpm dev` for the full stack.

### Production output and local preview

Web retains `pnpm nx run @qrk.sh/web:build` and
`pnpm nx run @qrk.sh/web:start`. App's `pnpm nx run @qrk.sh/app:build`
writes static output to `apps/app/dist/client`, including `index.html` as
the SPA shell. Run `pnpm nx run @qrk.sh/app:preview` for its local static
preview on port 10010 (`PORT` overrides it). Web
production startup defaults to port 10011. The separate preview configuration has no Start server
plugin. Open App's own hostname; Web remains available for authentication.

App Storybook includes the module playgrounds alongside editor stories. See
[Modules README](apps/app/modules/README.md) for the backend-origin setting. API
retains the existing R2 buckets; previously saved absolute URLs using port 4101
need their origin updated separately.

## Local subdomain routing proof

With `pnpm dev` running, Web's development-only proof displays the subdomain
and path without a site query. Open [alpha](https://alpha.qrk.localhost/)
or [beta](https://beta.qrk.localhost/about/team?from=proof). The page's
Home/About links exercise Next navigation while the browser retains the
selected hostname. `PORTLESS_WILDCARD=1` on the root `dev` script sends these
tenant labels through Web's process-owned `qrk` registration.

Only one DNS label before `.qrk.localhost` is recognized. The explicit App,
API, and Zerospin registrations own their service hostnames. Next
internals, static files, and `/api`, `/trpc`, and `/rpc` endpoints retain their
existing routing. Proof labels do not yet identify sites or users.

The earlier trial's static `qrk` alias is replaced by process-owned monorepo
registration. If migrating an existing trial setup, remove that static alias
once with `pnpm exec portless alias --remove qrk` before starting `pnpm dev`.
Normal startup needs no manual alias. Keep the shared proxy and other aliases.
The [routing research](wiki/research/nextjs-subdomain-routing.md) and
[Plan 024](wiki/archive/plans/024-plan-nextjs-subdomain-routing.md) retain historical
trial evidence; everyday development uses standard HTTPS port 443, with apps
distinguished by hostname.

## Deployment

Web remains a Next.js deployment at `qrk.sh`; App's static TanStack Start SPA
targets `app.qrk.sh`. Route each hostname to its own Vercel project. Web
retains its public and authentication routes; it does not proxy App paths.

App's Vercel configuration serves `dist/client`, resolves assets and RPC
forwarding before falling back to `index.html` for application deep links.
The 2026-10-21 integer-V1 cutover deployed both existing frontend projects.
`app.qrk.sh` is attached to the existing App project, with a DNS-only Cloudflare
`A` record at `76.76.21.21`, automatic TTL and a Vercel-managed certificate.
Its root, sign-in, JavaScript, SharedWorker and SQLite WASM URLs returned HTTPS
200 with certificate validation. The existing `qrk-studio.vercel.app` alias remains.

Vercel hosts the frontends in the `morganatwork` team:

- Web: [qrk-web.vercel.app](https://qrk-web.vercel.app), project `qrk-web`, root `apps/web`.
- App: existing [qrk-studio.vercel.app](https://qrk-studio.vercel.app), project `qrk-studio`, root `apps/app`, static output `dist/client`.

The custom domain [qrk.sh](https://qrk.sh) is attached to `qrk-web`. Cloudflare
remains authoritative for DNS: its apex `CNAME` points to
`e9746fc558e89321.vercel-dns-017.com` with **DNS only** proxy status and automatic
TTL. Cloudflare flattens the apex alias; Vercel serves the site and manages HTTPS.

Web's optional `NEXT_PUBLIC_APP_ORIGIN`
defaults to `https://app.qrk.sh`; App's `NEXT_PUBLIC_WEB_ORIGIN` defaults
to `https://qrk.sh`. API CORS and both `qrk-api` and `qrk-zerospin`
`CLERK_AUTHORIZED_PARTY` bindings use exactly `https://app.qrk.sh`. The origin
cutover preserved every Durable Object namespace identity and all other protected
bindings. App's package build emits static output; Web's saved build command runs
its Nx `build` target and retains the Next build.

Deploy locally built output because Vercel cannot reach the local package
registry. Use an isolated checkout copy containing the current source and installed
dependencies, excluding development `.env*` files. Keep traced Next dependencies
inside the copy; an external `.pnpm` symlink is rejected by prebuilt upload.
From that copy's monorepo root, pull production settings and values securely:

```sh
vercel pull --project qrk-studio --environment production --yes
```

With dependencies already installed, set `settings.installCommand` to `""` in
the copy's ignored `.vercel/project.json`, then run:

```sh
vercel build --prod --yes
vercel deploy --prebuilt --prod --yes
```

Repeat with `--project qrk-web` in the pull command. Always use `--prebuilt`;
hosted dependency installation is not configured.

When saving or restoring `.vercel` output, preserve symlinks (`cp -a` or
`shutil.copytree(..., symlinks=True)`). Web's Next shared function aliases must remain
links; dereferencing them creates duplicate functions and can exceed Vercel's
Hobby function limit. Build with the pulled production Clerk values and remove
the downloaded environment copy afterward. The 2026-10-21 deployments passed
public route and JavaScript/CSS checks; App's SharedWorker and SQLite WASM assets
also returned HTTP 200. These checks do not establish authenticated command execution.

The deployed frontends use production Clerk credentials. App's production
Zerospin endpoint is `https://zerospin.qrk.sh`, backed by
Cloudflare Worker `qrk-zerospin` with logical system `qrk-sh` and system ID
`sys_qrk_sh_1`. Its system specification is accepted and initialized; the
administrative healthcheck returns `healthy`. App's production publishable
key matches the Worker binding. See the [backend deployment notes](apps/zerospin/README.md#production).
Cloudflare routes `https://zerospin.qrk.sh` directly to this Worker as a
Custom Domain with managed DNS and HTTPS. The Worker's original
`https://qrk-zerospin.morganatwork.workers.dev` endpoint remains available.

The API is deployed as Cloudflare Worker `qrk-api` at
`https://api.qrk.sh`, a Custom Domain with managed DNS and HTTPS. App's production
`NEXT_PUBLIC_API_URL` uses that origin for uploads and `/rpc` forwarding.
New public asset URLs use `https://api.qrk.sh/assets`; the original
`https://qrk-api.morganatwork.workers.dev` endpoint remains available.
Production Clerk authentication, provider secrets, R2 bindings, and SQLite
Durable Object namespaces are configured. See [API's production deployment notes](apps/api/README.md#production).

### Production authentication

The existing **QRK.SH** Clerk application has a production instance for `qrk.sh`,
cloned from development with required, immutable usernames. Its Frontend API is
`https://clerk.qrk.sh`; its account portal is `https://accounts.qrk.sh`.
Production Paths use `/sign-in`, `/sign-up`, and `/` for home/sign-out; the
application retains `/replace` as its post-authentication destination.

Cloudflare has these additional DNS-only CNAME records:

| Host              | Target                              |
| ----------------- | ----------------------------------- |
| `clerk`           | `frontend-api.clerk.services`       |
| `accounts`        | `accounts.clerk.services`           |
| `clkmail`         | `mail.jilsy98ve8hd.clerk.services`  |
| `clk._domainkey`  | `dkim1.jilsy98ve8hd.clerk.services` |
| `clk2._domainkey` | `dkim2.jilsy98ve8hd.clerk.services` |

Clerk's production DNS, email configuration, and both certificates are verified.
Google OAuth uses the existing `qrksh-com` project and the
`QRK.SH Production (Clerk)` Web client, configured with JavaScript origin
`https://qrk.sh` and redirect URI `https://clerk.qrk.sh/v1/oauth_callback`.
Its credentials are saved in Clerk. The live `https://qrk.sh/sign-in` Google
redirect was verified against that client and callback with only `openid`,
email, and profile scopes; no Google account was selected or production user
created during verification.

Google's API Services User Data Policy was accepted with authorization, using
the approved support/contact email. Its OAuth app is **In production** with an
External audience. Branding uses homepage `https://qrk.sh`, privacy policy
`https://qrk.sh/privacy`, and terms `https://qrk.sh/terms`. The approved legal
pages are published and effective October 18, 2026, with links and a service
description on the homepage.

The legal pages, Google developer contact, and Clerk support email use
`me@morganatwork.com`. Google's restricted user-support dropdown retains
`morgan.intrator@gmail.com` with approval, because only that signed-in Google
account is available. Clerk's public display configuration also contains the
privacy and terms URLs; mandatory signup consent remains unchanged.

Both Vercel projects' production variables and live builds use production Clerk
keys. Their local prebuilt outputs passed and were deployed to production on
October 18, 2026. OAuth client secrets belong in Clerk; do not commit them or
put them in public frontend environment variables.
