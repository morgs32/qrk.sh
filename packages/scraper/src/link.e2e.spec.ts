import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScraperApi } from "./ScraperApi";

const RPC_URL = "http://scraper.invalid/";

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", SELF.fetch.bind(SELF));
});

describe("Link repository", () => {
  it("prefers JSON-LD fields and resolves relative image and icon URLs", async () => {
    let upstreamCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === "https://example.com/json-ld-preview") {
          upstreamCalls += 1;
          return new Response(
            `<!doctype html>
<html>
  <head>
    <title>Document title</title>
    <link rel="icon" href="/icon.png">
    <meta property="og:title" content="Open Graph title">
    <meta property="og:description" content="Open Graph description">
    <meta property="og:site_name" content="Open Graph site">
    <meta property="og:image" content="/open-graph.png">
    <script type="application/ld+json">
      {
        "name": "JSON-LD title",
        "description": "JSON-LD description",
        "publisher": { "name": "JSON-LD site" },
        "image": "/json-ld.png"
      }
    </script>
  </head>
</html>`,
            { headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }

        return SELF.fetch(input, init);
      }),
    );

    using firstApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      firstApi.linkRepo().getPreview("https://example.com/json-ld-preview#details"),
    ).resolves.toEqual({
      _tag: "Right",
      right: {
        url: "https://example.com/json-ld-preview",
        title: "JSON-LD title",
        description: "JSON-LD description",
        siteName: "JSON-LD site",
        imageUrl: "https://example.com/json-ld.png",
        iconUrl: "https://example.com/icon.png",
      },
    });

    using cachedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      cachedApi.linkRepo().getPreview("https://example.com/json-ld-preview"),
    ).resolves.toMatchObject({ _tag: "Right", right: { title: "JSON-LD title" } });
    expect(upstreamCalls).toBe(1);
  });

  it("falls back through Open Graph, the document title, hostname, and favicon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === "https://opengraph.example/article") {
          return new Response(
            `<!doctype html>
<html>
  <head>
    <title>Document fallback</title>
    <meta property="og:title" content="Open Graph title">
    <meta property="og:description" content="Open Graph description">
    <meta property="og:image" content="https://cdn.example/preview.jpg">
    <script type="application/ld+json">not valid JSON</script>
  </head>
</html>`,
            { headers: { "content-type": "text/html" } },
          );
        }

        if (url === "https://document.example/article") {
          return new Response("<html><head><title>Document title only</title></head></html>", {
            headers: { "content-type": "text/html" },
          });
        }

        return SELF.fetch(input, init);
      }),
    );

    using openGraphApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      openGraphApi.linkRepo().getPreview("https://opengraph.example/article"),
    ).resolves.toEqual({
      _tag: "Right",
      right: {
        url: "https://opengraph.example/article",
        title: "Open Graph title",
        description: "Open Graph description",
        siteName: "opengraph.example",
        imageUrl: "https://cdn.example/preview.jpg",
        iconUrl: "https://opengraph.example/favicon.ico",
      },
    });

    using documentApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      documentApi.linkRepo().getPreview("https://document.example/article"),
    ).resolves.toMatchObject({
      _tag: "Right",
      right: {
        title: "Document title only",
        description: "",
        imageUrl: "",
      },
    });
  });

  it("returns typed failures for invalid URLs, unavailable pages, non-HTML, and missing titles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === "https://example.com/missing") {
          return new Response(null, { status: 404 });
        }
        if (url === "https://example.com/image") {
          return new Response("image", { headers: { "content-type": "image/png" } });
        }
        if (url === "https://example.com/no-title") {
          return new Response("<html><head></head></html>", {
            headers: { "content-type": "text/html" },
          });
        }

        return SELF.fetch(input, init);
      }),
    );

    using invalidApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      invalidApi.linkRepo().getPreview("file:///tmp/preview.html"),
    ).resolves.toMatchObject({
      _tag: "Left",
      left: { code: "invalid-scrape-request" },
    });

    using missingApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      missingApi.linkRepo().getPreview("https://example.com/missing"),
    ).resolves.toMatchObject({
      _tag: "Left",
      left: { code: "link-unavailable" },
    });

    using imageApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      imageApi.linkRepo().getPreview("https://example.com/image"),
    ).resolves.toMatchObject({
      _tag: "Left",
      left: { code: "unsupported-page-shape" },
    });

    using noTitleApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    await expect(
      noTitleApi.linkRepo().getPreview("https://example.com/no-title"),
    ).resolves.toMatchObject({
      _tag: "Left",
      left: { code: "unsupported-page-shape" },
    });
  });
});
