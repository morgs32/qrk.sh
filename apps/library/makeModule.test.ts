import { primitives } from "@zerospin/schema";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { githubProfile } from "./modules/githubProfile/githubProfile";
import { githubRepo } from "./modules/githubRepo/githubRepo";
import { mapPlace } from "./modules/mapPlace/mapPlace";
import { text } from "./modules/text/text";
import { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import { makeModule } from "./makeModule";
import { ScraperApi } from "./scraper/ScraperApi";
import type { IScrapeError } from "./scraper/types.public";

describe("makeModule data contracts", () => {
  it("validates the enclosing content identity", () => {
    expect(() =>
      makeModule({
        id: "Invalid Content",
        label: "Invalid",
        description: "Test",
        dataShape: null,
        defaultData: null,
        xs: { component: () => null, w: 1, h: 1 },
      }),
    ).toThrow("makeModule: id must be kebab-case");
  });

  it("uses explicit nulls for a static content", () => {
    const content = makeModule({
      dataShape: null,
      defaultData: null,
      id: "static",
      label: "Static",
      description: "A static content.",
      xs: { component: () => null, w: 1, h: 1 },
    });

    expect("moduleOptionsShape" in content).toBe(false);
    expect("moduleOptionsForm" in content).toBe(false);
    expect(content.dataShape).toBeNull();
    expect(content.defaultData).toBeNull();
    expect("getData" in content).toBe(false);
    expect("moduleOptions" in content).toBe(false);

    expect("moduleOptionsShape" in githubRepo).toBe(false);
    expect("moduleOptionsForm" in githubRepo).toBe(false);
    expect(githubRepo.dataShape).toBeNull();
    expect(githubRepo.defaultData).toBeNull();
    expect("getData" in githubRepo).toBe(false);
  });

  it("preserves typed custom moduleOptions controls through the group", () => {
    const placeContent = mapPlace;

    if (placeContent?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(placeContent?.configuration?.moduleOptionsShape?.googlePlaceId).toMatchObject({
      kind: "text",
      nullable: false,
      defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
    });
    expect(placeContent?.configuration?.moduleOptionsForm).toBeTypeOf("function");
    expect(placeContent).not.toHaveProperty("moduleOptionsShape");
    expect(placeContent).not.toHaveProperty("moduleOptionsForm");
    expect(placeContent).not.toHaveProperty("getData");
    expect(placeContent?.defaultData).toMatchObject({
      googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
      name: "Downtown Chicago",
      latitude: 41.8781136,
      longitude: -87.6297982,
    });
  });

  it("uses a data form for locally authored text", () => {
    const content = text;
    expect(content.configuration?.configurationType).toBe("form");
    expect(content.defaultData).toEqual({ content: null });
    expect(content.dataShape?.content.kind).toBe("json");
  });

  it("infers custom renderer values from their decoded primitive fields", () => {
    const content = makeModule({
      id: "typed-controls",
      label: "Typed-controls",
      description: "Typed custom controls.",
      configuration: makeFetcherConfiguration({
        moduleOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        moduleOptionsForm: ({ value, onChange }) => {
          expectTypeOf(value.query).toEqualTypeOf<string>();
          expectTypeOf(value.zoom).toEqualTypeOf<number>();
          onChange(value);
          return null;
        },
        fetcher: async ({ moduleOptions, setData }) => {
          setData({
            result: `${moduleOptions.query}:${moduleOptions.zoom}`,
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
      xs: { component: (props: { data: { result: string } }) => props.data.result, w: 1, h: 1 },
    });

    if (content.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(content.configuration?.moduleOptionsForm).toBeTypeOf("function");
  });

  it("preserves the GitHub profile request, response, default, and callback contract", () => {
    const profileContent = githubProfile;

    if (profileContent?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(profileContent?.configuration?.moduleOptionsShape?.url).toMatchObject({
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
    const content = makeModule({
      id: "profile",
      label: "Profile",
      description: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        moduleOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ moduleOptions, setData }) => {
          receivedCatalogOptions.push(moduleOptions);
          setData({
            login: moduleOptions.url,
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
        moduleOptions: { url: "https://github.com/morgs32" },
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
      makeModule({
        id: "profile",
        label: "Profile",
        description: "A data-backed profile.",
        configuration: makeFetcherConfiguration({
          moduleOptionsShape: {
            url: primitives.text(),
          },
          fetcher: async ({ moduleOptions, setData }) => {
            void moduleOptions;
            setData({ login: "morgs32" });
            return { _tag: "Right", right: undefined };
          },
        }),
        dataShape: {
          login: primitives.text(),
        },
        defaultData: JSON.parse('{"login":42}'),
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
    const content = makeModule({
      id: "profile",
      label: "Profile",
      description: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        moduleOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ moduleOptions, setData }) => {
          receivedCatalogOptions.push(moduleOptions);
          setData({ login: moduleOptions.url });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
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
      content.configuration.fetcher({ api, setData, moduleOptions: {} }),
    ).rejects.toBeDefined();
    await expect(
      content.configuration.fetcher({
        api,
        setData,
        moduleOptions: { url: 42 },
      }),
    ).rejects.toBeDefined();
    await expect(
      content.configuration.fetcher({
        api,
        setData,
        moduleOptions: {
          url: "https://github.com/morgs32",
          unexpected: true,
        },
      }),
    ).rejects.toBeDefined();
    expect(receivedCatalogOptions).toEqual([]);
    expect(setData).not.toHaveBeenCalled();
  });

  it("propagates validation failures from the supplied setter", async () => {
    const content = makeModule({
      id: "profile",
      label: "Profile",
      description: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        moduleOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ moduleOptions, setData }) => {
          void moduleOptions;
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
        moduleOptions: { url: "https://github.com/morgs32" },
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
    const content = makeModule({
      id: "profile",
      label: "Profile",
      description: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        moduleOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ moduleOptions }) => {
          void moduleOptions;
          return { _tag: "Left", left: providerError };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
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
        moduleOptions: { url: "https://github.com/morgs32" },
      }),
    ).resolves.toEqual({ _tag: "Left", left: providerError });
    expect(setData).not.toHaveBeenCalled();
  });

  it("allows data components to ignore the data argument", () => {
    const content = makeModule({
      id: "default",
      label: "Default",
      description: "Data is available but unused.",
      dataShape: { name: primitives.text() },
      defaultData: { name: "Default" },
      xs: { component: () => null, w: 1, h: 1 },
    });
    expect(content.defaultData).toEqual({ name: "Default" });
  });

  it("requires a matching schema/default pair", () => {
    // Invalid declarations are compile-time assertions, not runtime inputs.
    expectTypeOf(() => {
      // @ts-expect-error both data fields are required
      makeModule({
        id: "static",
        label: "Static",
        description: "Static",
        xs: { component: () => null, w: 1, h: 1 },
      });
      // @ts-expect-error a null schema requires a null default
      makeModule({
        id: "static",
        label: "Static",
        description: "Static",
        dataShape: null,
        defaultData: {},
        xs: { component: () => null, w: 1, h: 1 },
      });
      // @ts-expect-error a schema requires a non-null default
      makeModule({
        id: "data",
        label: "Data",
        description: "Data",
        dataShape: { name: primitives.text() },
        defaultData: null,
        xs: { component: () => null, w: 1, h: 1 },
      });
      makeModule({
        id: "data",
        label: "Data",
        description: "Data",
        dataShape: { name: primitives.text() },
        // @ts-expect-error defaults must match the schema
        defaultData: { name: 42 },
        xs: { component: () => null, w: 1, h: 1 },
      });
      makeModule({
        id: "data",
        label: "Data",
        description: "Data",
        dataShape: { name: primitives.text() },
        defaultData: { name: "Default" },
        // @ts-expect-error component data must match the schema
        xs: { component: (props: { data: { name: number } }) => props.data.name, w: 1, h: 1 },
      });
    }).toBeFunction();
  });
});
