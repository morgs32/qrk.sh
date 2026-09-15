import { makeFetcherConfiguration } from "./makeFetcherConfiguration";
import { primitives } from "@zerospin/schema";
import { textBrickCatalog } from "./catalogs/TextBrick/TextBrickCatalog";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import { ScraperApi } from "./scraper/ScraperApi";
import type { IScrapeError } from "./scraper/types.public";

import { githubCatalog } from "./catalogs/GitHubCards/GitHubProfileCatalog";
import { mapCatalog } from "./catalogs/Map/MapCatalog";
import { makeContent } from "./makeContent";
import { makeView } from "./makeView";

describe("makeContent data contracts", () => {
  it("rejects mismatched view keys at runtime", () => {
    const view = makeView({
      id: "activity",
      label: "Activity",
      w: 4,
      h: 2,
      order: 0,
      xs: () => null,
    });
    expect(() =>
      makeContent({
        content: "default",
        contentName: "Default",
        contentDescription: "Test",
        dataShape: null,
        defaultData: null,
        views: {
          // @ts-expect-error Exercise the runtime guard for untyped callers.
          summary: view,
        },
      }),
    ).toThrow('makeContent: view key "summary" must match id "activity"');
  });

  it("validates the enclosing content identity", () => {
    expect(() =>
      makeContent({
        content: "Invalid Content",
        contentName: "Invalid",
        contentDescription: "Test",
        dataShape: null,
        defaultData: null,
        views: {},
      }),
    ).toThrow("makeContent: content must be kebab-case");
  });

  it("uses explicit nulls for a static content", () => {
    const content = makeContent({
      dataShape: null,
      defaultData: null,
      content: "static",
      contentName: "Static",
      contentDescription: "A static content.",
      views: {
        "1x1": {
          id: "1x1",
          w: 1,
          h: 1,
          label: "1×1",
          order: 0,

          component: () => null,
        },
      },
    });

    expect("contentOptionsShape" in content).toBe(false);
    expect("contentOptionsForm" in content).toBe(false);
    expect(content.dataShape).toBeNull();
    expect(content.defaultData).toBeNull();
    expect("getData" in content).toBe(false);
    expect("contentOptions" in content).toBe(false);

    expect("contentOptionsShape" in githubCatalog.contents.repo).toBe(false);
    expect("contentOptionsForm" in githubCatalog.contents.repo).toBe(false);
    expect(githubCatalog.contents.repo.dataShape).toBeNull();
    expect(githubCatalog.contents.repo.defaultData).toBeNull();
    expect("getData" in githubCatalog.contents.repo).toBe(false);
  });

  it("preserves typed custom contentOptions controls through the catalog", () => {
    const placeContent = mapCatalog.contents.place;

    if (placeContent?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(placeContent?.configuration?.contentOptionsShape?.googlePlaceId).toMatchObject({
      kind: "text",
      nullable: false,
      defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
    });
    expect(placeContent?.configuration?.contentOptionsForm).toBeTypeOf("function");
    expect(placeContent).not.toHaveProperty("contentOptionsShape");
    expect(placeContent).not.toHaveProperty("contentOptionsForm");
    expect(placeContent).not.toHaveProperty("getData");
    expect(placeContent?.defaultData).toMatchObject({
      googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
      name: "Downtown Chicago",
      latitude: 41.8781136,
      longitude: -87.6297982,
    });
  });

  it("uses a data form for locally authored text", () => {
    const content = textBrickCatalog.contents.default;
    expect(content.configuration?.configurationType).toBe("form");
    expect(content.defaultData).toEqual({ content: null });
    expect(content.dataShape?.content.kind).toBe("json");
  });

  it("infers custom renderer values from their decoded primitive fields", () => {
    const content = makeContent({
      content: "typed-controls",
      contentName: "Typed-controls",
      contentDescription: "Typed custom controls.",
      configuration: makeFetcherConfiguration({
        contentOptionsShape: {
          query: primitives.text({ defaultValue: "Chicago" }),
          zoom: primitives.integer({ defaultValue: 14 }),
        },
        contentOptionsForm: ({ value, onChange }) => {
          expectTypeOf(value.query).toEqualTypeOf<string>();
          expectTypeOf(value.zoom).toEqualTypeOf<number>();
          onChange(value);
          return null;
        },
        fetcher: async ({ contentOptions, setData }) => {
          setData({ result: `${contentOptions.query}:${contentOptions.zoom}` });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        result: primitives.text(),
      },
      defaultData: {
        result: "Chicago",
      },
      views: {
        "1x1": {
          id: "1x1",
          w: 1,
          h: 1,
          label: "1×1",
          order: 0,

          component: (props: { data: { result: string } }) => props.data.result,
        },
      },
    });

    if (content.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(content.configuration?.contentOptionsForm).toBeTypeOf("function");
  });

  it("preserves the GitHub profile request, response, default, and callback contract", () => {
    const profileContent = githubCatalog.contents.profile;

    if (profileContent?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(profileContent?.configuration?.contentOptionsShape?.url).toMatchObject({
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
    const receivedContentOptions: Array<{ url: string }> = [];
    const content = makeContent({
      content: "profile",
      contentName: "Profile",
      contentDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        contentOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ contentOptions, setData }) => {
          receivedContentOptions.push(contentOptions);
          setData({ login: contentOptions.url, providerField: "loaded-provider-value" });
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
      views: {
        "1x1": {
          id: "1x1",
          w: 1,
          h: 1,
          label: "1×1",
          order: 0,

          component: (props: { data: { login: string } }) => {
            return props.data.login;
          },
        },
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
        contentOptions: { url: "https://github.com/morgs32" },
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
    expect(receivedContentOptions).toEqual([{ url: "https://github.com/morgs32" }]);
  });

  it("throws while constructing a content with invalid default data", () => {
    expect(() =>
      makeContent({
        content: "profile",
        contentName: "Profile",
        contentDescription: "A data-backed profile.",
        configuration: makeFetcherConfiguration({
          contentOptionsShape: {
            url: primitives.text(),
          },
          fetcher: async ({ contentOptions, setData }) => {
            void contentOptions;
            setData({ login: "morgs32" });
            return { _tag: "Right", right: undefined };
          },
        }),
        dataShape: {
          login: primitives.text(),
        },
        defaultData: JSON.parse('{"login":42}'),
        views: {
          "1x1": {
            id: "1x1",
            w: 1,
            h: 1,
            label: "1×1",
            order: 0,

            component: (props: { data: { login: string } }) => {
              return props.data.login;
            },
          },
        },
      }),
    ).toThrow();
  });

  it("rejects missing, invalid, and excess content options before invoking the callback", async () => {
    const receivedContentOptions: Array<{ url: string }> = [];
    const content = makeContent({
      content: "profile",
      contentName: "Profile",
      contentDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        contentOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ contentOptions, setData }) => {
          receivedContentOptions.push(contentOptions);
          setData({ login: contentOptions.url });
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      views: {
        "1x1": {
          id: "1x1",
          w: 1,
          h: 1,
          label: "1×1",
          order: 0,

          component: (props: { data: { login: string } }) => {
            return props.data.login;
          },
        },
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
      content.configuration.fetcher({ api, setData, contentOptions: {} }),
    ).rejects.toBeDefined();
    await expect(
      content.configuration.fetcher({
        api,
        setData,
        contentOptions: { url: 42 },
      }),
    ).rejects.toBeDefined();
    await expect(
      content.configuration.fetcher({
        api,
        setData,
        contentOptions: {
          url: "https://github.com/morgs32",
          unexpected: true,
        },
      }),
    ).rejects.toBeDefined();
    expect(receivedContentOptions).toEqual([]);
    expect(setData).not.toHaveBeenCalled();
  });

  it("propagates validation failures from the supplied setter", async () => {
    const content = makeContent({
      content: "profile",
      contentName: "Profile",
      contentDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        contentOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ contentOptions, setData }) => {
          void contentOptions;
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
      views: {
        "1x1": {
          id: "1x1",
          w: 1,
          h: 1,
          label: "1×1",
          order: 0,

          component: (props: { data: { login: string } }) => {
            return props.data.login;
          },
        },
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
        contentOptions: { url: "https://github.com/morgs32" },
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
    const content = makeContent({
      content: "profile",
      contentName: "Profile",
      contentDescription: "A data-backed profile.",
      configuration: makeFetcherConfiguration({
        contentOptionsShape: {
          url: primitives.text(),
        },
        fetcher: async ({ contentOptions }) => {
          void contentOptions;
          return { _tag: "Left", left: providerError };
        },
      }),
      dataShape: {
        login: primitives.text(),
      },
      defaultData: {
        login: "default-profile",
      },
      views: {
        "1x1": {
          id: "1x1",
          w: 1,
          h: 1,
          label: "1×1",
          order: 0,

          component: (props: { data: { login: string } }) => {
            return props.data.login;
          },
        },
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
        contentOptions: { url: "https://github.com/morgs32" },
      }),
    ).resolves.toEqual({ _tag: "Left", left: providerError });
    expect(setData).not.toHaveBeenCalled();
  });

  it("allows data components to ignore the data argument", () => {
    const content = makeContent({
      content: "default",
      contentName: "Default",
      contentDescription: "Data is available but unused.",
      dataShape: { name: primitives.text() },
      defaultData: { name: "Default" },
      views: {
        "1x1": {
          id: "1x1",
          w: 1,
          h: 1,
          label: "1×1",
          order: 0,
          component: () => null,
        },
      },
    });
    expect(content.defaultData).toEqual({ name: "Default" });
  });

  it("requires a matching schema/default pair", () => {
    // Invalid declarations are compile-time assertions, not runtime inputs.
    expectTypeOf(() => {
      // @ts-expect-error both data fields are required
      makeContent({
        content: "static",
        contentName: "Static",
        contentDescription: "Static",
        views: {},
      });
      // @ts-expect-error a null schema requires a null default
      makeContent({
        content: "static",
        contentName: "Static",
        contentDescription: "Static",
        dataShape: null,
        defaultData: {},
        views: {},
      });
      // @ts-expect-error a schema requires a non-null default
      makeContent({
        content: "data",
        contentName: "Data",
        contentDescription: "Data",
        dataShape: { name: primitives.text() },
        defaultData: null,
        views: {},
      });
      makeContent({
        content: "data",
        contentName: "Data",
        contentDescription: "Data",
        dataShape: { name: primitives.text() },
        // @ts-expect-error defaults must match the schema
        defaultData: { name: 42 },
        views: {},
      });
      makeContent({
        content: "data",
        contentName: "Data",
        contentDescription: "Data",
        dataShape: { name: primitives.text() },
        defaultData: { name: "Default" },
        views: {
          "1x1": {
            id: "1x1",
            w: 1,
            h: 1,
            label: "1×1",
            order: 0,
            // @ts-expect-error component data must match the schema
            component: (props: { data: { name: number } }) => props.data.name,
          },
        },
      });
    }).toBeFunction();
  });
});
