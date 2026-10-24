# Studio publishing ownership

Publication serialization was implemented and verified on 2026-10-16 and now lives in QRK's existing snapshot files. Image upload ownership is recorded separately below: Plan 027's verification is historical; the subsequent Plan 041 SWRConfig cleanup was implemented without new verification at the user's request. The other scan candidates were considered and left unchanged at that scan. The
Plan 042 composition follow-up below records current owners separately from the
original Library-era findings and verification.

## Current composition follow-up: Plan 042

Implemented 2026-10-22 without verification, as requested. Actual
[UserLayout](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/layout.tsx)
owns Clerk loading/sign-in and the account-keyed connected initializer; only its
ready callback mounts UserUI and descendants. Actual
[SiteLayout](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/layout.tsx)
owns the shared shell, and actual
[PageLayout](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx)
owns production editor composition, title and authenticated SWR upload host.
Separate authentication/draft wrappers, global settings stores, EditorLayout,
both wall providers/contexts, BrickCardStyleContext and WallPreviewViewport are
removed. PageLayout directly owns preview scrolling, 50dvh/56px drawer space,
scroll anchoring/clamping and floating toolbar placement, including reduced
motion. App reads saved `Site.cardStyle` directly; the local Cards override and
drawer-header Cards control are removed.

Site/Page settings routes query saved rows and key existing forms by the real
entity ID. Unsaved fields, Save and Cancel belong to each form. Outer title,
wordmark and sticky navbar read saved rows; publishing continues to use saved
Site/Page/Brick/Wall/Placement data and never saves form fields implicitly.
DrawerHeader retains breadcrumbs, navigation, breakpoint controls and publication.

The production URL owns `?breakpoint=md`; App's Zustand store owns only available
width. PageLayout's guard measures its viewport and uses one focused effect to
replace missing/non-fitting choices with the largest fitting breakpoint, clearing
insertion. Below 360px it shows insufficient space without selecting another
Wall. PagePreview adopts the development canvas's direct Wall query, drop
resolution and DOM drag registrations inside the existing WallBreakpointPane and
SiteHeader chrome. One fitting URL-selected frame mounts the canvas, with
WallPlacement retaining editing/deletion and Modules supplying draggable catalog
previews. The dev route and generated route-tree entries are removed. Chooser
components retain their UserUI queries and direct commands. Storybook owns its
memory-router breakpoint and width locally; its Wall Editor story remains a
controlled WallTree fixture and does not mount the adopted production canvas.
BrickDetail's form follows Placement identity: breakpoint changes, including
automatic correction, discard the old draft and abort pending uploads. Historical
upload evidence below predates this changed lifetime. The development canvas's
query, add/move and drag behavior now belongs to production PagePreview. See
[Plan 042](../archive/plans/042-plan-route-layout-ownership.md).

## Original publication ownership

QRK owns its persisted publication format, including the saved Library content inside it. `PageSnapshotSchema` now declares the complete page/wall shape, and `makePageSnapshot` projects the complete saved page content. Both use Library's existing editable models and field codecs. The former `WallSnapshotSchema` and `makeWallSnapshot` Library files and package exports are removed; no new helper, named type, or forwarding seam replaces them. [Schema](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/snapshots/pageSnapshotSchema.ts), [Projection](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/snapshots/makePageSnapshot.ts), [Library models](/Users/morgs32/GitHub/qrk.sh/apps/library/libraryModule/libraryModule.ts:127), [Library exports](/Users/morgs32/GitHub/qrk.sh/apps/library/package.json).

