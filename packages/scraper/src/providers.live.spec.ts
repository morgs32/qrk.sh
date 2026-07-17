import { newHttpBatchRpcSession } from "capnweb";
import { SELF } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";

import type { ScraperApi } from "./ScraperApi";
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

it.skipIf(process.env.SCRAPER_LIVE_LINKTREE_URL === undefined)("scrapes a live Linktree profile", async () => {
  const url = process.env.SCRAPER_LIVE_LINKTREE_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_LINKTREE_URL is required");
  using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  const submitted = getRight(await api.submitScrape({ pageType: "linktree", url }));
  // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
  const queueResult = await exports.default.queue("scraper-linktree", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { id: submitted.id, pageType: "linktree", url } }]);
  expect(queueResult).toMatchObject({ outcome: "ok" });
  using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await readApi.getScrape(submitted.id))).toMatchObject({ status: "completed", pageType: "linktree" });
});

it.skipIf(process.env.SCRAPER_LIVE_BEACONS_URL === undefined)("scrapes a live Beacons profile", async () => {
  const url = process.env.SCRAPER_LIVE_BEACONS_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_BEACONS_URL is required");
  using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  const submitted = getRight(await api.submitScrape({ pageType: "beacons", url }));
  // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
  const queueResult = await exports.default.queue("scraper-beacons", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { id: submitted.id, pageType: "beacons", url } }]);
  expect(queueResult).toMatchObject({ outcome: "ok" });
  using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await readApi.getScrape(submitted.id))).toMatchObject({ status: "completed", pageType: "beacons" });
});

it.skipIf(process.env.SCRAPER_LIVE_INSTAGRAM_URL === undefined)("scrapes a live Instagram profile", async () => {
  const url = process.env.SCRAPER_LIVE_INSTAGRAM_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_INSTAGRAM_URL is required");
  using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  const submitted = getRight(await api.submitScrape({ pageType: "instagram", url }));
  // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
  const queueResult = await exports.default.queue("scraper-instagram", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { id: submitted.id, pageType: "instagram", url } }]);
  expect(queueResult).toMatchObject({ outcome: "ok" });
  using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await readApi.getScrape(submitted.id))).toMatchObject({ status: "completed", pageType: "instagram" });
});

it.skipIf(process.env.SCRAPER_LIVE_TIKTOK_URL === undefined)("scrapes a live TikTok profile", async () => {
  const url = process.env.SCRAPER_LIVE_TIKTOK_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_TIKTOK_URL is required");
  using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  const submitted = getRight(await api.submitScrape({ pageType: "tiktok", url }));
  // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
  const queueResult = await exports.default.queue("scraper-tiktok", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { id: submitted.id, pageType: "tiktok", url } }]);
  expect(queueResult).toMatchObject({ outcome: "ok" });
  using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await readApi.getScrape(submitted.id))).toMatchObject({ status: "completed", pageType: "tiktok" });
});

it.skipIf(process.env.SCRAPER_LIVE_YOUTUBE_URL === undefined)("scrapes a live YouTube channel", async () => {
  const url = process.env.SCRAPER_LIVE_YOUTUBE_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_YOUTUBE_URL is required");
  using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  const submitted = getRight(await api.submitScrape({ pageType: "youtube", url }));
  // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
  const queueResult = await exports.default.queue("scraper-youtube", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { id: submitted.id, pageType: "youtube", url } }]);
  expect(queueResult).toMatchObject({ outcome: "ok" });
  using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await readApi.getScrape(submitted.id))).toMatchObject({ status: "completed", pageType: "youtube" });
});

it.skipIf(process.env.SCRAPER_LIVE_TRUTH_SOCIAL_URL === undefined)("scrapes a live Truth Social profile", async () => {
  const url = process.env.SCRAPER_LIVE_TRUTH_SOCIAL_URL;
  if (url === undefined) throw new Error("SCRAPER_LIVE_TRUTH_SOCIAL_URL is required");
  using api = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  const submitted = getRight(await api.submitScrape({ pageType: "truth-social", url }));
  // @ts-expect-error -- Enabled in tests by service_binding_extra_handlers.
  const queueResult = await exports.default.queue("scraper-truth-social", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { id: submitted.id, pageType: "truth-social", url } }]);
  expect(queueResult).toMatchObject({ outcome: "ok" });
  using readApi = newHttpBatchRpcSession<ScraperApi>(RPC_URL);
  expect(getRight(await readApi.getScrape(submitted.id))).toMatchObject({ status: "completed", pageType: "truth-social" });
});
