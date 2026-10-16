# Brick forms for Studio and Library

## Summary

Expose a working form for all 10 registered bricks in both apps.

Image and Article already have forms. Five provider forms need integration into Studio; Link, Map Place, and Swatch and Icon need complete forms. Use a shared foundation phase followed by eight brick phases.

Decisions settled:

- Provider forms edit sources, not fetched metadata.
- One Save validates, fetches, and submits the complete state.
- Each module owns its form and provider behavior.
- Swatch color becomes shared brick data across breakpoints.
- Use a clean local database reset for the Swatch schema change.

## Phase 0 — Form ownership and integration

Change the existing `makeModuleView.form` and `IModule.Form` contract:

```tsx
// The module owns editing; the host owns persistence.
form?: (props: {
  state: /* decoded module state */ | null;
  onSave: (state: /* decoded module state */) => Promise<void>;
  onCancel: () => void;
}) => ReactNode;
```

- Forms own drafts, validation, provider requests, pending state, errors, and one Save/Cancel pair. Reuse existing controls and inline prop shapes; introduce no new wrapper, named type, or dependency.
- Both detail pages render the module’s form without an enclosing `<form>`. Hosts retain session access, command admission, and accepted-state handling. Image owns upload requests; editor composition provides its Effect environment.
- Adapt Image and Article’s existing form plumbing to this contract, preserving their controls, upload behavior, rich-text behavior, and session-echo handling.
- Pass genuine `null` placeholder state through to provider forms. Unconfigured bricks must show blank source inputs rather than example URLs.
- Cancel discards drafts and errors. Cancelling or navigating away invalidates the editor’s pending submission before it can stage a command.
- Add Studio’s `/rpc` rewrite to its configured API origin, matching Library’s existing transport route.
- Keep each standalone provider branch until its corresponding brick phase registers the replacement form. Remove that branch in the same phase.
- Preserve Library admin’s validated JSON editing path; it must not fetch provider data when saving JSON.

## Brick phases

Each phase finishes with a working form in **both apps**, including successful save/reload, cancellation, and visible failure handling.

### Phase 1 — GitHub Profile

- Register the existing `GitHubProfileForm` through its module view.
- Preserve username/profile-URL normalization and `getGitHubProfile`.
- Decode the returned profile before submitting `{ payload: { url }, data }`.
- Keep fetched profile fields read-only; remove the standalone route branch.

### Phase 2 — GitHub Repository

- Register the existing `GitHubRepoForm`.
- Preserve its repository URL validation, canonicalization, and `.git` handling.
- Fetch through `getGitHubRepo`, decode the complete snapshot, then save.
- Remove the standalone route branch.

### Phase 3 — GitHub Activity

- Register the existing `GitHubActivityForm`.
- Preserve username/profile-URL input.
- Continue using `getGitHubProfile`, which already returns contributions; validate the activity-specific contribution data.
- Missing or invalid contribution data must leave the previous brick intact. Remove the standalone route branch.

### Phase 4 — Figma Thumbnail

- Register the existing `FigmaThumbnailForm`.
- Preserve its supported Figma URL formats and normalization.
- Fetch through `figmaBackend().getThumbnail`; retain the current nullable-thumbnail schema.
- Keep failed/private/unavailable document errors visible without saving partial state. Remove the standalone route branch.

### Phase 5 — Instagram

- Register the existing `InstagramForm`.
- Preserve username/profile-URL normalization and `getInstagramProfile`.
- Validate the returned profile and supported post-image snapshot before saving.
- Remove the standalone route branch.

### Phase 6 — Link

- Add module-owned `LinkForm` with a URL input.
- Use `linkBackend().getPreview`; save the returned canonical URL in the payload and the decoded preview as data.
- Do not expose manual title, description, image, or icon overrides.
- Failed lookups retain the input and existing brick. Preserve concurrent Link rendering and styling edits.

### Phase 7 — Map Place

- Add module-owned `MapPlaceForm` using the existing `GooglePlaceLookup`.
- A selected suggestion supplies only a place ID. On Save, fetch complete details through `googlePlacesBackend().getPlace`.
- Save the selected ID plus validated name, address, latitude, and longitude.
- Cover keyboard selection, replacing a selection, empty results, and provider failures. Do not expose manual coordinates.

