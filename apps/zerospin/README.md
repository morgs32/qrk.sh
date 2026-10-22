# QRK Zerospin backend

`zerospin.config.ts` exports the authored system with its existing
`sys_qrk_sh_1` identity. Zerospin generates the backend Wrangler configuration,
Worker entrypoint, and bindings. The installed CLI's default Worker name is
`qrk-sh-zerospin`; production explicitly uses `qrk-zerospin` without changing
the logical system name.

Put local authentication settings in this directory's `.env.local` (see
`.env.example`). The CLI discovers environment files from this project root.
Set `CLERK_AUTHORIZED_PARTY=https://app.qrk.localhost` to match App's
browser origin. Set `QRK_LIBRARY_API_URL=https://api.qrk.localhost/rpc` to the
API Worker's full LibraryApi RPC endpoint for brick-spec generation. Web still
owns the sign-in UI; keep existing secrets in their current local environment file.
Run local development from the repository root:

```sh
pnpm dev
```

The root `pnpm dev` command starts this Worker through Portless at
`https://zerospin.qrk.localhost`, retaining internal port 8788, alongside the
other three applications (App, Web, and API). Module playgrounds run in App Storybook. To start only this Worker, run `pnpm --dir apps/zerospin dev`.
Its `dev` script invokes Portless, which runs the CLI command in `dev:app`;
package metadata retains its hostname and port.

