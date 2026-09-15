import { it } from "@effect/vitest";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { SELF } from "cloudflare:test";
import { Effect } from "effect";
import { beforeEach, describe, expect, vi } from "vite-plus/test";

import type { ScraperApi } from "./ScraperApi.public";
import { linktreeFixtureJson } from "./providerFixtures";
import { parseLinktreePayload } from "./scrapeLinktree";
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

describe("Linktree scraper repository", () => {
  it.effect("retains the complete Linktree fixture behind its named payload contract", () =>
    Effect.gen(function* () {
      expect(
        yield* parseLinktreePayload({ json: linktreeFixtureJson, username: "miguelangeles" }),
      ).toMatchObject({
        props: {
          pageProps: { account: { username: "miguelangeles" }, links: [{ title: "Example" }] },
        },
      });
    }),
  );

  it("returns typed invalid-URL failures from linktreeRepo", async () => {
    using api = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(await api.linktreeRepo().scrape("https://example.com/profile")).toMatchObject({
      _tag: "Left",
      left: { code: "invalid-scrape-request" },
    });
  });

  it("scrapes and caches Linktree through one lazy BrowserHost", async () => {
    let browserDisconnected: (() => void) | undefined;
    const browser = {
      connected: true,
      newPage: vi.fn(async () => {
        let currentUrl = "";
        return {
          goto: vi.fn(async (url: string) => {
            currentUrl = url;
          }),
          $eval: vi.fn(async () => {
            if (currentUrl.includes("linktr.ee")) return linktreeFixtureJson;
            return null;
          }),
          close: vi.fn(async () => undefined),
        };
      }),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === "disconnected") browserDisconnected = callback;
        return browser;
      }),
    };
    launchMock.mockResolvedValue(browser);
    using api = newSyncRpcSession<ScraperApi>(RPC_URL);
    const linktree = getRight(
      await api.linktreeRepo().scrape("https://linktr.ee/miguelangeles/?source=test"),
    );
    expect(linktree.props.pageProps.account.username).toBe("miguelangeles");
    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(browser.newPage).toHaveBeenCalledTimes(1);

    using cachedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    expect(
      getRight(await cachedApi.linktreeRepo().scrape("https://linktr.ee/miguelangeles")),
    ).toMatchObject({ props: { pageProps: { account: { username: "miguelangeles" } } } });
    expect(browser.newPage).toHaveBeenCalledTimes(1);

    let secondBrowserDisconnected: (() => void) | undefined;
    const secondBrowser = {
      connected: true,
      newPage: vi.fn(async () => {
        let currentUrl = "";
        return {
          goto: vi.fn(async (url: string) => {
            currentUrl = url;
          }),
          $eval: vi.fn(async () =>
            currentUrl.includes("linktr.ee")
              ? JSON.stringify({
                  props: { pageProps: { account: { username: "browser-reconnected" } } },
                })
              : null,
          ),
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
    expect(
      getRight(await reconnectedApi.linktreeRepo().scrape("https://linktr.ee/browser-reconnected")),
    ).toMatchObject({ props: { pageProps: { account: { username: "browser-reconnected" } } } });

    expect(launchMock).toHaveBeenCalledTimes(2);
    expect(secondBrowser.newPage).toHaveBeenCalledTimes(1);
    secondBrowser.connected = false;
    secondBrowserDisconnected?.();
  });
});
