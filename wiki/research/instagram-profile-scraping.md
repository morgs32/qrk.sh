# Instagram profile scraping

Researched 2026-10-13 against QRK source and official Meta, Apify, and Bright Data documentation. Provider capabilities and prices below are documentation claims, checked on that date. Initial research read public provider metadata/schema GETs without running a scraper. The isolated Nathan trial and subsequent permanent integration checks on 2026-10-14 are recorded below. API checks, both hosts' Save/reload and R2 image checks, and Studio's authoritative backend persistence confirmation pass.

## Recommendation

Use **Apify's maintained `apify/instagram-profile-scraper`** for QRK's public-profile snapshots. Its documented output already combines a profile image, follower count, and up to 12 recent posts. This fits QRK's avatar plus four post thumbnails in one lookup. The approved implementation replaces metadata acquisition inside `getInstagramProfile.ts`, preserving the existing download, R2 persistence, RPC, and form behavior. The live trial below demonstrated Nathan's lookup and existing image pipeline once in isolated local Miniflare; subsequent local integration checks passed in both hosts. [Apify Profile Scraper](https://apify.com/apify/instagram-profile-scraper), [Permanent metadata path](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:28).

## What QRK needs today

- Input is a username or Instagram profile URL. The current normalizer/form do not accept individual `/p/` or `/reel/` URLs. [Normalizer](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/normalizeInstagramUrl.ts:11), [Form input](/Users/morgs32/GitHub/qrk.sh/apps/library/modules/instagram/InstagramForm.tsx:34).
- Output is `username`, `profileImageUrl`, `followersText`, and zero to four ordered `postImageUrls`. Videos contribute an image thumbnail; a public profile with no posts can succeed. [Response schema](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/schemas.ts:10), [Selected provider thumbnails](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:141).
- The Worker immediately downloads each returned image, checks for a successful nonempty image, and writes immutable R2 objects. Each Save scrapes afresh; retention does not serve a cached profile response. These behaviors remain unchanged. [Download and persistence](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:164), [Retention](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:229).
- The historical remote browser used Cloudflare Puppeteer. Its recorded HTTP 200 redirect to `/accounts/login/` proved a login wall, not Nathan's privacy status. `BrowserHost` remains registered but normal Instagram lookups now bypass it. [BrowserHost](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/BrowserHost.ts:13), [Recorded diagnosis](/Users/morgs32/GitHub/qrk.sh/wiki/plans/021-plan-brick-forms.md:151), [Current RPC wiring](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/LibraryApi.ts:27).

## Provider comparison

| Option | Documented fit | QRK implication |
| --- | --- | --- |
| **Apify Profile Scraper**, maintained by Apify | Profile usernames, URLs, or IDs; profile picture URLs, follower counts, privacy flag, and latest 12 posts with details. | Best initial trial: the required snapshot is already one profile result. [Actor documentation](https://apify.com/apify/instagram-profile-scraper). |
| **Apify Instagram Scraper**, maintained by Apify | Public profiles, posts, reels, comments, mentions, hashtags, and places; separate content modes and result limits. | Useful if QRK later needs deeper post extraction; its wider controls add little to this four-thumbnail snapshot. [Actor documentation](https://apify.com/apify/instagram-scraper). |
| **Bright Data Instagram Scraper API** | A profile collector returns `profile_image_link`, `followers`, `account`, `is_private`, and `posts`; the schema describes `posts` as top posts. Separate post discovery by profile URL is available. | Strong alternative, but the profile record alone does not document the required latest ordered thumbnails. Verify ordering/shape or use separate post discovery. [Official profile schema](https://docs.brightdata.com/scrapers/gd_l1vikfch901nx3by4.json), [Instagram API overview](https://docs.brightdata.com/products/scrapers/instagram/introduction). |

### Apify request and field mapping

The actor's input schema has a required `usernames` array and optional `includeAboutSection`, defaulting to false. The About account add-on is unnecessary for this brick. Use the normalized username even though the README also advertises URLs/IDs. [Input schema](https://apify.com/apify/instagram-profile-scraper/input-schema).

Implemented request shape; the historical trial is recorded separately below:

```http
POST https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?timeout=20
Authorization: Bearer <server-side Apify API token>
Content-Type: application/json

{"usernames":["nasa"],"includeAboutSection":false}
```

Apify requires its own account/API token, and supports bearer-header authentication. No Instagram credentials appear in the Profile Scraper's published input schema. That is the documented customer-facing contract; it does not disclose how the provider operates internally. [Actor API](https://apify.com/apify/instagram-profile-scraper/api), [API authentication](https://docs.apify.com/api/v2/getting-started), [Input schema](https://apify.com/apify/instagram-profile-scraper/input-schema).

| Existing QRK field | Implemented provider mapping |
| --- | --- |
| `username` | Identity-matched result `username` |
| `profileImageUrl` | `profilePicUrlHD`, falling back to `profilePicUrl` |
| `followersText` | English compact presentation of `followersCount`, up to one decimal place |
| `postImageUrls` | First four `latestPosts[].displayUrl` thumbnails, preserving provider order |

These fields appear in Apify's documented output sample and were present in Nathan's historical trial. The implementation preserves provider order without promising chronological or pinned-post ordering. Missing selected image URLs fail validation rather than becoming arbitrary fallbacks; posts after the selected four are not validated. [Documented output sample](https://apify.com/apify/instagram-profile-scraper), [Current decoder and mapping](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:125).

### Costs and timing

- **Apify Profile Scraper:** Free plan $2.60 per 1,000 profiles ($0.0026 each); Starter $2.30; Scale $2.00; Business $1.60. Its pricing tab says platform costs are included. The Free plan provides $5 per month, no card required: about 1,923 profiles before other credit consumption. Subsequent dataset storage/reads can incur platform usage, so the profile price is not a promise of the whole account's final bill. [Actor pricing](https://apify.com/apify/instagram-profile-scraper/pricing), [Platform pricing](https://apify.com/pricing).
- **Apify Instagram Scraper:** Free-plan price is $2.70 per 1,000 results, billed per scraped item. One run has one content type. [Actor documentation](https://apify.com/apify/instagram-scraper).
- **Bright Data:** Current Instagram product page advertises 5,000 free credits monthly, no card required, and PAYG $1.50 per 1,000 successful records; infrastructure/retries are included. Credits are shared across eligible products. These are the current product-page rates, not a negotiated account quote. [Instagram pricing](https://brightdata.com/products/web-scraper/Instagram).

Apify's synchronous dataset endpoint can wait up to 300 seconds before HTTP 408; its documentation warns that a broken client connection leaves the caller without run-status information. This is an endpoint ceiling, not a profile latency guarantee or proof that it fits QRK's Save request. Set a bounded trial timeout and per-run spending cap. [Synchronous endpoint](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post).

**QRK's current local proxy budget is materially shorter.** Studio and Library forward `/rpc` through Next external rewrites. Their configs set no `experimental.proxyTimeout`; installed Next uses a 30,000ms default, and Capnweb buffers the response until `rpc.drain()`. A silent provider lookup plus R2 downloads lasting over 30 seconds therefore risks a local Next proxy error. This is a source-based inference, not a measured request failure or a guarantee about deployed runtimes. Measure the complete Save path first. If it exceeds this limit, decide on an explicit scoped proxy timeout or an asynchronous flow using the observed latency; do not add job machinery before that evidence. [Library rewrite](/Users/morgs32/GitHub/qrk.sh/apps/library/next.config.ts:26), [Studio rewrite](/Users/morgs32/GitHub/qrk.sh/apps/studio/next.config.ts:21), [Installed Next timeout](/Users/morgs32/GitHub/qrk.sh/apps/library/node_modules/next/dist/server/lib/router-utils/proxy-request.js:35), [Next configuration forwarding](/Users/morgs32/GitHub/qrk.sh/apps/library/node_modules/next/dist/server/lib/router-server.js:415), [Installed Capnweb buffering](/Users/morgs32/GitHub/qrk.sh/apps/library/node_modules/capnweb/dist/index.js:2550).

Bright Data's synchronous `/datasets/v3/scrape` returns JSON with `format=json` and uses a bearer API key. At 60 seconds it returns HTTP 202 with a `snapshot_id`; the work continues and requires monitoring/download. Instagram processing time has no fixed published guarantee, and profile-to-post discovery usually needs the asynchronous path. [Synchronous endpoint](https://docs.brightdata.com/api-reference/scrapers/synchronous-requests), [Instagram timing and discovery](https://docs.brightdata.com/products/scrapers/instagram/introduction).

## Privacy and media handling

Both products advertise public-data collection. Apify's sample exposes `private`; Bright Data's schema exposes `is_private`. Neither is evidence that Nathan is private or that private post content can be obtained. QRK's decoder requires explicit privacy status and distinguishes a private result from incomplete responses, identity mismatches, access failures, and provider timeouts. An empty public feed remains valid. [Apify public scope](https://apify.com/apify/instagram-profile-scraper), [Bright Data public scope](https://brightdata.com/products/web-scraper/Instagram), [Bright Data error records](https://docs.brightdata.com/products/scrapers/scrapers-library/faqs), [Current privacy validation](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:102).

The documented images are direct Instagram CDN URLs, not provider-hosted permanent assets. No fixed CDN URL lifetime was verified in the maintained providers' documentation. QRK treats them as transient download inputs and preserves its immediate R2 copy rather than using them as the brick's durable display URLs. This requires no new storage layer. [Apify URL sample](https://apify.com/apify/instagram-profile-scraper), [Bright Data URL sample](https://docs.brightdata.com/products/scrapers/instagram/introduction), [Existing R2 copy](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:164).

## Why Meta's supported API is a different product flow

Meta's official Instagram Postman workspace documents professional Business/Creator accounts. Facebook Login requires a professional account linked to a Facebook Page, can retrieve some metadata of other Businesses/Creators, and cannot access consumer accounts. Instagram Login supports professional accounts without requiring a linked Facebook Page. These APIs fit a connected professional-account flow; they are not a general arbitrary personal-profile URL lookup replacement. That conclusion is an inference from the documented account scope. [Official workspace](https://www.postman.com/meta/instagram/overview), [Facebook Login scope](https://www.postman.com/meta/instagram/folder/9cgqucg/instagram-api-with-facebook-login), [Instagram Login scope](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login).

Direct Meta developer-site requests were rate-limited during research. Detailed Business Discovery, oEmbed, or retired-API behavior was not independently established and is not a basis for this recommendation.

## Integration 2026-10-14

The approved permanent path makes one fresh authenticated Apify POST from the API Worker. `LibraryApi` supplies `APIFY_API_TOKEN`, configured with authorization in the existing ignored `apps/api/.env.local`; API was restarted afterward. No credential values were recorded, and no provider credentials enter browser configuration. The request disables the About account add-on, sets the actor timeout to 20 seconds, and applies one 20-second HTTP deadline through response-body reading. It does not retry automatically or fall back to `BrowserHost`. Image downloads and R2 writes keep their existing behavior and are outside that provider deadline. [RPC token wiring](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/LibraryApi.ts:27), [Provider request and deadline](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:28), [Local credential instructions](/Users/morgs32/GitHub/qrk.sh/apps/api/README.md:25).

Inline Effect Schemas require a matching username and explicit privacy status before profile-field decoding. Public results require a nonnegative integer follower count, usable avatar, and a present post array; an empty array succeeds. Authentication/billing/configuration failures use `provider-configuration-error`, transport/timeouts/rate limits use `scrape-transient-failure`, malformed data uses `unsupported-page-shape`, and a different username uses `profile-identity-mismatch`. Only an explicitly private profile becomes `profile-unavailable`. Raw provider errors and credentials are excluded from messages and logs. Existing sequential image validation, immutable R2 keys, and completed-response retention remain unchanged. [Decoder and failure mapping](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:19), [R2 pipeline and retention](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:164).

**API checks passed:** Nx `@qrk.sh/api:types`, `ts`, `lint`, and `build`; the targeted Workerd invocation passed **66 tests in two files**, `instagram.e2e.spec.ts` and `instagram-scraper.e2e.spec.ts`. These exercise mocked provider responses and local R2 behavior. No Library tests were written or run. [Integration checks](/Users/morgs32/GitHub/qrk.sh/apps/api/instagram.e2e.spec.ts), [Historical scraper checks](/Users/morgs32/GitHub/qrk.sh/apps/api/instagram-scraper.e2e.spec.ts).

**Live Library Save/reload passed after one manual retry:** the normal form at `http://qrk-forms.localhost:4100/bricks/brk_6a1b74ce6ec64780b4a1f824a1e556d7` submitted Nathan's profile through the Next proxy to the permanent API path. The first request timed out in **20.112579 seconds**. Apify's run used build `0.0.640`, timed out at its 20-second actor limit, and returned zero results; its log reported upstream blocking and session retries. This was a provider timeout, not a privacy result. QRK made no automatic retry. [Timed-out Apify run](https://console.apify.com/actors/runs/AKgvBZpBIje9TR39p).

One manual Save retry completed successfully in **17.326781 seconds**, including the profile lookup, sequential downloads, local R2 writes, and retention attempt. Nathan's avatar, **four available post thumbnails**, and `1M` follower text persisted after reload. Library Admin confirmed all five saved R2 URLs under `instagram/nathanfielder/29a8e4fd-02c8-4c3f-a68b-bb2ef7ad8424/`; each served HTTP 200 with `image/jpeg` and nonempty bytes. Avatar and ordered post sizes were 6,603, 83,623, 169,170, 33,315, and 161,304 bytes, totaling **454,015 bytes**. The successful complete RPC response was within the local 30-second budget. These two live outcomes show variable provider latency; neither the historical isolated 5.397-second trial nor this successful retry guarantees future latency or establishes an exact charge. [Library reload screenshot](/tmp/qrk-apify-library-reload.jpg).

Apify independently lists the retry as `SUCCEEDED`, with one dataset result, build `0.0.640`, and a displayed actor duration of **14 seconds**. That provider duration is distinct from the measured **17.326781-second** complete RPC response. The console displays **$0.00 rounded**; no exact account-credit delta or charge was established. [Successful Apify retry](https://console.apify.com/actors/runs/oDrRN7uJrGZuds46e).

**Historical Studio blocker resolved:** the initial authenticated editor failed before any Instagram request because concurrent Library output contained CommonJS `require("react")` in `modulesHash-CcaY_H1X.js`. The current build configuration supplies `esmExternalRequirePlugin` for the external React import. After a normal Nx backend restart against the intact existing database, the backend reported `system spec accepted` and Studio's full catalog and My Travels grid loaded without that browser error. Library's separate development frontend was also restored without duplicating the already-running API. No source changes or Library tests were made during this resumed verification. [Historical blocker screenshot](/tmp/qrk-apify-studio-blocker.jpg), [Current React adapter](/Users/morgs32/GitHub/qrk.sh/apps/library/vite.lib.config.ts:46).

**Live authenticated Studio Save/reload passed:** after one human-assisted normal catalog drop, Studio created Instagram brick `brk_4685a95c1bc2403985470198e13424d5` in the existing My Travels site/page. The normal form saved Nathan once, with no retry. The API Workerd log recorded `POST /rpc` HTTP 200 in **6,394 ms**, covering the provider lookup, sequential image downloads, local R2 writes, and retention attempt. The browser-level network capture contained no corresponding RPC timing record, so **6.394 seconds is the API pipeline measurement, not a separately measured complete browser Save**. [Studio reload screenshot](/tmp/qrk-apify-studio-reload.jpg).

Reload preserved the canonical Nathan profile URL, `1M` follower text, and all four thumbnails. Their browser natural dimensions were 720×540, 1080×1350, 320×561, and 1080×810. All five stored images under `instagram/nathanfielder/054de3d9-613a-4131-a608-4a674eaa706e/` served HTTP 200 with `image/jpeg` and nonempty bytes. Avatar and ordered post sizes were 6,603, 83,623, 169,170, 33,315, and 161,304 bytes, totaling **454,015 bytes**. The API pipeline fits the 30-second budget in this run; browser transport was not separately timed, and future provider latency remains variable.

A read-only query of the live authoritative `AggregateVersionRepo` joined this exact brick to its site and page and returned one row. Its decoded state confirmed the canonical Nathan URL, username `nathanfielder`, `1M` follower text, avatar, and four post R2 URLs with the same fetch prefix. The state exactly matched the originating `updateBrick` command `cmd_h3UY01FHfXYfs_6HmvarS`, aggregate index 58, finalized as `ZerospinSuccess` without failure. The query used `mode=ro` and `query_only`; it performed no database writes or resets.

The local Apify integration's required checks are complete. Production secret provisioning, production storage verification, and deployment remain outside this work. Plan 021 stays active only for its separate generated-color check. [Current form validation](/Users/morgs32/GitHub/qrk.sh/apps/library/modules/instagram/InstagramForm.tsx:73), [Active plan](/Users/morgs32/GitHub/qrk.sh/wiki/plans/021-plan-brick-forms.md).

## Live trial 2026-10-14

**Passed:** one fresh POST to maintained `apify/instagram-profile-scraper`, with `{"usernames":["nathanfielder"],"includeAboutSection":false}`. The temporary diagnostic decoder verified that the returned username matched `nathanfielder` and that `private` was false. Apify returned HTTP 201; lookup and image-pipeline statuses were both `success`. The actual follower count was not logged.

Apify's console independently showed the API-origin run as `SUCCEEDED`, with one dataset row, build `0.0.639`, and a displayed duration of 3 seconds. That provider duration is distinct from the measured method call below. [Live Apify run](https://console.apify.com/actors/runs/YJcIL9B5XjWb17dGq), [Saved diagnostic output](/tmp/qrk-instagram-apify-trial-2026-10-14.log).

The diagnostic invoked `LibraryApi` through the existing API Workerd test seam with the real provider, real image fetches, and isolated local Miniflare R2. The unchanged `getInstagramProfile` importer downloaded the avatar and four post thumbnails, buffered and stored them, then attempted retention. All five stored assets returned HTTP 200 through local `SELF`, had an image content type, and contained nonempty bytes; the verified assets totaled **454,015 bytes**. [Existing importer and validation](/Users/morgs32/GitHub/qrk.sh/apps/api/modules/instagram/getInstagramProfile.ts:164).

| Measured operation | Elapsed |
| --- | ---: |
| Fresh provider lookup, including actor startup | 4,169 ms |
| Image importer and retention attempt | 1,228 ms |
| Complete `LibraryApi` method call | **5,397 ms** |

The method-call measurement includes the provider request and the unchanged sequential image-fetch/buffer/local-R2 pipeline. It excludes post-result asset verification and the test harness/Nx Library build. The full Nx invocation took 58.2 seconds, passed one test in one file, and exited 0; that duration is not the profile-request latency. Missing upstream source-map warnings were nonblocking and were not changed.

The observed 5.397-second method call was below both the approved 60-second trial budget and the source-derived local 30-second Next proxy budget. This was one measured run in isolated local R2: it did not traverse the Next proxy, exercise Studio/Library Save and reload, or use production storage. It establishes feasibility for this account and environment, not a latency guarantee. At trial cleanup, the temporary diagnostic spec/config wiring was removed and the real `getInstagramProfile`, `BrowserHost`, and `LibraryApi` sources remained unchanged. Permanent integration was implemented afterward, as recorded above.

The console displayed usage as **$0.00 rounded**. An exact account-credit delta was not established, so this does not prove a zero charge; the documentation-based per-profile estimate above is not a verified charge either. [Live run usage](https://console.apify.com/actors/runs/YJcIL9B5XjWb17dGq). This historical bounded trial does not establish permanent-integration or both-host Save/reload verification and does not complete Plan 021.
