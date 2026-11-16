# Local published Pages

## Problem

QRK records immutable Page snapshots and publication state, but Web has no route that retrieves a published Page. Its `WallViewer` is only used by Storybook, and its fixture renderer does not render every registered Brick. A visitor must be able to open the actual published Site locally without seeing saved drafts or historical snapshots.

[Plan 091](../archive/plans/091-plan-domain-assignment-and-command-continuations.md) supersedes this plan's hostname, username and canonical-reader choices: Web addresses registered User V4. Cross-release replay can lag without a query barrier; same-release committed unpublication and the final pointer recheck remain required.

## Agreed behavior

1. A Site keeps the slug chosen at creation, unique within its owner's Sites. A local published Site uses `https://<site-slug>-<username>.qrk.localhost/`; nested Page paths follow the hostname. Usernames contain only ASCII letters and numbers, so the last hyphen separates the username from the Site slug. Normalize and validate the hostname, its DNS label length, and the verified Clerk username. Resolve the username through Clerk and the Site slug within that user's aggregate; do not add a Domains service or a separate hostname registry.
2. Only a published Site and a published Page's **current** immutable snapshot are public. Saved Page edits and historical snapshots remain private; saved Site settings take effect immediately. A request starting after canonical unpublication has committed must not serve the Site. Do not cache or statically render published HTML or metadata. A request that has already completed its authoritative read cannot be recalled.
3. Web server-renders the Page and its metadata. Use the existing administrative System API from a trusted Web server, as explicitly chosen; keep the System secret server-only. Return only the current snapshot and the Site fields needed for public presentation. Missing, malformed, or unpublished destinations are normal 404s; Clerk, transport, authorization, and broken-invariant failures reach an error boundary rather than being disguised as 404s.
4. Server-render all four independently arranged Walls. CSS shows the Wall for the viewport. Use the existing fixed widths as minimum thresholds: `sm` below 720 pixels, `md` from 720, `lg` from 1080, and `xl` from 1440; the special layout below 360 is described next. Each interactive Brick owns its activation: YouTube, Spotify, maps, and carousel behavior start only when their Wall is visible and stop when it becomes hidden. Since the server cannot know the viewport, omit external player iframe `src` values for **all four** instances in initial HTML; add them only after detecting the visible Wall. On a resize, the newly visible Wall activates; a stopped player may restart from its beginning. Preserve carousel reduced-motion and explicit pause/focus behavior. Static text and carousel images remain in the server HTML; without JavaScript, players and maps remain inert placeholders.
5. Below 360 pixels, reflow the smallest Wall into a single column: preserve saved Section, Stack, Row, and Placement order; stack side-by-side Stacks and wrap Rows; let each Brick use the available width. Keep chosen text sizes and allow text to wrap. When a Brick's minimum width exceeds its container, preserve that minimum and allow native horizontal scrolling in that Brick's container only. Do not scale the Wall, add custom scroll cues or keyboard handling, change the saved 360-pixel layout, or make the whole Page scroll horizontally.
6. The public header shows the Site name only, with no logo or automatic Page links. Honor the applicable saved Site settings, including Brick spacing and sticky-header behavior. Page paths are unique within a Site when created. Wire the existing disabled Unpublish button to its existing command. Render existing Pages; adding Page-creation UI is out of scope.
7. This work is local only. The user performs manual UI verification. Preserve unrelated work, Clerk accounts, uploads, existing data, all registered releases, and canonical selections. The user must personally handwrite any registry promotion after reviewing the evidence and exact change. Production, deployment, and production Clerk changes are out of scope.

## Examples

1. Creator `morgs32` creates Site slug `my-site`; its local address is `my-site-morgs32.qrk.localhost`. Another user can use `my-site` because their username identifies a different owner. An invalid or overlong combined hostname is rejected at a trusted boundary rather than accepted from a route parameter.
2. A published `/about` Page points to snapshot A. Saving an edit does not expose it. Publishing updates changes the pointer to snapshot B, and a subsequent public read returns B. After a canonical unpublish commit, a new request returns 404.
3. A 320-pixel viewport presents the saved small Wall as an ordered single column without reducing the text font size. If one Brick requires 360 pixels, only that Brick's container scrolls horizontally.

```ts
// Pseudocode for SDK calls, not proposed new wrapper functions.
// Both reads must use the actual canonical User release.
const page = await readPublishedPagePointer({ userId, siteSlug, path });
// Recheck Site/Page publication and that the Page still points to this ID.
const snapshot = await readCurrentPublishedSnapshot({
  userId,
  siteSlug,
  pageId: page.id,
  snapshotId: page.publishedSnapshotId,
});
// If a publish or unpublish changed the pointer between reads, do not serve it.
```

## Implementation

