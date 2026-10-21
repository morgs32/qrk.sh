# QRK Zerospin backend

`zerospin.config.ts` exports the authored system with its existing
`sys_qrk_sh_1` identity. Zerospin generates the backend Wrangler configuration,
Worker entrypoint, and bindings. The installed CLI's default Worker name is
`qrk-sh-zerospin`; production explicitly uses `qrk-zerospin` without changing
the logical system name.

Put local authentication settings in this directory's `.env.local` (see
`.env.example`). The CLI discovers environment files from this project root.
Set `CLERK_AUTHORIZED_PARTY=https://app.qrk.localhost` to match App's
browser origin. Web still owns the sign-in UI; keep existing secrets in their
current local environment file.
Run local development from the repository root:

```sh
pnpm dev
```

The root `pnpm dev` command starts this Worker through Portless at
`https://zerospin.qrk.localhost`, retaining internal port 8788, alongside the
other three applications (App, Web, and API). Module playgrounds run in App Storybook. To start only this Worker, run `pnpm --dir apps/zerospin dev`.
Its `dev` script invokes Portless, which runs the CLI command in `dev:app`;
package metadata retains its hostname and port.

QRK installs the CLI and runtime packages at `24.0.1` from the populated local
registry described in the [root README](../../README.md#zerospin-packages).
Shared module definitions live in `src/modules/`; App and API compile their source
directly. Backend development does not rebuild installed Zerospin files.

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
file mode `0600`; keep it separate from local development settings. The
production rollout uses these bindings:

- `ZEROSPIN_ENVIRONMENT=production` and `ZEROSPIN_SYSTEM_ID=sys_qrk_sh_1`.
- `CLERK_AUTHORIZED_PARTY=https://app.qrk.sh` for the standalone App rollout.
- Secrets `ZEROSPIN_PUBLISHABLE_KEY`, `ZEROSPIN_SECRET_KEY`, and `CLERK_SECRET_KEY`.

App's production build uses `https://zerospin.qrk.sh` and the matching
publishable key. Keep the server secret and Clerk secret out of frontend public
variables.

Apply the authorized-party binding with the standalone App deployment;
changing the local production settings does not update the live Worker. Token
verification and the system/aggregate identities remain unchanged.

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

Core `24.0.1` provides the server-only
`@zerospin/core/utils/getSystemApi/getSystemApi` client. Supply
`ZerospinApiUrl` and `SecretKey` (`Redacted<string>`) in the application's Effect
layer, then acquire it with `yield* getSystemApi()`. Construct a connection-free
query with `makeQueryDbVersion({ models: userAggregateV1.models })` and pass
the selection to `systemApi.executeAggregateQuery` with user aggregate identity:

```ts
import { userAggregateV1 } from "./src/aggregates/user/UserV1";

const systemApi = yield * getSystemApi();
const db = makeQueryDbVersion({ models: userAggregateV1.models });
const site =
  yield *
  systemApi.executeAggregateQuery({
    aggregateName: "user",
    aggregateVersion: 1,
    aggregateId,
    query: db.query.site.findFirst({
      where: { id: { eq: siteId } },
      with: {
        pages: {
          with: {
            bricks: true,
            walls: {
              with: {
                sections: { with: { stacks: { with: { rows: { with: { placements: true } } } } } },
              },
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

The integer revision cutover requires empty affected development and production
storage. Regular development startup does not delete stores. The maintainer has
authorized erasing this system's obsolete data for the new baseline; reset
completion is recorded separately from source migration. No decoder or payload
adapter imports older data.

App's move from Web to its own hostname is a hard origin cutover. The new
origin initializes its own Node and synchronizes accepted backend data for the
same Clerk identity. Old-origin databases and backups remain untouched;
local-only drafts and unsent commands stay on the old origin and are not
migrated. No backend reset or cross-origin storage bridge is part of this move.

Browser backups are scoped by origin. The earlier Article Markdown cutover uses a fresh
local origin in the existing Chrome profile, preserving login cookies and previous
origin databases. Close affected tabs and workers before rebuilding. Installed
browser runtimes may reset incompatible node tables during initialization, so do
not reopen the rebuilt app on an origin being preserved. Old backend or browser
rows have no compatibility decoder or migration; restoring an old directory does
not make its rows readable by the current declarations.

## Source layout

`src/system.ts` registers one fresh User aggregate at integer revision `1`.
The web actor, provisioner, models, ordinary contracts, and module definitions
also use their own integer revision `1`. App owns one complete pure session
definition, `apps/app/zerospin/userSessionDefinition.ts`, which its initializer
and SharedWorker import directly. Older release declarations, payload adapter
edges, browser session registrations, and replay-only provider contracts are
removed. Server queries use the canonical `userAggregateV1` declaration.

The user aggregate ID is the verified Clerk token subject (`clerkUserId`), with
no added prefix. The web actor verifies Clerk through `userProvisionerV1`, then
its authorization provisions through `createUser` in its selected release.
Each attempt allocates an independent `usr_…` resource ID. The provisioner owner
guard rejects duplicate subjects with `user-already-exists`; authorization treats
that refusal as successful provisioning. Other admission/execution failures stop
initialization. The web actor never exposes `createUser`.

Model relationships use `modelRef` with the stable `defineModel` identity.
The aggregate selects model versions, and Zerospin binds the references against
that selected graph after checking ID compatibility. Adding a non-key Site field
therefore does not require new Page, Brick, Placement or unrelated contract versions.

Site `stickyNavbar` is a non-null boolean defaulting to `true`. Site creation
records it enabled; `updateSiteSettings` saves the checkbox value. This change
uses the explicitly authorized reset of local `sys_qrk_sh_1` storage; no new
aggregate/model/contract versions are introduced for the former reference cascade.
No verification runs were performed for this change, as requested.

### Placement spec validity

Placement revision `1` requires a nonempty root, at least one element, and structured
json-render elements. Its Effect schema also requires the root to name an existing
element. Model operations and authored query decoding use this schema, so invalid
specs raise errors instead of rendering an empty-layout fallback. Manual spec
commands additionally validate the selected module's components and props.

The nonempty and element-shape constraints serialize into the stored JSON Schema.
The cross-field root-membership filter runs in Effect; generic JSON Schema
consumers do not enforce that filter. Generated and manually edited specs are
validated before their placement update, and authored query decoding applies the
same persisted spec schema.

The fresh baseline registers the current strict Placement schema directly.
Each command declares its current models, operation bindings, and payload
validators without a predecessor or payload-translation edge. The cutover
requires empty affected development and production stores; stored commands and
resources from former releases cannot be imported into this baseline.

### Provider forms save complete state

User revision `1` exposes `updateBrickV1` for content saves. The seven
provider configure/complete pairs are removed from both the owner and web actor.
Current module definitions contain `{ payload, data }` and have no retained
legacy registry. The save command validates current module state, advances the
shared Brick state revision, and supersedes active spec generation while
preserving placement identities, specs, and ordering.

Each module form fetches and validates before staging its one state save. Provider
failures leave previous content intact. Cancellation closes local RPC and blocks
late saves; it does not reverse remote side effects. Pending status and errors are
not persisted and nothing resumes on mount. App's provider runners are deleted;
its separate layout generation remains. Storybook uses the same fetch-then-save
forms with local example state. No verification runs were performed.

App owns the persisted editor. Its Page owns shared Bricks and four Walls,
one per `sm`/`md`/`lg`/`xl` breakpoint. Walls own ordered Sections; Sections own
ordered Stacks; Stacks own vertical Rows; Rows own horizontal Placements.
Placements reference shared Bricks and keep per-breakpoint variant identities,
specs, and generation revisions. The required `variantId` currently accepts only
`"default"`; each breakpoint placement owns its choice independently. Published
placement snapshots retain that identity. The field is part of the fresh
development baseline, without a missing-field fallback or backfill. Existing
affected stores require a separately authorized cutover before adoption; this
source change performs no storage reset.

Model and canonical contract declarations live directly under
`src/aggregates/user/models/` and `contracts/`. Wall/Brick references bind to the
final Page table. State-save and spec-update commands live directly
in their versioned backend files, where concrete model versions are selected.
Zerospin owns module state/component schemas, versions, catalogs, default specs,
and normalization under `src/modules/`. App owns forms and rendering; API owns
provider operations. There is no contract-binding factory, standalone Library database,
seeded Page, or host-binding declaration assembly.

`createPage` records the Page and all four Walls with one initial Section and
empty Stack each. `addBrick` records shared null content and four deterministic
Placements, explicitly selecting the `"default"` variant for each; the active
Wall follows its explicit insertion target and other Walls append a new Row to
their last Stack. Move commands renumber affected
siblings atomically through internal `cleanupWall`. It prunes empty Rows, then
Stacks, then Sections, and compacts all surviving sibling positions, including
Placements. Movement cleans the whole affected Wall; Delete Brick removes its
Placements and content and cleans all four Page Walls. Empty Walls remain usable
drop targets. Move capacity is checked after cleanup. Initial Page scaffolds and
explicit container creation retain their current semantics.

Each command edits a narrow ordered candidate hierarchy before cleanup. Ordinary
programs only record named operations; evaluation reads pre-application state
and the transaction applies the complete checked batch. Stable insertion anchors
are validated before candidate mutation, and genuine self-before moves return
without cleanup.

The cleanup operation capabilities change the accepted declarations in place as
part of the fresh-development cutover. Adoption requires empty affected backend
definition/materialization storage and fresh matching browser session state.
Retained environments need versioned release evolution before rollout; normal
development startup preserves storage.

The web actor selects editor rows through Page → Site → User and the actual
container parent chains. Write commands also validate ownership, membership,
before-sibling references, capacity, and module limits. A Placement derives its
breakpoint from its containing Wall. Generation/update programs preserve request
and revision guards. Provider lookups belong to the open form and cannot save
after cancellation or navigation.
PageSnapshot rows are exposed only while a Page identifies them as its current
published snapshot, leaving historical content canonical without syncing its
entire history into App. Session lifetime, local query/staging work, and failure
presentation remain App-owned.

Plan 036 requires the separately approved empty affected development state.
Stopping the backend and moving only `dev-worker/sys_qrk_sh_1` under the existing
backup directory preserves the previous data. Matching browser definition locks
open new App partitions; previous App/Library partitions, cookies, uploads,
unrelated stores, and production data remain untouched. This source change does
not itself perform that cutover or verify live command finalization.

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
Restart with `pnpm --dir apps/zerospin dev` and require system-spec acceptance. The changed
browser session lock produces a new browser Node namespace on the same origin;
old IndexedDB databases and cookies remain untouched. Do not reset the API's R2
stores or the package registry.

## Page index slugs

The Page model and `createPage` require an explicit `slug` value, with no default.
`null` identifies the site's index page at `/`; non-null slugs keep their existing
behavior. After authenticating the site's owner, the `createPage` guard rejects
a second null-slug Page for the same site with `create-page-index-taken` (409)
before recording the Page or its four Walls. Each site can have one index page.

This nullable Page slug change adds no migration, storage reset, or backfill.
Existing pages with the `home` slug remain unchanged. The fresh-data instructions
above apply to the earlier Site slug cutover, not this Page index change.

## Publishing and page history

Site's `isPublished` controls site availability. Page's independent `isPublished`
and nullable `publishedSnapshotId` identify whether the page is published and
which immutable PageSnapshot supplies its published content. A snapshot contains
page metadata, shared Brick content once, and all four ordered Walls with their
Sections, Stacks, Rows, and Placements/specs. Container arrays preserve sibling
position order; shared Bricks have a stable identity order. Generation state,
revisions, and editor bookkeeping are excluded. Publication creates immutable
rows and grants no snapshot update/delete operation.

`publishSite({ siteId, pages: [{ pageId, snapshotId }] })` checks ownership and
the required index page, snapshots all checked pages, marks unchecked pages
unpublished while retaining their snapshot pointers, and enables the site in one
checked operation batch. `publishPage` requires a published site and unpublished
page. `publishPageUpdates` requires a published site and published page; it
creates another snapshot and advances the pointer. `unpublishSite` changes only
the site's availability flag. All four contracts enforce ownership.

Snapshot IDs are generated once before staging and retained in command payloads;
programs read the saved content rather than accepting browser-supplied snapshots.
QRK's `snapshots/pageSnapshotSchema.ts` and `snapshots/makePageSnapshot.ts`
own this publication shape and projection. The same builder serves publication
commands and App's saved-versus-published comparison, so movement and horizontal
Row grouping mark the Page dirty. Each command reads all relevant parent and
Placement models; browser callers cannot submit replacement snapshot content.
Saved Site Settings remain immediate and outside Page publication history.

The editor schema change is a hard development cutover rather than a retained
history adapter. Follow the scoped backup procedure above; old affected releases
are not registered to backport the new hierarchy. Public website rendering and
browsing/restoring publication history remain later application work.

## Complete session declarations

Each authored session has one complete checked definition, including `systemName`, with explicit model and contract entries. Host wiring, UI owners, and SharedWorkers import that defining module directly. Credentials remain in authentication and host wiring. Zerospin packages are pinned to `24.0.1`; React UI contexts use `makeReactUI`.
