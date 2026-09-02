# Origin-specific scraper repos design

**Date:** 2026-07-17
**Status:** Approved for planning

## Problem Statement

The scraper Worker routes origin-specific work through a shared job repository and seven Queues. Clients submit a `pageType`, poll a job ID, and receive results only after Queue processing. This adds asynchronous state, retry machinery, and dynamic routing even though callers want to select one scraper repository and await its data directly.

## Solution

Replace the job and Queue model with seven origin-specific Durable Object repositories exposed as Cap'n Web capabilities by `ScraperApi`. Each repository validates its own URLs, returns its provider-native payload from a public `scrape(url)` method, and owns a 24-hour stale-while-revalidate cache. Browser-backed repositories delegate extraction to one shared `BrowserHost` Durable Object; GitHub and Truth Social fetch directly.

## User Stories

1. As an RPC client, I want to select an origin repository explicitly so that I do not pass a redundant discriminator.
2. As an RPC client, I want `scrape(url)` to return the payload directly so that I do not submit and poll jobs.
3. As an RPC client, I want typed origin payloads and typed domain failures.
4. As an RPC client, I want fresh cached data returned without another upstream request.
5. As an RPC client, I want stale successful data returned immediately while refresh happens in the background.
6. As an operator, I want concurrent requests for one canonical URL to share one extraction attempt.
7. As an operator, I want browser-backed origins to share one lazily connected Browser Run session without a Queue or scheduler.
8. As a maintainer, I want each origin's repository and persistence behavior written explicitly without a generic cache abstraction.

## Implementation Decisions

1. `ScraperApi` exposes `linktreeRepo()`, `beaconsRepo()`, `instagramRepo()`, `githubRepo()`, `tiktokRepo()`, `youtubeRepo()`, and `truthSocialRepo()`.
2. Each accessor returns the corresponding global Durable Object stub directly through Cap'n Web.
3. `ScraperApi` carries the Zerospin `Apis` brand and every public origin repo carries the `TargetApi` brand. Clients use `newSyncRpcSession`, which makes stub-returning accessors synchronous in TypeScript and prevents awaiting a repo capability.
4. Repo identity replaces `pageType` and `origin`; neither remains in requests, cache rows, or payload envelopes.
5. Every repository exposes only one public domain method, `scrape(url)`, returning `IRpcEither` with its named provider payload.
6. The seven payload contracts are `ILinktreeScrapePayload`, `IBeaconsScrapePayload`, `IInstagramScrapePayload`, `IGitHubScrapePayload`, `ITikTokScrapePayload`, `IYouTubeScrapePayload`, and `ITruthSocialScrapePayload`.
7. `IJsonValue` models the RPC-safe static view of structured-cloneable provider JSON. Nested containers remain opaque `object` values to avoid recursive expansion in Cloudflare's generated Durable Object stub types, while Effect Schema validates the complete value recursively at runtime. Payload types use it to describe the existing minimum provider identity and retain excess provider-native data across Durable Object RPC.
8. Every repository has one global Durable Object instance and a cache table keyed by canonical URL.
9. Each repository owns a separate table, migrations, Drizzle setup, cache control flow, and per-URL in-flight map. No shared cache schema, migration, base class, helper, registry, lookup method, or data loop is introduced.
10. Successful rows contain the typed JSON payload, refresh timestamp, and expiry timestamp. Freshness lasts 24 hours after a successful scrape.
11. A fresh hit returns immediately. An expired hit returns stale data indefinitely and schedules a coalesced refresh with `ctx.waitUntil`.
12. A failed background refresh logs the repository and canonical URL, retains stale data, and clears the in-flight marker.
13. A missing row awaits one coalesced extraction. A failure returns `Left` and is not cached.
14. Repositories perform no automatic retries.
15. `BrowserHost` exposes explicit `scrapeLinktree`, `scrapeBeacons`, `scrapeInstagram`, `scrapeTikTok`, and `scrapeYouTube` methods for the matching repositories.
16. `BrowserHost` launches lazily, coalesces launch attempts, reuses a connected browser, clears it when disconnected, and reconnects on the next call.
17. Browser calls open concurrent isolated pages through the existing provider extraction functions. There is no Queue, semaphore, page cap, alarm, or idle timer.
18. GitHub and Truth Social remain direct HTTP extraction workflows inside their repositories.
19. `Worker.ts` contains only the Cap'n Web fetch entrypoint and required Durable Object exports.
20. The deployment creates seven SQLite Durable Object classes and `BrowserHost`, deletes `ScraperRepo`, removes every Queue binding, and starts with empty origin caches.

## Testing Decisions

1. The primary deterministic seam is Cloudflare Workers Vitest across the Cap'n Web session, explicit accessor, returned Durable Object stub, repository normalization/cache, and mocked existing extraction boundary.
2. Every repository is tested explicitly for its accessor, canonical identity, invalid URLs, first miss, concurrent miss coalescing, fresh hits, stale refresh, concurrent refresh coalescing, successful replacement, failed refresh retention, and uncached first-scrape failure.
3. `BrowserHost` tests cover lazy launch, connected reuse, concurrent isolated pages, launch coalescing, disconnect clearing, relaunch, and typed failures.
4. Existing provider fixtures continue to verify parsing, full payload retention, and identity validation.
5. Opt-in live tests call each repository's `scrape(url)` method directly and perform no Queue invocation or polling.
6. Verification uses the scraper Nx lint, typecheck, generated types, deterministic test, optional live test targets, and `git diff --check`.

## Out of Scope

1. Queues, jobs, job history, polling, automatic retry, caller-selected cache policy, force refresh, or cache invalidation APIs are excluded.
2. A provider registry, generic repository, shared cache code, dynamic origin lookup, normalized cross-provider payload, or barrel export is excluded.
3. Migration of old `ScraperRepo` job rows is excluded.
4. Changes to URL contracts or provider extraction strategies are excluded.

## Further Notes

1. Existing job data is deliberately discarded when the old Durable Object class is deleted.
2. Upstream payload volatility remains isolated by minimum runtime schemas, fixture contracts, and opt-in live smoke tests.