1. Recheck the current registry and available version numbers. Use the existing declaration upgrade path to enforce canonical non-index Page-path validation and per-Site uniqueness at creation; keep the single `null` index convention and prevent empty/ambiguous paths without inventing unrelated character restrictions. Preserve nested paths, case, and Unicode through URL encoding. Evolve the affected command, owner/actor, and App session bindings as required. Add a candidate without altering existing registrations or canonical selections. Preserve retained V1 history; test adapters and replay rather than resetting storage. Present candidate evidence and the exact promotion edit for the user to handwrite.
2. Verify how the local Clerk instance can enforce the agreed alphanumeric username rule. Do not assume its prebuilt SignUp supports an arbitrary rule. Validate the actual authenticated Clerk username and combined hostname length at the authoritative Site-creation boundary, not the App's URL parameter: current claims contain only Clerk ID and the User model starts with `username: null`. Trace a verified username through the existing authentication boundary. If this requires moving a validation or trust boundary, present the exact change and ask for direction before implementing it. Do not create an account or modify production Clerk. Usernames from the wiped QRK database need no migration; Clerk accounts are separate and must be preserved. If the agreed rule cannot be enforced safely with the available local Clerk configuration or requires consumer-side API machinery, report the concrete mismatch before inventing an identity system.
3. Add a bounded local hostname-aware Web route/rewrite using the existing Portless wildcard configuration; preserve base-host authentication, `__dev`, assets, Next internals, and exact infrastructure hosts. Guard the internal route so it cannot serve public content through a forged base-host path. Use Clerk's username-filtered lookup, verify the returned username under the chosen hostname normalization, and reject no match or ambiguous matches. No browser receives a Clerk secret or System secret.
4. Add a server-only Web read using the installed System API and the actual canonical User release. The remote query API rejects `RAW`, placeholders, and column-to-column comparisons, and `publishedSnapshotId` is not a relation. First select the matching published Site/Page and its pointer; then select that exact snapshot while rechecking the same Site and Page, both publication flags, requested path, and current pointer in the final canonical read. Explicitly project public Site settings and snapshot content. If the pointer changes between reads, retry in a bounded way or return unavailable; never return the stale candidate. Prototype the supported typed query and its relation/projection behavior early. If the API cannot express the required recheck, stop and report the SDK/API gap rather than weaken visibility or add consumer-side machinery. Add only the exact package dependencies actually imported through the package manager, retain fixed-group pins, and document the local server-only configuration without exposing secrets.
5. Implement the dynamic uncached public Page route and metadata. Use the existing Brick-owned render path for every registered module and its stored layout/Brick/Placement state; do not import the App's editor-only Link wrapper or duplicate module-specific rendering in Web. Make Article body content server-render at its existing module/Meowdown boundary; verify Text and other Brick content in actual Next HTML. If the renderer or editor API prevents this, report the mismatch rather than silently ship client-only content. Render the Site-name header with the applicable saved Site settings; no automatic Page navigation. Use the existing shared card-surface styling and font assets, and verify Web supplies the Map Brick's existing public Mapbox token through its module-owned integration without exposing private keys or adding module-specific logic to Web.
6. Extend the Wall rendering path to emit all four Walls with CSS viewport selection. Adapt the existing fixed-width Wall sizing for the sub-360 single-column behavior above, retaining Brick order and per-Brick native overflow. Each affected interactive module detects whether its own Wall is displayed and owns initialization and cleanup; do not add module-specific branches or new props to the shared Wall/editor contract. Keep player URLs out of server HTML until activation. Any proposed shared hook, context, or other abstraction requires user direction under repository rules.
7. Verify the existing Publish Site dialog uses the current snapshot model identity; it currently imports historical `PageSnapshotV5`, so correct the identity at its owning call site if required. Enable Site Settings' existing Unpublish action using its registered command. Stage once and use existing session delivery/failure handling. A successful optimistic stage or immediate live-query change is not canonical confirmation; do not invent a command waiter or claim confirmation from either. Test the public-read guarantee after the canonical command commits.
8. Reconcile the glossary with the implemented result; create an ADR only if the implemented decision is hard to reverse, surprising without context, and reflects a real trade-off. Keep the plan current and archive it after required agent checks pass. Do not update the glossary or create an ADR during planning.

## Verification

1. Use focused mocked Clerk/SystemApi tests for hostname parsing, username matching and invalid/ambiguous inputs, DNS length, missing/unpublished resources, credential isolation, public-field projection, backend failures, and pointer changes between reads. Test canonical publication/unpublication with the actual registered System using `makeSystemHarness` and provider substitutes. Separately exercise the real `executeAggregateQuery` encoding, relations and transport against the configured local Zerospin service using disposable authorized local data, including unpublish after canonical commit and a republish pointer race; confirm the query targets the actual canonical release. If the real local boundary cannot be exercised without unavailable credentials, report that limitation. Never call live providers in tests.
2. Test Page-path uniqueness and invalid/duplicate paths, ownership, V1 retained-history replay, candidate release publication progress, and the exact user-handwritten promotion evidence. Do not treat candidate registration or an optimistic stage as canonical success.
3. Test real Next server HTML for Text and Article body, all four Walls, metadata and module-owned rendering; verify no provider iframe `src` loads before activation. Exercise visible-only initialization/cleanup, resizing and player restart, carousel pause/reduced motion, and absence of duplicate hidden player/map work. Test sub-360 ordering, preserved font sizes and per-Brick native overflow. Preserve no-JavaScript static content.
4. Run relevant Bricks checks and Storybook build, the Zerospin backend test target, and App and Web builds. If local Portless wildcard mode is not active, use the existing configured setup; do not create extra aliases or use raw localhost ports. The user performs the manual local UI check, including actual media and responsive behavior. Report the local runtime evidence and any unverified provider/API limits separately.

