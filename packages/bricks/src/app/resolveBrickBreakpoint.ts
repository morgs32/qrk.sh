import type { LayoutItem } from "react-grid-layout";

/** Inherit one complete entry, including an explicitly hidden placement. */
export function resolveBrickBreakpoint(
  brick: {
    xs: { gridItem: LayoutItem | null; viewOptions: unknown; frame: "default" | "card" };
  } & Partial<
    Record<
      "sm" | "md" | "lg" | "xl" | "2xl",
      { gridItem: LayoutItem | null; viewOptions: unknown; frame: "default" | "card" }
    >
  >,
  breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "2xl",
) {
  if (breakpoint === "2xl" && brick["2xl"]) return brick["2xl"];
  if ((breakpoint === "2xl" || breakpoint === "xl") && brick.xl) return brick.xl;
  if ((breakpoint === "2xl" || breakpoint === "xl" || breakpoint === "lg") && brick.lg) return brick.lg;
  if ((breakpoint === "2xl" || breakpoint === "xl" || breakpoint === "lg" || breakpoint === "md") && brick.md) return brick.md;
  if (breakpoint !== "xs" && brick.sm) return brick.sm;
  return brick.xs;
}
