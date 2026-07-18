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

        for (const [sizeName, brick] of Object.entries(variant.sizes)) {
          expect(kebabCase.test(sizeName)).toBe(true);
          expect(brick.def.variant).toBe(variantName);
          expect(brick.def.size).toBe(sizeName);
          expect(collection.variants[brick.def.variant]?.sizes[brick.def.size]).toBe(brick);
        }
      }
    }

    expect(collectionNames.size).toBe(6);
  });

  it("uses default for collections with one content variant", () => {
    for (const collection of Object.values(collectionsHash)) {
      if (collection.collectionName === "github") {
        continue;
      }

      expect(Object.keys(collection.variants)).toEqual(["default"]);
    }
  });
});
