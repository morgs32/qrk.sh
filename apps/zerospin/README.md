# QRK Zerospin backend

`zerospin.config.ts` exports the authored system with its existing
`sys_qrk_sh_1` identity. Zerospin generates the backend Wrangler configuration,
Worker entrypoint, and bindings. The installed CLI's default Worker name is
`qrk-sh-zerospin`; production explicitly uses `qrk-zerospin` without changing
the logical system name.

Put local authentication settings in this directory's `.env.local` (see
`.env.example`). The CLI discovers environment files from this project root.
Run local development from the repository root:

```sh
pnpm nx run @qrk.sh/zerospin:dev
```

QRK installs the CLI and runtime packages at `14.0.0` from the populated local
registry described in the [root README](../../README.md#zerospin-packages). Nx
builds QRK's reusable Library before backend development; it does not
rebuild installed Zerospin files.

Repository tests and standalone automated checks are deferred until a test
structure is agreed. Avoid integration testing of this Zerospin backend; the
future end-to-end compatibility suite is deferred (see root `AGENTS.md`).

## Production

Cloudflare account **Morgan at Work** hosts Worker `qrk-zerospin` at
`https://qrk-zerospin.morganatwork.workers.dev`. It retains logical system
`qrk-sh` and system ID `sys_qrk_sh_1`. This is fresh production Durable Object
storage, separate from local `.wrangler` state. The first deployment accepted
the authored specification, initialized the system, and returned `healthy`
from the administrative healthcheck on October 18, 2026.

The Custom Domain `https://zerospin.qrk.sh` routes directly to this Worker.
Cloudflare manages its DNS and certificate.

The ignored `.env.production` stores production framework and Clerk keys with
file mode `0600`; keep it separate from local development settings. The Worker
has these bindings:

- `ZEROSPIN_ENVIRONMENT=production` and `ZEROSPIN_SYSTEM_ID=sys_qrk_sh_1`.
- `CLERK_AUTHORIZED_PARTY=https://qrk.sh`.
- Secrets `ZEROSPIN_PUBLISHABLE_KEY`, `ZEROSPIN_SECRET_KEY`, and `CLERK_SECRET_KEY`.

Studio's production build uses `https://zerospin.qrk.sh` and the matching
publishable key. Keep the server secret and Clerk secret out of frontend public
variables.
The separate uploads/module API is deployed as `qrk-api`; see its
[production configuration](../api/README.md#production).

The installed `zerospin deploy` command has no Worker-name override. For this
production name, load the authored config and generate a temporary Wrangler
configuration with the public `@zerospin/dev-worker/makeWranglerConfig` export,
using the installed `@zerospin/production-worker/ProductionWorker` entrypoint
and `environment: "production"`. Preserve its generated aliases, version
metadata, migrations, and Durable Object bindings. Set only its deployment
`name` to `qrk-zerospin`, the account ID to
`4b0ca6b8e3a6fe721318c9de65b5f29d`, `workers_dev` to `true`, and the Clerk
authorized-party variable above. Preserve
`routes: [{ pattern: "zerospin.qrk.sh", custom_domain: true }]` in the generated
production configuration so future deployments retain the Custom Domain.
Upload the three secrets from a protected JSON
file with Wrangler's additive `--secrets-file` option:

```sh
pnpm exec wrangler deploy --config <generated-production-config.json> \
  --env-file <empty-env-file> --secrets-file <protected-secrets.json>
```

Run from this package in an isolated copy matching the frontend source. The
explicit empty environment file keeps local environment files out of the
deployment. Do not use the default CLI deployment name for this Worker.

Complete installation through the public administrative `getSystemApi`,
providing `ZerospinApiUrl` and a redacted `SecretKey`: accept the specification
with `acceptSystemSpec()`, wait for `getExecutingWorkerVersion()` to match the
uploaded version, then call `initialize()` and `healthcheck()`. These are
deployment lifecycle operations; no application data or integration-test
fixtures are created. Accepted definition locks remain durable if a later
initialization step fails. Do not reset or seed production storage to retry.

## Server aggregate reads

Core `14.0.0` provides the server-only
`@zerospin/core/utils/getSystemApi/getSystemApi` client. Supply
`ZerospinApiUrl` and `SecretKey` (`Redacted<string>`) in the application's Effect
layer, then acquire it with `yield* getSystemApi()`. Construct a connection-free
query with `makeQueryDbVersion({ models: userSessionDefinition.models })` and pass
the selection to `systemApi.executeAggregateQuery` with user aggregate identity:

```ts
const systemApi = yield * getSystemApi();
const db = makeQueryDbVersion({ models: userSessionDefinition.models });
const site =
  yield *
  systemApi.executeAggregateQuery({
    aggregateName: "user",
    aggregateVersion: "2.0.0",
    aggregateId,
    query: db.query.site.findFirst({
      where: { id: { eq: siteId } },
      with: {
        pages: {
          with: {
            wall: {
              with: { bricks: { with: { placements: true } } },
            },
          },
        },
      },
    }),
  });
```

The inferred result preserves nested columns, JSON, and dates; missing first
results are `undefined`, and empty many results are `[]`. The Worker reads
canonical resource state after catching up materialization. These administrative
reads use the server secret and have no actor visibility filter.
See the [core layer example and transport boundary](../../../zerospin/packages/core/src/utils/README.md#administrative-aggregate-reads).
Aggregate-ID resolution and website rendering remain separate application work.

The package cutover requires empty storage for superseded retained command and
SQLite schemas. The regular `dev` target does not reset storage. Stop development
before moving `.wrangler/zerospin/dev-worker/sys_qrk_sh_1` into a uniquely named
directory under `.wrangler/zerospin/backups/`. Starting the normal Nx `dev`
target then creates current storage while preserving the old directory for
recovery. Do not use `--clean` when the old data must be preserved.

Browser backups are scoped by origin. The Article Markdown cutover uses a fresh
local origin in the existing Chrome profile, preserving login cookies and previous
origin databases. Close affected tabs and workers before rebuilding. Installed
browser runtimes may reset incompatible node tables during initialization, so do
not reopen the rebuilt app on an origin being preserved. Old backend or browser
rows have no compatibility decoder or migration; restoring an old directory does
not make its rows readable by the current declarations.

## Source layout

`src/system.ts` registers user aggregate `2.0.0` alongside retained `1.0.0`.
The current release uses Site/Page `2.0.0`, PageSnapshot `1.0.0`, and web actor
`2.0.0`; unchanged User, provisioner, and Library declarations are reused.
The four Site/Page editing contracts have successor declarations with identity
payload adapters in both directions and explicit successor guards/programs.

The user aggregate ID is the verified Clerk token subject (`clerkUserId`), with
no added prefix. This starts fresh aggregate storage; existing `acct_…`
aggregates remain under their old IDs and are not migrated or deleted.

The web actors verify Clerk through `userProvisionerV1`, then authorization awaits `createUser`
under that provisioner actor and verified identity. Each attempt generates an
independent User resource ID (`usr_…`); `identity.clerkUserId` remains the Clerk
subject. The provisioner guard runs inside the aggregate command transaction and
rejects duplicate subjects with `user-already-exists`, which authorization
accepts as successful provisioning.
Other admission or execution failures prevent session initialization.

The current web actor selects User → Site → Page → Wall → Brick → Placement rows by Clerk
identity and exposes PageSnapshot rows only while a Page points to them as its
current snapshot. Historical contents remain canonical without synchronizing the
whole history into Studio. The provisioner exposes
only User. Each actor declares its exposed models separately from its canonical
query database and row selections. Wall, Brick, Placement, and their editing contracts are supplied by
`@qrk.sh/library/libraryModule`. QRK owns the Page's `wallId` reference; `createPage`
creates that deterministic wall and the Page in one command. Legacy Grid/Brick
snapshot contracts have been removed. There is no migration or lazy wall provisioning.
Existing Studio browser databases remain untouched by this code cutover.
Studio's `userBrowserRelease` uses the matching V2 web actor. Its `UserApp.Initializer`
owns initialization and disposal for each Clerk identity. Models live under `aggregates/user/models/<model>/`,
and contracts under `aggregates/user/contracts/<command>/`.

The private provisioner owner guard owns identity and duplicate-user decisions in
one admission transaction. Its declared aggregate failures retain their domain
codes. Browser editing guards declare contract failures; programs record deferred operations through their named descriptor map and return only their domain result. Checked evaluation produces the ordered batch and result together; reads remain on pre-application state. The web actor does not expose `createUser`.

Browser command occurrences carry nullable private failures. Confirmed occurrences
settle optimism even when their selected resource delta is empty. Canonical
provisioning command results retain server finalization. Node storage schema 14
and native session schema 3 require empty affected storage when upgrading to 7.0.0;
the package update does not reset or translate existing storage.

## Site creation slugs

`createSite` requires a slug containing lowercase ASCII letters/digits separated
by single internal hyphens. After checking the authenticated owner, its guard
rejects invalid format with `site-slug-invalid` (400), or a slug already used by
that user's Site with `site-slug-taken` (409). These checks and the site write run
in the existing aggregate transaction. Different users may reuse a slug.
The stored Site model remains nullable; no slug-editing command is added.

This declaration change uses fresh development data, without retained-history
migration. Stop the dev worker, then move the whole
`.wrangler/zerospin/dev-worker/sys_qrk_sh_1` directory into a uniquely timestamped
`.wrangler/zerospin/backups/sys_qrk_sh_1-<UTC timestamp>-pre-site-slugs` directory.
Restart the normal Nx `dev` target and require system-spec acceptance. The changed
browser session lock produces a new browser Node namespace on the same origin;
old IndexedDB databases and cookies remain untouched. Do not reset the API's R2
stores or the package registry.

## Page index slugs

The Page model and `createPage` require an explicit `slug` value, with no default.
`null` identifies the site's index page at `/`; non-null slugs keep their existing
behavior. After authenticating the site's owner, the `createPage` guard rejects
a second null-slug Page for the same site with `create-page-index-taken` (409)
before recording the Page or its Library wall. Each site can have one index page.

This nullable Page slug change adds no migration, storage reset, or backfill.
Existing pages with the `home` slug remain unchanged. The fresh-data instructions
above apply to the earlier Site slug cutover, not this Page index change.

## Publishing and page history

Site's `isPublished` controls site availability. Page's independent `isPublished`
and nullable `publishedSnapshotId` identify whether the page is published and
which immutable PageSnapshot supplies its published content. A snapshot contains
saved page metadata and Library brick state, specs, visibility, and layouts at
every breakpoint. It excludes generation requests/errors, revisions, and
measurement bookkeeping. Each publication creates a new row; publishing contracts
grant snapshot creation only, with no update/delete operation.

`publishSite({ siteId, pages: [{ pageId, snapshotId }] })` checks ownership and
the required index page, snapshots all checked pages, marks unchecked pages
unpublished while retaining their snapshot pointers, and enables the site in one
checked operation batch. `publishPage` requires a published site and unpublished
page. `publishPageUpdates` requires a published site and published page; it
creates another snapshot and advances the pointer. `unpublishSite` changes only
the site's availability flag. All four contracts enforce ownership.

Snapshot IDs are generated once before staging and retained in command payloads;
programs read the saved content rather than accepting browser-supplied snapshots.
QRK's existing `snapshots/pageSnapshotSchema.ts` and `snapshots/makePageSnapshot.ts`
own the whole publication shape and projection, including the saved Library
brick/placement subset. They derive field codecs from `libraryModule` while
choosing publication exclusions, nesting, and stable brick/breakpoint ordering.
The same projection serves publishing commands and Studio's structural dirty
comparison independently of query ordering; Library exposes no publication
snapshot API. Saved Site Settings changes remain immediate and are not part of
page publication history.

The publication release preserves storage: its version-specific model database
replays retained history through successor programs, initializing existing sites
and pages as unpublished. Retain V1 releases and contract lineage, deliver pending
V1 commands before switching browser namespaces, and preserve the prior browser
stores. The historical reset instructions above do not apply to publishing.
Public website rendering and browsing/restoring publication history remain later
application work.