### Phase 8 — Swatch and Icon

- Add module-owned `SwatchAndIconForm`, reusing the existing color picker and `MaterialSymbolsIconLookup`.
- Add required `payload.color` to the module’s state schema and default state. Keep `payload.hash` and `data.name/svg`.
- Validate a complete hex color before Save.
- Search bundled Sharp Line icons through `searchIcons` and fetch SVG through `getIconSvg` only when the selected hash changes. Color-only saves preserve the embedded SVG and current identifier, including historical Streamline icons and the default Asterisk with an empty hash.
- Bind the default spec to `/payload/color`; authored rendering reads the same saved field.
- Enforce that color in the module’s `SwatchAndIconColor` registry entry, so generated literal colors cannot override the shared value. Preserve layout structure and other properties.

```ts
// A color-only edit preserves the selected icon and its fetched SVG.
{
  ...savedState,
  payload: { ...savedState.payload, color: "#4A7C59" },
}
```

This phase needs no generic spec-save extension or change to the `updateBrick` payload: color and icon save together as one state document.

### Accepted local icon catalog amendment

1. API bundles Google's standard 24px Sharp Line SVGs from pinned revision
   `49d4db35df873165d6bd6ba09b063c7dafbac2f4`, including its Apache 2.0 license
   and imported count. A dependency-free downloader validates every SVG and
   replaces the generated catalog only after a complete import.
2. Module-owned `searchIcons` and `getIconSvg` expose direct Library RPC methods.
   Search matches all name words, ranks exact/prefix/alphabetical matches, and
   preserves offset pagination and data-URL previews. No provider calls, key,
   new storage, or HTTP routes are required.
3. New selections save Google slugs in the existing `payload.hash`; saved
   `data.name/svg`, historical Streamline identifiers, and color-only behavior
   require no migration. The stateless Streamline Durable Object is retired by
   an append-only `v2` deletion migration; no deployment or state reset is part
   of this amendment.

```ts
// 1. Search and preview come from API's bundled snapshot.
await api.searchIcons("account balance", 0, 48);

// 2. Only a changed selection resolves SVG before the existing state Save.
await api.getIconSvg("account_balance");
```

Implementation verification: all 4,154 pinned SVGs imported and validated;
the dependency-free renderer is deterministic and matches formatting. API
binding generation, API and Library typechecking/lint/builds, and all 13
API-only Workerd icon checks pass. A live `/rpc` HTTP batch returns `home`
first (27 matching icons) and its 224-byte SVG after restarting API against
the existing local state. Runtime icon operations make no provider requests.
No Library tests were changed or run, and no deployment or storage reset was
performed.

Manual verification completed after one user-assisted catalog drop, using
Library brick `brk_6284e4bf6a6a40cf9e8dca49d345f2e5` on
`qrk-forms.localhost:4100`. Search `ar` returned 687 matches: the first 48 and
next 48 were distinct and all 96 SVG data-URL previews loaded. Normalized
` HOME ` search selected Home; Save/reload retained its SVG and color.
Cancel discarded a Home Max/color draft, and a no-results search preserved
the saved selection. A controlled compatibility fixture changed only the
stored identifier to `ico_Legacy123` through Admin while preserving the
embedded Home SVG. A normal color-only Save/reload retained that unavailable
identifier and the exact SVG bytes, proving it did not resolve the icon again.
The fixture was then restored to `home` and its original `#4A7C59` color
through a normal combined Save/reload. Screenshot:
`/tmp/qrk-material-symbols-picker.jpg`.

**Material Symbols amendment remaining work: None.**

## Verification and local cutover

- After each brick phase, manually verify both app surfaces. Repository tests and standalone automated checks are deferred under root `AGENTS.md`.
- Check invalid input, provider failure/retry, duplicate submission prevention, Cancel, navigation during a request, and persistence after reload.
- Preserve brick identity, grid placement, and layout specs during ordinary form saves.
- Regression-check Image uploads and Article editing after their plumbing change.
- For Swatch, verify color-only, icon-only, and combined edits across every breakpoint, including a generated spec containing a literal color.
- Defer automated backend verification until the future end-to-end compatibility suite is agreed. Do not scaffold integration tests.
- For the approved clean cutover, stop local Zerospin, move its database directory into the documented backup directory, and restart with fresh storage. Reset affected local browser session data, using Library’s existing Reset control and preserving Clerk cookies.
- Require `system spec accepted` before final browser verification. Reset local development data only; add no compatibility decoder, production migration, or deployment.
- Update affected documentation as phases land. Preserve unrelated WIP, including the earlier dashboard heading removal.

