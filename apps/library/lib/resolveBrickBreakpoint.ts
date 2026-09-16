import type { Spec } from "@json-render/core";
import type { LayoutItem } from "react-grid-layout";

/** Inherit one complete entry, including an explicitly hidden placement. */
export function resolveBrickBreakpoint(
  brick: {
    sm: { gridItem: LayoutItem | null; breakpointOptions: unknown; spec?: Spec };
  } & Partial<
    Record<"md" | "lg" | "xl", { gridItem: LayoutItem | null; breakpointOptions: unknown; spec?: Spec }>
  >,
  breakpoint: "sm" | "md" | "lg" | "xl",
) {
  if (breakpoint === "xl" && brick.xl) return brick.xl;
  if ((breakpoint === "xl" || breakpoint === "lg") && brick.lg) return brick.lg;
  if (breakpoint !== "sm" && brick.md) return brick.md;
  return brick.sm;
}
