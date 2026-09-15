import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { SELF } from "cloudflare:test";
import { beforeAll, expect, it, vi } from "vite-plus/test";

import type { ScraperApi } from "./ScraperApi.public";
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

it.skipIf(process.env.SCRAPER_LIVE_LINKTREE_URL === undefined)(
  "scrapes a live Linktree profile",
  async () => {
    const url = process.env.SCRAPER_LIVE_LINKTREE_URL;
    if (url === undefined) throw new Error("SCRAPER_LIVE_LINKTREE_URL is required");
    using api = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(getRight(await api.linktreeRepo().scrape(url))).toHaveProperty(
      "props.pageProps.account.username",
    );
  },
);
