# Multi-provider scraper design

**Date:** 2026-07-16
**Status:** Planned — archived

## Problem Statement

The `scraper` Worker supports only Linktree. Adding another public creator platform currently requires changing routing, Queue configuration, URL validation, extraction, failure handling, and tests without a settled provider contract. The platforms requested next also do not expose the same public-page shape: Beacons, Instagram, TikTok, and YouTube require browser-rendered page extraction, while Truth Social exposes Mastodon-compatible JSON. Treating every provider as either Linktree-shaped or browser-only would make the system brittle and waste Browser Run capacity.

## Solution

Extend `scraper` with five profile page types: `beacons`, `instagram`, `tiktok`, `youtube`, and `truth-social`. Preserve the existing Cap'n Web API and global `ScraperRepo` Durable Object. Give every page type its own Queue and an explicit provider workflow containing URL normalization, one primary extraction strategy, raw-payload validation, and failure classification.

Browser-backed provider Queues launch one Browser Run session per Queue batch and open one isolated page per job. The Truth Social Queue uses direct public JSON requests and does not launch a browser. Every provider persists its native raw profile payload in the existing job envelope. Transient failures retry the same strategy up to three Queue deliveries; deterministic failures terminate immediately.

## User Stories

1. As an RPC client, I want to submit a public Beacons, Instagram, TikTok, YouTube, Truth Social, or Linktree profile URL through the same API so that provider choice does not change the client workflow.
2. As an RPC client, I want a new job for every submission so that repeated observations of one profile remain independently inspectable.
3. As an RPC client, I want canonical URLs and typed validation failures so that malformed or unsupported profile forms never enter a Queue.
4. As an RPC client, I want pending jobs to expose retry progress and the latest failure so that a delayed scrape is distinguishable from an idle job.
5. As a maintainer, I want one Queue per page type so that each provider can have independent throughput, retry, and operating limits.
6. As a maintainer, I want one explicit primary extraction strategy per provider so that provider behavior remains visible and testable.
7. As a maintainer, I want provider-native raw payloads persisted so that a premature shared profile model does not discard provider-specific data.
8. As a maintainer, I want deterministic tests for every provider and separately gated live smoke tests so that routine verification is stable while upstream compatibility is still observable.

## Implementation Decisions

1. The public Cap'n Web contract remains `submitScrape({ pageType, url })` and `getScrape(id)`. `submitScrape` routes by the validated `pageType`; no provider-specific RPC methods are added.
2. `pageType` contains exactly `linktree`, `beacons`, `instagram`, `tiktok`, `youtube`, and `truth-social` in this version.
3. A scrape job represents one public creator profile or channel page. It does not represent an individual post, video, comment collection, transcript, feed traversal, or recursively discovered link.
4. Each submission creates a new job even when its canonical URL matches an earlier job.
5. Each page type has a separately named producer binding and Queue consumer configuration. The Worker Queue entrypoint dispatches from the Queue name to the corresponding provider workflow. Unknown Queue names and a message whose `pageType` does not match its Queue are deterministic failures.
6. Provider routing remains explicit in the Worker and API boundaries. The implementation may share already-approved job persistence and Effect boundary utilities, but it does not introduce a provider registry, generic scraper class hierarchy, barrel, or additional package export.
7. Canonical profile URLs use these exact forms:
   1. Linktree: `https://linktr.ee/<slug>`.
   2. Beacons: `https://beacons.ai/<slug>`.
   3. Instagram: `https://www.instagram.com/<username>`.
   4. TikTok: `https://www.tiktok.com/@<username>`.
   5. YouTube: `https://www.youtube.com/@<handle>`.
   6. Truth Social: `https://truthsocial.com/@<username>`.
