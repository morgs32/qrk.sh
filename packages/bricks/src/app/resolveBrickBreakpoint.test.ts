import { describe, expect, it } from "vitest";
import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";

describe("whole breakpoint entries", () => {
  const xs = {
    gridItem: { i: "a", x: 0, y: 0, w: 4, h: 4 },
    viewOptions: { imagePosition: "center" },
    frame: "default",
  } satisfies Parameters<typeof resolveBrickBreakpoint>[0]["xs"];
  const md = {
    gridItem: null,
    viewOptions: { imagePosition: "left" },
    frame: "card",
  } satisfies Parameters<typeof resolveBrickBreakpoint>[0]["xs"];
  it("inherits the complete nearest entry, including hidden status", () => {
    const brick = { xs, md };
    expect(resolveBrickBreakpoint(brick, "xs")).toBe(xs);
    expect(resolveBrickBreakpoint(brick, "sm")).toBe(xs);
    expect(resolveBrickBreakpoint(brick, "md")).toBe(md);
    expect(resolveBrickBreakpoint(brick, "lg")).toBe(md);
    expect(resolveBrickBreakpoint(brick, "xl")).toBe(md);
    expect(resolveBrickBreakpoint(brick, "2xl")).toBe(md);
  });
  it("honors explicit overrides without merging their fields", () => {
    const lg = { gridItem: xs.gridItem, viewOptions: {}, frame: "default" } satisfies Parameters<
      typeof resolveBrickBreakpoint
    >[0]["xs"];
    expect(resolveBrickBreakpoint({ xs, md, lg }, "lg")).toBe(lg);
  });
});
