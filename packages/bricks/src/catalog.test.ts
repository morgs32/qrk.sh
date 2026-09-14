import { describe, expect, it } from "vite-plus/test";

import { makeBrick } from "./makeBrick";
import { makeVariant } from "./makeVariant";
import { makeCollection } from "./makeCollection";

import { collectionsHash } from "./collectionsHash";

describe("brick catalog identity", () => {
  it("registers unique kebab-case collection, variant, and layout identities", () => {
    const collectionNames = new Set<string>();
    const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    for (const collection of Object.values(collectionsHash)) {
      expect(kebabCase.test(collection.collectionName)).toBe(true);
      expect(collectionNames.has(collection.collectionName)).toBe(false);
      collectionNames.add(collection.collectionName);

      for (const [variantName, variant] of Object.entries(collection.variants)) {
        expect(kebabCase.test(variantName)).toBe(true);
        expect(variant.variantDescription.trim()).not.toBe("");

        for (const [layoutName, brick] of Object.entries(variant.layouts)) {
          expect(kebabCase.test(layoutName)).toBe(true);
          expect(brick.def.variant).toBe(variantName);
          expect(brick.def.layout).toBe(layoutName);
          expect(collection.variants[brick.def.variant]?.layouts[brick.def.layout]).toBe(brick);
        }
      }
    }

    expect(collectionNames.size).toBe(10);
  });

  it("uses default for collections with one content variant", () => {
    for (const collection of Object.values(collectionsHash)) {
      if (
        collection.collectionName === "github" ||
        collection.collectionName === "figma" ||
        collection.collectionName === "map"
      ) {
        continue;
      }

      expect(Object.keys(collection.variants)).toEqual(["default"]);
    }
  });

  it("registers four explicit data-backed Figma file variants", () => {
    const figmaCollection = collectionsHash.figma;

    expect(Object.keys(figmaCollection.variants)).toEqual([
      "design",
      "board",
      "slides",
      "prototype",
    ]);

    const design = figmaCollection.variants.design;
    expect(Object.keys(design.layouts)).toEqual(["4x4"]);
    if (design.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(design.configuration?.payloadShape).toHaveProperty("url");
    expect(design.dataShape).toHaveProperty("thumbnail_url");
    expect(design.defaultData).toMatchObject({ title: "Figma Design", url: "" });
    expect(design.configuration?.fetcher).toBeTypeOf("function");

    const board = figmaCollection.variants.board;
    expect(Object.keys(board.layouts)).toEqual(["4x4"]);
    if (board.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(board.configuration?.payloadShape).toHaveProperty("url");
    expect(board.dataShape).toHaveProperty("thumbnail_url");
    expect(board.defaultData).toMatchObject({ title: "FigJam Board", url: "" });
    expect(board.configuration?.fetcher).toBeTypeOf("function");

    const slides = figmaCollection.variants.slides;
    expect(Object.keys(slides.layouts)).toEqual(["4x4"]);
    if (slides.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(slides.configuration?.payloadShape).toHaveProperty("url");
    expect(slides.dataShape).toHaveProperty("thumbnail_url");
    expect(slides.defaultData).toMatchObject({ title: "Figma Slides", url: "" });
    expect(slides.configuration?.fetcher).toBeTypeOf("function");

    const prototype = figmaCollection.variants.prototype;
    expect(Object.keys(prototype.layouts)).toEqual(["4x4"]);
    if (prototype.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(prototype.configuration?.payloadShape).toHaveProperty("url");
    expect(prototype.dataShape).toHaveProperty("thumbnail_url");
    expect(prototype.defaultData).toMatchObject({ title: "Figma Prototype", url: "" });
    expect(prototype.configuration?.fetcher).toBeTypeOf("function");
  });

  it("registers the data-backed Link default 4x2 variant", () => {
    const linkCollection = collectionsHash.link;
    const defaultVariant = linkCollection.variants.default;

    expect(Object.keys(linkCollection.variants)).toEqual(["default"]);
    expect(Object.keys(defaultVariant.layouts)).toEqual(["4x2"]);
    if (defaultVariant.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultVariant.configuration?.payloadShape).toHaveProperty("url");
    expect(defaultVariant.dataShape).toMatchObject({
      url: { kind: "text" },
      title: { kind: "text" },
      description: { kind: "text" },
      siteName: { kind: "text" },
      imageUrl: { kind: "text" },
      iconUrl: { kind: "text" },
    });
    expect(defaultVariant.defaultData).toMatchObject({
      title: "Celebrate our birthday & get Pro free for one year",
      siteName: "apps.apple.com",
    });
    expect(defaultVariant.configuration?.fetcher).toBeTypeOf("function");
  });

  it("registers the tokenless TikTok creator embed", () => {
    const tikTokCollection = collectionsHash.tiktok;
    const defaultVariant = tikTokCollection.variants.default;

    expect(Object.keys(tikTokCollection.variants)).toEqual(["default"]);
    expect(Object.keys(defaultVariant.layouts)).toEqual(["4x4"]);
    if (defaultVariant.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultVariant.configuration?.payloadShape).toHaveProperty("url");
    expect(defaultVariant.dataShape).toMatchObject({ username: { kind: "text" } });
    expect(defaultVariant.defaultData).toEqual({ username: "theonion" });
    expect(defaultVariant.configuration?.fetcher).toBeTypeOf("function");
  });

  it("registers locally authored Tiptap JSON for the Text collection", () => {
    const textCollection = collectionsHash.text;
    const defaultVariant = textCollection.variants.default;

    expect(textCollection.collectionLabel).toBe("Text");
    expect(Object.keys(defaultVariant.layouts)).toEqual(["4x4", "8x2"]);
    if (defaultVariant.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultVariant.configuration?.payloadShape?.content).toMatchObject({
      kind: "json",
      nullable: true,
      defaultValue: null,
    });
    expect(defaultVariant.configuration?.payloadForm?.content).toBeTypeOf("function");
    expect(defaultVariant.configuration?.fetcher).toBeUndefined();
  });
});

it("keeps layouts with identical dimensions independently addressable", () => {
  const first = makeBrick({
    variant: "default", layout: "summary", label: "Summary", w: 4, h: 2,
    order: 0, component: () => "Summary content",
  });
  const second = makeBrick({
    variant: "default", layout: "activity", label: "Activity", w: 4, h: 2,
    order: 1, component: () => "Activity content",
  });
  const collection = makeCollection({
    collectionName: "layout-test", collectionLabel: "Layout test", collectionDescription: "Test layouts",
    variants: {
      default: makeVariant({
        variant: "default", variantName: "Default", variantDescription: "Test variant",
        dataShape: null, defaultData: null,
        layouts: { summary: first, activity: second },
      }),
    },
  });
  const layouts = collection.variants.default.layouts;
  expect(Object.keys(layouts)).toEqual(["summary", "activity"]);
  expect(layouts.summary.def).toMatchObject({ layout: "summary", label: "Summary", w: 4, h: 2 });
  expect(layouts.activity.def).toMatchObject({ layout: "activity", label: "Activity", w: 4, h: 2 });
  expect(layouts.summary.component).toBe(first.component);
  expect(layouts.activity.component).toBe(second.component);
  expect(first.component()).toBe("Summary content");
  expect(second.component()).toBe("Activity content");
});
