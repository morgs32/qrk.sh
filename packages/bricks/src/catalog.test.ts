import { describe, expect, it } from "vitest";

import { collectionsHash } from "./collectionsHash";
import { findCollectionBrick } from "./findCollectionBrick";

describe("brick catalog identity", () => {
  it("registers unique kebab-case collection and brick names with exact lookup", () => {
    const collectionNames = new Set<string>();
    const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    for (const collection of Object.values(collectionsHash)) {
      expect(kebabCase.test(collection.collectionName)).toBe(true);
      expect(collectionNames.has(collection.collectionName)).toBe(false);
      collectionNames.add(collection.collectionName);

      const brickNames = new Set<string>();
      for (const brick of Object.values(collection.bricks)) {
        expect(kebabCase.test(brick.def.name)).toBe(true);
        expect(brickNames.has(brick.def.name)).toBe(false);
        brickNames.add(brick.def.name);
        expect(findCollectionBrick(brick.def)).toBe(brick);
      }
    }

    expect(collectionNames.size).toBe(18);
  });
});
