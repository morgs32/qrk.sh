# GitHub profile scraper implementation plan

**Date:** 2026-07-17
**Source spec:** `008-spec-github-profile-scraper.md`

## Implementation

1. Extend the provider contract with `github`, canonical profile URL validation, the `GITHUB_TOKEN` binding, and a dedicated Queue.
2. Add the authenticated GitHub user request with pinned REST headers, complete JSON preservation, identity validation, and explicit failure classification.
3. Add nullable `expiredAt` persistence and an atomic repository operation that reuses pending or unexpired completed GitHub jobs.
4. Route GitHub submissions and Queue deliveries explicitly, set expiration 24 hours after completion, and make Queue-send failure immediately replaceable.
5. Extend deterministic and opt-in live Worker tests for request shape, payloads, deduplication, expiration, failure recovery, and real authenticated completion.

## Verification

1. Run `pnpm nx run scraper:lint`.
2. Run `pnpm nx run scraper:typecheck`.
3. Run `pnpm nx run scraper:test:e2e`.
4. Run `pnpm nx run scraper:test:live` when `GITHUB_TOKEN` is available.
5. Run `git diff --check` and preserve unrelated worktree changes.
