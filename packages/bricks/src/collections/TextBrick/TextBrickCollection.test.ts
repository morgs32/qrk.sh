import { describe, expect, it } from "vite-plus/test";

import { textBrickCollection } from "./TextBrickCollection";

describe("Text collection", () => {
  it("uses a local Tiptap JSON contentOptions control", () => {
    const defaultContent = textBrickCollection.contents.default;

    expect(textBrickCollection.collectionName).toBe("text");
    expect(textBrickCollection.collectionLabel).toBe("Text");
    if (defaultContent?.configuration?.configurationType !== "form") {
      throw new Error("Expected form configuration");
    }
    expect(defaultContent?.dataShape?.content).toMatchObject({
      kind: "json",
      nullable: true,
      defaultValue: null,
    });
    expect(defaultContent?.configuration?.form).toBeTypeOf("function");
    expect(defaultContent?.defaultData).toEqual({ content: null });
  });
});