8. Every URL requires HTTPS, the exact listed hostname, and exactly one non-empty profile path segment. Normalization removes query strings, fragments, and trailing slashes. Alternate hosts, custom domains, locale prefixes, legacy YouTube `/channel/`, `/c/`, and `/user/` forms, and non-profile resource paths are rejected rather than redirected or inferred.
9. Linktree retains its current Browser Run strategy and parses the JSON text in `script#__NEXT_DATA__`.
10. Beacons uses Browser Run. It waits for the public creator page to render, then captures the page's embedded application state when present and the rendered profile data needed to represent the public page. Its persisted payload records which of those page-native sources were available; it does not convert them into the cross-provider profile model.
11. Instagram uses Browser Run against the public profile page. It captures the browser-visible embedded profile state or page-native JSON response used to render that profile. A login wall, private profile, disabled public embedding, challenge page, or absent supported profile shape is a deterministic failure in this unauthenticated version.
12. TikTok uses Browser Run and captures the embedded profile hydration JSON exposed by the rendered page. The parser recognizes only explicitly tested hydration script shapes; an unrecognized replacement shape is a deterministic `unsupported-page-shape` failure rather than a best-effort DOM projection.
13. YouTube uses Browser Run and captures the channel page's `ytInitialData` object. Only the initial public channel profile payload is included; continuation tokens are retained if present but are not followed.
14. Truth Social uses direct HTTPS requests to its Mastodon-compatible account JSON path. The workflow looks up the account for the canonical username and persists the returned account object. It does not launch Browser Run or fetch the account's statuses in this profile-only version.
15. There is no automatic fallback between browser extraction, alternate internal endpoints, third-party APIs, DOM summaries, or cached payloads. A provider strategy change is an explicit later design and parser version change.
16. Scraping is unauthenticated and proxy-free. The Worker stores no social-platform credentials, cookies, browser profiles, residential proxy configuration, CAPTCHA solver, or stealth configuration. Each Browser Run batch starts a fresh browser session, and each job receives a fresh page.
17. Browser-backed Queue consumers launch one browser per batch. A browser-launch failure applies the transient failure policy to every message in that batch. After launch, each message is isolated: it opens and closes its own page, and one message failure does not stop remaining messages.
18. The Truth Social Queue processes its batch without a browser. Each message receives its own request and failure classification so one upstream response does not stop the batch.
19. The existing global `ScraperRepo` Durable Object and Drizzle Durable SQLite database remain the persistence boundary for all providers.
20. The common persisted envelope remains job ID, canonical URL, page type, status, nullable raw payload, nullable error text, created timestamp, and updated timestamp. Add `attemptCount` so Queue delivery progress is observable.
21. `attemptCount` starts at zero and increments before each extraction attempt. A transient failure leaves status `pending` and stores the latest error text. A later success stores the payload, clears error text, and sets status `completed`. A deterministic failure or exhausted retry stores the final error text and sets status `failed`.
22. Provider payloads remain raw and provider-native. Effect Schema validates that extracted data is JSON-persistable and verifies the minimum provider identity needed to prove the requested profile was returned. The database does not add a shared normalized creator-profile table.
23. Failure classification is explicit:
   1. Invalid requests, Queue/page-type mismatch, missing or private profiles, login or challenge pages, unsupported page shapes, malformed extracted JSON, identity mismatch, and payload validation failures are deterministic and fail immediately.
   2. Browser launch failure, navigation timeout, temporary upstream server response, throttling response, and transient network failure are retryable.
   3. Persistence failures are not acknowledged as successful processing. They remain eligible for Queue redelivery because the database state cannot safely prove completion or failure.
24. A retryable extraction failure calls `message.retry()` while fewer than three attempts have been recorded. The third failed extraction attempt persists `failed` and acknowledges the message. Deterministic failures persist `failed` and acknowledge on their first attempt.
25. Effect owns request and message schemas, URL normalization errors, provider domain errors, failure classification, retry decisions, JSON validation, Either encoding, and asynchronous workflow orchestration. Native Puppeteer callbacks, Cloudflare Queue acknowledgement methods, direct `fetch`, and synchronous Drizzle operations remain native at their required runtime boundaries and are lifted into Effect where they participate in typed failure handling.
26. The only package exports remain the default Worker entrypoint and named `ScraperRepo` Durable Object class required by Wrangler.
27. ScrapeCreators documentation is used as a capability map for the profile resources platforms expose, not as an extraction dependency. The Worker calls no ScrapeCreators API and requires no ScrapeCreators credential.

## Testing Decisions

1. The highest deterministic seam is the Cloudflare Workers Vitest runtime spanning Cap'n Web submission, the selected Queue binding, provider extraction input, Queue handling, and global Durable Object persistence.
2. A shared routing scenario submits one canonical URL for each page type and proves that only that page type's Queue receives the message. The test remains written explicitly per provider rather than introducing a data-driven loop.
3. Each provider has a deterministic extraction contract test with a checked-in minimal fixture representing its supported public payload shape:
   1. Linktree proves `#__NEXT_DATA__` identity extraction.
   2. Beacons proves supported embedded state and rendered profile capture.
   3. Instagram proves supported public-profile state capture and challenge/private-page classification.
   4. TikTok proves the explicitly supported hydration script shape and rejects an unknown shape.
   5. YouTube proves `ytInitialData` capture without following continuations.
   6. Truth Social proves account lookup JSON capture without a Browser Run call.
