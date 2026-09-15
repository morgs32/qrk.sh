import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { makeView } from "./makeView";
import { makeContent } from "./makeContent";
import { makeCatalog } from "./makeCatalog";

import { catalogsHash } from "./catalogsHash";

describe("brick catalog identity", () => {
  it("registers unique kebab-case catalog, content, and view identities", () => {
    const catalogNames = new Set<string>();
    const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    for (const catalog of Object.values(catalogsHash)) {
      expect(kebabCase.test(catalog.catalogName)).toBe(true);
      expect(catalogNames.has(catalog.catalogName)).toBe(false);
      catalogNames.add(catalog.catalogName);

      for (const [contentName, content] of Object.entries(catalog.contents)) {
        expect(kebabCase.test(contentName)).toBe(true);
        expect(content.contentDescription.trim()).not.toBe("");

        for (const [viewName, brick] of Object.entries(content.views)) {
          expect(kebabCase.test(viewName)).toBe(true);
          expect(brick.def.content).toBe(contentName);
          expect(brick.def.view).toBe(viewName);
          expect(catalog.contents[brick.def.content]?.views[brick.def.view]).toBe(brick);
        }
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

      expect(Object.keys(catalog.contents)).toEqual(["default"]);
    }
  });

  it("registers one data-backed Figma thumbnail content", () => {
    const catalog = catalogsHash.figma;
    expect(Object.keys(catalog.contents)).toEqual(["thumbnail"]);
    const thumbnail = catalog.contents.thumbnail;
    expect(Object.keys(thumbnail.views)).toEqual(["4x4"]);
    expect(thumbnail.views["4x4"].def).toMatchObject({ w: 4, h: 4 });
    expect(thumbnail.configuration?.configurationType).toBe("fetcher");
    expect(thumbnail.dataShape).toHaveProperty("thumbnail_url");
    expect(thumbnail.defaultData).toMatchObject({ title: "Figma Thumbnail", url: "" });
  });

  it("registers the data-backed Link default 4x2 content", () => {
    const linkCatalog = catalogsHash.link;
    const defaultContent = linkCatalog.contents.default;

    expect(Object.keys(linkCatalog.contents)).toEqual(["default"]);
    expect(Object.keys(defaultContent.views)).toEqual(["4x2"]);
    if (defaultContent.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultContent.configuration?.contentOptionsShape).toHaveProperty("url");
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
    const defaultContent = tikTokCatalog.contents.default;

    expect(Object.keys(tikTokCatalog.contents)).toEqual(["default"]);
    expect(Object.keys(defaultContent.views)).toEqual(["4x4"]);
    if (defaultContent.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultContent.configuration?.contentOptionsShape).toHaveProperty("url");
    expect(defaultContent.dataShape).toMatchObject({ username: { kind: "text" } });
    expect(defaultContent.defaultData).toEqual({ username: "theonion" });
    expect(defaultContent.configuration?.fetcher).toBeTypeOf("function");
  });

  it("registers locally authored Tiptap JSON for the Text catalog", () => {
    const textCatalog = catalogsHash.text;
    const defaultContent = textCatalog.contents.default;

    expect(textCatalog.catalogLabel).toBe("Text");
    expect(Object.keys(defaultContent.views)).toEqual(["4x4", "8x2"]);
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

it("keeps views with identical dimensions independently addressable", () => {
  const first = makeView({
    id: "summary",
    label: "Summary",
    w: 4,
    h: 2,
    order: 0,
    xs: () => "Summary content",
  });
  const second = makeView({
    id: "activity",
    label: "Activity",
    w: 4,
    h: 2,
    order: 1,
    xs: () => "Activity content",
  });
  const catalog = makeCatalog({
    catalogName: "view-test",
    catalogLabel: "View test",
    catalogDescription: "Test views",
    contents: {
      default: makeContent({
        content: "default",
        contentName: "Default",
        contentDescription: "Test content",
        dataShape: null,
        defaultData: null,
        views: { summary: first, activity: second },
      }),
    },
  });
  const views = catalog.contents.default.views;
  expect(Object.keys(views)).toEqual(["summary", "activity"]);
  expect(views.summary.def).toEqual({
    catalogName: "view-test",
    catalogLabel: "View test",
    content: "default",
    view: "summary",
    label: "Summary",
    w: 4,
    h: 2,
    order: 0,
    data: null,
  });
  expect(views.activity.def).toMatchObject({ view: "activity", label: "Activity", w: 4, h: 2 });
  expect(views.summary.component).toBe(first.component);
  expect(views.activity.component).toBe(second.component);
  expect(renderToStaticMarkup(createElement(first.component, { breakpoint: "xs" }))).toBe(
    "Summary content",
  );
  expect(renderToStaticMarkup(createElement(second.component, { breakpoint: "xs" }))).toBe(
    "Activity content",
  );
});
