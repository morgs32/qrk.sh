import { it } from "@effect/vitest";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { env, SELF } from "cloudflare:test";
import { Effect } from "effect";
import { beforeEach, describe, expect, vi } from "vitest";

import type { ScraperApi } from "./ScraperApi";
import {
  beaconsFixture,
  gitHubFixture,
  instagramFixture,
  linktreeFixtureJson,
  tikTokFixture,
  truthSocialFixture,
  youTubeFixture,
} from "./providerFixtures";
import { parseBeaconsPayload } from "./scrapeBeacons";
import { parseInstagramPayload } from "./scrapeInstagram";
import { parseGitHubPayload } from "./scrapeGitHub";
import { parseLinktreePayload } from "./scrapeLinktree";
import { parseTikTokPayload } from "./scrapeTikTok";
import { parseTruthSocialPayload } from "./scrapeTruthSocial";
import { parseYouTubePayload } from "./scrapeYouTube";
import type { IRpcEither } from "./types";

const launchMock = vi.hoisted(() => vi.fn());

vi.mock("@cloudflare/puppeteer", () => ({
  default: { launch: launchMock },
}));

const RPC_URL = "http://scraper.invalid/";

const getRight = <RIGHT>(either: IRpcEither<RIGHT>): RIGHT => {
  if (either._tag === "Left") {
    throw new Error(`${either.left.code}: ${either.left.message}`);
  }
  return either.right;
};

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  launchMock.mockReset();
  vi.stubGlobal("fetch", SELF.fetch.bind(SELF));
});

