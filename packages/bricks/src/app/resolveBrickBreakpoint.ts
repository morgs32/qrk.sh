import type { LayoutItem } from "react-grid-layout";

/** Inherit one complete entry, including an explicitly hidden placement. */
export function resolveBrickBreakpoint(
  brick: {
    xs: { gridItem: LayoutItem | null; viewOptions: unknown };
  } & Partial<
    Record<
      "sm" | "lg" | "xl",
      { gridItem: LayoutItem | null; viewOptions: unknown }
    >
  >,
  breakpoint: "xs" | "sm" | "lg" | "xl",
) {
  if (breakpoint === "xl" && brick.xl) return brick.xl;
  if ((breakpoint === "xl" || breakpoint === "lg") && brick.lg) return brick.lg;
  if (breakpoint !== "xs" && brick.sm) return brick.sm;
  return brick.xs;
}
