import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import { ScraperApi } from "./scraper/ScraperApi";

describe("makeFetcherConfiguration", () => {
  it("decodes module options independently of a content definition and forwards the publishing callback", async () => {
    const receivedModuleOptions: Array<{ hash: string }> = [];
    const fetcher = makeFetcherConfiguration({
      moduleOptionsShape: {
        hash: primitives.text({ defaultValue: "asterisk" }),
      },
      fetcher: async ({ moduleOptions, setData }) => {
        receivedModuleOptions.push(moduleOptions);
        setData({ svg: moduleOptions.hash, providerField: true });
        return { _tag: "Right", right: undefined };
      },
    });
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();
    expect(fetcher.configurationType).toBe("fetcher");

    await expect(fetcher.fetcher({ api, setData, moduleOptions: {} })).resolves.toEqual({
      _tag: "Right",
      right: undefined,
    });
    await expect(
      fetcher.fetcher({ api, setData, moduleOptions: { hash: 42 } }),
    ).rejects.toBeDefined();
    await expect(
      fetcher.fetcher({
        api,
        setData,
        moduleOptions: { hash: "icon", unexpected: true },
      }),
    ).rejects.toBeDefined();
    expect(setData).toHaveBeenCalledExactlyOnceWith({
      svg: "asterisk",
      providerField: true,
    });
    expect(receivedModuleOptions).toEqual([{ hash: "asterisk" }]);
  });
  it("requires a fetcher and accepts one typed whole-module-options form", () => {
    expectTypeOf(() => {
      // @ts-expect-error a fetcher is required
      makeFetcherConfiguration({ moduleOptionsShape: {} });
      makeFetcherConfiguration({
        moduleOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
        },
        moduleOptionsForm: {
          // @ts-expect-error a field map is not a component
          query: () => null,
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
      makeFetcherConfiguration({
        moduleOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        moduleOptionsForm: ({ value, onChange }) => {
          expectTypeOf(value.query).toEqualTypeOf<string>();
          expectTypeOf(value.zoom).toEqualTypeOf<number>();
          onChange({ query: value.query, zoom: value.zoom });
          // @ts-expect-error changes replace the complete module options
          onChange({ query: value.query });
          return null;
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
    }).toBeFunction();
  });
});