describe("origin-specific scraper repositories", () => {
  it.effect("retains each complete provider fixture behind its named payload contract", () =>
    Effect.gen(function* () {
      expect(yield* parseLinktreePayload({ json: linktreeFixtureJson, username: "miguelangeles" })).toMatchObject({ props: { pageProps: { account: { username: "miguelangeles" }, links: [{ title: "Example" }] } } });
      expect(yield* parseBeaconsPayload({ payload: beaconsFixture, username: "creator" })).toEqual(beaconsFixture);
      expect(yield* parseInstagramPayload({ payload: instagramFixture, username: "creator" })).toEqual(instagramFixture);
      expect(yield* parseGitHubPayload({ payload: gitHubFixture, login: "octocat" })).toEqual(gitHubFixture);
      expect(yield* parseTikTokPayload({ payload: tikTokFixture, username: "creator" })).toEqual(tikTokFixture);
      expect(yield* parseYouTubePayload({ payload: youTubeFixture, handle: "creator" })).toEqual(youTubeFixture);
      expect(yield* parseTruthSocialPayload({ payload: truthSocialFixture, username: "creator" })).toEqual(truthSocialFixture);
    }),
  );

  it("returns typed invalid-URL failures from every explicit repo accessor", async () => {
    using linktreeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(await linktreeApi.linktreeRepo().scrape("https://example.com/profile")).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
    using beaconsApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(await beaconsApi.beaconsRepo().scrape("https://creator.beacons.ai")).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
    using instagramApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(await instagramApi.instagramRepo().scrape("https://instagram.com/creator")).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
    using gitHubApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(await gitHubApi.githubRepo().scrape("https://github.com/topics/effect")).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
    using tikTokApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(await tikTokApi.tiktokRepo().scrape("https://www.tiktok.com/t/short")).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
    using youTubeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(await youTubeApi.youtubeRepo().scrape("https://www.youtube.com/channel/123")).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
    using truthSocialApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(await truthSocialApi.truthSocialRepo().scrape("https://truthsocial.com/@creator/posts/1")).toMatchObject({ _tag: "Left", left: { code: "invalid-scrape-request" } });
  });

  it("scrapes and caches all five browser origins through one lazy BrowserHost", async () => {
    let browserDisconnected: (() => void) | undefined;
    const browser = {
      connected: true,
      newPage: vi.fn(async () => {
        let currentUrl = "";
        return {
          goto: vi.fn(async (url: string) => {
            currentUrl = url;
          }),
          $eval: vi.fn(async (selector: string) => {
            if (currentUrl.includes("linktr.ee")) return linktreeFixtureJson;
            if (currentUrl.includes("beacons.ai")) return JSON.stringify(beaconsFixture.data);
            if (currentUrl.includes("tiktok.com")) return JSON.stringify(tikTokFixture.data);
            if (currentUrl.includes("youtube.com") && selector === "link[rel='canonical']") return currentUrl;
            return null;
          }),
          $$eval: vi.fn(async () => [JSON.stringify(instagramFixture.data)]),
          title: vi.fn(async () => "Public profile"),
          waitForFunction: vi.fn(async () => undefined),
          evaluate: vi.fn(async () => youTubeFixture.data),
          close: vi.fn(async () => undefined),
        };
      }),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === "disconnected") browserDisconnected = callback;
        return browser;
      }),
    };
    launchMock.mockResolvedValue(browser);
    using linktreeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const linktree = getRight(await linktreeApi.linktreeRepo().scrape("https://linktr.ee/miguelangeles/?source=test"));
    expect(linktree.props.pageProps.account.username).toBe("miguelangeles");
    using beaconsApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await beaconsApi.beaconsRepo().scrape("https://beacons.ai/creator/?source=test"))).toMatchObject({ username: "creator", source: "embedded" });
    using instagramApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await instagramApi.instagramRepo().scrape("https://www.instagram.com/creator/?source=test"))).toMatchObject({ username: "creator" });
    using tikTokApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await tikTokApi.tiktokRepo().scrape("https://www.tiktok.com/@creator/?source=test"))).toMatchObject({ username: "creator" });
    using youTubeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await youTubeApi.youtubeRepo().scrape("https://www.youtube.com/@creator/?source=test"))).toMatchObject({ handle: "creator" });

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(browser.newPage).toHaveBeenCalledTimes(5);

    using cachedLinktreeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await cachedLinktreeApi.linktreeRepo().scrape("https://linktr.ee/miguelangeles"))).toMatchObject({ props: { pageProps: { account: { username: "miguelangeles" } } } });
    using cachedBeaconsApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await cachedBeaconsApi.beaconsRepo().scrape("https://beacons.ai/creator"))).toMatchObject({ username: "creator" });
    using cachedInstagramApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await cachedInstagramApi.instagramRepo().scrape("https://www.instagram.com/creator"))).toMatchObject({ username: "creator" });
    using cachedTikTokApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await cachedTikTokApi.tiktokRepo().scrape("https://www.tiktok.com/@creator"))).toMatchObject({ username: "creator" });
    using cachedYouTubeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await cachedYouTubeApi.youtubeRepo().scrape("https://www.youtube.com/@creator"))).toMatchObject({ handle: "creator" });
    expect(browser.newPage).toHaveBeenCalledTimes(5);
    let secondBrowserDisconnected: (() => void) | undefined;
    const secondBrowser = {
      connected: true,
      newPage: vi.fn(async () => {
        let currentUrl = "";
        return {
          goto: vi.fn(async (url: string) => {
            currentUrl = url;
          }),
          $eval: vi.fn(async () => currentUrl.includes("linktr.ee") ? JSON.stringify({ props: { pageProps: { account: { username: "browser-reconnected" } } } }) : null),
          $$eval: vi.fn(async () => []),
          title: vi.fn(async () => "Public profile"),
          waitForFunction: vi.fn(async () => undefined),
          evaluate: vi.fn(async () => ({})),
          close: vi.fn(async () => undefined),
        };
      }),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === "disconnected") secondBrowserDisconnected = callback;
        return secondBrowser;
      }),
    };
    browser.connected = false;
    browserDisconnected?.();
    launchMock.mockResolvedValue(secondBrowser);
    using reconnectedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await reconnectedApi.linktreeRepo().scrape("https://linktr.ee/browser-reconnected"))).toMatchObject({ props: { pageProps: { account: { username: "browser-reconnected" } } } });

    expect(launchMock).toHaveBeenCalledTimes(2);
    expect(secondBrowser.newPage).toHaveBeenCalledTimes(1);
    secondBrowser.connected = false;
    secondBrowserDisconnected?.();
  });

  it("coalesces concurrent first GitHub scrapes and serves canonical fresh cache hits", async () => {
    let upstreamCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://api.github.com/users/coalesced") {
        upstreamCalls += 1;
        await Promise.resolve();
        return new Response(JSON.stringify({ ...gitHubFixture, login: "coalesced" }), { status: 200 });
      }
      return SELF.fetch(input, init);
    }));
    const repo = env.GITHUB_REPO.getByName("global");
    const firstPromise = repo.scrape("https://github.com/Coalesced/?source=first");
    const secondPromise = repo.scrape("https://github.com/coalesced");
    const first = getRight(await firstPromise);
    const second = getRight(await secondPromise);

    expect(first).toMatchObject({ login: "coalesced" });
    expect(second).toMatchObject({ login: "coalesced" });
    expect(upstreamCalls).toBe(1);
    using cachedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await cachedApi.githubRepo().scrape("https://github.com/coalesced/"))).toMatchObject({ login: "coalesced" });
    expect(upstreamCalls).toBe(1);
  });

  it("serves stale GitHub data while one background refresh replaces it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-18T00:00:00.000Z"));
    let upstreamCalls = 0;
    let releaseRefresh: (() => void) | undefined;
    const refreshBlocked = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://api.github.com/users/stale-refresh") {
        upstreamCalls += 1;
        if (upstreamCalls === 2) await refreshBlocked;
        return new Response(JSON.stringify({ ...gitHubFixture, login: "stale-refresh", name: upstreamCalls === 1 ? "Old" : "New" }), { status: 200 });
      }
      return SELF.fetch(input, init);
    }));
    using api = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await api.githubRepo().scrape("https://github.com/stale-refresh"))).toMatchObject({ name: "Old" });

    vi.setSystemTime(new Date("2026-07-19T00:00:00.001Z"));
    const staleRepo = env.GITHUB_REPO.getByName("global");
    const firstStale = getRight(await staleRepo.scrape("https://github.com/stale-refresh"));
    const secondStale = getRight(await staleRepo.scrape("https://github.com/stale-refresh"));
    expect(firstStale).toMatchObject({ name: "Old" });
    expect(secondStale).toMatchObject({ name: "Old" });
    expect(upstreamCalls).toBe(2);
    releaseRefresh?.();
    await vi.waitFor(() => expect(upstreamCalls).toBe(2));
    using refreshedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await refreshedApi.githubRepo().scrape("https://github.com/stale-refresh"))).toMatchObject({ name: "New" });
  });

  it("logs a failed background refresh and retains stale GitHub data indefinitely", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-18T00:00:00.000Z"));
    let upstreamCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://api.github.com/users/stale-failure") {
        upstreamCalls += 1;
        if (upstreamCalls === 1) return new Response(JSON.stringify({ ...gitHubFixture, login: "stale-failure", name: "Last success" }), { status: 200 });
        return new Response(null, { status: 500 });
      }
      return SELF.fetch(input, init);
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    using api = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await api.githubRepo().scrape("https://github.com/stale-failure"))).toMatchObject({ name: "Last success" });

    vi.setSystemTime(new Date("2026-08-18T00:00:00.000Z"));
    using staleApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await staleApi.githubRepo().scrape("https://github.com/stale-failure"))).toMatchObject({ name: "Last success" });
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(consoleError.mock.calls[0]?.[0]).toContain("scraper-background-refresh-failed");
    using retainedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await retainedApi.githubRepo().scrape("https://github.com/stale-failure"))).toMatchObject({ name: "Last success" });
  });

  it("does not cache a failed first GitHub scrape", async () => {
    let upstreamCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://api.github.com/users/not-cached-failure") {
        upstreamCalls += 1;
        if (upstreamCalls === 1) return new Response(null, { status: 500 });
        return new Response(JSON.stringify({ ...gitHubFixture, login: "not-cached-failure" }), { status: 200 });
      }
      return SELF.fetch(input, init);
    }));
    using api = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(await api.githubRepo().scrape("https://github.com/not-cached-failure")).toMatchObject({ _tag: "Left", left: { code: "scrape-transient-failure" } });
    using retryApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await retryApi.githubRepo().scrape("https://github.com/not-cached-failure"))).toMatchObject({ login: "not-cached-failure" });
    expect(upstreamCalls).toBe(2);
  });

  it("scrapes and caches Truth Social directly without BrowserHost", async () => {
    let upstreamCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === "https://truthsocial.com/api/v1/accounts/lookup?acct=direct-origin") {
        upstreamCalls += 1;
        return new Response(JSON.stringify({ ...truthSocialFixture, username: "direct-origin", acct: "direct-origin" }), { status: 200 });
      }
      return SELF.fetch(input, init);
    }));
    using api = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await api.truthSocialRepo().scrape("https://truthsocial.com/@direct-origin/?source=test"))).toMatchObject({ username: "direct-origin" });
    using cachedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await cachedApi.truthSocialRepo().scrape("https://truthsocial.com/@direct-origin"))).toMatchObject({ username: "direct-origin" });
    expect(upstreamCalls).toBe(1);
    expect(launchMock).not.toHaveBeenCalled();
  });
});
