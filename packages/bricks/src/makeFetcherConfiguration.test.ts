import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { ScraperApi } from "./scraper/ScraperApi";

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
  it("requires a fetcher and accepts one typed whole-payload form", () => {
    expectTypeOf(() => {
      // @ts-expect-error a fetcher is required
      makeFetcherConfiguration({ payloadShape: {} });
      makeFetcherConfiguration({
        payloadShape: { query: primitives.text({ defaultValue: "Chicago" }) },
        payloadForm: {
          // @ts-expect-error a field map is not a component
          query: () => null,
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
      makeFetcherConfiguration({
        payloadShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        payloadForm: ({ value, onChange }) => {
          expectTypeOf(value.query).toEqualTypeOf<string>();
          expectTypeOf(value.zoom).toEqualTypeOf<number>();
          onChange({ query: value.query, zoom: value.zoom });
          // @ts-expect-error changes replace the complete payload
          onChange({ query: value.query });
          return null;
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
    }).toBeFunction();
  });
});
