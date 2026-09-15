import { describe, expect, it } from "vite-plus/test";

import { textBrickCatalog } from "./TextBrickCatalog";

describe("Text catalog", () => {
  it("uses a local Tiptap JSON registryOptions control", () => {
    const defaultContent = textBrickCatalog.registries.default;

    expect(textBrickCatalog.catalogName).toBe("text");
    expect(textBrickCatalog.catalogLabel).toBe("Text");
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
