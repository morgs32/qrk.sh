# Linktree scraper design

**Date:** 2026-07-16
**Status:** Approved for planning

## Problem Statement

QRK has no Worker package that accepts a single public page scrape, processes it asynchronously with Cloudflare Queues and Browser Run, and persists the result in Durable Object SQLite. The first supported page type is Linktree, whose complete public profile payload is embedded in the page's `#__NEXT_DATA__` script.

## Solution

Create a private `scraper` Worker package. Its Cap'n Web gateway creates scrape jobs, routes each job to the Queue dedicated to its page type, and reads job state from one globally named Durable Object. The Linktree consumer reuses one Browser Run session across each Queue batch, parses one page per message, and stores the raw `#__NEXT_DATA__` object through Drizzle's Durable Object SQLite driver.

## User Stories

1. As an RPC client, I want to submit one canonical Linktree profile URL so that it is scraped asynchronously.
2. As an RPC client, I want every submission to produce a new job so that repeated scrapes remain independently inspectable.
3. As an RPC client, I want to retrieve pending, completed, or failed state by job ID so that asynchronous completion is observable.
4. As a maintainer, I want one Queue binding per page type so that future scrapers can have independent consumers and operating limits.
5. As a maintainer, I want the raw Linktree payload persisted in Durable Object SQLite so that no profile data is discarded by a premature normalization contract.

## Implementation Decisions

1. The package lives at `packages/scraper`, and its npm package name is literally `scraper`.
2. `submitScrape({ pageType, url })` and `getScrape(id)` are the Cap'n Web methods. Both return a serialized Effect Either containing either a success value or a typed domain error.
3. `pageType` is an enum whose only initial member is `linktree`.
4. Linktree input requires HTTPS, the exact `linktr.ee` hostname, and exactly one non-empty path segment. Query strings, fragments, and trailing slashes are removed.
5. Every submission receives a new UUID and is inserted as `pending` before its Queue message is sent.
6. One globally named `ScraperRepo` Durable Object owns the Drizzle SQLite database.
7. The `scrapeJobs` table stores job ID, normalized URL, page type, status, nullable raw JSON, nullable error text, and created and updated timestamps.
8. The Linktree Queue accepts multi-message batches. One Browser Run session is launched per batch, and one page is opened and closed per job.
9. A job reads and parses `script#__NEXT_DATA__`. The entire parsed JSON object is persisted without a contact-summary projection.
10. The first browser, navigation, selector, parse, or persistence failure is terminal. The job is marked `failed`, its message is acknowledged, and the consumer continues with the batch.
11. Effect owns input validation, domain errors, Either encoding, and asynchronous workflow composition. Cloudflare handlers, Puppeteer page callbacks, and synchronous Drizzle operations retain their native APIs.
12. The package exports only its default Worker entrypoint and the named Durable Object class required by Wrangler.

## Testing Decisions

1. `linktree.e2e.spec.ts` uses the Cloudflare Workers Vitest runtime and Cap'n Web client.
2. The acceptance test submits `https://linktr.ee/miguelangeles`, waits for Queue processing, retrieves the completed job through Cap'n Web, and verifies `props.pageProps.account.username` is `miguelangeles`.
3. The same runtime verifies invalid URL rejection, missing job lookup, and terminal failure persistence.
4. Package lint, typecheck, and Worker tests are run locally. The existing duplicate vendored `effect` project-name failure is reported separately if it prevents Nx orchestration.

## Out of Scope

1. Recursive crawling, screenshots, proxies, contact normalization, authentication, UI integration, and additional page types are excluded.
2. Queue retries and scrape-result deduplication are excluded.

## Further Notes

1. The live e2e test intentionally depends on network availability and Linktree retaining its `#__NEXT_DATA__` representation.
2. Future page types add an enum member, a dedicated Queue binding, and a dedicated consumer without changing the persisted job identity model.