Implementation approved in chat. Prior token-helper work remains part of the authenticated environment.

## Accepted upload amendment

1. Image owns `ImageUploadEnvironment`, `ImageUploadRuntimeContext`, and its named upload Effect. The environment contains upload URL, optional site grouping, and a fresh authorization Effect.
2. Studio editor composition supplies Clerk authorization using `getClerkToken`; offline errors preserve `clerk-offline-error`. Standalone Library deliberately supplies its anonymous endpoint. Missing Studio tokens fail without falling back to anonymous upload.
3. The Image-owned runner provides the editor Layer at the existing session `runPromise` boundary; add no managed runtime or generic module service framework.

```ts
// 1. The module consumes a dependency; it owns the multipart operation.
const environment = yield* ImageUploadEnvironment;
const authorization = yield* environment.authorization;

// 2. The host binds its environment before the session executes the program.
session.runPromise(program.pipe(Effect.provide(imageLayer)), { signal });
```

## Implementation status

1. Phases 0-8 implemented. All ten views register module-owned forms.
2. Image upload environment supplied by editor composition; Clerk offline mapping preserved.
3. Library and Studio typechecking/lint and Library package build pass, including the final cancellation fixes. Backend typechecking/lint and workerd pass: 2 files, 12 checks. Studio formatting and all 37 changed Library source/config files pass formatting; the whole-Library formatting target still reports the unrelated existing `lib/ModulePreview.tsx` formatting failure, which remains untouched.
4. Development backend backed up at `apps/zerospin/.wrangler/zerospin/backups/sys_qrk_sh_1-20261014T015027Z-pre-brick-forms`; fresh backend reports `system spec accepted` on port 8788.
5. Existing Library origins reject stale browser storage before Reset renders. Manual verification uses a fresh local origin while preserving the existing origin backups and Clerk cookies.
6. Manual verification found and fixed Map lookup results covering/moving Cancel. Results occupy layout space, outside dismissal follows completed clicks, and Escape dismisses the lookup without closing Library's drawer.
7. Studio invalidates a form at same-origin route-click/history intent and guards command admission, before Next finishes navigation. A visibly pending Activity lookup was discarded; reconnect/reload retained the previous profile and calendar.
8. The local backend later exited with Wrangler's proxy network error. It was restarted against the same new database and again reported `system spec accepted`; final Studio reconnect checks passed. Studio was also restarted after package-build/HMR churn. No further database reset occurred.
9. The user supplied a Google Places key, which was configured only in ignored `apps/api/.env.local`. API restarted ready on port 8787; Library and web were restored as separate dev targets after the earlier shared dev job stopped. Real Map verification now passes in both hosts. No credential values were recorded in this plan.
10. The user supplied `https://www.instagram.com/nathanfielder/`. Both normal forms attempted that exact profile against the restarted API and received its existing “Instagram profile is not publicly available” error. Reloads retained the previous null state in both hosts; no partial snapshot was admitted. That generic error does not establish the account's privacy.
11. The user authorized bounded Instagram diagnosis. One normal Library Save with temporary server diagnostics recorded HTTP `200`, final pathname `/accounts/login/`, and `navigationOk: true`. The remote browser reached Instagram's login page; `scrapeInstagram` rejects that pathname before metadata parsing and emits the generic `profile-unavailable` message. No private/unpublished metadata branch was reached. Temporary diagnostics were removed afterward; the scraper's behavior remains unchanged.
12. The user approved permanent Apify metadata integration after the isolated Nathan trial completed lookup and local R2 downloads in 5.397 seconds. The normal `getInstagramProfile` path now uses the server-side `APIFY_API_TOKEN`, configured with authorization in the existing ignored `apps/api/.env.local`, one maintained Profile Scraper request with the About add-on disabled, and a 20-second actor/HTTP response-body deadline. API was restarted afterward. The decoder validates identity, explicit privacy, follower count, avatar, and up to four ordered thumbnails before the unchanged sequential R2 importer and completed-response retention. Historical BrowserHost bindings and registrations remain intact but are bypassed. Nx API binding generation, typechecking, lint, and bundling pass; targeted Workerd checks pass 66 tests in two files. Library's permanent-path Save/reload passes after one manual retry; authenticated Studio Save/reload and all five R2 images also pass after the concurrent Library React adapter restored browser-compatible output. Read-only authoritative backend state and the successfully finalized Studio update command confirm complete persistence. Instagram's required local integration verification is complete. See [integration and historical trial](../research/instagram-profile-scraping.md).

