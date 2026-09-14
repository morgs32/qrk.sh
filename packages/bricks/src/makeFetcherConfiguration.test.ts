import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { ScraperApi } from "./scraper/ScraperApi";

import { makeFetcherConfiguration } from "./makeFetcherConfiguration";

describe("makeFetcherConfiguration", () => {
  it("decodes content options independently of a content definition and forwards the publishing callback", async () => {
    const receivedContentOptions: Array<{ hash: string }> = [];
    const fetcher = makeFetcherConfiguration({
      contentOptionsShape: { hash: primitives.text({ defaultValue: "asterisk" }) },
      fetcher: async ({ contentOptions, setData }) => {
        receivedContentOptions.push(contentOptions);
        setData({ svg: contentOptions.hash, providerField: true });
        return { _tag: "Right", right: undefined };
      },
    });
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();
    expect(fetcher.configurationType).toBe("fetcher");

    await expect(fetcher.fetcher({ api, setData, contentOptions: {} })).resolves.toEqual({
      _tag: "Right",
      right: undefined,
    });
    await expect(
      fetcher.fetcher({ api, setData, contentOptions: { hash: 42 } }),
    ).rejects.toBeDefined();
    await expect(
      fetcher.fetcher({ api, setData, contentOptions: { hash: "icon", unexpected: true } }),
    ).rejects.toBeDefined();
    expect(setData).toHaveBeenCalledExactlyOnceWith({ svg: "asterisk", providerField: true });
    expect(receivedContentOptions).toEqual([{ hash: "asterisk" }]);
  });
  it("requires a fetcher and accepts one typed whole-content-options form", () => {
    expectTypeOf(() => {
      // @ts-expect-error a fetcher is required
      makeFetcherConfiguration({ contentOptionsShape: {} });
      makeFetcherConfiguration({
        contentOptionsShape: { query: primitives.text({ defaultValue: "Chicago" }) },
        contentOptionsForm: {
          // @ts-expect-error a field map is not a component
          query: () => null,
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
      makeFetcherConfiguration({
        contentOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        contentOptionsForm: ({ value, onChange }) => {
          expectTypeOf(value.query).toEqualTypeOf<string>();
          expectTypeOf(value.zoom).toEqualTypeOf<number>();
          onChange({ query: value.query, zoom: value.zoom });
          // @ts-expect-error changes replace the complete content options
          onChange({ query: value.query });
          return null;
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
    }).toBeFunction();
  });
});
