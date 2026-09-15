import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import { ScraperApi } from "./scraper/ScraperApi";

describe("makeFetcherConfiguration", () => {
  it("decodes catalog options independently of a content definition and forwards the publishing callback", async () => {
    const receivedCatalogOptions: Array<{ hash: string }> = [];
    const fetcher = makeFetcherConfiguration({
      catalogOptionsShape: {
        hash: primitives.text({ defaultValue: "asterisk" }),
      },
      fetcher: async ({ catalogOptions, setData }) => {
        receivedCatalogOptions.push(catalogOptions);
        setData({ svg: catalogOptions.hash, providerField: true });
        return { _tag: "Right", right: undefined };
      },
    });
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();
    expect(fetcher.configurationType).toBe("fetcher");

    await expect(fetcher.fetcher({ api, setData, catalogOptions: {} })).resolves.toEqual({
      _tag: "Right",
      right: undefined,
    });
    await expect(
      fetcher.fetcher({ api, setData, catalogOptions: { hash: 42 } }),
    ).rejects.toBeDefined();
    await expect(
      fetcher.fetcher({
        api,
        setData,
        catalogOptions: { hash: "icon", unexpected: true },
      }),
    ).rejects.toBeDefined();
    expect(setData).toHaveBeenCalledExactlyOnceWith({
      svg: "asterisk",
      providerField: true,
    });
    expect(receivedCatalogOptions).toEqual([{ hash: "asterisk" }]);
  });
  it("requires a fetcher and accepts one typed whole-catalog-options form", () => {
    expectTypeOf(() => {
      // @ts-expect-error a fetcher is required
      makeFetcherConfiguration({ catalogOptionsShape: {} });
      makeFetcherConfiguration({
        catalogOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
        },
        catalogOptionsForm: {
          // @ts-expect-error a field map is not a component
          query: () => null,
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
      makeFetcherConfiguration({
        catalogOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        catalogOptionsForm: ({ value, onChange }) => {
          expectTypeOf(value.query).toEqualTypeOf<string>();
          expectTypeOf(value.zoom).toEqualTypeOf<number>();
          onChange({ query: value.query, zoom: value.zoom });
          // @ts-expect-error changes replace the complete catalog options
          onChange({ query: value.query });
          return null;
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
    }).toBeFunction();
  });
});
