import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { githubGroup } from "./groups/github/githubGroup";
import { mapGroup } from "./groups/map/mapGroup";
import { textBrickGroup } from "./groups/text/textBrickGroup";
import { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import { makeCatalog } from "./makeCatalog";
import { ScraperApi } from "./scraper/ScraperApi";
import type { IScrapeError } from "./scraper/types.public";

describe("makeCatalog data contracts", () => {
  it("validates the enclosing content identity", () => {
    expect(() =>
      makeCatalog({
        id: "Invalid Content",
        label: "Invalid",
        description: "Test",
        dataShape: null,
        defaultData: null,
        order: 0,
        xs: { component: () => null, w: 1, h: 1 },
      }),
    ).toThrow("makeCatalog: id must be kebab-case");
  });

  it("uses explicit nulls for a static content", () => {
    const content = makeCatalog({
      dataShape: null,
      defaultData: null,
      id: "static",
      label: "Static",
      description: "A static content.",
      order: 0,
      xs: { component: () => null, w: 1, h: 1 },
    });

    expect("catalogOptionsShape" in content).toBe(false);
    expect("catalogOptionsForm" in content).toBe(false);
    expect(content.dataShape).toBeNull();
    expect(content.defaultData).toBeNull();
    expect("getData" in content).toBe(false);
    expect("catalogOptions" in content).toBe(false);

    expect("catalogOptionsShape" in githubGroup.catalogs.repo).toBe(false);
    expect("catalogOptionsForm" in githubGroup.catalogs.repo).toBe(false);
    expect(githubGroup.catalogs.repo.dataShape).toBeNull();
    expect(githubGroup.catalogs.repo.defaultData).toBeNull();
    expect("getData" in githubGroup.catalogs.repo).toBe(false);
  });

  it("preserves typed custom catalogOptions controls through the group", () => {
    const placeContent = mapGroup.catalogs.place;

    if (placeContent?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(placeContent?.configuration?.catalogOptionsShape?.googlePlaceId).toMatchObject({
      kind: "text",
      nullable: false,
      defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
    });
    expect(placeContent?.configuration?.catalogOptionsForm).toBeTypeOf("function");
    expect(placeContent).not.toHaveProperty("catalogOptionsShape");
    expect(placeContent).not.toHaveProperty("catalogOptionsForm");
    expect(placeContent).not.toHaveProperty("getData");
    expect(placeContent?.defaultData).toMatchObject({
      googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
      name: "Downtown Chicago",
      latitude: 41.8781136,
      longitude: -87.6297982,
    });
  });

  it("uses a data form for locally authored text", () => {
    const content = textBrickGroup.catalogs.default;
    expect(content.configuration?.configurationType).toBe("form");
    expect(content.defaultData).toEqual({ content: null });
    expect(content.dataShape?.content.kind).toBe("json");
  });

  it("infers custom renderer values from their decoded primitive fields", () => {
    const content = makeCatalog({
      id: "typed-controls",
      label: "Typed-controls",
      description: "Typed custom controls.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        catalogOptionsForm: ({ value, onChange }) => {
          expectTypeOf(value.query).toEqualTypeOf<string>();
          expectTypeOf(value.zoom).toEqualTypeOf<number>();
          onChange(value);
          return null;
        },
        fetcher: async ({ catalogOptions, setData }) => {
          setData({
            result: `${catalogOptions.query}:${catalogOptions.zoom}`,
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
      order: 0,
      xs: { component: (props: { data: { result: string } }) => props.data.result, w: 1, h: 1 },
    });

    if (content.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(content.configuration?.catalogOptionsForm).toBeTypeOf("function");
  });

  it("preserves the GitHub profile request, response, default, and callback contract", () => {
    const profileContent = githubGroup.catalogs.profile;

    if (profileContent?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(profileContent?.configuration?.catalogOptionsShape?.url).toMatchObject({
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
    const receivedCatalogOptions: Array<{ url: string }> = [];
    const content = makeCatalog({
      id: "profile",
      label: "Profile",
      description: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ catalogOptions, setData }) => {
          receivedCatalogOptions.push(catalogOptions);
          setData({
            login: catalogOptions.url,
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
      order: 0,
      xs: {
        component: (props: { data: { login: string } }) => {
          return props.data.login;
        },
        w: 1,
        h: 1,
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
        catalogOptions: { url: "https://github.com/morgs32" },
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
    expect(receivedCatalogOptions).toEqual([{ url: "https://github.com/morgs32" }]);
  });

  it("throws while constructing a content with invalid default data", () => {
    expect(() =>
      makeCatalog({
        id: "profile",
        label: "Profile",
        description: "A data-backed profile.",
        configuration: makeFetcherConfiguration({
          catalogOptionsShape: {
            url: primitives.text(),
          },
          fetcher: async ({ catalogOptions, setData }) => {
            void catalogOptions;
            setData({ login: "morgs32" });
            return { _tag: "Right", right: undefined };
          },
        }),
        dataShape: {
          login: primitives.text(),
        },
        defaultData: JSON.parse('{"login":42}'),
        order: 0,
        xs: {
          component: (props: { data: { login: string } }) => {
            return props.data.login;
          },
          w: 1,
          h: 1,
        },
      }),
    ).toThrow();
  });

  it("rejects missing, invalid, and excess catalog options before invoking the callback", async () => {
    const receivedCatalogOptions: Array<{ url: string }> = [];
    const content = makeCatalog({
      id: "profile",
      label: "Profile",
      description: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ catalogOptions, setData }) => {
          receivedCatalogOptions.push(catalogOptions);
          setData({ login: catalogOptions.url });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      order: 0,
      xs: {
        component: (props: { data: { login: string } }) => {
          return props.data.login;
        },
        w: 1,
        h: 1,
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
      content.configuration.fetcher({ api, setData, catalogOptions: {} }),
    ).rejects.toBeDefined();
    await expect(
      content.configuration.fetcher({
        api,
        setData,
        catalogOptions: { url: 42 },
      }),
    ).rejects.toBeDefined();
    await expect(
      content.configuration.fetcher({
        api,
        setData,
        catalogOptions: {
          url: "https://github.com/morgs32",
          unexpected: true,
        },
      }),
    ).rejects.toBeDefined();
    expect(receivedCatalogOptions).toEqual([]);
    expect(setData).not.toHaveBeenCalled();
  });

  it("propagates validation failures from the supplied setter", async () => {
    const content = makeCatalog({
      id: "profile",
      label: "Profile",
      description: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ catalogOptions, setData }) => {
          void catalogOptions;
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
      order: 0,
      xs: {
        component: (props: { data: { login: string } }) => {
          return props.data.login;
        },
        w: 1,
        h: 1,
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
        catalogOptions: { url: "https://github.com/morgs32" },
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
    const content = makeCatalog({
      id: "profile",
      label: "Profile",
      description: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ catalogOptions }) => {
          void catalogOptions;
          return { _tag: "Left", left: providerError };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      order: 0,
      xs: {
        component: (props: { data: { login: string } }) => {
          return props.data.login;
        },
        w: 1,
        h: 1,
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
        catalogOptions: { url: "https://github.com/morgs32" },
      }),
    ).resolves.toEqual({ _tag: "Left", left: providerError });
    expect(setData).not.toHaveBeenCalled();
  });

  it("allows data components to ignore the data argument", () => {
    const content = makeCatalog({
      id: "default",
      label: "Default",
      description: "Data is available but unused.",
      dataShape: { name: primitives.text() },
      defaultData: { name: "Default" },
      order: 0,
      xs: { component: () => null, w: 1, h: 1 },
    });
    expect(content.defaultData).toEqual({ name: "Default" });
  });

  it("requires a matching schema/default pair", () => {
    // Invalid declarations are compile-time assertions, not runtime inputs.
    expectTypeOf(() => {
      // @ts-expect-error both data fields are required
      makeCatalog({
        id: "static",
        label: "Static",
        description: "Static",
        order: 0,
        xs: { component: () => null, w: 1, h: 1 },
      });
      // @ts-expect-error a null schema requires a null default
      makeCatalog({
        id: "static",
        label: "Static",
        description: "Static",
        dataShape: null,
        defaultData: {},
        order: 0,
        xs: { component: () => null, w: 1, h: 1 },
      });
      // @ts-expect-error a schema requires a non-null default
      makeCatalog({
        id: "data",
        label: "Data",
        description: "Data",
        dataShape: { name: primitives.text() },
        defaultData: null,
        order: 0,
        xs: { component: () => null, w: 1, h: 1 },
      });
      makeCatalog({
        id: "data",
        label: "Data",
        description: "Data",
        dataShape: { name: primitives.text() },
        // @ts-expect-error defaults must match the schema
        defaultData: { name: 42 },
        order: 0,
        xs: { component: () => null, w: 1, h: 1 },
      });
      makeCatalog({
        id: "data",
        label: "Data",
        description: "Data",
        dataShape: { name: primitives.text() },
        defaultData: { name: "Default" },
        order: 0,
        // @ts-expect-error component data must match the schema
        xs: { component: (props: { data: { name: number } }) => props.data.name, w: 1, h: 1 },
      });
    }).toBeFunction();
  });
});
