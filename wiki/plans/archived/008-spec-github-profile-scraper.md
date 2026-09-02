# GitHub profile scraper design

**Date:** 2026-07-17
**Status:** Approved for planning

## Problem Statement

The `scraper` Worker cannot retrieve GitHub profile data through GitHub's supported authenticated API. Repeated requests for the same profile would also spend rate-limit capacity unnecessarily unless the Worker reuses an in-flight or recently completed result.

## Solution

Add `github` as a direct-API provider behind the existing `submitScrape` and `getScrape` RPC methods. Its Queue performs one authenticated `GET /users/{username}` request and persists the complete response. The global `ScraperRepo` atomically reuses a pending job or a completed job whose `expiredAt` is in the future. Successful results expire 24 hours after completion; failed jobs are immediately replaceable.

## User Stories

1. As an RPC client, I want to submit a canonical GitHub profile URL through the existing Scraper API.
2. As an RPC client, I want the complete GitHub user endpoint response without a premature shared profile projection.
3. As an RPC client, I want repeated submissions to return the same pending or fresh completed job.
4. As an RPC client, I want failed or expired jobs to be replaceable immediately.
5. As an operator, I want GitHub authentication to come from a Worker secret that is never persisted or returned.

## Implementation Decisions

1. `submitScrape({ pageType, url })` and `getScrape(id)` remain the public RPC methods. `pageType` gains `github`; callers do not provide expiration.
2. GitHub input accepts `https://github.com/<login>` with one account segment. Normalization removes query strings, fragments, and a trailing slash, lowercases the login for cache identity, and rejects alternate hosts and non-profile paths.
3. The Queue performs exactly one `GET https://api.github.com/users/{login}` request. Related GitHub resources are not fetched.
4. Requests send `Authorization: Bearer <GITHUB_TOKEN>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2026-03-10`, and a valid `User-Agent`. `GITHUB_TOKEN` is a Cloudflare secret.
5. The complete JSON response is persisted. Validation proves it is JSON-persistable and its `login` matches the requested login case-insensitively while retaining excess fields.
6. The global `ScraperRepo` atomically returns the newest matching pending job or matching completed job with `expiredAt > now`; the API returns its ID and sends no Queue message.
7. Without a reusable job, submission creates one pending job and sends one Queue message. Failed and expired jobs are not reusable.
8. `expiredAt` is nullable in the common job envelope. It stays null for pending, retrying, failed, and non-GitHub jobs. GitHub completion sets it to completion time plus 24 hours.
9. GitHub Queue-send failure marks the new job failed before returning the typed Queue error, allowing immediate resubmission.
10. `404` is a deterministic unavailable-profile failure. Invalid credentials or forbidden access fail deterministically. Rate limiting, `429`, server errors, and network failures use the existing three-attempt transient retry policy.
11. Existing providers retain their current behavior and one-new-job-per-submission semantics.

## Testing Decisions

1. The deterministic seam is the Cloudflare Workers Vitest runtime across Cap'n Web submission, Queue dispatch, mocked GitHub response, and Durable Object persistence.
2. Deterministic tests cover URL normalization, authenticated headers, full payload preservation, identity validation, pending and completed reuse, expiry replacement, failed-job replacement, and response failure classification.
3. An opt-in live end-to-end test uses `GITHUB_TOKEN` and a configured public profile URL, submits through Cap'n Web, waits for Queue completion, reads with `getScrape`, and verifies the returned login. It remains outside routine token-free CI.
4. Verification runs the Scraper Nx lint, typecheck, deterministic test, and token-gated live test targets when credentials are available.

## Out of Scope

1. Repositories, organizations, social accounts, followers, following, events, contributions, and activity aggregation are excluded.
2. HTML scraping, GraphQL, ETags, webhooks, background refresh, stale-while-revalidate, and scheduled cleanup are excluded.
3. Caller-selected TTLs, force refresh, multiple credentials, token rotation, and GitHub App authentication are excluded.
4. Cache changes for existing providers are excluded.

## Further Notes

1. GitHub documents that the endpoint supports fine-grained personal access tokens without additional permissions and exposes publicly visible email only to authenticated requests.
2. GitHub requires a valid `User-Agent`; the pinned API version keeps the provider payload stable until an intentional update.
