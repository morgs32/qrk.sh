# qrk.sh

## Zerospin packages

Zerospin owns its source, builds, and releases in the sibling `../zerospin`
checkout. QRK installs exact `15.0.0` packages from the local Verdaccio registry;
there is no vendored Zerospin source or consumer-side Zerospin build.

The credential-free project `.npmrc` routes all dependencies through
`http://127.0.0.1:4873/`, including the unscoped `system-worker`. The registry
serves Zerospin packages locally and proxies ordinary third-party packages to
npm. The framework supplies its SQL.js runtime.
Cloudflare Worker types and Zod peers match across Library and the backend so
they resolve the same Core and Drizzle package instances.
The workspace pins Effect and `@effect/platform-node-shared` to `4.0.2` for the
Zerospin CLI.
Effect is installed from the registry; no Effect source is vendored.

Repository tests and standalone automated checks are deferred until a test
structure is agreed. See [Testing and checks](./AGENTS.md#testing-and-checks).

The installed SDK package supplies five consumer skills: feature authoring,
actor authorization, declaration evolution, external work, and command submission.
The browser and React packages supply session ownership and React integration skills. Intent `0.5.5` is pinned in this workspace; the
root permission policy enables those packages and the managed `AGENTS.md` block
discovers the available guidance.
After a dependency upgrade, use `pnpm exec intent install` to refresh guidance.
Inspect available skills with `pnpm exec intent list` and load task guidance with
`pnpm exec intent load '@zerospin/sdk#zerospin-author-feature'` (or another listed
SDK skill ID). Skill content follows the installed package version.

Two Next.js apps with App Router:

- `apps/web` owns the public homepage at `/` and the `/sign-in`, `/sign-up`, `/replace`, and `/ordered-outline` routes.
- `apps/studio` owns dashboards at `/:username` and site workspaces under `/:username/site`.

## Features

- Brick grid and groups (see **Brick group identity** below)

## Brick group identity

Brick groups are defined under `apps/library/groups/`.

1. **`groupName`** identifies a group; **`catalog`** identifies a data/configuration and responsive presentation definition within it.
2. **`(groupName, catalog)`** uniquely identifies a group brick, independently of dimensions. Views are no longer a separate selection.
3. Placed bricks retain their own **`brickId`**. Library bricks and backend brick records store **`groupId`** and **`catalogId`**.

This is a hard terminology cutover: old backend state must be reset before reuse.
`libraryModule` exports the shared models and flat command contracts. Library
uses its standalone definition; Studio uses the authenticated user definition.

Model and contract versions remain unchanged. Library viewport preference
uses `qrk-bricks-library-viewport-v1`. Wall rows live in each initialized session's
SQLite replica, with SharedWorker-owned IndexedDB persistence.

More detail and test patterns: [docs/styleguide/component-and-file-naming.md](docs/styleguide/component-and-file-naming.md).

## Tech Stack

- [Next.js 16.3.4](https://nextjs.org/) with App Router
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
   requires the running registry with the locked `15.0.0` packages; hosted
   distribution and deployment-machine bootstrap are not configured here.

2. Start all five application development servers through Portless:

   ```bash
   pnpm dev
   ```

3. Open [https://qrk.localhost:1355/](https://qrk.localhost:1355/).

The root `portless.json` uses Portless's native monorepo discovery with the
`dev:portless` script. Only Web, Studio, Library, API, and Zerospin expose that
script, so examples and Storybooks do not start. Each script runs its existing
Nx `dev` target with `--excludeTaskDependencies`; Portless owns starting the
five processes without duplicate dependency launches.

| App | Development URL | Internal port |
| --- | --- | --- |
| Web | [qrk.localhost:1355](https://qrk.localhost:1355/) | 3000 |
| Studio | [studio.qrk.localhost:1355](https://studio.qrk.localhost:1355/) | 3001 |
| Library | [library.qrk.localhost:1355](https://library.qrk.localhost:1355/) | 4100 |
| API | [api.qrk.localhost:1355](https://api.qrk.localhost:1355/) | 8787 |
| Zerospin | [zerospin.qrk.localhost:1355](https://zerospin.qrk.localhost:1355/) | 8788 |

Web has no `web.` prefix. Sign in through Web; it continues forwarding
application routes to Studio. The trusted HTTPS wildcard proxy on port 1355 is
shared with other projects. The root command pins HTTPS on port 1355 and
auto-starts that listener if needed; an explicit start uses
`pnpm exec portless proxy start --port 1355 --https --wildcard`. Portless's first
HTTPS setup trusts its local CA. Inspect registrations with
`pnpm exec portless list`. App routes belong to their processes and are removed
when `pnpm dev` stops; leave the shared proxy and other projects' routes running.

Direct Nx development targets remain available on their internal HTTP ports.
Use `pnpm dev` for the complete HTTPS setup.

For pre-cutover development data, follow the [backend storage quarantine](apps/zerospin/README.md)
and [Library fresh-origin check](apps/library/README.md) instructions. Superseded
retained commands and SQLite schemas require empty storage; old data is preserved
separately and has no compatibility migration.

Studio's `userBrowserDefinition` uses the installed browser package's
`makeAggregateBrowserDefinition` with its pure `userSessionDefinition` and authored
`node.worker.ts` entrypoint. `makeApplicationSharedWorker` binds the worker artifact
to the connected session.
Zerospin chooses its name from the runtime version and persistent session identity.
Studio uses Webpack in Next development and production builds to bundle the
worker and its `new URL(..., import.meta.url)` SQLite WASM asset. Studio listens
on port 3001 behind web on port 3000. Web proxies Studio's isolated
`/studio-static/_next/` asset namespace. Next bundles the SharedWorker and its
SQLite WASM from the installed browser package and the application worker entrypoint. Existing `/assets/` public-file URLs have explicit
Studio mappings.
Library exports its source directly to Studio, API, and Zerospin; startup does
not build a separate Library package. Vite remains for Storybook and examples.
Keep each app's `.next` directory between runs so Webpack can reuse its filesystem cache.

Studio server-renders the document, fonts, and navigation before its browser
session initializes. `UserApp.Initializer` owns a fresh facade for its Clerk binding;
ready readers suspend until that facade publishes its initialized database. The dashboard shows the homepage's Silkscreen `QRK.SH` wordmark; the site navbar reserves its
custom wordmark with a skeleton. Browser-owned data and editor drafts stay under
the content readiness gate. Persistent App Router layouts retain the editor
across drawers; native React View Transitions animate drawer entry and snapshot
exit for 300 ms, with reduced-motion and immediate-navigation fallbacks.
See [Studio's README](apps/studio/README.md) for routes and browser checks.

The signed-in Clerk user supplies its Clerk user ID directly as `aggregateId`,
matching the verified token subject on the server. Zerospin verifies those
expectations online before attachment. Offline reopening requires that exact
previously verified identity and session lock. Runtime versions use separate
storage; pending commands in an older version are not migrated or deleted.

The `api` Worker runs on port 8787 (inspector 9231) and Zerospin on port 8788. API
owns module RPCs, Clerk-authenticated uploads, and asset serving. See
[API's README](apps/api/README.md) for bindings and private provider settings. Set
`NEXT_PUBLIC_API_URL=https://api.qrk.localhost:1355` and
`NEXT_PUBLIC_ZEROSPIN_API_URL=https://zerospin.qrk.localhost:1355` in
`apps/studio/.env.local`. Worker authorized-party settings use
`https://qrk.localhost:1355`, matching the browser's Web origin. New public
asset URLs use `https://api.qrk.localhost:1355/assets`.

To run the Library app and its API Worker:

```bash
pnpm nx run @qrk.sh/library:dev
```

Library uses Next.js App Router with Webpack on port 4100. Its Nx target starts
the unified API Worker on port 8787. Next forwards `/rpc`, `/upload`, and
`/assets/*` to API, preserving same-origin client URLs. The private Library package
maps its existing imports directly to TypeScript, TSX, and stylesheet source;
each consumer compiles the source it uses.

To run the dashboard and site app instead:

```bash
pnpm nx run @qrk.sh/studio:dev
```

### Production server

Build and start either app with Nx: `pnpm nx run @qrk.sh/web:build` and
`pnpm nx run @qrk.sh/web:start`, or the equivalent `@qrk.sh/studio` targets.
Studio uses Webpack and writes `.next`; its production server defaults to port
3001 (`PORT` overrides it). Keep web on port 3000 with `APP_ORIGIN` pointing to
Studio.

Library retains its development server and Storybook; it has no package build,
Next production build, or production preview target. See
[Library's README](apps/library/README.md) for the backend-origin setting. API
retains the existing R2 buckets; previously saved absolute URLs using port 4101
need their origin updated separately.

## Local subdomain routing proof

With `pnpm dev` running, Web's development-only proof displays the subdomain
and path without a site query. Open [alpha](https://alpha.qrk.localhost:1355/)
or [beta](https://beta.qrk.localhost:1355/about/team?from=proof). The page's
Home/About links exercise Next navigation while the browser retains the
selected hostname. `PORTLESS_WILDCARD=1` on the root `dev` script sends these
tenant labels through Web's process-owned `qrk` registration.

Only one DNS label before `.qrk.localhost` is recognized. The explicit Studio,
Library, API, and Zerospin registrations own their service hostnames. Next
internals, static files, and `/api`, `/trpc`, and `/rpc` endpoints retain their
existing routing. Proof labels do not yet identify sites or users.

The earlier trial's static `qrk` alias is replaced by process-owned monorepo
registration. If migrating an existing trial setup, remove that static alias
once with `pnpm exec portless alias --remove qrk` before starting `pnpm dev`.
Normal startup needs no manual alias. Keep the shared proxy and other aliases.
The [routing research](wiki/research/nextjs-subdomain-routing.md) and
[Plan 024](wiki/plans/024-plan-nextjs-subdomain-routing.md) retain historical
trial evidence and the earlier port 443 proposal; everyday development uses
port 1355.

## Deployment

Deploy both Next.js apps and route `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/privacy`, `/terms`, `/replace`, and `/ordered-outline` to `@qrk.sh/web`; route the remaining application paths to `@qrk.sh/studio`.

Preserve the `/studio-static/` and `/assets/` proxy routes in production.

Vercel hosts the frontends in the `morganatwork` team:

- Web: [qrk-web.vercel.app](https://qrk-web.vercel.app), project `qrk-web`, root `apps/web`.
- Studio: [qrk-studio.vercel.app](https://qrk-studio.vercel.app), project `qrk-studio`, root `apps/studio`.

The custom domain [qrk.sh](https://qrk.sh) is attached to `qrk-web`. Cloudflare
remains authoritative for DNS: its apex `CNAME` points to
`e9746fc558e89321.vercel-dns-017.com` with **DNS only** proxy status and automatic
TTL. Cloudflare flattens the apex alias; Vercel serves the site and manages HTTPS.

Web's production `APP_ORIGIN` points to `https://qrk-studio.vercel.app`.
Each project's build command runs its existing Nx `build` target, retaining
Studio's Webpack configuration.

Deploy locally built output because Vercel cannot reach the local package
registry. Use an isolated checkout copy containing the current source, installed
dependencies, and each app's `.env.local` so builds leave running development
apps intact. From that copy's monorepo root, select one project:

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
`shutil.copytree(..., symlinks=True)`). Next's shared function aliases must remain
links; dereferencing them creates duplicate functions and can exceed Vercel's
Hobby function limit. Ensure the snapshot's app-local environment files and
Vercel production variables both use production Clerk keys before building.

The deployed frontends use production Clerk credentials. Studio's production
Zerospin endpoint is `https://zerospin.qrk.sh`, backed by
Cloudflare Worker `qrk-zerospin` with logical system `qrk-sh` and system ID
`sys_qrk_sh_1`. Its system specification is accepted and initialized; the
administrative healthcheck returns `healthy`. Studio's production publishable
key matches the Worker binding. See the [backend deployment notes](apps/zerospin/README.md#production).
Cloudflare routes `https://zerospin.qrk.sh` directly to this Worker as a
Custom Domain with managed DNS and HTTPS. The Worker's original
`https://qrk-zerospin.morganatwork.workers.dev` endpoint remains available.

The API is deployed as Cloudflare Worker `qrk-api` at
`https://api.qrk.sh`, a Custom Domain with managed DNS and HTTPS. Studio's production
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

| Host | Target |
| --- | --- |
| `clerk` | `frontend-api.clerk.services` |
| `accounts` | `accounts.clerk.services` |
| `clkmail` | `mail.jilsy98ve8hd.clerk.services` |
| `clk._domainkey` | `dkim1.jilsy98ve8hd.clerk.services` |
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
