/** Shared breakpoint ids, preview widths, and grid-width resolution. */
export const BREAKPOINTS = [
  { id: "sm", minWidth: 0, previewWidth: 375 },
  { id: "md", minWidth: 640, previewWidth: 640 },
  { id: "lg", minWidth: 1024, previewWidth: 1024 },
  { id: "xl", minWidth: 1280, previewWidth: 1440 },
] as const;

/** Map measured grid width to the active breakpoint id. */
export function resolveBreakpoint(gridWidth: number): (typeof BREAKPOINTS)[number]["id"] {
  if (gridWidth < 640) return "sm";
  if (gridWidth < 1024) return "md";
  if (gridWidth < 1280) return "lg";
  return "xl";
}
