import { it } from "@effect/vitest";
import { newHttpBatchRpcSession } from "capnweb";
import { env, SELF } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { Effect } from "effect";
import { beforeAll, describe, expect, vi } from "vitest";

import type { ScraperApi } from "./ScraperApi";
import { normalizeBeaconsUrl } from "./normalizeBeaconsUrl";
import { normalizeInstagramUrl } from "./normalizeInstagramUrl";
import { normalizeGitHubUrl } from "./normalizeGitHubUrl";
import { normalizeLinktreeUrl } from "./normalizeLinktreeUrl";
import { normalizeTikTokUrl } from "./normalizeTikTokUrl";
import { normalizeTruthSocialUrl } from "./normalizeTruthSocialUrl";
import { normalizeYouTubeUrl } from "./normalizeYouTubeUrl";
import { beaconsFixture, gitHubFixture, instagramFixture, linktreeFixtureJson, tikTokFixture, truthSocialFixture, youTubeFixture } from "./providerFixtures";
import { parseBeaconsPayload } from "./scrapeBeacons";
import { parseInstagramPayload } from "./scrapeInstagram";
import { parseGitHubPayload, scrapeGitHub } from "./scrapeGitHub";
import { parseLinktreePayload } from "./scrapeLinktree";
import { parseTikTokPayload } from "./scrapeTikTok";
import { parseTruthSocialPayload } from "./scrapeTruthSocial";
import { parseYouTubePayload } from "./scrapeYouTube";
import type { IRpcEither } from "./types";

const RPC_URL = "http://scraper.invalid/";

beforeAll(() => {
  vi.stubGlobal("fetch", SELF.fetch.bind(SELF));
});

const getRight = <RIGHT>(either: IRpcEither<RIGHT>): RIGHT => {
  if (either._tag === "Left") {
    throw new Error(`${either.left.code}: ${either.left.message}`);
  }
  return either.right;
};

