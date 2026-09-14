import { describe, expect, it } from "vite-plus/test";

import { textBrickCollection } from "./TextBrickCollection";

describe("Text collection", () => {
  it("uses a local Tiptap JSON payload control", () => {
    const defaultVariant = textBrickCollection.variants.default;

    expect(textBrickCollection.collectionName).toBe("text");
    expect(textBrickCollection.collectionLabel).toBe("Text");
    if (defaultVariant?.configuration?.configurationType !== "fetcher") {
      throw new Error("Expected fetcher configuration");
    }
    expect(defaultVariant?.configuration?.payloadShape?.content).toMatchObject({
      kind: "json",
      nullable: true,
      defaultValue: null,
    });
    expect(defaultVariant?.configuration?.payloadForm?.content).toBeTypeOf("function");
    expect(defaultVariant?.configuration?.fetcher).toBeUndefined();
  });
});
