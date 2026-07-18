import { primitives } from "@zerospin/core/models/primitives";
import { describe, expect, it } from "vitest";
import { ScraperApi } from "scraper/ScraperApi";
import type { IScrapeError } from "scraper/types";

import { githubCollection } from "./collections/GitHubCards/GitHubProfileCollection";
import { makeVariant } from "./makeVariant";

describe("makeVariant data contracts", () => {
  it("omits every data-contract field for a static variant", () => {
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

    expect("payloadShape" in variant).toBe(false);
    expect("dataShape" in variant).toBe(false);
    expect("defaultData" in variant).toBe(false);
    expect("getData" in variant).toBe(false);
    expect("payload" in variant).toBe(false);

    expect("payloadShape" in githubCollection.variants.repo).toBe(false);
    expect("dataShape" in githubCollection.variants.repo).toBe(false);
    expect("defaultData" in githubCollection.variants.repo).toBe(false);
    expect("getData" in githubCollection.variants.repo).toBe(false);
  });

  it("preserves the GitHub profile request, response, default, and callback contract", () => {
    const profileVariant = githubCollection.variants.profile;

    expect(profileVariant?.payloadShape?.url).toMatchObject({
      kind: "text",
      nullable: false,
      defaultValue: "https://github.com/morgs32",
    });
    expect(profileVariant?.dataShape).toMatchObject({
      login: { kind: "text" },
      avatar_url: { kind: "text" },
      name: { kind: "text", nullable: true },
      bio: { kind: "text", nullable: true },
      location: { kind: "text", nullable: true },
      blog: { kind: "text" },
      public_repos: { kind: "integer" },
      followers: { kind: "integer" },
      following: { kind: "integer" },
    });
    expect(profileVariant?.defaultData).toMatchObject({
      id: 1364795,
      login: "morgs32",
      name: "Morgan Intrator",
    });
    expect(profileVariant?.getData).toBeTypeOf("function");
  });

  it("decodes request and successful response data while preserving provider fields", async () => {
    const callbackPayloads: Array<{ url: string }> = [];
    const variant = makeVariant({
      variant: "profile",
      variantDescription: "A data-backed profile.",
      payloadShape: {
        url: primitives.text(),
      },
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
        providerField: "default-provider-value",
      },
      getData: async ({ payload }) => {
        callbackPayloads.push(payload);
        return {
          _tag: "Right",
          right: {
            login: payload.url,
            providerField: "loaded-provider-value",
          },
        };
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
          component: (props: { data: { login: string } }) => {
            return props.data.login;
          },
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
      right: {
        login: "https://github.com/morgs32",
        providerField: "loaded-provider-value",
      },
    });
    expect(callbackPayloads).toEqual([{ url: "https://github.com/morgs32" }]);
  });

  it("throws while constructing a variant with invalid default data", () => {
    expect(() =>
      makeVariant({
        variant: "profile",
        variantDescription: "A data-backed profile.",
        payloadShape: {
          url: primitives.text(),
        },
        dataShape: {
          login: primitives.text(),
        },
        defaultData: JSON.parse('{"login":42}'),
        getData: async ({ payload }) => {
          void payload;
          return { _tag: "Right", right: { login: "morgs32" } };
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
            component: (props: { data: { login: string } }) => {
              return props.data.login;
            },
          },
        },
      }),
    ).toThrow();
  });

  it("rejects missing, invalid, and excess payloads before invoking the callback", async () => {
    const callbackPayloads: Array<{ url: string }> = [];
    const variant = makeVariant({
      variant: "profile",
      variantDescription: "A data-backed profile.",
      payloadShape: {
        url: primitives.text(),
      },
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      getData: async ({ payload }) => {
        callbackPayloads.push(payload);
        return { _tag: "Right", right: { login: payload.url } };
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
          component: (props: { data: { login: string } }) => {
            return props.data.login;
          },
        },
      },
    });
    const api = Object.create(ScraperApi.prototype);

    await expect(variant.getData({ api, payload: {} })).rejects.toBeDefined();
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

  it("rejects successful provider data that does not match dataShape", async () => {
    const variant = makeVariant({
      variant: "profile",
      variantDescription: "A data-backed profile.",
      payloadShape: {
        url: primitives.text(),
      },
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      getData: async ({ payload }) => {
        void payload;
        return { _tag: "Right", right: { login: 42 } };
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
          component: (props: { data: { login: string } }) => {
            return props.data.login;
          },
        },
      },
    });
    const api = Object.create(ScraperApi.prototype);

    await expect(
      variant.getData({
        api,
        payload: { url: "https://github.com/morgs32" },
      }),
    ).rejects.toBeDefined();
  });

  it("passes provider Left results through unchanged", async () => {
    const providerError: IScrapeError = {
      code: "profile-unavailable",
      message: "GitHub authentication or access failed with HTTP 401",
      retryable: false,
    };
    const variant = makeVariant({
      variant: "profile",
      variantDescription: "A data-backed profile.",
      payloadShape: {
        url: primitives.text(),
      },
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      getData: async ({ payload }) => {
        void payload;
        return { _tag: "Left", left: providerError };
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
          component: (props: { data: { login: string } }) => {
            return props.data.login;
          },
        },
      },
    });
    const api = Object.create(ScraperApi.prototype);

    await expect(
      variant.getData({
        api,
        payload: { url: "https://github.com/morgs32" },
      }),
    ).resolves.toEqual({ _tag: "Left", left: providerError });
  });

  it("requires the complete data contract and a declared data component prop", () => {
    // This call is intentionally retained as a compile-time assertion. A variant
    // cannot opt into payload loading without the response shape and default.
    // @ts-expect-error data-backed variants require all four contract properties
    makeVariant({
      variant: "profile",
      variantDescription: "An incomplete data-backed profile.",
      payloadShape: {
        url: primitives.text(),
      },
      getData: async ({ payload }: { payload: { url: string } }) => {
        return { _tag: "Right", right: { login: payload.url } };
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

    // @ts-expect-error data-backed size components must declare the data prop
    makeVariant({
      variant: "profile",
      variantDescription: "A data-backed profile.",
      payloadShape: {
        url: primitives.text(),
      },
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      getData: async ({ payload }: { payload: { url: string } }) => {
        return { _tag: "Right", right: { login: payload.url } };
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
          // Merely ignoring the data argument does not satisfy this contract.
          component: () => null,
        },
      },
    });
  });
});
