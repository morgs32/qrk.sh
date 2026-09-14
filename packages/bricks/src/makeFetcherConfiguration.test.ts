import { primitives } from "@zerospin/schema";
import { describe, expect, it } from "vitest";
import { ScraperApi } from "scraper/ScraperApi";

import { makeFetcherConfiguration } from "./makeFetcherConfiguration";

describe("makeFetcherConfiguration", () => {
  it("decodes payloads independently of a variant and preserves provider results", async () => {
    const payloads: Array<{ hash: string }> = [];
    const fetcher = makeFetcherConfiguration({
      payloadShape: { hash: primitives.text({ defaultValue: "asterisk" }) },
      fetcher: async ({ payload }) => {
        payloads.push(payload);
        return { _tag: "Right", right: { svg: payload.hash, providerField: true } };
      },
    });
    const api = Object.create(ScraperApi.prototype);

    await expect(fetcher.fetcher({ api, payload: {} })).resolves.toEqual({
      _tag: "Right",
      right: { svg: "asterisk", providerField: true },
    });
    await expect(fetcher.fetcher({ api, payload: { hash: 42 } })).rejects.toBeDefined();
    await expect(
      fetcher.fetcher({ api, payload: { hash: "icon", unexpected: true } }),
    ).rejects.toBeDefined();
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
