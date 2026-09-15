import { describe, expect, it } from "vite-plus/test";

import { textBrickGroup } from "./textBrickGroup";

describe("Text group", () => {
  it("uses a local Tiptap JSON catalogOptions control", () => {
    const defaultContent = textBrickGroup.catalogs.default;

    expect(textBrickGroup.id).toBe("text");
    expect(textBrickGroup.label).toBe("Text");
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
