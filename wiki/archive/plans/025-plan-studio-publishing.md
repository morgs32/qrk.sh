# Studio publishing and page history

Status: Complete and archived on 2026-10-16. Normal compilation, accepted fresh startup, manual Studio publishing review, and canonical history retention passed. The user-authorized backend reset superseded preserved-content replay for this run.

## Agreed behavior

1. Render one shared drawer header from the common drawer layout, preserving breadcrumbs, settings Save/Cancel, and Close behavior. Place **Publish Site**, then **Publish Page / Publish Updates**, immediately left of Close/Cancel.
2. Hide **Publish Site** while the site is published. Its modal uses the existing directory-style SiteTree and prechecks previously published pages. The index page at `/` is always checked and disabled.
3. Publish the selected pages and enable the site through one `publishSite` command. Unchecked pages become unpublished while retaining their snapshot pointers and history.
4. Offer **Publish Page** only for an unpublished page in a published site. Offer **Publish Updates** when a published page's saved content differs from its current snapshot. Hide the page action when unchanged.
5. **Unpublish Site** belongs in Site Settings. It disables site availability while retaining page flags and snapshots. Remove the inert website-unpublish section from Page Settings.
6. Publishing uses saved content; unsaved form drafts still require Save. Saved Site Settings changes take effect immediately.
7. Retain every historical page snapshot now. Public rendering, history browsing, restoration, and independent page-unpublish controls remain deferred.

## Models, contracts, and ownership

1. Add `SiteV2.isPublished`, initially false. Add `PageV2.isPublished`, initially false, and nullable `publishedSnapshotId`.
2. Add immutable `PageSnapshotV1` records with `pageId` and `content`, using framework timestamps. Give `pageId` a real Page relation; keep Page's snapshot pointer a typed identifier to avoid unsupported table-reference cycles.
3. Content contains page slug/title/description plus bricks, module state, and placement breakpoint/spec/geometry/visibility. Exclude generation requests/errors, revisions, and measurement bookkeeping. Sort arrays by stable identifiers and breakpoint; compare content structurally.
4. Library owns separate wall schema/projection files. QRK owns separate page schema/projection files. Only PageSnapshot is a stored snapshot model. Import each symbol directly from its defining file; introduce no declaration barrels or extra named types.
5. Contracts and payloads:

   | Contract | Payload | Behavior |
   | --- | --- | --- |
   | `publishSite` | `{ siteId, pages: [{ pageId, snapshotId }] }` | Snapshot checked pages, update their pointers/flags, mark unchecked pages unpublished, enable site |
   | `publishPage` | `{ pageId, snapshotId }` | Require published site and unpublished page; create snapshot and publish page |
   | `publishPageUpdates` | `{ pageId, snapshotId }` | Require published site and published page; create snapshot and advance pointer |
   | `unpublishSite` | `{ siteId }` | Disable site availability only |

6. All contracts enforce ownership. Site publication requires an unpublished site, unique selected page/snapshot IDs, selected pages belonging to the site, and exactly one included index page. Read snapshot content authoritatively from saved models.
7. Generate snapshot IDs once before staging and retain them in payloads. Grant publishing contracts snapshot create operations only. Do not expose snapshot update/delete operations.
8. Select only current snapshots into Studio; retain old snapshot contents in canonical storage without syncing all history to browsers.

```ts
// 1. Validate ownership, checked pages, and the mandatory index page.
// 2. Record each checked page's snapshot and advance its pointer/flag.
// 3. Mark unchecked pages unpublished, preserving pointers and history.
// 4. Enable the site within the same checked operation batch.
```

1. Example: selecting `/` and `/about` while unchecking `/contact` creates new snapshots for the first two pages. Contact becomes unpublished and keeps its old snapshots.
2. Example: editing and saving a published page shows Publish Updates. Publishing creates another snapshot; the previous row stays unchanged.

## Implementation steps

