import { wallBreakpointWidths } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallSizing";

/** Decorative frame borders sit outside the authored page-content width. */
export const PREVIEW_BORDER_WIDTH = 1;

/** Shared breakpoint ids and preview widths. */
export const BREAKPOINTS = [
  { id: "sm", minWidth: 0, previewWidth: wallBreakpointWidths.sm },
  { id: "md", minWidth: 720, previewWidth: wallBreakpointWidths.md },
  { id: "lg", minWidth: 1080, previewWidth: wallBreakpointWidths.lg },
  { id: "xl", minWidth: 1440, previewWidth: wallBreakpointWidths.xl },
] as const;