| Responsibility | Owner and evidence |
| --- | --- |
| Editable content and invariants | Library owns Brick module/state and Placement breakpoint/spec/geometry/visibility, including editing revisions, generation, and measurement fields. [Brick model](/Users/morgs32/GitHub/qrk.sh/apps/library/libraryModule/models/brick/makeBrickModel.ts), [Placement model](/Users/morgs32/GitHub/qrk.sh/apps/library/libraryModule/models/placement/placementModelV1.ts). |
| Publication serialization | QRK selects retained fields, excludes generation/errors/revisions/measurements, nests placements under bricks, and sorts arrays ordinally. Slug/title/description and wall content stay in the existing page snapshot schema/projection. [Schema](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/snapshots/pageSnapshotSchema.ts), [Projection](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/snapshots/makePageSnapshot.ts). |
| Durable publication data and rules | QRK uses `publishPage` for both first publication and subsequent updates and owns immutable PageSnapshot records, Site/Page flags, current pointers, eligibility/ownership guards, and the current-snapshot selection. [Snapshot model](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV1.ts), [Site publication](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/publishSite/PublishSiteV1.ts), [Page publication](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/publishPage/PublishPageV1.ts), [Actor selection](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/actors/userActorV2.ts). |
| Publishing controls and draft comparison | Studio owns its drawer actions, selected pages, generated snapshot IDs, and staging/failure presentation. It reuses QRK's projection for saved-content dirty comparison. [Header](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/(drawer)/DrawerHeader.tsx), [Dialog](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/(drawer)/PublishSiteDialog.tsx). |

The relocation preserves stored content shape, field exclusions, ordering, command payloads, model/contract versions, and runtime behavior. Both publishing commands and Studio continue using the same `makePageSnapshot` definition. There is no stored WallSnapshot model. Library's renderer reads live model rows, and its standalone durability uses the existing session backup mechanism. [Renderer](/Users/morgs32/GitHub/qrk.sh/apps/library/lib/BrickWall.tsx), [Standalone session](/Users/morgs32/GitHub/qrk.sh/apps/library/session/createLibraryStandaloneSession.ts).

The keep-Library argument was proximity to its content models. That remains appropriate for field codecs and editing invariants. Publication serialization instead chooses QRK's persisted representation; source inspection found no independent Library consumer of that representation. Folding it into QRK removes the package seam while preserving reuse among its actual callers. Archived Plan 025 records the former split and remains unchanged as historical evidence. [Historical plan](/Users/morgs32/GitHub/qrk.sh/wiki/archive/plans/025-plan-studio-publishing.md).

## Implemented follow-up: host-owned Image uploads

[Plan 027](../archive/plans/027-plan-host-owned-image-uploads.md) established host-owned upload protocols. [Plan 041](../archive/plans/041-plan-host-owned-upload-functions.md) subsequently removed the upload Effect service, runtime context, host layers and runner adapters. App and Storybook now provide `uploadImage(file, { signal }): Promise<string>` through `SWRConfig`. ImageForm explicitly supplies that function to `useSWRMutation`; a type-only augmentation declares the optional SWR field. No separate Image upload context or initializer capability is added. [Image form](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageForm.tsx), [Configuration typing](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageUploadSWR.d.ts).

1. App's PageLayout owns fresh Clerk `getToken()` acquisition, the configured `/upload` endpoint, multipart file/current-site fields, authorization headers, response parsing, and synchronous Effect Schema decoding. Storybook's ModulePlayground owns anonymous `/image/upload` with no site or authorization fields. Both use ordinary async functions, independently of Zerospin, and forward the form's AbortSignal to `fetch`; App also checks cancellation after token acquisition. Save stages App's existing `updateBrick` command; returned asset URLs remain publicly readable. No shared HTTP adapter was added because these protocols belong to the two actual hosts. [App host](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx), [Storybook host](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModulePlayground.tsx).
2. SWR owns form-local request pending/error state, with revalidation and cache population disabled. Image retains file validation, local validation/save errors, picker/drop behavior, unsaved drafts, Save gating, cancellation, and suppression of late results. Success updates only the draft URL; Save persists Image state. Cancel resets mutation state and separately aborts unfinished transport. Leaving the form also aborts it. Completed uploads retain their existing storage lifetime. Without an uploader, the form supports manual URL entry and Save. [Form lifecycle](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/image/ImageForm.tsx).
3. Server authentication, routes, request/response formats, R2 keys, asset serving, and the ordinary module form contract remain unchanged. Site Settings now acquires its upload token directly through Clerk while retaining its Promise uploader, session reads/commands, toasts and unrelated QR-code SWR read. No dependency, model/contract version, migration, or reset was introduced. [Site Settings](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx), [API routing and authentication](/Users/morgs32/GitHub/qrk.sh/apps/api/Worker.ts:41), [Upload storage](/Users/morgs32/GitHub/qrk.sh/apps/api/handleUpload.ts).
4. Plan 027 implemented the image-protocol candidate from the scan without expanding the earlier publication relocation. Its compilation and manual verification passed; the separate Image evidence below records those historical outcomes and an initial development-session interruption. Plan 041 added no tests, builds, browser uploads or failure injection at the user's request; those earlier results do not verify the new wiring.