1. Preserve storage by adding `user@2.0.0` and `web@2.0.0` alongside V1 definitions. Upgrade Site/Page and four existing Site/Page contracts. Use identity payload adapters both directions, explicit successor guards/programs/models/operations, and patch Page's Site reference to SiteV2. Reuse unchanged User, createUser, provisioner, and Library declarations.
2. The original cutover required retained-history replay without reset and delivery of pending V1 commands before switching Studio namespaces. During verification, the user explicitly chose a local backend storage reset instead of repairing preexisting V1 declaration drift. The reset supersedes preserved-history verification for this run; preserve the backup, unrelated work, browser stores, and cookies. See the reset evidence below.
3. Render DrawerHeader from the common drawer layout. Move existing header behavior into it and remove duplicate headers/brick layout. Capture settings baselines on entry, keyed by branch and IDs; preserve exact Cancel restoration and scroll:false closing.
4. Keep publication state in live models, outside editable draft stores. Extend existing ISiteTreeNode with optional controlled checkbox props, preserving its display-only consumer.
5. Use existing Dialog controls. Initialize modal selections when opening; lock the index page; retain selection after immediate refusal; close on successful staging. Surface later originating-command failures without presenting optimism as canonical completion.
6. Switch active Studio model imports and session registration to the new release. Preserve local null-slug Page changes and identify the mandatory index page strictly with `slug === null`.
7. Update affected READMEs and glossary after implementation. Create an ADR only for an implemented decision that is hard to reverse, surprising without context, and the result of a real trade-off.

## Planned files

Legend: `+` create, `~` modify, `-` remove. Each schema, projection, model version, and contract definition has its own file.

```text
qrk.sh/
├── apps/library/
│   ├── + libraryModule/snapshots/wallSnapshotSchema.ts
│   ├── + libraryModule/snapshots/makeWallSnapshot.ts
│   ├── ~ package.json
│   ├── ~ vite.lib.config.ts
│   └── ~ README.md
├── apps/zerospin/
│   ├── ~ src/system.ts
│   ├── src/aggregates/user/
│   │   ├── + UserV2.ts
│   │   ├── ~ userSessionDefinition.ts
│   │   ├── + actors/userActorV2.ts
│   │   ├── + models/site/SiteV2.ts
│   │   ├── + models/page/PageV2.ts
│   │   ├── + models/pageSnapshot/pageSnapshot.ts
│   │   ├── + models/pageSnapshot/PageSnapshotV1.ts
│   │   ├── + snapshots/pageSnapshotSchema.ts
│   │   ├── + snapshots/makePageSnapshot.ts
│   │   └── contracts/
│   │       ├── + createSite/CreateSiteV2.ts
│   │       ├── + createPage/CreatePageV2.ts
│   │       ├── + updateSiteSettings/UpdateSiteSettingsV2.ts
│   │       ├── + updatePageSettings/UpdatePageSettingsV2.ts
│   │       ├── + publishSite/publishSite.ts
│   │       ├── + publishSite/PublishSiteV1.ts
│   │       ├── + publishPage/publishPage.ts
│   │       ├── + publishPage/PublishPageV1.ts
│   │       ├── + publishPageUpdates/publishPageUpdates.ts
│   │       ├── + publishPageUpdates/PublishPageUpdatesV1.ts
│   │       ├── + unpublishSite/unpublishSite.ts
│   │       └── + unpublishSite/UnpublishSiteV1.ts
│   └── ~ README.md
├── apps/studio/
│   ├── ~ zerospin/userSession.ts
│   ├── ~ components/ZerospinUser.tsx
│   ├── ~ components/SiteTree.tsx
│   ├── ~ app/[username]/(dashboard)/page.tsx
│   ├── app/[username]/site/[siteId]/
│   │   ├── ~ SiteLayout.tsx
│   │   └── page/[pageId]/
│   │       ├── ~ Grid.tsx
│   │       ├── ~ Modules/Modules.tsx
│   │       ├── ~ BrickDetail/BrickDetail.tsx
│   │       ├── ~ PageSettings/PageSettings.tsx
│   │       ├── ~ SiteSettings/SiteSettings.tsx
│   │       └── (drawer)/
│   │           ├── ~ layout.tsx
│   │           ├── + DrawerHeader.tsx
│   │           ├── + PublishSiteDialog.tsx
│   │           └── (bricks)/
│   │               ├── - layout.tsx
│   │               └── ~ modules/[moduleId]/page.tsx
│   └── ~ README.md
└── wiki/
    ├── + plans/025-plan-studio-publishing.md
    └── ~ glossary.md
```

## Verification and completion

1. Use normal development compilation and manual Studio review. Add no test suites, backend integration tests, or standalone check gates.
2. Review ownership/root/page-eligibility guards, immutable permissions, stable snapshot identity/content, and atomic operation batches.
3. Review every drawer branch for one header, correct actions, preserved breadcrumbs, Save/Cancel, and scrolling. Review first publication, republish defaults, unchecked pages, saved-content dirtiness, and retained history.
4. Observe normal startup and preserved-content replay before claiming a storage-preserving cutover works. The later user-authorized reset supersedes preserved-content replay for this run: verify fresh backend acceptance and manual Studio behavior, and make no retained-content replay claim.
5. Reconcile documentation with the implementation, record evidence here, and archive this plan only after all required work is complete.

