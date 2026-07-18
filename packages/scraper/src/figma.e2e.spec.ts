import { it } from "@effect/vitest";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { env, SELF } from "cloudflare:test";
import { Effect } from "effect";
import { beforeEach, describe, expect, vi } from "vitest";

import type { ScraperApi } from "./ScraperApi";
import { parseFigmaFilePreviewPayload } from "./scrapeFigma";

const RPC_URL = "http://scraper.invalid/";
const DESIGN_KEY = "AbCdEfGhIjKlMnOpQrStUv";
const BOARD_KEY = "BcDeFgHiJkLmNoPqRsTuVw";
const SLIDES_KEY = "CdEfGhIjKlMnOpQrStUvWx";
const PROTOTYPE_KEY = "DeFgHiJkLmNoPqRsTuVwXy";
const STALE_DESIGN_KEY = "EfGhIjKlMnOpQrStUvWxYz";
const UNAVAILABLE_DESIGN_KEY = "FgHiJkLmNoPqRsTuVwXyZa";
const TRANSIENT_BOARD_KEY = "GhIjKlMnOpQrStUvWxYzAb";
const MALFORMED_SLIDES_KEY = "HiJkLmNoPqRsTuVwXyZaBc";
const MISSING_TITLE_PROTOTYPE_KEY = "IjKlMnOpQrStUvWxYzAbCd";
const CONCURRENT_DESIGN_KEY = "JkLmNoPqRsTuVwXyZaBcDe";
const FAILED_REFRESH_BOARD_KEY = "KlMnOpQrStUvWxYzAbCdEf";

const figmaFixture = {
  version: "1.0",
  type: "rich",
  title: "QRK design system",
  url: `https://www.figma.com/design/${DESIGN_KEY}/QRK-design-system?node-id=1-2`,
  thumbnail_url: "https://api-cdn.figma.com/resize/thumbnails/preview-id?height=450",
  thumbnail_width: 800,
  thumbnail_height: 450,
  provider_name: "Figma",
  future_metadata: { retained: true },
};

beforeEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", SELF.fetch.bind(SELF));
});

