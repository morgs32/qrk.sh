import type { LayoutItem } from "react-grid-layout";

/** Inherit one complete entry, including an explicitly hidden placement. */
export function resolveBrickBreakpoint(
  brick: { xs: { gridItem: LayoutItem | null; viewOptions: unknown } } & Partial<
    Record<"sm" | "md" | "lg", { gridItem: LayoutItem | null; viewOptions: unknown }>
  >,
  breakpoint: "xs" | "sm" | "md" | "lg",
) {
  if (breakpoint === "lg" && brick.lg) return brick.lg;
  if ((breakpoint === "lg" || breakpoint === "md") && brick.md) return brick.md;
  if (breakpoint !== "xs" && brick.sm) return brick.sm;
  return brick.xs;
}