## Starting state and decisions

1. Implementation started with existing local changes to PageV1/CreatePageV1, dashboard/pageStore, and Studio/backend READMEs. Those changes identify the index Page using `slug: null`, while the original plan named `home`. The user explicitly confirmed `slug: null` during implementation; the guard and modal follow it without a legacy `home` fallback.
2. Existing Studio/Web/Library development processes were running; no backend listener was present on port 8788 before this implementation.

## Implementation and compilation evidence

1. Added individual wall/page schema and projection files, immutable PageSnapshot, successor models/contracts/actor/release, the common header, nested publication tree modal, page/update/site actions, and late originating-publication failure presentation. Public rendering and history UI remain deferred.
2. The user explicitly confirmed the newer nullable index convention. Both modal and contract require exactly one `slug === null` index page, with no `home` fallback. Existing WIP in PageV1/CreatePageV1, dashboard/pageStore, and README sections was preserved.
3. Snapshot IDs are retained in command payloads; snapshot create operations use ordinary INSERT semantics and cannot overwrite retained IDs. Source review confirms ownership/root/state guards and one checked site-publication batch. Studio actor selections include only snapshots referenced by their owning Page's current pointer.
4. Snapshot projection accepts the actual query's nullable brick reference at its input boundary, without casts or model changes. Arrays use ordinal sorting so browser/server locale differences cannot create false publication dirtiness.
5. Initial Library and Studio builds passed before the runtime startup repairs. Scoped source formatting and `git diff --check` passed. The final production build after those repairs and removal of temporary review controls is recorded below. No test suites, backend integration tests, or standalone check gates were added or run.
6. The initial `pnpm nx run @qrk.sh/zerospin:dev` attempt loaded declarations and reached Wrangler's listener, but failed its accepted-system-spec check and exited. Nx printed a successful continuous-target summary despite the inner lifecycle failure; that attempt did not establish backend readiness. Diagnostic log: `/tmp/qrk-plan025-backend.log`. The later authorized reset and successful startup are recorded below.
7. Before reset authorization, existing Chrome was preserved. A temporary localhost Studio tab showed Loading account and no registered live session before the release wiring changed. Live publication interactions and preserved-content replay were not verified during that initial failed startup; no backend or browser storage was reset in that attempt.
8. Library, Studio, and backend READMEs and the existing glossary reflect the implemented behavior. No implemented choice met all three ADR criteria, so no ADR was added.
9. Before the reset, read-only inspection of retained accepted definitions and SQLite tables confirmed that older V1 declarations lacked Library revision/generation fields and 17 currently registered contracts; accepted Page/createPage slugs were non-nullable. Canonical history contained three createUser commands and no Site/Page/Brick/Placement rows. Wholesale rollback would also have restored an incorrect older createSite payload. No accepted-definition rows or other stored state were changed during that diagnosis.
10. The user explicitly authorized "Reset storage" instead of the proposed legacy V1 repair. The stopped local backend's whole `apps/zerospin/.wrangler/zerospin/dev-worker/sys_qrk_sh_1` directory was preserved at `apps/zerospin/.wrangler/zerospin/backups/sys_qrk_sh_1-20261016T173428170591Z-plan025-user-reset`, then the normal dev target created fresh storage. Browser data and cookies were not cleared; API/R2 storage, environment files, and the package registry were preserved. This authorized reset supersedes the original preserved-history verification for this run.
11. After reset, normal backend development reached `Ready on http://127.0.0.1:8788/ (system spec accepted)`. Diagnostic log: `/tmp/qrk-plan025-backend-reset.log`. Both current authored releases were accepted without legacy declaration repair. This established fresh startup acceptance; retained-content replay remains superseded by the authorized reset.
12. The first post-reset Chrome review at `localhost:3000/morgs32` remained on **Loading account**, with **No sessions** in Zerospin DevTools. `/sign-in` redirected to `/morgs32`; scripts returned 200 and no console error was observed. Those observations did not establish that the user was signed out. Browser databases and cookies were preserved throughout the later recovery.
13. Source review identified the existing startup-boundary violation: `UserSessionWork` called `useInitializedSession()` directly beneath `UserApp.Initializer`, before a local Suspense boundary could catch the pending reader. The user authorized the bounded correction: add React Suspense immediately inside Initializer around UserSessionWork so the owner can commit its startup effect. This was implemented, normal dashboard session initialization then succeeded, and an ordinary canonical site creation succeeded. No broader authentication changes or browser-data reset were needed.
14. Opening the editor exposed a preexisting Library bundling problem: bundled Meowdown/BaseUI CommonJS shims retained external React requires because React was duplicated between the normal external list and `esmExternalRequirePlugin`. Removing the duplicate allowed the editor to render, but the plugin's fixed `namespace["module.exports"]` facade then failed Studio's production webpack compilation. The final bounded repair removed the incompatible plugin, restored normal React externalization, and externalized only the exact existing `@meowdown/react` dependency. Meowdown retains its own BaseUI dependency version; Library package versions, CSS imports, and snapshot entrypoints were preserved. No dependency, custom transform, or webpack workaround was added.
15. After that repair, `pnpm nx run @qrk.sh/studio:build` passed its Library dependency, optimized production compilation, TypeScript, prerendering, and route generation. It was rerun after temporary dashboard controls were fully removed and passed again, exit 0 in 58.1 seconds. Final log: `/tmp/qrk-plan025-studio-final-build.log`. Generated Library module-view output imports Meowdown normally and has no raw React require calls; extracted Article CSS retained Meowdown and QRK selectors.
16. The user authorized temporary dashboard controls to stage ordinary `createPage` commands for About and Contact during manual review. Those controls created the two review pages and were fully removed before the final build; they are not shipped functionality.
17. Manual review verified that the first index-page publication used saved metadata and excluded an unsaved settings draft. Cancel restored the settings baseline. Saving published-page metadata showed **Publish Updates**; publishing those updates hid the action again.
18. Saving Site Settings changed the canonical site name immediately. **Unpublish Site** set site availability false while retaining page publication flags, current snapshot pointers, and history. Republishing with `/` and About selected left Contact unchecked and unpublished. Contact's **Publish Page** action then published it successfully.
19. Canonical storage review observed five retained snapshots after those initial flows. Earlier snapshot content hashes and framework timestamps remained unchanged while current page pointers advanced; the final review below extended that evidence to eight snapshots.
20. Manual drawer review covered the catalog, module detail, brick detail, Page Settings, and Site Settings. Each rendered one shared header with the appropriate breadcrumbs and publication action immediately before Close/Cancel. Module-owned brick Save/Cancel remained in its form. The separate breakpoint route retained its own toolbar and Close behavior; changing the viewed breakpoint did not show Publish Updates. DOM inspection confirmed one header and independent settings-body scrolling while the header stayed in place.
21. Dragged a Swatch and Icon brick onto Contact, saved color `#3355AA`, and published its updates through the shared brick-detail header. The new snapshot contained the saved module state plus specs, geometry, and visibility at all four breakpoints, sorted `lg`, `md`, `sm`, `xl`. Brick keys were `id`, `moduleId`, `state`, and `placements`; placement keys were `breakpoint`, `spec`, `gridItem`, and `isVisible`. Generation, revision, and measurement bookkeeping were absent. All five earlier snapshot hashes and timestamps remained unchanged.
22. After another Unpublish Site, the modal prechecked `/`, About, and Contact, with `/` disabled. Unchecking Contact and republishing created new snapshots for `/` and About, enabled the site, and made Contact unpublished while preserving its current snapshot pointer and both historical snapshots. Contact's header then offered Publish Page. The final command finalized successfully; all eight publication/unpublication commands in the review succeeded canonically.
23. Final canonical storage contained eight snapshots. Every prior six content hashes and framework timestamps remained unchanged after the final republication. The current-pointer predicate selected three snapshots. Live Studio DevTools Database → pageSnapshot independently showed exactly those three current rows, while canonical history retained all eight.
24. Source review covered ownership, mandatory null-slug index inclusion, page eligibility, unique selected identifiers, immutable create-only permissions, the checked site-publication batch, immediate-refusal selection retention, and later originating-command failure presentation. No backend failure-injection suite or standalone check gate was introduced. Fresh authorization's V1 createUser commands also materialized into V2; this does not establish compatibility with the quarantined pre-reset history.
25. Final source formatting and `git diff --check` passed. Temporary setup controls were absent from source and the final production build. Screenshots from manual review were saved at `/tmp/qrk-studio-publish-selection.jpg` and `/tmp/qrk-studio-publishing-verified.jpg`. Affected READMEs and glossary are current; no decision met all three ADR criteria. Implementation and agreed verification are complete.

## Remaining work

None.
