import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { githubCatalog } from "./catalogs/GitHubCards/GitHubProfileCatalog";
import { mapCatalog } from "./catalogs/Map/MapCatalog";
import { textBrickCatalog } from "./catalogs/TextBrick/TextBrickCatalog";
import { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import { makeRegistry } from "./makeRegistry";
import { ScraperApi } from "./scraper/ScraperApi";
import type { IScrapeError } from "./scraper/types.public";

describe("makeRegistry data contracts", () => {
  it("validates the enclosing content identity", () => {
    expect(() =>
      makeRegistry({
        registry: "Invalid Content",
        registryName: "Invalid",
        registryDescription: "Test",
        dataShape: null,
        defaultData: null,
        w: 1,
        h: 1,
        order: 0,
        xs: () => null,
      }),
    ).toThrow("makeRegistry: registry must be kebab-case");
  });

  it("uses explicit nulls for a static content", () => {
    const content = makeRegistry({
      dataShape: null,
      defaultData: null,
      registry: "static",
      registryName: "Static",
      registryDescription: "A static content.",
      w: 1,
      h: 1,
      order: 0,
      xs: () => null,
    });

    expect("registryOptionsShape" in content).toBe(false);
    expect("registryOptionsForm" in content).toBe(false);
    expect(content.dataShape).toBeNull();
    expect(content.defaultData).toBeNull();
    expect("getData" in content).toBe(false);
    expect("registryOptions" in content).toBe(false);

    expect("registryOptionsShape" in githubCatalog.registries.repo).toBe(false);
    expect("registryOptionsForm" in githubCatalog.registries.repo).toBe(false);
    expect(githubCatalog.registries.repo.dataShape).toBeNull();
    expect(githubCatalog.registries.repo.defaultData).toBeNull();
    expect("getData" in githubCatalog.registries.repo).toBe(false);
  });

  it("preserves typed custom registryOptions controls through the catalog", () => {
    const placeContent = mapCatalog.registries.place;

    if (placeContent?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(placeContent?.configuration?.registryOptionsShape?.googlePlaceId).toMatchObject({
      kind: "text",
      nullable: false,
      defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
    });
    expect(placeContent?.configuration?.registryOptionsForm).toBeTypeOf("function");
    expect(placeContent).not.toHaveProperty("registryOptionsShape");
    expect(placeContent).not.toHaveProperty("registryOptionsForm");
    expect(placeContent).not.toHaveProperty("getData");
    expect(placeContent?.defaultData).toMatchObject({
      googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
      name: "Downtown Chicago",
      latitude: 41.8781136,
      longitude: -87.6297982,
    });
  });

  it("uses a data form for locally authored text", () => {
    const content = textBrickCatalog.registries.default;
    expect(content.configuration?.configurationType).toBe("form");
    expect(content.defaultData).toEqual({ content: null });
    expect(content.dataShape?.content.kind).toBe("json");
  });

  it("infers custom renderer values from their decoded primitive fields", () => {
    const content = makeRegistry({
      registry: "typed-controls",
      registryName: "Typed-controls",
      registryDescription: "Typed custom controls.",
      configuration: makeFetcherConfiguration({
        registryOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        registryOptionsForm: ({ value, onChange }) => {
          expectTypeOf(value.query).toEqualTypeOf<string>();
          expectTypeOf(value.zoom).toEqualTypeOf<number>();
          onChange(value);
          return null;
        },
        fetcher: async ({ registryOptions, setData }) => {
          setData({
            result: `${registryOptions.query}:${registryOptions.zoom}`,
          });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        result: primitives.text(),
      },
      defaultData: {
        result: "Chicago",
      },
      w: 1,
      h: 1,
      order: 0,
      xs: (props: { data: { result: string } }) => props.data.result,
    });

    if (content.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(content.configuration?.registryOptionsForm).toBeTypeOf("function");
  });

  it("preserves the GitHub profile request, response, default, and callback contract", () => {
    const profileContent = githubCatalog.registries.profile;

    if (profileContent?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(profileContent?.configuration?.registryOptionsShape?.url).toMatchObject({
      kind: "text",
      nullable: false,
      defaultValue: "https://github.com/morgs32",
    });
    expect(profileContent?.dataShape).toMatchObject({
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
    expect(profileContent?.defaultData).toMatchObject({
      id: 1364795,
      login: "morgs32",
      name: "Morgan Intrator",
    });
    expect(profileContent?.configuration?.fetcher).toBeTypeOf("function");
  });

  it("decodes requests and publishes provider data through the supplied setter", async () => {
    const receivedRegistryOptions: Array<{ url: string }> = [];
    const content = makeRegistry({
      registry: "profile",
      registryName: "Profile",
      registryDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        registryOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ registryOptions, setData }) => {
          receivedRegistryOptions.push(registryOptions);
          setData({
            login: registryOptions.url,
            providerField: "loaded-provider-value",
          });
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
      w: 1,
      h: 1,
      order: 0,
      xs: (props: { data: { login: string } }) => {
        return props.data.login;
      },
    });
    if (
      content.configuration === undefined ||
      !("fetcher" in content.configuration) ||
      content.configuration.fetcher === undefined
    ) {
      throw new Error("Expected a fetched content");
    }
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();

    await expect(
      content.configuration.fetcher({
        api,
        setData,
        registryOptions: { url: "https://github.com/morgs32" },
      }),
    ).resolves.toEqual({
      _tag: "Right",
      right: undefined,
    });
    expect(setData).toHaveBeenCalledExactlyOnceWith({
      login: "https://github.com/morgs32",
      providerField: "loaded-provider-value",
    });
    expect(content.configuration.configurationType).toBe("fetcher");
    expect(receivedRegistryOptions).toEqual([{ url: "https://github.com/morgs32" }]);
  });

  it("throws while constructing a content with invalid default data", () => {
    expect(() =>
      makeRegistry({
        registry: "profile",
        registryName: "Profile",
        registryDescription: "A data-backed profile.",
        configuration: makeFetcherConfiguration({
          registryOptionsShape: {
            url: primitives.text(),
          },
          fetcher: async ({ registryOptions, setData }) => {
            void registryOptions;
            setData({ login: "morgs32" });
            return { _tag: "Right", right: undefined };
          },
        }),
        dataShape: {
          login: primitives.text(),
        },
        defaultData: JSON.parse('{"login":42}'),
        w: 1,
        h: 1,
        order: 0,
        xs: (props: { data: { login: string } }) => {
          return props.data.login;
        },
      }),
    ).toThrow();
  });

  it("rejects missing, invalid, and excess registry options before invoking the callback", async () => {
    const receivedRegistryOptions: Array<{ url: string }> = [];
    const content = makeRegistry({
      registry: "profile",
      registryName: "Profile",
      registryDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        registryOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ registryOptions, setData }) => {
          receivedRegistryOptions.push(registryOptions);
          setData({ login: registryOptions.url });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      w: 1,
      h: 1,
      order: 0,
      xs: (props: { data: { login: string } }) => {
        return props.data.login;
      },
    });
    if (
      content.configuration === undefined ||
      !("fetcher" in content.configuration) ||
      content.configuration.fetcher === undefined
    ) {
      throw new Error("Expected a fetched content");
    }
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();

    await expect(
      content.configuration.fetcher({ api, setData, registryOptions: {} }),
    ).rejects.toBeDefined();
    await expect(
      content.configuration.fetcher({
        api,
        setData,
        registryOptions: { url: 42 },
      }),
    ).rejects.toBeDefined();
    await expect(
      content.configuration.fetcher({
        api,
        setData,
        registryOptions: {
          url: "https://github.com/morgs32",
          unexpected: true,
        },
      }),
    ).rejects.toBeDefined();
    expect(receivedRegistryOptions).toEqual([]);
    expect(setData).not.toHaveBeenCalled();
  });

  it("propagates validation failures from the supplied setter", async () => {
    const content = makeRegistry({
      registry: "profile",
      registryName: "Profile",
      registryDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        registryOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ registryOptions, setData }) => {
          void registryOptions;
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
      w: 1,
      h: 1,
      order: 0,
      xs: (props: { data: { login: string } }) => {
        return props.data.login;
      },
    });
    if (
      content.configuration === undefined ||
      !("fetcher" in content.configuration) ||
      content.configuration.fetcher === undefined
    ) {
      throw new Error("Expected a fetched content");
    }
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn(() => {
      throw new Error("Invalid content data");
    });

    await expect(
      content.configuration.fetcher({
        api,
        setData,
        registryOptions: { url: "https://github.com/morgs32" },
      }),
    ).rejects.toThrow("Invalid content data");
    expect(setData).toHaveBeenCalledExactlyOnceWith({ login: 42 });
  });

  it("passes provider Left results through unchanged", async () => {
    const providerError: IScrapeError = {
      code: "profile-unavailable",
      message: "GitHub authentication or access failed with HTTP 401",
      retryable: false,
    };
    const content = makeRegistry({
      registry: "profile",
      registryName: "Profile",
      registryDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        registryOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ registryOptions }) => {
          void registryOptions;
          return { _tag: "Left", left: providerError };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      w: 1,
      h: 1,
      order: 0,
      xs: (props: { data: { login: string } }) => {
        return props.data.login;
      },
    });
    if (
      content.configuration === undefined ||
      !("fetcher" in content.configuration) ||
      content.configuration.fetcher === undefined
    ) {
      throw new Error("Expected a fetched content");
    }
    const api = Object.create(ScraperApi.prototype);
    const setData = vi.fn();

    await expect(
      content.configuration.fetcher({
        api,
        setData,
        registryOptions: { url: "https://github.com/morgs32" },
      }),
    ).resolves.toEqual({ _tag: "Left", left: providerError });
    expect(setData).not.toHaveBeenCalled();
  });

  it("allows data components to ignore the data argument", () => {
    const content = makeRegistry({
      registry: "default",
      registryName: "Default",
      registryDescription: "Data is available but unused.",
      dataShape: { name: primitives.text() },
      defaultData: { name: "Default" },
      w: 1,
      h: 1,
      order: 0,
      xs: () => null,
    });
    expect(content.defaultData).toEqual({ name: "Default" });
  });

  it("requires a matching schema/default pair", () => {
    // Invalid declarations are compile-time assertions, not runtime inputs.
    expectTypeOf(() => {
      // @ts-expect-error both data fields are required
      makeRegistry({
        registry: "static",
        registryName: "Static",
        registryDescription: "Static",
        w: 1,
        h: 1,
        order: 0,
        xs: () => null,
      });
      // @ts-expect-error a null schema requires a null default
      makeRegistry({
        registry: "static",
        registryName: "Static",
        registryDescription: "Static",
        dataShape: null,
        defaultData: {},
        w: 1,
        h: 1,
        order: 0,
        xs: () => null,
      });
      // @ts-expect-error a schema requires a non-null default
      makeRegistry({
        registry: "data",
        registryName: "Data",
        registryDescription: "Data",
        dataShape: { name: primitives.text() },
        defaultData: null,
        w: 1,
        h: 1,
        order: 0,
        xs: () => null,
      });
      makeRegistry({
        registry: "data",
        registryName: "Data",
        registryDescription: "Data",
        dataShape: { name: primitives.text() },
        // @ts-expect-error defaults must match the schema
        defaultData: { name: 42 },
        w: 1,
        h: 1,
        order: 0,
        xs: () => null,
      });
      makeRegistry({
        registry: "data",
        registryName: "Data",
        registryDescription: "Data",
        dataShape: { name: primitives.text() },
        defaultData: { name: "Default" },
        w: 1,
        h: 1,
        order: 0,
        // @ts-expect-error component data must match the schema
        xs: (props: { data: { name: number } }) => props.data.name,
      });
    }).toBeFunction();
  });
});
