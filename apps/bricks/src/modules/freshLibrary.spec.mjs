import { describe, expect, it } from "vitest";
import { freshImageLayouts } from "./image/definition/freshImageLayouts";
import { resolveBrickLayout } from "./freshLibrary";

describe("fresh Brick layouts", () => {
  it("resolves a captioned rectangular image without changing the selected layout", () => {
    const brickState = { imageUrl: "image", altText: "A view", caption: "A view", crop: null, round: false };
    expect(resolveBrickLayout({ moduleId: "image", layoutId: "captionless", brickState })).toBe(freshImageLayouts.captioned);
    expect(resolveBrickLayout({ moduleId: "image", layoutId: "captionless", brickState: { ...brickState, caption: "" } })).toBe(freshImageLayouts.captionless);
  });

  it("rejects an unknown layout", () => {
    expect(() => resolveBrickLayout({ moduleId: "spotify", layoutId: "unknown", brickState: null })).toThrow();
  });
});
