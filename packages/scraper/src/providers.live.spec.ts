import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { env, SELF } from "cloudflare:test";
import { beforeAll, expect, it, vi } from "vitest";

import type { ScraperApi } from "./ScraperApi";
import type { IRpcEither } from "./types";

const RPC_URL = "http://scraper.invalid/";
const upstreamFetch = fetch;

beforeAll(() => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(RPC_URL)) return SELF.fetch(input, init);
    return upstreamFetch(input, init);
  });
});

const getRight = <RIGHT>(either: IRpcEither<RIGHT>): RIGHT => {
  if (either._tag === "Left") throw new Error(`${either.left.code}: ${either.left.message}`);
  return either.right;
};

it.skipIf(process.env.SCRAPER_LIVE_LINKTREE_URL === undefined)("scrapes a live Linktree profile", async () => {
  const url = process.env.SCRAPER_LIVE_LINKTREE_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_LINKTREE_URL is required");
  using api = newSyncRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await api.linktreeRepo().scrape(url))).toHaveProperty("props.pageProps.account.username");
});

it.skipIf(process.env.SCRAPER_LIVE_BEACONS_URL === undefined)("scrapes a live Beacons profile", async () => {
  const url = process.env.SCRAPER_LIVE_BEACONS_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_BEACONS_URL is required");
  using api = newSyncRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await api.beaconsRepo().scrape(url))).toHaveProperty("username");
});

it.skipIf(process.env.SCRAPER_LIVE_INSTAGRAM_URL === undefined)("scrapes a live Instagram profile", async () => {
  const url = process.env.SCRAPER_LIVE_INSTAGRAM_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_INSTAGRAM_URL is required");
  using api = newSyncRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await api.instagramRepo().scrape(url))).toHaveProperty("username");
});

it.skipIf(process.env.SCRAPER_LIVE_TIKTOK_URL === undefined)("scrapes a live TikTok profile", async () => {
  const url = process.env.SCRAPER_LIVE_TIKTOK_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_TIKTOK_URL is required");
  using api = newSyncRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await api.tiktokRepo().scrape(url))).toHaveProperty("username");
});

it.skipIf(process.env.SCRAPER_LIVE_YOUTUBE_URL === undefined)("scrapes a live YouTube channel", async () => {
  const url = process.env.SCRAPER_LIVE_YOUTUBE_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_YOUTUBE_URL is required");
  using api = newSyncRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await api.youtubeRepo().scrape(url))).toHaveProperty("handle");
});

it.skipIf(process.env.SCRAPER_LIVE_TRUTH_SOCIAL_URL === undefined)("scrapes a live Truth Social profile", async () => {
  const url = process.env.SCRAPER_LIVE_TRUTH_SOCIAL_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_TRUTH_SOCIAL_URL is required");
  using api = newSyncRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await api.truthSocialRepo().scrape(url))).toHaveProperty("username");
});

it.skipIf(env.GITHUB_TOKEN === "missing-live-github-token" || env.SCRAPER_LIVE_GITHUB_URL === "missing-live-github-url")("scrapes a live GitHub profile", async () => {
  const url = env.SCRAPER_LIVE_GITHUB_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_GITHUB_URL is required");
  using api = newSyncRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await api.githubRepo().getProfile(url))).toHaveProperty("login");
});
