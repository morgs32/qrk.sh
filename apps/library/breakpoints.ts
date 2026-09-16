/** Shared breakpoint ids, preview widths, and grid-width resolution. */
export const BREAKPOINTS = [
  { id: "sm", minWidth: 0, previewWidth: 360, gridItemWidth: 45 },
  { id: "md", minWidth: 720, previewWidth: 720, gridItemWidth: 90 },
  { id: "lg", minWidth: 1080, previewWidth: 1080, gridItemWidth: 135 },
  { id: "xl", minWidth: 1440, previewWidth: 1440, gridItemWidth: 180 },
] as const;

/** Map measured grid width to the active breakpoint id. */
export function resolveBreakpoint(gridWidth: number): (typeof BREAKPOINTS)[number]["id"] {
  if (gridWidth < BREAKPOINTS[1].minWidth) return "sm";
  if (gridWidth < BREAKPOINTS[2].minWidth) return "md";
  if (gridWidth < BREAKPOINTS[3].minWidth) return "lg";
  return "xl";
}
