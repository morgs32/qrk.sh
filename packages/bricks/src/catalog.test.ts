import { describe, expect, it } from "vitest";

import { collectionsHash } from "./collectionsHash";

describe("brick catalog identity", () => {
  it("registers unique kebab-case collection, variant, and size identities", () => {
    const collectionNames = new Set<string>();
    const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    for (const collection of Object.values(collectionsHash)) {
      expect(kebabCase.test(collection.collectionName)).toBe(true);
      expect(collectionNames.has(collection.collectionName)).toBe(false);
      collectionNames.add(collection.collectionName);

      for (const [variantName, variant] of Object.entries(collection.variants)) {
        expect(kebabCase.test(variantName)).toBe(true);
        expect(variant.variantDescription.trim()).not.toBe("");

        for (const [sizeName, brick] of Object.entries(variant.sizes)) {
          expect(kebabCase.test(sizeName)).toBe(true);
          expect(brick.def.variant).toBe(variantName);
          expect(brick.def.size).toBe(sizeName);
          expect(collection.variants[brick.def.variant]?.sizes[brick.def.size]).toBe(brick);
        }
      }
    }

    expect(collectionNames.size).toBe(7);
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
    expect(Object.keys(design.sizes)).toEqual(["4x4"]);
    expect(design.payloadShape).toHaveProperty("url");
    expect(design.dataShape).toHaveProperty("thumbnail_url");
    expect(design.defaultData).toMatchObject({ title: "Figma Design", url: "" });
    expect(design.getData).toBeTypeOf("function");

    const board = figmaCollection.variants.board;
    expect(Object.keys(board.sizes)).toEqual(["4x4"]);
    expect(board.payloadShape).toHaveProperty("url");
    expect(board.dataShape).toHaveProperty("thumbnail_url");
    expect(board.defaultData).toMatchObject({ title: "FigJam Board", url: "" });
    expect(board.getData).toBeTypeOf("function");

    const slides = figmaCollection.variants.slides;
    expect(Object.keys(slides.sizes)).toEqual(["4x4"]);
    expect(slides.payloadShape).toHaveProperty("url");
    expect(slides.dataShape).toHaveProperty("thumbnail_url");
    expect(slides.defaultData).toMatchObject({ title: "Figma Slides", url: "" });
    expect(slides.getData).toBeTypeOf("function");

    const prototype = figmaCollection.variants.prototype;
    expect(Object.keys(prototype.sizes)).toEqual(["4x4"]);
    expect(prototype.payloadShape).toHaveProperty("url");
    expect(prototype.dataShape).toHaveProperty("thumbnail_url");
    expect(prototype.defaultData).toMatchObject({ title: "Figma Prototype", url: "" });
    expect(prototype.getData).toBeTypeOf("function");
  });
});