## Other scan decisions: unchanged

1. **Keep `/rpc` and Mapbox configuration as they are.** Module resolution and spec generation still open the host's `/rpc`, while MapCanvas reads `PUBLIC_MAPBOX_TOKEN`. Endpoint injection or another token configuration layer was considered; current callers already configure host origins/tokens, and no differing requirement justified changing these seams. Provider workflows and map rendering remain module-owned. [Spec generation](/Users/morgs32/GitHub/qrk.sh/apps/library/session/startBrickSpecGeneration.ts:56), [Place lookup](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/mapPlace/GooglePlaceLookup.tsx:52), [Map resolution](/Users/morgs32/GitHub/qrk.sh/apps/library/modules/mapPlace/startMapPlaceResolution.ts:46), [Map configuration](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/mapPlace/MapCanvas.tsx:8).
2. **Keep shared preview chrome.** WallBreakpointPane retains its decorative device/browser frame and `qrk.sh` label. Both Studio and Library's app use that frame; no additional whole-file move or host configuration was justified by current callers. [Browser chrome](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/WallBreakpointPane.tsx:94), [Studio preview](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/PagePreview.tsx), [Library preview](/Users/morgs32/GitHub/qrk.sh/apps/library/app/LibraryLayout.tsx).
3. **Keep shared drawer sizing.** Both actual Drawer callers use `side="bottom"` and controlled `open`, giving them the same `50dvh` overlay on desktop/mobile. Both hosts reserve matching trailing padding and preserve their bottom scroll anchor. The older 4rem-offset classes are overridden for these callers; Studio's route/ViewTransition behavior and Library's local open state differ in lifecycle, not geometry. Host-supplied geometry would add coordination without addressing a current variation, so the sizing, focus/inert handling, and animation remain unchanged. [Controlled height](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/Drawer.tsx:140), [Studio drawer caller](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/layout.tsx), [Studio padding](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/MainColumns.tsx:27), [Library drawer and padding](/Users/morgs32/GitHub/qrk.sh/apps/library/app/LibraryLayout.tsx).

## Shared behavior retained in Library

1. ModuleFilmstrip, previews, measurements, drag payloads, BrickWall, and module forms serve both applications. Studio already supplies its own route links and brick-activation callback; those application routes do not live in shared Library UI. [Catalog seam](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/lib/ModuleFilmstrip.tsx:8), [Studio links](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/Modules/Modules.tsx:42), [Library links](/Users/morgs32/GitHub/qrk.sh/apps/library/app/modules/page.tsx:24), [Studio wall integration](/Users/morgs32/GitHub/qrk.sh/apps/app/app/[username]/site/[siteId]/page/[pageId]/PagePreview.tsx).
2. `startLibrarySessionWork` composes module-owned local work for both standalone Library and authenticated Studio sessions. Each host already starts/stops it with its own initialized session lifetime. Moving these reusable workflows into Studio would make Library's real standalone caller depend on the application. [Composition](/Users/morgs32/GitHub/qrk.sh/apps/library/session/startLibrarySessionWork.ts:12), [Studio lifetime](/Users/morgs32/GitHub/qrk.sh/apps/app/components/ZerospinUser.tsx:78), [Library lifetime](/Users/morgs32/GitHub/qrk.sh/apps/library/app/LibraryLayout.tsx).
3. Library's standalone fixture/session context and demo-only `useUpdateBrick` belong to its own app harness, not Studio. Their existence is not evidence for relocating module state, validation, rendering, or editing contracts. [Standalone setup](/Users/morgs32/GitHub/qrk.sh/apps/library/session/createLibraryStandaloneSession.ts), [Demo edit integration](/Users/morgs32/GitHub/qrk.sh/apps/library/lib/useUpdateBrick.tsx).

