import { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import { primitives } from "@zerospin/schema";
import { Schema } from "effect";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { ScraperApi } from "scraper/ScraperApi";
import type { IScrapeError } from "scraper/types";

import { githubCollection } from "./collections/GitHubCards/GitHubProfileCollection";
import { mapCollection } from "./collections/Map/MapCollection";
import { makeVariant } from "./makeVariant";

describe("makeVariant data contracts", () => {
  it("uses explicit nulls for a static variant", () => {
    const variant = makeVariant({
      dataShape: null,
      defaultData: null,
      variant: "static",
      variantLabel: "Static",
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
    expect("payloadForm" in variant).toBe(false);
    expect(variant.dataShape).toBeNull();
    expect(variant.defaultData).toBeNull();
    expect("getData" in variant).toBe(false);
    expect("payload" in variant).toBe(false);

    expect("payloadShape" in githubCollection.variants.repo).toBe(false);
    expect("payloadForm" in githubCollection.variants.repo).toBe(false);
    expect(githubCollection.variants.repo.dataShape).toBeNull();
    expect(githubCollection.variants.repo.defaultData).toBeNull();
    expect("getData" in githubCollection.variants.repo).toBe(false);
  });

  it("preserves typed custom payload controls through the collection", () => {
    const placeVariant = mapCollection.variants.place;

    if (placeVariant?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(placeVariant?.configuration?.payloadShape?.googlePlaceId).toMatchObject({
      kind: "text",
      nullable: false,
      defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
    });
    expect(placeVariant?.configuration?.payloadForm?.googlePlaceId).toBeTypeOf("function");
    expect(placeVariant).not.toHaveProperty("payloadShape");
    expect(placeVariant).not.toHaveProperty("payloadForm");
    expect(placeVariant).not.toHaveProperty("getData");
    expect(placeVariant?.defaultData).toMatchObject({
      googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
      name: "Downtown Chicago",
      latitude: 41.8781136,
      longitude: -87.6297982,
    });
  });

  it("preserves a local payload form without adding a data loader", () => {
    const variant = makeVariant({
      dataShape: null,
      defaultData: null,
      variant: "local-content",
      variantLabel: "Local-content",
      variantDescription: "Locally authored content.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          content: primitives.json({
            nullable: true,
            defaultValue: null,
            schema: Schema.Struct({ type: Schema.String }),
          }),
        },
        payloadForm: {
          content: (props) => {
            if (props.value !== null) {
              props.onChange(props.value);
            }
            return null;
          },
        },
      }),
      sizes: {
        "1x1": {
          def: {
            variant: "local-content",
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

    if (variant.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(variant.configuration?.payloadShape.content.defaultValue).toBeNull();
    expect(variant.configuration?.payloadForm?.content).toBeTypeOf("function");
    expect(variant.dataShape).toBeNull();
    expect(variant.defaultData).toBeNull();
    expect("fetcher" in (variant.configuration ?? {})).toBe(false);
    expect(variant.configuration?.configurationType).toBe("fetcher");
    expect("payloadShape" in variant).toBe(false);
    expect("payloadForm" in variant).toBe(false);
  });

  it("infers custom renderer values from their decoded primitive fields", () => {
    const variant = makeVariant({
      variant: "typed-controls",
      variantLabel: "Typed-controls",
      variantDescription: "Typed custom controls.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        payloadForm: {
          query: (props: { value: string; onChange: (value: string) => void }) => {
            props.onChange(props.value);
            return null;
          },
          zoom: (props: { value: number; onChange: (value: number) => void }) => {
            props.onChange(props.value);
            return null;
          },
        },
        fetcher: async ({ payload, setData }) => {
          setData({ result: `${payload.query}:${payload.zoom}` });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        result: primitives.text(),
      },
      defaultData: {
        result: "Chicago",
      },
      sizes: {
        "1x1": {
          def: {
            variant: "typed-controls",
            size: "1x1",
            w: 1,
            h: 1,
            label: "1×1",
            order: 0,
          },
          component: (props: { data: { result: string } }) => props.data.result,
        },
      },
    });

    if (variant.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(variant.configuration?.payloadForm?.query).toBeTypeOf("function");
    expect(variant.configuration?.payloadForm?.zoom).toBeTypeOf("function");
  });

  it("preserves the GitHub profile request, response, default, and callback contract", () => {
    const profileVariant = githubCollection.variants.profile;

    if (profileVariant?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(profileVariant?.configuration?.payloadShape?.url).toMatchObject({
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
    expect(profileVariant?.configuration?.fetcher).toBeTypeOf("function");
  });

  it("decodes requests and publishes provider data through the supplied setter", async () => {
    const callbackPayloads: Array<{ url: string }> = [];
    const variant = makeVariant({
      variant: "profile",
      variantLabel: "Profile",
      variantDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text(),
        },
        fetcher: async ({ payload, setData }) => {
          callbackPayloads.push(payload);
          setData({ login: payload.url, providerField: "loaded-provider-value" });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
        providerField: "default-provider-value",
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
    if (
      variant.configuration === undefined ||
      !("fetcher" in variant.configuration) ||
      variant.configuration.fetcher === undefined
    ) {
      throw new Error("Expected a fetched variant");
    }
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();

    await expect(
      variant.configuration.fetcher({
        api,
        setData,
        payload: { url: "https://github.com/morgs32" },
      }),
    ).resolves.toEqual({
      _tag: "Right",
      right: undefined,
    });
    expect(setData).toHaveBeenCalledExactlyOnceWith({
      login: "https://github.com/morgs32",
      providerField: "loaded-provider-value",
    });
    expect(variant.configuration.configurationType).toBe("fetcher");
    expect(callbackPayloads).toEqual([{ url: "https://github.com/morgs32" }]);
  });

  it("throws while constructing a variant with invalid default data", () => {
    expect(() =>
      makeVariant({
        variant: "profile",
        variantLabel: "Profile",
        variantDescription: "A data-backed profile.",
        configuration: makeFetcherConfiguration({
          payloadShape: {
            url: primitives.text(),
          },
          fetcher: async ({ payload, setData }) => {
            void payload;
            setData({ login: "morgs32" });
            return { _tag: "Right", right: undefined };
          },
        }),
        dataShape: {
          login: primitives.text(),
        },
        defaultData: JSON.parse('{"login":42}'),
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
      variantLabel: "Profile",
      variantDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text(),
        },
        fetcher: async ({ payload, setData }) => {
          callbackPayloads.push(payload);
          setData({ login: payload.url });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
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
    if (
      variant.configuration === undefined ||
      !("fetcher" in variant.configuration) ||
      variant.configuration.fetcher === undefined
    ) {
      throw new Error("Expected a fetched variant");
    }
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();

    await expect(
      variant.configuration.fetcher({ api, setData, payload: {} }),
    ).rejects.toBeDefined();
    await expect(
      variant.configuration.fetcher({
        api,
        setData,
        payload: { url: 42 },
      }),
    ).rejects.toBeDefined();
    await expect(
      variant.configuration.fetcher({
        api,
        setData,
        payload: {
          url: "https://github.com/morgs32",
          unexpected: true,
        },
      }),
    ).rejects.toBeDefined();
    expect(callbackPayloads).toEqual([]);
    expect(setData).not.toHaveBeenCalled();
  });

  it("propagates validation failures from the supplied setter", async () => {
    const variant = makeVariant({
      variant: "profile",
      variantLabel: "Profile",
      variantDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text(),
        },
        fetcher: async ({ payload, setData }) => {
          void payload;
          setData({ login: 42 });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
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
    if (
      variant.configuration === undefined ||
      !("fetcher" in variant.configuration) ||
      variant.configuration.fetcher === undefined
    ) {
      throw new Error("Expected a fetched variant");
    }
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn(() => {
      throw new Error("Invalid variant data");
    });

    await expect(
      variant.configuration.fetcher({
        api,
        setData,
        payload: { url: "https://github.com/morgs32" },
      }),
    ).rejects.toThrow("Invalid variant data");
    expect(setData).toHaveBeenCalledExactlyOnceWith({ login: 42 });
  });

  it("passes provider Left results through unchanged", async () => {
    const providerError: IScrapeError = {
      code: "profile-unavailable",
      message: "GitHub authentication or access failed with HTTP 401",
      retryable: false,
    };
    const variant = makeVariant({
      variant: "profile",
      variantLabel: "Profile",
      variantDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text(),
        },
        fetcher: async ({ payload }) => {
          void payload;
          return { _tag: "Left", left: providerError };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
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
    if (
      variant.configuration === undefined ||
      !("fetcher" in variant.configuration) ||
      variant.configuration.fetcher === undefined
    ) {
      throw new Error("Expected a fetched variant");
    }
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();

    await expect(
      variant.configuration.fetcher({
        api,
        setData,
        payload: { url: "https://github.com/morgs32" },
      }),
    ).resolves.toEqual({ _tag: "Left", left: providerError });
    expect(setData).not.toHaveBeenCalled();
  });

  it("allows data components to ignore the data argument", () => {
    const variant = makeVariant({
      variant: "default",
      variantLabel: "Default",
      variantDescription: "Data is available but unused.",
      dataShape: { name: primitives.text() },
      defaultData: { name: "Default" },
      sizes: {
        "1x1": {
          def: { variant: "default", size: "1x1", w: 1, h: 1, label: "1×1", order: 0 },
          component: () => null,
        },
      },
    });
    expect(variant.defaultData).toEqual({ name: "Default" });
  });

  it("requires a matching schema/default pair", () => {
    // Invalid declarations are compile-time assertions, not runtime inputs.
    expectTypeOf(() => {
      // @ts-expect-error both data fields are required
      makeVariant({
        variant: "static",
        variantLabel: "Static",
        variantDescription: "Static",
        sizes: {},
      });
      // @ts-expect-error a null schema requires a null default
      makeVariant({
        variant: "static",
        variantLabel: "Static",
        variantDescription: "Static",
        dataShape: null,
        defaultData: {},
        sizes: {},
      });
      // @ts-expect-error a schema requires a non-null default
      makeVariant({
        variant: "data",
        variantLabel: "Data",
        variantDescription: "Data",
        dataShape: { name: primitives.text() },
        defaultData: null,
        sizes: {},
      });
      makeVariant({
        variant: "data",
        variantLabel: "Data",
        variantDescription: "Data",
        dataShape: { name: primitives.text() },
        // @ts-expect-error defaults must match the schema
        defaultData: { name: 42 },
        sizes: {},
      });
      makeVariant({
        variant: "data",
        variantLabel: "Data",
        variantDescription: "Data",
        dataShape: { name: primitives.text() },
        defaultData: { name: "Default" },
        sizes: {
          "1x1": {
            def: { variant: "data", size: "1x1", w: 1, h: 1, label: "1×1", order: 0 },
            // @ts-expect-error component data must match the schema
            component: (props: { data: { name: number } }) => props.data.name,
          },
        },
      });
    }).toBeFunction();
  });
});
