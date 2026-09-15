import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import { ScraperApi } from "./scraper/ScraperApi";

describe("makeFetcherConfiguration", () => {
  it("decodes registry options independently of a content definition and forwards the publishing callback", async () => {
    const receivedRegistryOptions: Array<{ hash: string }> = [];
    const fetcher = makeFetcherConfiguration({
      registryOptionsShape: {
        hash: primitives.text({ defaultValue: "asterisk" }),
      },
      fetcher: async ({ registryOptions, setData }) => {
        receivedRegistryOptions.push(registryOptions);
        setData({ svg: registryOptions.hash, providerField: true });
        return { _tag: "Right", right: undefined };
      },
    });
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();
    expect(fetcher.configurationType).toBe("fetcher");

    await expect(fetcher.fetcher({ api, setData, registryOptions: {} })).resolves.toEqual({
      _tag: "Right",
      right: undefined,
    });
    await expect(
      fetcher.fetcher({ api, setData, registryOptions: { hash: 42 } }),
    ).rejects.toBeDefined();
    await expect(
      fetcher.fetcher({
        api,
        setData,
        registryOptions: { hash: "icon", unexpected: true },
      }),
    ).rejects.toBeDefined();
    expect(setData).toHaveBeenCalledExactlyOnceWith({
      svg: "asterisk",
      providerField: true,
    });
    expect(receivedRegistryOptions).toEqual([{ hash: "asterisk" }]);
  });
  it("requires a fetcher and accepts one typed whole-registry-options form", () => {
    expectTypeOf(() => {
      // @ts-expect-error a fetcher is required
      makeFetcherConfiguration({ registryOptionsShape: {} });
      makeFetcherConfiguration({
        registryOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
        },
        registryOptionsForm: {
          // @ts-expect-error a field map is not a component
          query: () => null,
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
      makeFetcherConfiguration({
        registryOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        registryOptionsForm: ({ value, onChange }) => {
          expectTypeOf(value.query).toEqualTypeOf<string>();
          expectTypeOf(value.zoom).toEqualTypeOf<number>();
          onChange({ query: value.query, zoom: value.zoom });
          // @ts-expect-error changes replace the complete registry options
          onChange({ query: value.query });
          return null;
        },
        fetcher: async () => ({ _tag: "Right", right: undefined }),
      });
    }).toBeFunction();
  });
});
