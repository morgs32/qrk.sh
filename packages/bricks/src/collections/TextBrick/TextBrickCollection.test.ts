import { describe, expect, it } from "vite-plus/test";

import { textBrickCollection } from "./TextBrickCollection";

describe("Text collection", () => {
  it("uses a local Tiptap JSON payload control", () => {
    const defaultVariant = textBrickCollection.variants.default;

    expect(textBrickCollection.collectionName).toBe("text");
    expect(textBrickCollection.collectionLabel).toBe("Text");
    if (defaultVariant?.configuration?.configurationType !== "form") {
      throw new Error("Expected form configuration");
    }
    expect(defaultVariant?.dataShape?.content).toMatchObject({
      kind: "json",
      nullable: true,
      defaultValue: null,
    });
    expect(defaultVariant?.configuration?.form).toBeTypeOf("function");
    expect(defaultVariant?.defaultData).toEqual({ content: null });
  });
});
