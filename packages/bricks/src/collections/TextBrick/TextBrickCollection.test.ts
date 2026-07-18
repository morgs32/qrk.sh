import { describe, expect, it } from "vitest";

import { textBrickCollection } from "./TextBrickCollection";

describe("Text collection", () => {
  it("uses a local Tiptap JSON payload control", () => {
    const defaultVariant = textBrickCollection.variants.default;

    expect(textBrickCollection.collectionName).toBe("text");
    expect(textBrickCollection.collectionLabel).toBe("Text");
    expect(defaultVariant?.payloadShape?.content).toMatchObject({
      kind: "json",
      nullable: true,
      defaultValue: null,
    });
    expect(defaultVariant?.payloadForm?.content).toBeTypeOf("function");
    expect(defaultVariant?.getData).toBeUndefined();
  });
});
