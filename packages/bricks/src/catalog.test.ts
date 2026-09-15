import { createElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { catalogsHash } from "./catalogsHash";
import { makeCatalog } from "./makeCatalog";
import { makeRegistry } from "./makeRegistry";

describe("brick catalog identity", () => {
  it("resolves repo XS dimensions and inherits SM dimensions above XS", () => {
    const def = catalogsHash.github.registries.repo.def;
    expect(def.xs).toEqual({ w: 4, h: 6 });
    expect(def.sm).toEqual({ w: 4, h: 2 });
    expect(def.lg).toEqual(def.sm);
    expect(def.xl).toEqual(def.sm);
  });
  it("registers unique kebab-case catalog, content, and view identities", () => {
    const catalogNames = new Set<string>();
    const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    for (const catalog of Object.values(catalogsHash)) {
      expect(kebabCase.test(catalog.catalogName)).toBe(true);
      expect(catalogNames.has(catalog.catalogName)).toBe(false);
      catalogNames.add(catalog.catalogName);

      for (const [registryName, content] of Object.entries(catalog.registries)) {
        expect(kebabCase.test(registryName)).toBe(true);
        expect(content.registryDescription.trim()).not.toBe("");

        expect(content.def.registry).toBe(registryName);
        expect(catalog.registries[content.def.registry]).toBe(content);
        expect(content).not.toHaveProperty("views");
        expect(content.def).not.toHaveProperty("view");
      }
    }

    expect(catalogNames.size).toBe(10);
  });

  it("uses default for catalogs with one content content", () => {
    for (const catalog of Object.values(catalogsHash)) {
      if (
        catalog.catalogName === "github" ||
        catalog.catalogName === "figma" ||
        catalog.catalogName === "map"
      ) {
        continue;
      }

      expect(Object.keys(catalog.registries)).toEqual(["default"]);
    }
  });

  it("registers one data-backed Figma thumbnail content", () => {
    const catalog = catalogsHash.figma;
    expect(Object.keys(catalog.registries)).toEqual(["thumbnail"]);
    const thumbnail = catalog.registries.thumbnail;
    expect(thumbnail.def.xs).toEqual({ w: 4, h: 4 });
    expect(thumbnail.configuration?.configurationType).toBe("fetcher");
    expect(thumbnail.dataShape).toHaveProperty("thumbnail_url");
    expect(thumbnail.defaultData).toMatchObject({
      title: "Figma Thumbnail",
      url: "",
    });
  });

  it("registers the data-backed Link default 4x2 content", () => {
    const linkCatalog = catalogsHash.link;
    const defaultContent = linkCatalog.registries.default;

    expect(Object.keys(linkCatalog.registries)).toEqual(["default"]);
    if (defaultContent.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultContent.configuration?.registryOptionsShape).toHaveProperty("url");
    expect(defaultContent.dataShape).toMatchObject({
      url: { kind: "text" },
      title: { kind: "text" },
      description: { kind: "text" },
      siteName: { kind: "text" },
      imageUrl: { kind: "text" },
      iconUrl: { kind: "text" },
    });
    expect(defaultContent.defaultData).toMatchObject({
      title: "Celebrate our birthday & get Pro free for one year",
      siteName: "apps.apple.com",
    });
    expect(defaultContent.configuration?.fetcher).toBeTypeOf("function");
  });

  it("registers the tokenless TikTok creator embed", () => {
    const tikTokCatalog = catalogsHash.tiktok;
    const defaultContent = tikTokCatalog.registries.default;

    expect(Object.keys(tikTokCatalog.registries)).toEqual(["default"]);
    if (defaultContent.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultContent.configuration?.registryOptionsShape).toHaveProperty("url");
    expect(defaultContent.dataShape).toMatchObject({
      username: { kind: "text" },
    });
    expect(defaultContent.defaultData).toEqual({ username: "theonion" });
    expect(defaultContent.configuration?.fetcher).toBeTypeOf("function");
  });

  it("registers locally authored Tiptap JSON for the Text catalog", () => {
    const textCatalog = catalogsHash.text;
    const defaultContent = textCatalog.registries.default;

    expect(textCatalog.catalogLabel).toBe("Text");
    if (defaultContent.configuration?.configurationType !== "form") {
      throw new Error("Expected form configuration");
    }
    expect(defaultContent.dataShape?.content).toMatchObject({
      kind: "json",
      nullable: true,
      defaultValue: null,
    });
    expect(defaultContent.configuration?.form).toBeTypeOf("function");
    expect(defaultContent.defaultData).toEqual({ content: null });
  });
});

it("validates registry keys and keeps identity independent of dimensions", () => {
  const registry = makeRegistry({
    registry: "summary",
    registryName: "Summary",
    registryDescription: "Test registry",
    dataShape: null,
    defaultData: null,

    order: 0,
    xs: { component: () => "Summary content", w: 4, h: 2 },
  });
  expect(() =>
    makeCatalog({
      catalogName: "test",
      catalogLabel: "Test",
      catalogDescription: "Test",
      registries: { wrong: registry },
    }),
  ).toThrow('registry key "wrong" must match registry "summary"');
  const catalog = makeCatalog({
    catalogName: "test",
    catalogLabel: "Test",
    catalogDescription: "Test",
    registries: { summary: registry },
  });
  expect(catalog.registries.summary.def).toEqual({
    catalogName: "test",
    catalogLabel: "Test",
    registry: "summary",
    label: "Summary",
    xs: { w: 4, h: 2 },
    sm: { w: 4, h: 2 },
    lg: { w: 4, h: 2 },
    xl: { w: 4, h: 2 },
    order: 0,
    data: null,
  });
  expect(
    renderToStaticMarkup(createElement(catalog.registries.summary.component, { breakpoint: "xs" })),
  ).toBe("Summary content");
});