## Manual verification evidence

Checked in the existing authenticated Chrome profile. Standalone Library used separate fresh local origins; Studio used its configured `http://localhost:3000` web origin and a local verification site.

| Module | Library | Authenticated Studio |
| --- | --- | --- |
| Image | Empty-file rejection; anonymous upload; Save/reload; pending Cancel retains saved URL/title. | Authenticated upload; Save/reload; empty-file rejection; pending Cancel and navigation retain saved URL/title. |
| Article | Title/subtitle and rich-text Save/reload; Cancel restores saved content; existing image upload control stays disabled. | Same module editor saves/reloads title/subtitle/body; Cancel discards title draft. |
| GitHub Profile | Null starts blank; live octocat save; pending navigation leaves previous state. | Live octocat save/reload; pending Cancel discards lookup. |
| GitHub Repo | Normalization, live metadata Save/reload, missing-repo failure, retry, pending Cancel. | Same successful canonical Save/reload; failure/retry; pending Cancel retains prior repo. |
| GitHub Activity | Live calendar Save/reload; invalid source/failure retain prior calendar; Cancel. | Live calendar Save/reload; validation/failure; pending navigation discards replacement before command admission and retains prior calendar after reconnect. |
| Figma Thumbnail | Blank/invalid input; unavailable-file failure and Cancel; official Embed Kit example Save/reload. | Blank/invalid input; official example Save/reload; 404 retains prior thumbnail; Cancel clears draft/error; pending navigation preserves saved state. |
| Instagram | Historical BrowserHost failure/Cancel checks retained. Permanent Apify: first request timed out at 20.113s; one manual retry succeeded in 17.327s. Nathan's avatar, four thumbnails, and `1M` follower text persisted after reload; all five R2 images serve successfully. | Permanent Apify Save/reload passes after one human-assisted catalog drop. One Save, no retry; API pipeline 6.394s, browser transport not separately timed. Canonical profile URL, `1M`, and four loaded thumbnails survive reload; all five R2 images serve successfully. Authoritative backend state and successful update command match exactly. |
| Link | Blank/invalid URL; real canonical preview Save/reload; failure keeps prior preview; pending-success Cancel preserves prior preview through response/reload. | Canonical example.com preview Save/reload, confirmed after backend restart; pending-success Cancel preserves prior preview through response/reload. |
| Map Place | Keyboard selection, replacement, complete Austin Save/reload, real empty results, Cancel. Admin confirms saved ID/name/address/latitude/longitude; brick ID/placement preserved. Earlier failure/Escape/navigation cases pass. | Keyboard selection, replacement, complete Seattle Save/reload, real empty results, Cancel; brick ID/placement preserved. Earlier visible failure/direct Cancel pass. |
| Swatch and Icon | Historical Streamline and breakpoint coverage retained. Bundled Material Symbols: previews, paging, normalized selection, icon-only and combined Save/reload, Cancel/no-results, and legacy-identifier color-only SVG preservation pass. | Historical color-only and real icon Save/reload; all four breakpoints share saved color. |

