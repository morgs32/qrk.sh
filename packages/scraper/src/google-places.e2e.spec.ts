import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScraperApi } from "./ScraperApi";

const RPC_URL = "http://scraper.invalid/";

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", SELF.fetch.bind(SELF));
});

describe("Google Places repository", () => {
  it("maps any-place autocomplete predictions without caching queries", async () => {
    let upstreamCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === "https://places.googleapis.com/v1/places:autocomplete") {
          upstreamCalls += 1;
          return new Response(
            JSON.stringify({
              suggestions: [
                {
                  placePrediction: {
                    placeId: "chicago-place-id",
                    text: { text: "Chicago, IL, USA" },
                    structuredFormat: {
                      mainText: { text: "Chicago" },
                      secondaryText: { text: "Illinois, USA" },
                    },
                  },
                },
                { queryPrediction: { text: { text: "Chicago weather" } } },
              ],
            }),
          );
        }

        return SELF.fetch(input, init);
      }),
    );

    using firstApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const first = await firstApi.googlePlacesRepo().autocomplete("  Chicago  ");
    expect(first).toEqual({
      _tag: "Right",
      right: [
        {
          placeId: "chicago-place-id",
          description: "Chicago, IL, USA",
          mainText: "Chicago",
          secondaryText: "Illinois, USA",
        },
      ],
    });

    using secondApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(secondApi.googlePlacesRepo().autocomplete("Chicago")).resolves.toEqual(first);
    expect(upstreamCalls).toBe(2);

    using shortQueryApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(shortQueryApi.googlePlacesRepo().autocomplete(" C ")).resolves.toEqual({
      _tag: "Right",
      right: [],
    });
    expect(upstreamCalls).toBe(2);
  });

  it("maps and caches place details while coalescing the first request", async () => {
    let upstreamCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith("/coalesced-chicago-place")) {
          upstreamCalls += 1;
          await Promise.resolve();
          return new Response(
            JSON.stringify({
              id: "coalesced-chicago-place",
              displayName: { text: "Downtown Chicago" },
              formattedAddress: "100 W Monroe St, Chicago, IL 60603, USA",
              location: { latitude: 41.8807, longitude: -87.6319 },
            }),
          );
        }

        return SELF.fetch(input, init);
      }),
    );

    const repo = env.GOOGLE_PLACES_REPO.getByName("global");
    const firstPromise = repo.getPlace("coalesced-chicago-place");
    const secondPromise = repo.getPlace("coalesced-chicago-place");
    const first = await firstPromise;
    const second = await secondPromise;

    expect(first).toEqual({
      _tag: "Right",
      right: {
        googlePlaceId: "coalesced-chicago-place",
        name: "Downtown Chicago",
        address: "100 W Monroe St, Chicago, IL 60603, USA",
        latitude: 41.8807,
        longitude: -87.6319,
      },
    });
    expect(second).toEqual(first);
    expect(upstreamCalls).toBe(1);

    using cachedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(cachedApi.googlePlacesRepo().getPlace("coalesced-chicago-place")).resolves.toEqual(
      first,
    );
    expect(upstreamCalls).toBe(1);
  });

  it("serves stale details while one background refresh replaces the cache", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-18T00:00:00.000Z"));
    let upstreamCalls = 0;
    let releaseRefresh: (() => void) | undefined;
    const refreshBlocked = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith("/stale-chicago-place")) {
          upstreamCalls += 1;
          if (upstreamCalls === 2) {
            await refreshBlocked;
          }
          return new Response(
            JSON.stringify({
              id: "stale-chicago-place",
              displayName: { text: upstreamCalls === 1 ? "Old Chicago" : "New Chicago" },
              formattedAddress: "100 W Monroe St, Chicago, IL 60603, USA",
              location: { latitude: 41.8807, longitude: -87.6319 },
            }),
          );
        }

        return SELF.fetch(input, init);
      }),
    );

    using initialApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      initialApi.googlePlacesRepo().getPlace("stale-chicago-place"),
    ).resolves.toMatchObject({ _tag: "Right", right: { name: "Old Chicago" } });

    vi.setSystemTime(new Date("2026-07-19T00:00:00.001Z"));
    const staleRepo = env.GOOGLE_PLACES_REPO.getByName("global");
    await expect(staleRepo.getPlace("stale-chicago-place")).resolves.toMatchObject({
      _tag: "Right",
      right: { name: "Old Chicago" },
    });
    await expect(staleRepo.getPlace("stale-chicago-place")).resolves.toMatchObject({
      _tag: "Right",
      right: { name: "Old Chicago" },
    });
    expect(upstreamCalls).toBe(2);

    releaseRefresh?.();
    await vi.waitFor(() => expect(upstreamCalls).toBe(2));

    using refreshedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      refreshedApi.googlePlacesRepo().getPlace("stale-chicago-place"),
    ).resolves.toMatchObject({ _tag: "Right", right: { name: "New Chicago" } });
  });

  it("returns typed failures for invalid input, provider errors, and malformed details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith("/unavailable-place")) {
          return new Response(null, { status: 404 });
        }
        if (url.endsWith("/malformed-place")) {
          return new Response(JSON.stringify({ id: "malformed-place" }));
        }

        return SELF.fetch(input, init);
      }),
    );

    using invalidApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(invalidApi.googlePlacesRepo().getPlace("  ")).resolves.toMatchObject({
      _tag: "Left",
      left: { code: "invalid-scrape-request" },
    });

    using unavailableApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      unavailableApi.googlePlacesRepo().getPlace("unavailable-place"),
    ).resolves.toMatchObject({ _tag: "Left", left: { code: "place-unavailable" } });

    using malformedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      malformedApi.googlePlacesRepo().getPlace("malformed-place"),
    ).resolves.toMatchObject({ _tag: "Left", left: { code: "unsupported-page-shape" } });
  });
});
