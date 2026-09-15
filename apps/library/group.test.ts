import { createElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { groupsHash } from "./groupsHash";
import { makeGroup } from "./makeGroup";
import { makeCatalog } from "./makeCatalog";

describe("brick group identity", () => {
  it("resolves repo XS dimensions and inherits SM dimensions above XS", () => {
    const def = groupsHash.github.catalogs.repo.def;
    expect(def.xs).toEqual({ w: 4, h: 6 });
    expect(def.sm).toEqual({ w: 4, h: 2 });
    expect(def.lg).toEqual(def.sm);
    expect(def.xl).toEqual(def.sm);
  });
  it("registers unique kebab-case group, content, and view identities", () => {
    const groupNames = new Set<string>();
    const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    for (const group of Object.values(groupsHash)) {
      expect(kebabCase.test(group.id)).toBe(true);
      expect(groupNames.has(group.id)).toBe(false);
      groupNames.add(group.id);

      for (const [catalogName, content] of Object.entries(group.catalogs)) {
        expect(kebabCase.test(catalogName)).toBe(true);
        expect(content.description.trim()).not.toBe("");

        expect(content.def.catalogId).toBe(catalogName);
        expect(group.catalogs[content.def.catalogId]).toBe(content);
        expect(content).not.toHaveProperty("views");
        expect(content.def).not.toHaveProperty("view");
      }
    }

    expect(groupNames.size).toBe(10);
  });

  it("uses default for groups with one content content", () => {
    for (const group of Object.values(groupsHash)) {
      if (
        group.id === "github" ||
        group.id === "figma" ||
        group.id === "map"
      ) {
        continue;
      }

      expect(Object.keys(group.catalogs)).toEqual(["default"]);
    }
  });

  it("registers one data-backed Figma thumbnail content", () => {
    const group = groupsHash.figma;
    expect(Object.keys(group.catalogs)).toEqual(["thumbnail"]);
    const thumbnail = group.catalogs.thumbnail;
    expect(thumbnail.def.xs).toEqual({ w: 4, h: 4 });
    expect(thumbnail.configuration?.configurationType).toBe("fetcher");
    expect(thumbnail.dataShape).toHaveProperty("thumbnail_url");
    expect(thumbnail.defaultData).toMatchObject({
      title: "Figma Thumbnail",
      url: "",
    });
  });

  it("registers the data-backed Link default 4x2 content", () => {
    const linkGroup = groupsHash.link;
    const defaultContent = linkGroup.catalogs.default;

    expect(Object.keys(linkGroup.catalogs)).toEqual(["default"]);
    if (defaultContent.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultContent.configuration?.catalogOptionsShape).toHaveProperty("url");
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
    const tikTokGroup = groupsHash.tiktok;
    const defaultContent = tikTokGroup.catalogs.default;

    expect(Object.keys(tikTokGroup.catalogs)).toEqual(["default"]);
    if (defaultContent.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultContent.configuration?.catalogOptionsShape).toHaveProperty("url");
    expect(defaultContent.dataShape).toMatchObject({
      username: { kind: "text" },
    });
    expect(defaultContent.defaultData).toEqual({ username: "theonion" });
    expect(defaultContent.configuration?.fetcher).toBeTypeOf("function");
  });

  it("registers locally authored Tiptap JSON for the Text group", () => {
    const textGroup = groupsHash.text;
    const defaultContent = textGroup.catalogs.default;

    expect(textGroup.label).toBe("Text");
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

it("validates catalog keys and keeps identity independent of dimensions", () => {
  const catalog = makeCatalog({
    id: "summary",
    label: "Summary",
    description: "Test catalog",
    dataShape: null,
    defaultData: null,

    order: 0,
    xs: { component: () => "Summary content", w: 4, h: 2 },
  });
  expect(() =>
    makeGroup({
      id: "test",
      label: "Test",
      description: "Test",
      catalogs: { wrong: catalog },
    }),
  ).toThrow('catalog key "wrong" must match catalog "summary"');
  const group = makeGroup({
    id: "test",
    label: "Test",
    description: "Test",
    catalogs: { summary: catalog },
  });
  expect(group.catalogs.summary.def).toEqual({
    groupId: "test",
    groupLabel: "Test",
    catalogId: "summary",
    label: "Summary",
    xs: { w: 4, h: 2 },
    sm: { w: 4, h: 2 },
    lg: { w: 4, h: 2 },
    xl: { w: 4, h: 2 },
    order: 0,
    data: null,
  });
  expect(
    renderToStaticMarkup(createElement(group.catalogs.summary.component, { breakpoint: "xs" })),
  ).toBe("Summary content");
});
