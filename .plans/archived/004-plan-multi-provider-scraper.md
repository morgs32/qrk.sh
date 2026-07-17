# Multi-provider scraper implementation plan

**Date:** 2026-07-16
**Status:** Implemented — archived
**Design spec:** `.plans/archived/004-spec-multi-provider-scraper.md`

## Goal

1. Extend the private `scraper` Worker from Linktree-only scraping to explicit Linktree, Beacons, Instagram, TikTok, YouTube, and Truth Social profile scraping.
2. Preserve the existing Cap'n Web API, global `ScraperRepo` Durable Object, Drizzle Durable SQLite persistence, and the package's two required Worker exports.
3. Give every page type its own Queue, URL contract, extraction workflow, payload validation, failure classification, retry behavior, deterministic coverage, and opt-in live smoke coverage.
4. Keep control flow provider-specific. Do not add a provider registry, generic scraper hierarchy, barrel, re-export, fallback strategy, cross-provider profile model, or data-driven test loop.

## Requirements Trace

1. Spec user stories 1 through 3 map to the page-type schema, exact URL normalization, explicit Queue selection in `ScraperApi.submitScrape`, and encoded typed failures.
2. Spec user stories 4 and 5 map to `attemptCount`, one producer and consumer per page type, and Queue-name dispatch in the Worker entrypoint.
3. Spec user stories 6 and 7 map to one extraction module per provider and provider-native JSON persistence in the existing job envelope.
4. Spec user story 8 maps to deterministic provider fixtures and Worker-runtime tests, with public-network smoke tests behind explicit environment configuration.

## Approved Implementation Surface

1. Extend the existing named domain types in `packages/scraper/src/types.ts` for the six page types, retry-aware jobs, Queue bindings, and approved error codes. Add no public type module or package export.
2. Extend the schemas in `packages/scraper/src/schemas.ts` for page types, messages, JSON persistence, and minimum provider identity.
3. Retain the provider-owned `normalizeLinktreeUrl` and `scrapeLinktree` modules. Add equivalently named provider-owned normalization and extraction modules for the five new providers.
4. Keep Queue orchestration in `Worker.ts`, API routing in `ScraperApi.ts`, and persistence in `ScraperRepo.ts`.
5. Keep the only runtime exports as the default Worker entrypoint and named `ScraperRepo` class.

## Implementation Steps

1. Extend the persisted job contract.
   1. Extend `IPageType` with `beacons`, `instagram`, `tiktok`, `youtube`, and `truth-social`.
   2. Add `attemptCount` to `IScrapeJob`, initialized to zero.
   3. Extend `IScrapeError.code` only for the approved request, extraction, Queue mismatch, retry, and persistence outcomes.
   4. Add explicit producer bindings for all six page types to `IScraperEnv`.
   5. Add `attempt_count` to the Drizzle table.
   6. Add a second Durable SQLite migration that expands the `page_type` constraint, preserves existing Linktree rows, and initializes `attempt_count` to zero.
   7. Update `ScraperRepo.createJob` and add direct repository operations for starting an attempt, storing a pending retry error, completing, and terminally failing.
   8. Keep each synchronous Drizzle statement direct; do not add single-call Effect wrappers.
2. Extend trust-boundary schemas.
   1. Extend `PageTypeSchema` to the six literals and preserve schema/type parity.
   2. Keep submission and Queue message decoding strict.
   3. Validate that raw provider payloads are JSON-persistable before database writes.
   4. Validate Linktree identity at `props.pageProps.account.username`.
   5. Validate Beacons identity from the supported embedded or rendered profile source.
   6. Validate Instagram identity from the supported public-profile state.
   7. Validate TikTok identity from the supported hydration object.
   8. Validate YouTube identity from the supported `ytInitialData` channel metadata.
   9. Validate Truth Social identity from the Mastodon-compatible account object.
   10. Map Effect Schema parse failures to scraper domain errors with explicit excess-property behavior.
