import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { scrapeFigma } from "./scrapeFigma";
import { encodeRpc } from "./encodeRpc";

const url = "https://www.figma.com/board/z5h3z46BL4EfEFGk3LBxI9";

afterEach(() => vi.unstubAllGlobals());

it("rejects missing credentials before fetching", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const result = await Effect.runPromise(scrapeFigma({ url, token: " " }).pipe(encodeRpc));
  expect(result).toMatchObject({
    _tag: "Left",
    left: {
      code: "provider-configuration-error",
      message: expect.stringContaining("FIGMA_TOKEN is missing"),
    },
  });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  [400, "invalid-scrape-request"],
  [401, "provider-configuration-error"],
  [403, "provider-configuration-error"],
  [404, "file-unavailable"],
  [418, "provider-configuration-error"],
  [429, "scrape-transient-failure"],
  [500, "scrape-transient-failure"],
])("preserves HTTP %i in the mapped error", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
  const result = await Effect.runPromise(scrapeFigma({ url, token: "test-token" }).pipe(encodeRpc));
  expect(result).toMatchObject({
    _tag: "Left",
    left: { code, message: expect.stringContaining(`HTTP ${status}`) },
  });
});
