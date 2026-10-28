/** Decorative frame borders sit outside the authored page-content width. */
export const PREVIEW_BORDER_WIDTH = 1;

/** Shared breakpoint ids and preview widths. */
export const BREAKPOINTS = [
  { id: "sm", minWidth: 0, previewWidth: 360 },
  { id: "md", minWidth: 720, previewWidth: 720 },
  { id: "lg", minWidth: 1080, previewWidth: 1080 },
  { id: "xl", minWidth: 1440, previewWidth: 1440 },
] as const;
