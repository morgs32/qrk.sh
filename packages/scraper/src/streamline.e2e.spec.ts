import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScraperApi } from "./ScraperApi";

const RPC_URL = "http://scraper.invalid/";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", SELF.fetch.bind(SELF));
});

describe("Streamline repository", () => {
  it("returns one requested page of icon search metadata", async () => {
    let upstreamRequests = 0;
    const upstreamFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url.startsWith("https://public-api.streamlinehq.com/v1/search/global")) {
        upstreamRequests += 1;
        const parsedUrl = new URL(url);
        expect(parsedUrl.searchParams.get("productType")).toBe("icons");
        expect(parsedUrl.searchParams.get("productTier")).toBe("free");
        expect(parsedUrl.searchParams.get("query")).toBe("home");
        expect(parsedUrl.searchParams.get("offset")).toBe("24");
        expect(parsedUrl.searchParams.get("limit")).toBe("24");
        expect(new Headers(init?.headers).get("x-api-key")).toBe(
          "deterministic-streamline-test-key",
        );

        return new Response(
          JSON.stringify({
            query: "home",
            results: [
              {
                hash: "ico_home123",
                name: "Home",
                imagePreviewUrl: "https://assets.streamlinehq.com/home.png",
                familyName: "Core Line",
                isFree: true,
              },
            ],
            pagination: { total: 49, hasMore: true, offset: 24, nextOffset: 48 },
          }),
        );
      }

      return SELF.fetch(input, init);
    });
    vi.stubGlobal("fetch", upstreamFetch);

    using api = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(api.streamlineRepo().search(" home ", 24, 24)).resolves.toEqual({
      _tag: "Right",
      right: {
        query: "home",
        results: [
          {
            hash: "ico_home123",
            name: "Home",
            imagePreviewUrl: "https://assets.streamlinehq.com/home.png",
            familyName: "Core Line",
            isFree: true,
          },
        ],
        pagination: { total: 49, hasMore: true, offset: 24, nextOffset: 48 },
      },
    });
    expect(upstreamRequests).toBe(1);
  });

  it("downloads SVG data only after an icon hash is selected", async () => {
    let upstreamRequests = 0;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 12h18"/></svg>';
    const upstreamFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url === "https://public-api.streamlinehq.com/v1/icons/ico_home123") {
        upstreamRequests += 1;
        expect(new Headers(init?.headers).get("x-api-key")).toBe(
          "deterministic-streamline-test-key",
        );
        return new Response(JSON.stringify({ hash: "ico_home123", name: "Home" }));
      }

      if (url.startsWith("https://public-api.streamlinehq.com/v1/icons/ico_home123/download/svg")) {
        upstreamRequests += 1;
        const parsedUrl = new URL(url);
        expect(parsedUrl.searchParams.get("size")).toBe("48");
        expect(parsedUrl.searchParams.get("responsive")).toBe("true");
        expect(parsedUrl.searchParams.get("strokeToFill")).toBe("false");
        return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
      }

      return SELF.fetch(input, init);
    });
    vi.stubGlobal("fetch", upstreamFetch);

    using api = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(api.streamlineRepo().getSvg("ico_home123")).resolves.toEqual({
      _tag: "Right",
      right: { hash: "ico_home123", name: "Home", svg },
    });
    expect(upstreamRequests).toBe(2);
  });

  it("rejects invalid search pagination and invalid icon hashes without upstream requests", async () => {
    let upstreamRequests = 0;
    const upstreamFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://public-api.streamlinehq.com/")) {
        upstreamRequests += 1;
      }
      return SELF.fetch(input, init);
    });
    vi.stubGlobal("fetch", upstreamFetch);

    using searchApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(searchApi.streamlineRepo().search("home", -1, 24)).resolves.toMatchObject({
      _tag: "Left",
      left: { code: "invalid-scrape-request" },
    });

    using svgApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(svgApi.streamlineRepo().getSvg("not-an-icon-hash")).resolves.toMatchObject({
      _tag: "Left",
      left: { code: "invalid-scrape-request" },
    });
    expect(upstreamRequests).toBe(0);
  });
});