QRK installs the CLI and runtime packages at `27.0.0` from the populated local
registry described in the [root README](../../README.md#zerospin-packages).
Shared module definitions live in `src/modules/`; App and API compile their source
directly. Backend development does not rebuild installed Zerospin files.

The 26.x selection-definition cutover compares authored filters, identity
references, ordering, limits, and explicit SQL expression structure. Generated
SQL is only an execution artifact. It has no catalogue migration or legacy
comparison path. The authorized local cutover reset development state for
`sys_qrk_sh_1` and QRK's Zerospin browser databases; login cookies and credentials
were retained. This work did not deploy or reset production.

Run `pnpm nx run @qrk.sh/zerospin:test` for contained backend behavior with
`@effect/vitest`. `makeSystemHarness` tests use empty in-memory storage and
System-origin commands. Generation tests evaluate the authored declarations
against fresh method-level SQLite seed rows and replay their recorded model
operations; those tests do not exercise actor-origin admission. Neither test
seam verifies actor authentication, browser synchronization, Durable Object
transport, or live providers.

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
- `QRK_LIBRARY_API_URL=https://api.qrk.sh/rpc` for recorded brick-spec generation.
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
`4b0ca6b8e3a6fe721318c9de65b5f29d`, `workers_dev` to `true`, and the
`CLERK_AUTHORIZED_PARTY` and `QRK_LIBRARY_API_URL` variables above. Preserve
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

Core `27.0.0` provides the server-only
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

### Recorded brick-spec generation

The browser stages the optimistic `generateBrickSpecV1` command. Its backend
`generateBrickSpecServerV1` adapter re-records the checked Placement update and
one `generateBrickSpecExternalV1` operation with canonical module content,
current spec, prompt, request identity and both revisions. The originating
AggregateChain retains the request and its continuation; an open browser is no
longer required to initiate the provider request or apply its result.

`generateBrickSpecExternalV1.external.request` calls `LibraryApi.generateSpec`
through the required `QRK_LIBRARY_API_URL` full HTTP(S) RPC URL. OpenAI and its
credentials remain in `apps/api`. The request has a 30-second lifetime, aborts
HTTP and disposes its Cap'n Web session when it finishes or is interrupted, and
decodes the API's unknown response before retention. Missing or invalid URL
configuration becomes a recorded external request failure.

The continuation handles recorded Success and Failure. It rechecks the current
request identity, module, state/spec revisions and Wall membership before
recording a Placement update. Valid module specs advance `specRevision` and
mark generation ready; API rejections, invalid specs and external request
failures mark the still-current generation failed. Superseded results record
no model mutation. `completeBrickSpecGenerationV1` and App's generation scanner
are removed. No storage schema or storage reset is part of this change.

Source command replay does not call providers. Uncertain process loss can
repeat a provider request; this integration does not claim exactly-once OpenAI
execution. Contained harness tests do not verify real API delivery or production
configuration. Set the production
`QRK_LIBRARY_API_URL=https://api.qrk.sh/rpc` binding when deploying this capability.

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
brick-spec generation runs through recorded backend external work. Storybook
uses the same fetch-then-save forms with local example state. No verification runs were performed.

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
empty Stack each inside `Wall.layout`. The layout contains ordered Section,
named Stack, and Row nodes; Rows list Placement IDs. Node IDs stay stable while
arrays supply parentage and order. Section, Stack, and Row are no longer SQL
models, and no numeric sibling positions are stored.

Placement remains a separate model with direct `wallId`, shared `brickId`,
variant, spec, spec revision, and generation state. Brick retains shared module
content and its state revision. The unique Wall/Brick index preserves one
appearance per Wall. Spec/content updates never rewrite layout JSON.

`addBrick` records shared null content and four deterministic
Placements, explicitly selecting the `"default"` variant for each; the active
Wall follows its explicit insertion target and other Walls append a new Row to
their last existing Stack in Section order. The browser-safe layout module under
`aggregates/user/layout/` owns stable target lookup and pure array transformations.
Movement prunes all empty Rows, Stacks, and Sections in the edited Wall, then
checks capacity. Brick deletion removes its four references/Placement records
and shared content and prunes only ancestors emptied by those removals.
Unrelated empty containers remain untouched. Empty Walls remain usable drop
targets. Initial Page scaffolds and explicit container creation retain their
current semantics.

Commands calculate the next layout from current state and record one Wall update
per changed Wall alongside the required Brick/Placement operations. Ordinary
programs only record named operations; evaluation reads pre-application state
and the transaction applies the complete checked batch. Pure layout functions
preserve their input and return expected structural refusals through Result.
Stable insertion anchors are validated before candidate mutation, and genuine
self-before moves return the original layout without cleanup or a Wall update.

The current V1 development baseline replaces the old structural declarations in
place. The hard cutover includes definitions, admitted history, materialization,
projections, and checkpoints together; there is no old/new compatibility graph,
layout migration, or automatic reset. Normal development startup preserves
storage and must not run changed definitions against the previous graph.

The web actor selects Walls and Bricks through Page → Site → User and Placements
through Wall → Page → Site → User. Write commands also validate ownership, membership,
before-sibling references, capacity, and module limits. A Placement derives its
breakpoint directly from its Wall. JSON layout references are checked for
uniqueness and corresponding record membership. Generation/update programs
preserve request and revision guards. Provider lookups belong to the open form and cannot save
after cancellation or navigation.
PageSnapshot rows are exposed only while a Page identifies them as its current
published snapshot, leaving historical content canonical without syncing its
entire history into App. Session lifetime, local query/staging work, and failure
presentation remain App-owned.

[Plan 039](../../wiki/archive/plans/039-plan-wall-owned-layout-tree.md) records the
authorized local hard cutover. App/Zerospin watchers and affected browser sessions
were stopped before editing the declarations. The previous local
`dev-worker/sys_qrk_sh_1` directory is preserved at
`.wrangler/zerospin/backups/sys_qrk_sh_1-plan039-20261021T222956Z`.
The new baseline uses empty affected backend storage and a fresh definition-keyed
App namespace. Old App/Library partitions and their unsent work, cookies, uploads,
unrelated stores, and production data remain untouched and are not imported into
the new graph. Runtime readiness and command outcomes are recorded in Plan 039;
the storage move alone does not verify them.

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
Sections, Stacks, Rows, and Placements/specs. Container arrays preserve the Wall
layout's array order; shared Bricks have a stable identity order. Generation state,
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
Row grouping mark the Page dirty. Each command reads the Walls' structural JSON
and separate Brick/Placement records; browser callers cannot submit replacement
snapshot content. Missing layout references are invariant failures, not skipped
records or reconstructed legacy hierarchies.
Saved Site Settings remain immediate and outside Page publication history.

The editor schema change is a hard development cutover rather than a retained
history adapter. Follow the scoped backup procedure above; old affected releases
are not registered to backport the new hierarchy. Public website rendering and
browsing/restoring publication history remain later application work.

## Complete session declarations

Each authored session has one complete checked definition, including `systemName`, with explicit model and contract entries. Host wiring, UI owners, and SharedWorkers import that defining module directly. Credentials remain in authentication and host wiring. Zerospin packages are pinned to `27.0.0`; React UI contexts use `makeReactUI`.