## References

1. [ADR 001: Wall-owned layout tree](../adrs/001-wall-owned-layout-tree.md) and [ADR 002: Brick-owned commands and Placement state](../adrs/002-brick-owned-commands-and-placement-state.md) govern the layout and Brick ownership decisions this plan uses.
2. [Current WallViewer](../../apps/web/library/WallViewer.tsx), [current User actor](../../apps/zerospin/src/fresh/userActorV1.ts), and [current Page creation](../../apps/zerospin/src/fresh/contracts/CreatePageV1.ts) establish the existing rendering, authorization, and uniqueness boundaries.
3. [Zerospin System API reference](../../../zerospin/fragment/content/reference/sdk.md) documents the administrative query boundary; [Clerk's user-list documentation](https://clerk.com/docs/reference/backend/user/get-user-list) documents username-filtered lookup. Verify local instance behavior rather than assuming case normalization or custom validation support.

## Planned files

`+` creates; `~` modifies. Recheck exact versions and file locations before implementation.

```text
qrk.sh/
├── + wiki/plans/090-plan-local-published-pages.md
├── ~ wiki/glossary.md                         # after implementation
├── ~ apps/web/
│   ├── ~ proxy.ts and package.json            # local hostname routing and server dependencies
│   ├── ~ app/layout.tsx                      # base/public metadata and server rendering as needed
│   ├── + app/published/[host]/[[...path]]/page.tsx
│   ├── + library/                            # server-only published read and tests
│   ├── ~ library/WallViewer.tsx               # four Walls and narrow-screen reflow
│   └── ~ library/WallViewer.stories.tsx
├── ~ apps/bricks/src/modules/
│   ├── ~ article/react/ArticleBrickContent.tsx # server-render saved Article body
│   ├── ~ youtube/react/YoutubePlayer.tsx
│   ├── ~ spotify/react/SpotifyPlayer.tsx
│   ├── ~ mapPlace/react/MapCanvas.tsx
│   ├── ~ imageCarousel/react/ImageCarousel.tsx
│   └── ~ react/                              # only if existing render boundary needs it
├── ~ apps/app/
│   ├── ~ app/[username]/(dashboard)/page.tsx # hostname display and trusted validation flow
│   ├── ~ app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings.tsx
│   ├── ~ app/[username]/site/[siteId]/page/[pageId]/PageSettings/PageSettings.tsx
│   ├── ~ app/[username]/site/[siteId]/page/[pageId]/PublishSiteDialog.tsx # if identity correction is required
│   └── ~ zerospin/userSessionDefinition.ts
├── ~ apps/zerospin/src/system.ts             # add candidate; preserve canonical and entries
├── + apps/zerospin/src/fresh/                # next contract/actor/owner upgrade lineage
├── + apps/zerospin/test/                     # focused uniqueness and retained-history checks
└── ~ pnpm-lock.yaml
```

## Remaining work

The local Web reader, responsive Wall rendering, shared Brick view catalog, App links and Unpublish action are implemented. Bricks, App, and Web builds and focused tests have passed. Initial server markup contains all four Walls and the tested Text and Article content without loading provider iframes. Interactive visibility transitions and responsive layout remain for the user's manual verification.

User V2 and V3 are registered as candidates with V1 still canonical. V3 also rejects backslashes in Page paths, which V2 would accept even though the public reader cannot route them. The local retained history at the time of the check contained one `createUser` command; its V1 and V3 evaluations matched, V3 caught up through that command, and its outbox was empty. This is not evidence for retained Site or Page history. Plan 091 registers User V4 and addresses it directly for the public read; the user directed that promotion is not required. Verify publication and unpublication committed on V4 against V4 reads without changing the canonical selection.

Plan 091 supersedes the Clerk-username requirement with QRK-owned usernames. Continue to enforce the saved username and hostname rules at their authoritative command and service boundaries; do not treat the App's client-side check as authoritative.

The local System API accepted both published-reader query shapes over the configured transport, but the queried aggregate had no published data. Positive publication, unpublication, and pointer-race behavior over that boundary remain to be exercised. Mocked reader tests cover the two-read checks; the registered-System harness covers publication, unpublication, retained snapshots and republishing. The full backend target passed 17 files and 34 tests. Real browser activation and layout remain manual. The Web application's implicit root favicon path may conflict with a Page at that path; saved Site icon URLs are emitted directly in metadata, but their browser behavior has not been verified.
