import { primitives } from "@zerospin/schema";
import { describe, expect, it, vi } from "vitest";
import { ScraperApi } from "scraper/ScraperApi";

import { makeFetcherConfiguration } from "./makeFetcherConfiguration";

describe("makeFetcherConfiguration", () => {
  it("decodes payloads independently of a variant and forwards the publishing callback", async () => {
    const payloads: Array<{ hash: string }> = [];
    const fetcher = makeFetcherConfiguration({
      payloadShape: { hash: primitives.text({ defaultValue: "asterisk" }) },
      fetcher: async ({ payload, setData }) => {
        payloads.push(payload);
        setData({ svg: payload.hash, providerField: true });
        return { _tag: "Right", right: undefined };
      },
    });
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();
    expect(fetcher.configurationType).toBe("fetcher");

    await expect(fetcher.fetcher({ api, setData, payload: {} })).resolves.toEqual({
      _tag: "Right",
      right: undefined,
    });
    await expect(fetcher.fetcher({ api, setData, payload: { hash: 42 } })).rejects.toBeDefined();
    await expect(
      fetcher.fetcher({ api, setData, payload: { hash: "icon", unexpected: true } }),
    ).rejects.toBeDefined();
    expect(setData).toHaveBeenCalledExactlyOnceWith({ svg: "asterisk", providerField: true });
    expect(payloads).toEqual([{ hash: "asterisk" }]);
  });
  it("rejects unknown custom fields and controls without defaults", () => {
    makeFetcherConfiguration({
      payloadShape: { query: primitives.text({ defaultValue: "Chicago" }) },
      payloadForm: {
        // @ts-expect-error payloadForm keys must be declared by payloadShape
        unknownField: () => null,
      },
    });
    makeFetcherConfiguration({
      payloadShape: { query: primitives.text() },
      payloadForm: {
        // @ts-expect-error custom payload controls require a descriptor defaultValue
        query: () => null,
      },
    });
  });
});