describe("Figma file repository", () => {
  it.effect(
    "decodes preview metadata, fills absent thumbnails, and preserves provider fields",
    () =>
      Effect.gen(function* () {
        const complete = yield* parseFigmaFilePreviewPayload({
          payload: figmaFixture,
          canonicalUrl: `https://www.figma.com/design/${DESIGN_KEY}`,
        });
        expect(complete).toMatchObject({
          title: "QRK design system",
          url: `https://www.figma.com/design/${DESIGN_KEY}`,
          thumbnail_width: 800,
          future_metadata: { retained: true },
        });

        const withoutThumbnail = yield* parseFigmaFilePreviewPayload({
          payload: {
            title: "Board without thumbnail",
            url: `https://www.figma.com/board/${BOARD_KEY}`,
            provider_name: "Figma",
          },
          canonicalUrl: `https://www.figma.com/board/${BOARD_KEY}`,
        });
        expect(withoutThumbnail).toMatchObject({
          thumbnail_url: null,
          thumbnail_width: null,
          thumbnail_height: null,
          provider_name: "Figma",
        });

        const emptyCanonicalUrl = yield* Effect.either(
          parseFigmaFilePreviewPayload({
            payload: {
              title: "Missing canonical URL",
              url: "",
            },
            canonicalUrl: `https://www.figma.com/design/${DESIGN_KEY}`,
          }),
        );
        expect(emptyCanonicalUrl).toMatchObject({
          _tag: "Left",
          left: { code: "unsupported-page-shape" },
        });
      }),
  );

  it("keeps four explicit URL-family capabilities and rejects cross-family calls", async () => {
    const upstreamFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://api.figma.com/v1/oembed")) {
        return new Response(JSON.stringify(figmaFixture), { status: 200 });
      }
      return SELF.fetch(input, init);
    });
    vi.stubGlobal("fetch", upstreamFetch);

    using designApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const designMismatch = await designApi
      .figmaRepo()
      .getDesign(`https://www.figma.com/board/${BOARD_KEY}/Planning`);
    expect(designMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });
    using designSlidesApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const designSlidesMismatch = await designSlidesApi
      .figmaRepo()
      .getDesign(`https://www.figma.com/slides/${SLIDES_KEY}/Quarterly-review`);
    expect(designSlidesMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });
    using designPrototypeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const designPrototypeMismatch = await designPrototypeApi
      .figmaRepo()
      .getDesign(`https://www.figma.com/proto/${PROTOTYPE_KEY}/Mobile-flow`);
    expect(designPrototypeMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });

    using boardApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const boardMismatch = await boardApi
      .figmaRepo()
      .getBoard(`https://www.figma.com/slides/${SLIDES_KEY}/Quarterly-review`);
    expect(boardMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });
    using boardDesignApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const boardDesignMismatch = await boardDesignApi
      .figmaRepo()
      .getBoard(`https://www.figma.com/design/${DESIGN_KEY}/Design-system`);
    expect(boardDesignMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });
    using boardPrototypeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const boardPrototypeMismatch = await boardPrototypeApi
      .figmaRepo()
      .getBoard(`https://www.figma.com/proto/${PROTOTYPE_KEY}/Mobile-flow`);
    expect(boardPrototypeMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });

    using slidesApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const slidesMismatch = await slidesApi
      .figmaRepo()
      .getSlides(`https://www.figma.com/proto/${PROTOTYPE_KEY}/Mobile-flow`);
    expect(slidesMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });
    using slidesDesignApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const slidesDesignMismatch = await slidesDesignApi
      .figmaRepo()
      .getSlides(`https://www.figma.com/design/${DESIGN_KEY}/Design-system`);
    expect(slidesDesignMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });
    using slidesBoardApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const slidesBoardMismatch = await slidesBoardApi
      .figmaRepo()
      .getSlides(`https://www.figma.com/board/${BOARD_KEY}/Planning`);
    expect(slidesBoardMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });

    using prototypeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const prototypeMismatch = await prototypeApi
      .figmaRepo()
      .getPrototype(`https://www.figma.com/design/${DESIGN_KEY}/Design-system`);
    expect(prototypeMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });
    using prototypeBoardApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const prototypeBoardMismatch = await prototypeBoardApi
      .figmaRepo()
      .getPrototype(`https://www.figma.com/board/${BOARD_KEY}/Planning`);
    expect(prototypeBoardMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });
    using prototypeSlidesApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const prototypeSlidesMismatch = await prototypeSlidesApi
      .figmaRepo()
      .getPrototype(`https://www.figma.com/slides/${SLIDES_KEY}/Quarterly-review`);
    expect(prototypeSlidesMismatch).toMatchObject({
      _tag: "Left",
      left: { code: "file-type-mismatch" },
    });

    using invalidApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const invalid = await invalidApi
      .figmaRepo()
      .getDesign(`https://example.com/design/${DESIGN_KEY}`);
    expect(invalid).toMatchObject({
      _tag: "Left",
      left: { code: "invalid-scrape-request" },
    });

    expect(upstreamFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("api.figma.com"),
      expect.anything(),
    );
  });

  it("coalesces concurrent first loads for one canonical file URL", async () => {
    let upstreamCalls = 0;
    let releaseRequest: (() => void) | undefined;
    const requestBlocked = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.startsWith("https://api.figma.com/v1/oembed")) {
          upstreamCalls += 1;
          await requestBlocked;
          return new Response(JSON.stringify(figmaFixture), { status: 200 });
        }
        return SELF.fetch(input, init);
      }),
    );

    const repo = env.FIGMA_REPO.getByName("global");
    const first = repo.getDesign(
      `https://www.figma.com/design/${CONCURRENT_DESIGN_KEY}/First-name`,
    );
    const second = repo.getDesign(
      `https://www.figma.com/design/${CONCURRENT_DESIGN_KEY}/Second-name?node-id=4-5`,
    );

    await vi.waitFor(() => expect(upstreamCalls).toBe(1));
    releaseRequest?.();

    await expect(first).resolves.toMatchObject({ _tag: "Right" });
    await expect(second).resolves.toMatchObject({ _tag: "Right" });
    expect(upstreamCalls).toBe(1);
  });

  it("normalizes file URLs, authenticates server-side, and caches every named method", async () => {
    const requestedUrls: string[] = [];
    const requestTokens: Array<string | null> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.startsWith("https://api.figma.com/v1/oembed")) {
          const endpoint = new URL(url);
          const requestedUrl = endpoint.searchParams.get("url");
          if (requestedUrl === null) throw new Error("Expected the Figma URL query parameter");
          requestedUrls.push(requestedUrl);
          requestTokens.push(new Headers(init?.headers).get("X-Figma-Token"));
          return new Response(
            JSON.stringify({
              ...figmaFixture,
              title: requestedUrl,
              url: `${requestedUrl}?node-id=should-not-survive`,
            }),
            { status: 200 },
          );
        }
        return SELF.fetch(input, init);
      }),
    );

    using designApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const design = await designApi
      .figmaRepo()
      .getDesign(`https://figma.com/design/${DESIGN_KEY}/First-name?node-id=1-2#fragment`);
    expect(design).toMatchObject({
      _tag: "Right",
      right: { url: `https://www.figma.com/design/${DESIGN_KEY}` },
    });

    using cachedDesignApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const cachedDesign = await cachedDesignApi
      .figmaRepo()
      .getDesign(`https://www.figma.com/design/${DESIGN_KEY}/Different-name?m=dev`);
    expect(cachedDesign).toMatchObject({
      _tag: "Right",
      right: { url: `https://www.figma.com/design/${DESIGN_KEY}` },
    });

    using boardApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const board = await boardApi
      .figmaRepo()
      .getBoard(`https://www.figma.com/board/${BOARD_KEY}/Workshop`);
    expect(board).toMatchObject({
      _tag: "Right",
      right: { url: `https://www.figma.com/board/${BOARD_KEY}` },
    });

    using slidesApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const slides = await slidesApi
      .figmaRepo()
      .getSlides(`https://www.figma.com/deck/${SLIDES_KEY}/Quarterly-review`);
    expect(slides).toMatchObject({
      _tag: "Right",
      right: { url: `https://www.figma.com/slides/${SLIDES_KEY}` },
    });

    using prototypeApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const prototype = await prototypeApi
      .figmaRepo()
      .getPrototype(
        `https://www.figma.com/proto/${PROTOTYPE_KEY}/Mobile-flow?starting-point-node-id=4-8`,
      );
    expect(prototype).toMatchObject({
      _tag: "Right",
      right: { url: `https://www.figma.com/proto/${PROTOTYPE_KEY}` },
    });

    expect(requestedUrls).toEqual([
      `https://www.figma.com/design/${DESIGN_KEY}`,
      `https://www.figma.com/board/${BOARD_KEY}`,
      `https://www.figma.com/slides/${SLIDES_KEY}`,
      `https://www.figma.com/proto/${PROTOTYPE_KEY}`,
    ]);
    expect(requestTokens).toEqual([
      "deterministic-figma-token",
      "deterministic-figma-token",
      "deterministic-figma-token",
      "deterministic-figma-token",
    ]);
    expect(JSON.stringify([design, board, slides, prototype])).not.toContain(
      "deterministic-figma-token",
    );
  });

  it("serves one-hour stale data while one background refresh replaces it", async () => {
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
        if (url.startsWith("https://api.figma.com/v1/oembed")) {
          upstreamCalls += 1;
          if (upstreamCalls === 2) await refreshBlocked;
          return new Response(
            JSON.stringify({
              ...figmaFixture,
              title: upstreamCalls === 1 ? "Old Figma title" : "New Figma title",
            }),
            { status: 200 },
          );
        }
        return SELF.fetch(input, init);
      }),
    );

    const repo = env.FIGMA_REPO.getByName("global");
    const initial = await repo.getDesign(
      `https://www.figma.com/design/${STALE_DESIGN_KEY}/Initial`,
    );
    expect(initial).toMatchObject({ _tag: "Right", right: { title: "Old Figma title" } });

    vi.setSystemTime(new Date("2026-07-18T01:00:00.001Z"));
    const firstStale = await repo.getDesign(
      `https://www.figma.com/design/${STALE_DESIGN_KEY}/Stale`,
    );
    const secondStale = await repo.getDesign(
      `https://www.figma.com/design/${STALE_DESIGN_KEY}/Also-stale`,
    );
    expect(firstStale).toMatchObject({ _tag: "Right", right: { title: "Old Figma title" } });
    expect(secondStale).toMatchObject({ _tag: "Right", right: { title: "Old Figma title" } });
    expect(upstreamCalls).toBe(2);

    releaseRefresh?.();
    await vi.waitFor(() => expect(upstreamCalls).toBe(2));

    using refreshedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const refreshed = await refreshedApi
      .figmaRepo()
      .getDesign(`https://www.figma.com/design/${STALE_DESIGN_KEY}/Refreshed`);
    expect(refreshed).toMatchObject({ _tag: "Right", right: { title: "New Figma title" } });
  });

  it("retains stale data when a background refresh fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-18T00:00:00.000Z"));
    let upstreamCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.startsWith("https://api.figma.com/v1/oembed")) {
          upstreamCalls += 1;
          if (upstreamCalls === 1) {
            return new Response(
              JSON.stringify({ ...figmaFixture, title: "Retained board title" }),
              { status: 200 },
            );
          }
          return new Response(null, { status: 503 });
        }
        return SELF.fetch(input, init);
      }),
    );

    const repo = env.FIGMA_REPO.getByName("global");
    const initial = await repo.getBoard(
      `https://www.figma.com/board/${FAILED_REFRESH_BOARD_KEY}/Initial`,
    );
    expect(initial).toMatchObject({
      _tag: "Right",
      right: { title: "Retained board title" },
    });

    vi.setSystemTime(new Date("2026-07-18T01:00:00.001Z"));
    const stale = await repo.getBoard(
      `https://www.figma.com/board/${FAILED_REFRESH_BOARD_KEY}/Expired`,
    );
    expect(stale).toMatchObject({
      _tag: "Right",
      right: { title: "Retained board title" },
    });
    await vi.waitFor(() => expect(upstreamCalls).toBe(2));

    const retained = await repo.getBoard(
      `https://www.figma.com/board/${FAILED_REFRESH_BOARD_KEY}/Still-available`,
    );
    expect(retained).toMatchObject({
      _tag: "Right",
      right: { title: "Retained board title" },
    });
  });

  it("maps access, transient, and malformed upstream failures without caching first failures", async () => {
    let unavailableCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.startsWith("https://api.figma.com/v1/oembed")) {
          const requestedUrl = new URL(url).searchParams.get("url");
          if (requestedUrl?.includes(UNAVAILABLE_DESIGN_KEY)) {
            unavailableCalls += 1;
            return new Response(null, { status: 403 });
          }
          if (requestedUrl?.includes(TRANSIENT_BOARD_KEY)) {
            return new Response(null, { status: 429 });
          }
          if (requestedUrl?.includes(MALFORMED_SLIDES_KEY)) {
            return new Response("{", {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (requestedUrl?.includes(MISSING_TITLE_PROTOTYPE_KEY)) {
            return new Response(JSON.stringify({ url: requestedUrl }), { status: 200 });
          }
        }
        return SELF.fetch(input, init);
      }),
    );

    using unavailableApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const unavailable = await unavailableApi
      .figmaRepo()
      .getDesign(`https://www.figma.com/design/${UNAVAILABLE_DESIGN_KEY}/Private`);
    expect(unavailable).toMatchObject({ _tag: "Left", left: { code: "file-unavailable" } });

    using unavailableAgainApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const unavailableAgain = await unavailableAgainApi
      .figmaRepo()
      .getDesign(`https://www.figma.com/design/${UNAVAILABLE_DESIGN_KEY}/Private`);
    expect(unavailableAgain).toMatchObject({
      _tag: "Left",
      left: { code: "file-unavailable" },
    });
    expect(unavailableCalls).toBe(2);

    using transientApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const transient = await transientApi
      .figmaRepo()
      .getBoard(`https://www.figma.com/board/${TRANSIENT_BOARD_KEY}/Rate-limited`);
    expect(transient).toMatchObject({
      _tag: "Left",
      left: { code: "scrape-transient-failure" },
    });

    using malformedApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const malformed = await malformedApi
      .figmaRepo()
      .getSlides(`https://www.figma.com/slides/${MALFORMED_SLIDES_KEY}/Malformed`);
    expect(malformed).toMatchObject({
      _tag: "Left",
      left: { code: "unsupported-page-shape" },
    });

    using missingTitleApi = newSyncRpcSession<ScraperApi>(RPC_URL);
    const missingTitle = await missingTitleApi
      .figmaRepo()
      .getPrototype(`https://www.figma.com/proto/${MISSING_TITLE_PROTOTYPE_KEY}/Missing-title`);
    expect(missingTitle).toMatchObject({
      _tag: "Left",
      left: { code: "unsupported-page-shape" },
    });
  });
});