4. Queue tests prove that browser providers share one browser per batch but isolate pages per message, while Truth Social never launches a browser.
5. Retry tests prove first and second transient failures remain `pending`, increment `attemptCount`, store the latest error, and request redelivery. They prove the third transient failure becomes terminal and acknowledged.
6. Terminal tests prove invalid messages, identity mismatches, missing/private profiles, challenge pages, unsupported shapes, and malformed payloads fail immediately while later messages in the same batch continue.
7. Persistence tests prove successful retry clears the prior error, stores the provider-native raw payload, and preserves the canonical URL and page type in the common envelope.
8. Live provider smoke tests are opt-in through an explicit environment flag and provider sample URL configuration. Each live test exercises Cap'n Web through Queue processing and `getScrape`, then asserts the returned provider identity matches the requested profile. These tests are excluded from the default deterministic target.
9. The existing Linktree e2e test is adapted to the same deterministic/live split rather than remaining an unconditional network dependency.
10. Package lint, typecheck, deterministic Worker tests, and opt-in live Worker tests are exposed as separate Nx targets where the package's current project configuration allows it. Existing unrelated Nx graph failures are recorded separately and are not repaired as part of this feature.

## Out of Scope

1. Posts, videos, reels, stories, comments, transcripts, feeds, pagination, continuation requests, recursive crawling, and scheduled refreshes are excluded.
2. A normalized cross-provider creator schema, contact extraction, deduplication, merging identities across providers, and search are excluded.
3. Authentication, stored browser state, platform credentials, proxies, CAPTCHA solving, stealth measures, and third-party scraping APIs are excluded.
4. Custom Beacons domains, Instagram alternate hosts, TikTok short links, legacy YouTube channel URL forms, Truth Social post URLs, and automatic redirect discovery are excluded.
5. Screenshots, media downloads, asset mirroring, UI integration, webhook notification, and public package APIs beyond the existing Cap'n Web methods are excluded.
6. Automatic provider strategy fallback and runtime-configurable provider registration are excluded.

## Further Notes

1. Cloudflare's [Queues and Browser Run tutorial](https://developers.cloudflare.com/queues/tutorials/web-crawler-with-browser-run/) is the operating model for asynchronous browser batches, including retrying browser-launch failures instead of treating them as page failures.
2. Cloudflare's [Browser Run FAQ](https://developers.cloudflare.com/browser-run/faq/) notes that `domcontentloaded` can occur before page JavaScript finishes. Each browser provider therefore defines and tests its own readiness condition instead of relying on one global navigation event.
3. The [ScrapeCreators capability documentation](https://docs.scrapecreators.com/) distinguishes profiles or channels from posts, videos, comments, transcripts, and other resources across the requested platforms. This design deliberately starts with only the profile capability so later resource types can receive their own URL, payload, pagination, and Queue decisions.
4. The [ScrapeCreators Linktree walkthrough](https://scrapecreators.com/blog/scrape-linktree) establishes `#__NEXT_DATA__` as Linktree's raw page payload. Linktree retains that provider-specific parser rather than being forced into a new generic page parser.
5. Truth Social monitoring research describes its Mastodon-compatible endpoints as internal and unsupported, with no stability guarantee. The [TruthPush implementation overview](https://truthpush.com/en/blog/monitoring-without-platform-api) and [1322 comparison](https://1322.io/blog/truth-social-api-guide) inform the direct-JSON choice and its explicit drift risk; the [Mastodon accounts API](https://docs.joinmastodon.org/methods/accounts/) defines the inherited account lookup shape. If Truth Social no longer permits unauthenticated account lookup, the provider fails explicitly and returns to design rather than silently becoming a browser scraper.
6. Instagram officially limits embedding to eligible public profiles and content, as described in its [public profile embedding guidance](https://www.facebook.com/help/instagram/620154495870484?locale=en_GB). Private profiles and disabled public embedding are therefore explicit unsupported outcomes.
7. Beacons documents public link-in-bio pages and their shareable profile URLs in its [creator help](https://help.beacons.ai/en/articles/4697409) and describes link, video, image, embed, and signup blocks on its [Link in Bio product page](https://beacons.bio/i/app-pages/link-in-bio). The raw Beacons payload must preserve block diversity rather than extracting only hyperlinks.
8. Instagram and TikTok are expected to be the most volatile browser providers. Their fixture tests define the supported parser contract, while opt-in live smoke tests detect upstream drift without destabilizing normal CI.
