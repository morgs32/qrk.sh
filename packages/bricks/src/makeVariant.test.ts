import { primitives } from "@zerospin/core/models/primitives";
import { describe, expect, it } from "vitest";
import { ScraperApi } from "scraper/ScraperApi";

import { githubCollection } from "./collections/GitHubCards/GitHubProfileCollection";
import { makeVariant } from "./makeVariant";

describe("makeVariant data contracts", () => {
  it("omits payload and getData for a static variant", () => {
    const variant = makeVariant({
      variant: "static",
      variantDescription: "A static variant.",
      sizes: {
        "1x1": {
          def: {
            variant: "static",
            size: "1x1",
            w: 1,
            h: 1,
            label: "1×1",
            order: 0,
          },
          component: () => null,
        },
      },
    });

    expect("payload" in variant).toBe(false);
    expect("getData" in variant).toBe(false);
    expect("payload" in githubCollection.variants.repo).toBe(false);
    expect("getData" in githubCollection.variants.repo).toBe(false);
  });

  it("preserves the GitHub profile payload descriptor and wrapped callback", () => {
    const profileVariant = githubCollection.variants.profile;

    expect(profileVariant?.payload?.url).toMatchObject({
      kind: "text",
      nullable: false,
      defaultValue: "https://github.com/morgs32",
    });
    expect(profileVariant?.getData).toBeTypeOf("function");
  });

  it("passes a decoded payload to the supplied callback", async () => {
    const callbackPayloads: Array<{ url: string }> = [];
    const variant = makeVariant({
      variant: "profile",
      variantDescription: "A data-backed profile.",
      payload: {
        url: primitives.text(),
      },
      getData: async ({ payload }) => {
        callbackPayloads.push(payload);
        return { _tag: "Right", right: payload.url };
      },
      sizes: {
        "1x1": {
          def: {
            variant: "profile",
            size: "1x1",
            w: 1,
            h: 1,
            label: "1×1",
            order: 0,
          },
          component: () => null,
        },
      },
    });
    const api = Object.create(ScraperApi.prototype);

    await expect(
      variant.getData({
        api,
        payload: { url: "https://github.com/morgs32" },
      }),
    ).resolves.toEqual({
      _tag: "Right",
      right: "https://github.com/morgs32",
    });
    expect(callbackPayloads).toEqual([{ url: "https://github.com/morgs32" }]);
  });

  it("rejects invalid and excess payloads before invoking the callback", async () => {
    const callbackPayloads: Array<{ url: string }> = [];
    const variant = makeVariant({
      variant: "profile",
      variantDescription: "A data-backed profile.",
      payload: {
        url: primitives.text(),
      },
      getData: async ({ payload }) => {
        callbackPayloads.push(payload);
        return { _tag: "Right", right: payload.url };
      },
      sizes: {
        "1x1": {
          def: {
            variant: "profile",
            size: "1x1",
            w: 1,
            h: 1,
            label: "1×1",
            order: 0,
          },
          component: () => null,
        },
      },
    });
    const api = Object.create(ScraperApi.prototype);

    await expect(
      variant.getData({
        api,
        payload: { url: 42 },
      }),
    ).rejects.toBeDefined();
    await expect(
      variant.getData({
        api,
        payload: {
          url: "https://github.com/morgs32",
          unexpected: true,
        },
      }),
    ).rejects.toBeDefined();
    expect(callbackPayloads).toEqual([]);
  });
});
