import { describe, expect, it } from "vitest";
import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";

describe("whole breakpoint entries", () => {
  const xs = {
    gridItem: { i: "a", x: 0, y: 0, w: 4, h: 4 },
    viewOptions: { imagePosition: "center" },
  };
  const md = { gridItem: null, viewOptions: { imagePosition: "left" } };
  it("inherits the complete nearest entry, including hidden status", () => {
    const brick = { xs, md };
    expect(resolveBrickBreakpoint(brick, "xs")).toBe(xs);
    expect(resolveBrickBreakpoint(brick, "sm")).toBe(xs);
    expect(resolveBrickBreakpoint(brick, "md")).toBe(md);
    expect(resolveBrickBreakpoint(brick, "lg")).toBe(md);
  });
  it("honors explicit overrides without merging their fields", () => {
    const lg = { gridItem: xs.gridItem, viewOptions: {} };
    expect(resolveBrickBreakpoint({ xs, md, lg }, "lg")).toBe(lg);
  });
});
