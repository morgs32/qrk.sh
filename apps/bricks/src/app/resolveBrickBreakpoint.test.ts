import { describe, expect, it } from "vitest";

import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";

describe("whole breakpoint entries", () => {
  const xs = {
    gridItem: { i: "a", x: 0, y: 0, w: 4, h: 4 },
    appearanceOptions: { imagePosition: "center" },
  } satisfies Parameters<typeof resolveBrickBreakpoint>[0]["xs"];
  const lg = {
    gridItem: null,
    appearanceOptions: { imagePosition: "left" },
  } satisfies Parameters<typeof resolveBrickBreakpoint>[0]["xs"];
  it("inherits the complete nearest entry, including hidden status", () => {
    const brick = { xs, lg };
    expect(resolveBrickBreakpoint(brick, "xs")).toBe(xs);
    expect(resolveBrickBreakpoint(brick, "sm")).toBe(xs);
    expect(resolveBrickBreakpoint(brick, "lg")).toBe(lg);
    expect(resolveBrickBreakpoint(brick, "xl")).toBe(lg);
  });
  it("honors explicit overrides without merging their fields", () => {
    const xl = {
      gridItem: xs.gridItem,
      appearanceOptions: {},
    } satisfies Parameters<typeof resolveBrickBreakpoint>[0]["xs"];
    expect(resolveBrickBreakpoint({ xs, lg, xl }, "xl")).toBe(xl);
  });
});