## Publication relocation verification

1. Source/documentation reconciliation was completed for the approved publication relocation and its initial scan. At that point, no additional scan candidate had been implemented; the later Image change is recorded separately above.
2. `pnpm nx run @qrk.sh/app:build` passed the current Turbopack production compilation, TypeScript, and route generation, exit 0 in 11.3 seconds. Log: `/tmp/qrk-publishing-ownership-build.log`. No Library package build was invoked.
3. The running backend reloaded the relocated source and reported `Ready on http://127.0.0.1:8788/ (system spec accepted)` against retained storage. No model/contract version, migration, or storage reset was required. Runtime evidence: `/tmp/qrk-turbopack-zdVI6f/turbopack-warm-dev.log`.
4. Manual review in the existing Chrome session confirmed that an unchanged published page exposed no publish action, an unsaved description draft exposed only Save/Cancel, Save exposed Publish Updates, and publishing hid that action again. Screenshot: `/tmp/qrk-publishing-ownership-ready.jpg`.
5. Canonical publication finalized successfully with a ninth snapshot containing the saved description `QRK-owned snapshot verification` and the same `{ slug, title, description, wall: { bricks } }` structure. The root pointer advanced. Every previous eight snapshot records retained identical raw/structural content hashes, structure, and framework timestamps; other page pointers and publication flags were unchanged.
6. Source review confirmed unchanged field codecs, nested shape, nullable placement references, filtering, and ordinal sorting. Searches found no source imports or package exports referencing the removed helpers. Scoped source formatting and `git diff --check` passed. No new test suite, backend integration test, standalone check gate, or compatibility shim was added. Archived Plan 025 remains unchanged.

## Image upload verification

1. `pnpm nx run @qrk.sh/app:build` passed Turbopack production compilation, TypeScript, and route generation, exit 0 in 15.0 seconds. Log: `/tmp/qrk-plan027-studio-build.log`. The running Library development server compiled and served its Image form normally.
2. Real SVG uploads in both applications confirmed host request ownership: Studio's `POST /upload` included Authorization and the exact current `siteId`; Library's `POST /image/upload` included neither Authorization nor a site field. Existing Chrome login, browser storage, and retained assets were preserved.
3. Paused requests showed disabled fields/Save with Cancel enabled. Success changed only the draft URL; Save rendered the uploaded asset, and reload retained the saved URL and loaded image in both applications. Screenshots: `/tmp/qrk-plan027-studio-saved.jpg` and `/tmp/qrk-plan027-library-saved.jpg`.
4. Invalid text files were rejected without a request. Simulated HTTP 500 JSON responses displayed `Plan 027 upload failure` and retained the saved URL; later valid uploads succeeded in both applications.
5. Cancelling paused uploads produced `net::ERR_ABORTED` and restored the saved URL in both applications. Cancelling after a completed retry restored the earlier URL while the uploaded asset remained retrievable. In Studio, switching breakpoints during a pending upload retained the operation; navigating to a second temporary brick aborted the pending fetch and showed its unchanged default URL.
6. All three temporary verification bricks, two in Studio and one in Library, were removed through normal drag-outside UI actions. Both review grids returned to empty, retained R2 objects were preserved, and request interception was cleared using `Fetch.enable` with empty patterns.
7. The initial Studio upload during HMR failed with an undefined-is-not-iterable error before sending a request. A fresh reload resolved it without a source change; subsequent repeated upload, rejection, and cancellation flows succeeded. This records the observed recovery rather than attributing an unverified root cause.
8. Independent source review found no actionable issue. No test suite, standalone check gate, storage reset, API change, or additional scan follow-up was introduced. The completed publication-relocation evidence above remains separate and unchanged.