1. Pending forms disable Save and editable fields while retaining Cancel; synchronous submission refs prevent a second asynchronous submission. Exact provider request counts and malformed contribution injection were not measured through the live UI. Complete-snapshot decoding and guard placement were reviewed in source; no Library tests or mock provider responses were added.
2. Existing Map Place identity has `hasPlaceholder: false`, so catalog drops retain its configured default place. The form still accepts `null`; current UI cannot create a null Map placeholder.
3. Library Admin's editable state JSON remains separate from provider forms. Its placement Spec tree is read-only, so literal-color Spec verification cannot bypass generation through that UI.
4. Link's pending-success Cancel was verified in both hosts with temporary tab-scoped network latency. Forms visibly remained busy; Cancel restored prior state, the real RPC subsequently completed successfully, and prior URLs/previews survived reload. Networking was restored immediately; no mock responses or Library tests were used.
5. Permanent Apify verification used Library brick `brk_6a1b74ce6ec64780b4a1f824a1e556d7` at `http://qrk-forms.localhost:4100`. The initial RPC took 20.112579 seconds; Apify run `AKgvBZpBIje9TR39p` timed out with zero results and upstream blocking/session retries, so no privacy conclusion follows. QRK did not retry automatically. One manual Save retry completed in 17.326781 seconds and saved Nathan's avatar, four available thumbnails, and `1M` followers. Apify independently confirmed retry run `oDrRN7uJrGZuds46e` as `SUCCEEDED`, one dataset result, build `0.0.640`, and 14 seconds of actor execution; that duration differs from the complete RPC timing. Reload and Admin confirmed the complete state; all five R2 URLs under fetch prefix `29a8e4fd-02c8-4c3f-a68b-bb2ef7ad8424` served HTTP 200, `image/jpeg`, and nonempty bytes totaling 454,015 bytes. This proves one successful Library request within 30 seconds, not a latency guarantee or an exact provider charge; the console's $0.00 is rounded. Screenshot: `/tmp/qrk-apify-library-reload.jpg`.
6. Studio's initial existing site/page route failed before the Instagram editor or an Apify call because concurrent Library output emitted CommonJS `require("react")` in `modulesHash-CcaY_H1X.js`. The current `esmExternalRequirePlugin` React adapter resolves that browser import. After a normal Nx backend restart preserving the existing database and reporting `system spec accepted`, Studio's full catalog and My Travels grid loaded normally. Library's development frontend was restored separately without duplicating API. No source changes or Library tests were made during this resumed verification. Historical screenshot: `/tmp/qrk-apify-studio-blocker.jpg`.
7. After one human-assisted catalog drop, Studio created normal Instagram brick `brk_4685a95c1bc2403985470198e13424d5` in existing site `sit_Xcx_JLz45jrTnofykI_ae`, page `pag_2S6nbHXH-pHjV9CVxXg2W`. One normal Save succeeded without retry. Workerd logged `POST /rpc` HTTP 200 in 6,394 ms for the API provider/R2/retention pipeline; the browser's SharedWorker network path supplied no separate timing record, so no exact full browser Save latency is claimed. Reload retained Nathan's canonical URL, `1M` followers, and four loaded thumbnails with natural dimensions 720×540, 1080×1350, 320×561, and 1080×810. All five R2 assets under prefix `054de3d9-613a-4131-a608-4a674eaa706e` served HTTP 200, `image/jpeg`, and nonempty bytes totaling 454,015 bytes. A read-only authoritative `AggregateVersionRepo` query matched the exact brick/site/page row and confirmed its complete state exactly equals successful `updateBrick` command `cmd_h3UY01FHfXYfs_6HmvarS`, aggregate index 58, finalized as `ZerospinSuccess` without failure. Database access used `mode=ro` and `query_only`, with no writes or resets. Screenshot: `/tmp/qrk-apify-studio-reload.jpg`.

```tsx
// 1. Save submits only the complete validated state; the host owns admission.
await onSave(nextState);

// 2. Studio blocks admission as soon as navigation starts, even while Next waits.
if (navigationPending.current) {
  throw new DOMException("Brick editor navigation started", "AbortError");
}

// 3. Cancel aborts the module's active work and restores the committed form.
activeSubmission.current?.abort();
onCancel();
```

## Remaining work

1. Swatch generated literal-color enforcement through live UI: the last Admin Generate attempt returned `generate-failed` because the provider had no credits. Restore generation access, then generate a Spec with a literal color and confirm the saved shared color wins at all breakpoints. Registry enforcement is implemented and source-reviewed; the live check remains pending.

Archive only after required verification. Keep this plan active while these prerequisites/checks remain unresolved.