describe("scraper deterministic contracts", () => {
  it.effect("normalizes every canonical provider URL", () =>
    Effect.gen(function* () {
      expect(yield* normalizeLinktreeUrl("https://linktr.ee/miguelangeles/?x=1#bio")).toBe("https://linktr.ee/miguelangeles");
      expect(yield* normalizeBeaconsUrl("https://beacons.ai/creator/?x=1#bio")).toBe("https://beacons.ai/creator");
      expect(yield* normalizeInstagramUrl("https://www.instagram.com/creator/?x=1#bio")).toBe("https://www.instagram.com/creator");
      expect(yield* normalizeGitHubUrl("https://github.com/OctoCat/?x=1#bio")).toBe("https://github.com/octocat");
      expect(yield* normalizeTikTokUrl("https://www.tiktok.com/@creator/?x=1#bio")).toBe("https://www.tiktok.com/@creator");
      expect(yield* normalizeYouTubeUrl("https://www.youtube.com/@creator/?x=1#bio")).toBe("https://www.youtube.com/@creator");
      expect(yield* normalizeTruthSocialUrl("https://truthsocial.com/@creator/?x=1#bio")).toBe("https://truthsocial.com/@creator");
    }),
  );

  it.effect("validates every provider fixture and identity", () =>
    Effect.gen(function* () {
      expect(yield* parseLinktreePayload({ json: linktreeFixtureJson, username: "miguelangeles" })).toMatchObject({ props: { pageProps: { account: { username: "miguelangeles" } } } });
      expect(yield* parseBeaconsPayload({ payload: beaconsFixture, username: "creator" })).toEqual(beaconsFixture);
      expect(yield* parseInstagramPayload({ payload: instagramFixture, username: "creator" })).toEqual(instagramFixture);
      expect(yield* parseGitHubPayload({ payload: gitHubFixture, login: "octocat" })).toEqual(gitHubFixture);
      expect(yield* parseTikTokPayload({ payload: tikTokFixture, username: "creator" })).toEqual(tikTokFixture);
      expect(yield* parseYouTubePayload({ payload: youTubeFixture, handle: "creator" })).toEqual(youTubeFixture);
      expect(yield* parseTruthSocialPayload({ payload: truthSocialFixture, username: "creator" })).toEqual(truthSocialFixture);
    }),
  );

  it.effect("classifies unavailable and rate-limited GitHub responses", () =>
    Effect.gen(function* () {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
      const unavailable = yield* scrapeGitHub({ url: "https://github.com/octocat", token: "test-token" }).pipe(Effect.either);
      expect(unavailable).toMatchObject({ _tag: "Left", left: { code: "profile-unavailable" } });

      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
      const rateLimited = yield* scrapeGitHub({ url: "https://github.com/octocat", token: "test-token" }).pipe(Effect.either);
      expect(rateLimited).toMatchObject({ _tag: "Left", left: { code: "scrape-transient-failure", retryable: true } });
      vi.stubGlobal("fetch", SELF.fetch.bind(SELF));
    }),
  );

  it.effect("creates and retrieves a separate pending Linktree job", () =>
    Effect.gen(function* () {
      using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const submitted = getRight(yield* Effect.promise(async () => await api.submitScrape({ pageType: "linktree", url: "https://linktr.ee/miguelangeles" })));
      using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const job = getRight(yield* Effect.promise(async () => await readApi.getScrape(submitted.id)));
      expect(job).toMatchObject({ pageType: "linktree", url: "https://linktr.ee/miguelangeles", status: "pending", attemptCount: 0, error: null });
    }),
  );

  it.effect("creates and retrieves a separate pending Beacons job", () =>
    Effect.gen(function* () {
      using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const submitted = getRight(yield* Effect.promise(async () => await api.submitScrape({ pageType: "beacons", url: "https://beacons.ai/creator" })));
      using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(getRight(yield* Effect.promise(async () => await readApi.getScrape(submitted.id)))).toMatchObject({ pageType: "beacons", status: "pending", attemptCount: 0 });
    }),
  );

  it.effect("creates and retrieves a separate pending Instagram job", () =>
    Effect.gen(function* () {
      using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const submitted = getRight(yield* Effect.promise(async () => await api.submitScrape({ pageType: "instagram", url: "https://www.instagram.com/creator" })));
      using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(getRight(yield* Effect.promise(async () => await readApi.getScrape(submitted.id)))).toMatchObject({ pageType: "instagram", status: "pending", attemptCount: 0 });
    }),
  );

  it.effect("creates and retrieves a separate pending TikTok job", () =>
    Effect.gen(function* () {
      using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const submitted = getRight(yield* Effect.promise(async () => await api.submitScrape({ pageType: "tiktok", url: "https://www.tiktok.com/@creator" })));
      using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(getRight(yield* Effect.promise(async () => await readApi.getScrape(submitted.id)))).toMatchObject({ pageType: "tiktok", status: "pending", attemptCount: 0 });
    }),
  );

  it.effect("creates and retrieves a separate pending YouTube job", () =>
    Effect.gen(function* () {
      using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const submitted = getRight(yield* Effect.promise(async () => await api.submitScrape({ pageType: "youtube", url: "https://www.youtube.com/@creator" })));
      using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(getRight(yield* Effect.promise(async () => await readApi.getScrape(submitted.id)))).toMatchObject({ pageType: "youtube", status: "pending", attemptCount: 0 });
    }),
  );

  it.effect("creates and retrieves a separate pending Truth Social job", () =>
    Effect.gen(function* () {
      using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const submitted = getRight(yield* Effect.promise(async () => await api.submitScrape({ pageType: "truth-social", url: "https://truthsocial.com/@creator" })));
      using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(getRight(yield* Effect.promise(async () => await readApi.getScrape(submitted.id)))).toMatchObject({ pageType: "truth-social", status: "pending", attemptCount: 0 });
    }),
  );

  it.effect("rejects alternate provider URL forms and returns typed not-found", () =>
    Effect.gen(function* () {
      using linktreeApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(yield* Effect.promise(async () => await linktreeApi.submitScrape({ pageType: "linktree", url: "https://example.com/profile" }))).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
      using beaconsApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(yield* Effect.promise(async () => await beaconsApi.submitScrape({ pageType: "beacons", url: "https://creator.beacons.ai" }))).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
      using instagramApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(yield* Effect.promise(async () => await instagramApi.submitScrape({ pageType: "instagram", url: "https://instagram.com/creator" }))).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
      using gitHubApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(yield* Effect.promise(async () => await gitHubApi.submitScrape({ pageType: "github", url: "https://github.com/topics/effect" }))).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
      using tikTokApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(yield* Effect.promise(async () => await tikTokApi.submitScrape({ pageType: "tiktok", url: "https://www.tiktok.com/t/short" }))).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
      using youTubeApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(yield* Effect.promise(async () => await youTubeApi.submitScrape({ pageType: "youtube", url: "https://www.youtube.com/channel/123" }))).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
      using truthSocialApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(yield* Effect.promise(async () => await truthSocialApi.submitScrape({ pageType: "truth-social", url: "https://truthsocial.com/@creator/posts/1" }))).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
      using notFoundApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(yield* Effect.promise(async () => await notFoundApi.getScrape(crypto.randomUUID()))).toMatchObject({ _tag: "Left", left: { code: "scrape-job-not-found" } });
    }),
  );

  it.effect("retries two transient failures and terminates the third attempt", () =>
    Effect.gen(function* () {
      const id = crypto.randomUUID();
      const repo = env.SCRAPER_REPO.getByName("global");
      yield* Effect.promise(async () => await repo.createJob({ id, pageType: "linktree", url: "https://linktr.ee/miguelangeles" }));
      const body = { id, pageType: "linktree", url: "https://linktr.ee:1/miguelangeles" };

      yield* Effect.promise(async () =>
        // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
        await exports.default.queue("scraper-linktree", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body }]),
      );
      using firstReadApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(getRight(yield* Effect.promise(async () => await firstReadApi.getScrape(id)))).toMatchObject({ status: "pending", attemptCount: 1 });

      yield* Effect.promise(async () =>
        // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
        await exports.default.queue("scraper-linktree", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 2, body }]),
      );
      using secondReadApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      expect(getRight(yield* Effect.promise(async () => await secondReadApi.getScrape(id)))).toMatchObject({ status: "pending", attemptCount: 2 });

      yield* Effect.promise(async () =>
        // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
        await exports.default.queue("scraper-linktree", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 3, body }]),
      );
      using thirdReadApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const failed = getRight(yield* Effect.promise(async () => await thirdReadApi.getScrape(id)));
      expect(failed).toMatchObject({ status: "failed", attemptCount: 3, payload: null });
      expect(failed.error).not.toBeNull();
    }),
  );

  it.effect("fails a Queue and page-type mismatch on its first attempt", () =>
    Effect.gen(function* () {
      const id = crypto.randomUUID();
      const repo = env.SCRAPER_REPO.getByName("global");
      yield* Effect.promise(async () => await repo.createJob({ id, pageType: "truth-social", url: "https://truthsocial.com/@creator" }));
      yield* Effect.promise(async () =>
        // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
        await exports.default.queue("scraper-truth-social", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { id, pageType: "linktree", url: "https://linktr.ee/creator" } }]),
      );
      using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const failed = getRight(yield* Effect.promise(async () => await readApi.getScrape(id)));
      expect(failed).toMatchObject({ status: "failed", attemptCount: 1, payload: null });
      expect(failed.error).toContain("delivered to truth-social Queue");
    }),
  );

  it.effect("reuses pending and unexpired GitHub jobs, then replaces expired and failed jobs", () =>
    Effect.gen(function* () {
      using firstApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const first = getRight(yield* Effect.promise(async () => await firstApi.submitScrape({ pageType: "github", url: "https://github.com/OctoCat" })));
      using pendingApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const pending = getRight(yield* Effect.promise(async () => await pendingApi.submitScrape({ pageType: "github", url: "https://github.com/octocat/" })));
      expect(pending.id).toBe(first.id);

      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === "https://api.github.com/users/octocat") {
          const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
          expect(headers.get("authorization")).toBe("Bearer deterministic-test-token");
          expect(headers.get("accept")).toBe("application/vnd.github+json");
          expect(headers.get("user-agent")).toBe("qrk.sh-scraper");
          expect(headers.get("x-github-api-version")).toBe("2026-03-10");
          return new Response(JSON.stringify(gitHubFixture), { status: 200, headers: { "content-type": "application/json" } });
        }
        return SELF.fetch(input, init);
      }));
      yield* Effect.promise(async () =>
        // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
        await exports.default.queue("scraper-github", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { id: first.id, pageType: "github", url: "https://github.com/octocat" } }]),
      );
      vi.stubGlobal("fetch", SELF.fetch.bind(SELF));

      using completedApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const completed = getRight(yield* Effect.promise(async () => await completedApi.getScrape(first.id)));
      expect(completed).toMatchObject({ status: "completed", payload: gitHubFixture });
      expect(completed.expiredAt).toBeGreaterThan(Date.now());
      using freshApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const fresh = getRight(yield* Effect.promise(async () => await freshApi.submitScrape({ pageType: "github", url: "https://github.com/octocat" })));
      expect(fresh.id).toBe(first.id);

      const repo = env.SCRAPER_REPO.getByName("global");
      yield* Effect.promise(async () => await repo.completeJob({ id: first.id, payload: gitHubFixture, expiredAt: Date.now() - 1 }));
      using expiredApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const expiredReplacement = getRight(yield* Effect.promise(async () => await expiredApi.submitScrape({ pageType: "github", url: "https://github.com/octocat" })));
      expect(expiredReplacement.id).not.toBe(first.id);
      yield* Effect.promise(async () => await repo.failJob({ id: expiredReplacement.id, error: "forced deterministic failure" }));
      using failedApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
      const failedReplacement = getRight(yield* Effect.promise(async () => await failedApi.submitScrape({ pageType: "github", url: "https://github.com/octocat" })));
      expect(failedReplacement.id).not.toBe(expiredReplacement.id);
    }),
  );
});
