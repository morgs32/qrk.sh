/** Smallest integer grid units whose pixel size is ≥ intrinsicPx. */
export function minGridUnits(gridItemWidth: number, intrinsicPx: number): number {
  if (intrinsicPx <= 0) return 1;
  return Math.max(1, Math.ceil(intrinsicPx / gridItemWidth));
}

export const BREAKPOINTS = [
  { id: "sm", previewWidth: 360, gridItemWidth: 45 },
  { id: "md", previewWidth: 720, gridItemWidth: 90 },
  { id: "lg", previewWidth: 1080, gridItemWidth: 135 },
  { id: "xl", previewWidth: 1440, gridItemWidth: 180 },
] as const;

export function resolveBreakpointEntry(breakpoint: string) {
  for (const entry of BREAKPOINTS) {
    if (entry.id === breakpoint) return entry;
  }
  return undefined;
}

export function isBreakpointId(
  value: string,
): value is (typeof BREAKPOINTS)[number]["id"] {
  return BREAKPOINTS.some((entry) => entry.id === value);
}