3. Add exact URL normalization.
   1. Retain Linktree normalization for only `https://linktr.ee/<slug>`.
   2. Add Beacons normalization for only `https://beacons.ai/<slug>`.
   3. Add Instagram normalization for only `https://www.instagram.com/<username>`.
   4. Add TikTok normalization for only `https://www.tiktok.com/@<username>`.
   5. Add YouTube normalization for only `https://www.youtube.com/@<handle>`.
   6. Add Truth Social normalization for only `https://truthsocial.com/@<username>`.
   7. In every normalizer, require HTTPS, the exact hostname, and one non-empty provider-shaped path segment; remove query, fragment, and trailing slash.
   8. In `ScraperApi.submitScrape`, branch explicitly by `pageType`, normalize, create a fresh job, and send only to the matching Queue.
   9. If job creation succeeds but Queue send fails, return a typed failure and leave the pending job visible; do not route it elsewhere.
4. Tighten the Linktree workflow.
   1. Keep Browser Run and `script#__NEXT_DATA__` as the only extraction strategy.
   2. Classify navigation, missing selector, malformed JSON, invalid payload, and username mismatch explicitly.
   3. Preserve the complete decoded object and guarantee page closure.
5. Add the Beacons browser workflow.
   1. Wait for a Beacons-specific rendered readiness condition.
   2. Capture supported embedded application state when present plus the required rendered profile and block data.
   3. Persist one provider-native object recording which page sources were available.
   4. Validate requested identity and deterministically reject missing supported state or non-profile pages.
6. Add the Instagram browser workflow.
   1. Wait for the tested public-profile state or page-native JSON response.
   2. Capture the complete supported public profile payload.
   3. Detect login walls, challenge pages, private profiles, missing profiles, and disabled public embedding.
   4. Validate the requested username; classify unsupported public outcomes as deterministic and temporary navigation/upstream failures as transient.
7. Add the TikTok browser workflow.
   1. Wait for one explicitly tested hydration script shape.
   2. Parse and preserve the complete hydration object.
   3. Validate the requested creator identity.
   4. Deterministically reject malformed JSON, unknown hydration shapes, missing profiles, challenge pages, and identity mismatches.
   5. Add no DOM-summary or alternate-endpoint fallback.
8. Add the YouTube browser workflow.
   1. Wait until `ytInitialData` is available on the canonical handle channel page.
   2. Read and preserve the complete initial channel object.
   3. Validate channel identity against the requested handle.
   4. Preserve continuation tokens without following them.
   5. Deterministically reject missing data, non-channel pages, and identity mismatches.
9. Add the Truth Social direct-JSON workflow.
   1. Derive the username from the normalized URL and call the unauthenticated Mastodon-compatible lookup endpoint with `fetch`.
   2. Parse, validate, identity-check, and preserve the returned account object.
   3. Treat not found, invalid JSON, invalid shape, and identity mismatch as deterministic.
   4. Treat throttling, temporary server responses, and network failures as transient.
   5. Do not accept a browser or launch Browser Run.
10. Implement retry-aware Queue orchestration in `Worker.ts`.
    1. Branch explicitly on `batch.queue` for all six Queues.
    2. Reject unknown Queue names and Queue/message page-type mismatches deterministically.
    3. Launch one browser per browser-backed batch and create one isolated page per message.
    4. Process Truth Social messages independently without a browser.
    5. Increment `attemptCount` before extraction.
    6. On success, persist payload, clear error, mark completed, then acknowledge.
    7. On deterministic failure, persist failed state, then acknowledge.
    8. On transient failure before attempt three, persist pending state and latest error, then call `message.retry()`.
    9. On transient failure at attempt three, persist failed state, then acknowledge.
    10. Apply browser-launch failure to every message using the same attempt policy.
    11. Continue later messages after an earlier extraction failure.
    12. If persistence fails, do not acknowledge successful processing; allow Queue redelivery.
    13. Use named `Effect.fn` programs for decoding, failure classification, retry decisions, and async workflow composition. Keep Puppeteer callbacks, Queue methods, `fetch`, and synchronous Drizzle native at their runtime edges.
11. Configure six Queues.
    1. Add producers and consumers for `scraper-linktree`, `scraper-beacons`, `scraper-instagram`, `scraper-tiktok`, `scraper-youtube`, and `scraper-truth-social` in `wrangler.jsonc`.
    2. Keep multi-message batches and configure enough Cloudflare retries for the Worker's three-attempt policy.
    3. Mirror all six consumers in `vitest.config.ts` with short deterministic timeouts.
    4. Regenerate `worker-configuration.d.ts` through the package types target.
    5. Add a separate opt-in live test script/target without making the default suite network-dependent.
12. Build deterministic Worker-runtime coverage.
    1. Check in minimal provider fixtures for Linktree, Beacons, Instagram, TikTok, YouTube, and Truth Social.
    2. Adapt `linktree.e2e.spec.ts` to fixture-backed Cap'n Web, Queue, and Durable Object coverage.
    3. Add explicit routing assertions for all six providers without a data loop.
    4. Add one explicit extraction contract test file per provider.
    5. Prove browser-backed messages share one browser per batch but use separate pages.
    6. Prove Truth Social never launches a browser.
    7. Prove first and second transient failures remain pending, increment attempts, store errors, and request redelivery.
    8. Prove the third transient failure becomes terminal and acknowledged.
    9. Prove deterministic failures terminate on attempt one without stopping later batch messages.
    10. Prove a successful retry clears the earlier error and persists raw provider data.
    11. Preserve typed missing-job coverage and explicitly test rejected URL forms for every provider.
13. Add opt-in live smoke coverage.
    1. Gate live Worker tests with an explicit environment flag and separate sample URL per provider.
    2. For each enabled provider, exercise Cap'n Web submission, the real Queue path, `getScrape`, and identity matching.
    3. Keep providers independently configurable and report upstream shape drift without runtime fallback.
14. Audit the implementation boundary.
    1. Confirm `Worker.ts` exports only the default handler and `ScraperRepo`.
    2. Confirm no barrel, registry, generic scraper base, normalized profile model, automatic fallback, credentials, proxies, post/feed crawling, or data-driven test loop was added.
    3. Confirm every named type or helper is approved by this plan or separately approved before implementation under `AGENTS.md`.
    4. Update linked repository documentation only if a documented path, symbol, Queue name, or command changes.

## Verification Plan

1. Run `pnpm nx show project scraper --json` and record resolved targets once the workspace graph can be processed.
2. Run `pnpm nx run scraper:lint`.
3. Run `pnpm nx run scraper:typecheck`.
4. Run `pnpm nx run scraper:types` and confirm all six generated Queue bindings.
5. Run `pnpm nx run scraper:test:e2e` for deterministic Worker tests.
6. Run the separate live smoke target only with the live flag and sample URLs configured.
7. Run `git diff --check`.
8. Search for new `ALLOWED_CAST`, assertion chains, barrels, unapproved exports, provider registries, fallback behavior, and test data loops.
9. If it remains, record the duplicate Nx project-name failure for `vendor/effect` and `vendor/effect/packages/effect` separately; do not repair vendored Nx metadata in this feature.

## Completion Gate

1. Do not mark the plan implemented until all six page types traverse Cap'n Web, only their own Queue, the global Durable Object, and `getScrape` in deterministic Worker tests.
2. Require direct evidence for browser reuse, page isolation, Truth Social's no-browser path, deterministic failures, first/second retries, third-attempt exhaustion, and persistence-gated acknowledgment.
3. Report opt-in live failures caused by upstream blocking or shape drift separately from deterministic regressions.
4. Preserve unrelated work and report unrelated Nx graph or repository failures without fixing them.
5. Keep this plan under `.plans/plans/` until implementation and required verification are complete; archive it only after completion.

## Execution Record

1. Implemented six explicit page types, canonical URL validators, producer bindings, Queue consumers, and provider extraction workflows.
2. Added retry-aware Durable SQLite persistence with `attemptCount`, pending retry errors, terminal exhaustion, and persistence-gated acknowledgment.
3. Added deterministic fixtures and Worker-runtime coverage for all provider parsers, URL contracts, Cap'n Web submission, Durable Object persistence, three-attempt retry behavior, Queue mismatch behavior, and typed not-found results.
4. Added six separately configured opt-in live smoke tests and regenerated Worker binding types.
5. Verified `scraper:typecheck`, `scraper:lint`, `scraper:types`, and `scraper:test:e2e` through Nx. The deterministic suite passed 11 tests.
6. Verified the live target discovers six tests and skips them when provider sample URLs are not configured.
7. `git diff --check` and the cast/export/registry audit passed. The forced browser connection-failure test emits Miniflare Browser Rendering shutdown warnings after its assertions, but Vitest and Nx exit successfully.
