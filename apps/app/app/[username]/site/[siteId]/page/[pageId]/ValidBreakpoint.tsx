"use client";

import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../../../../../../modules/lib/breakpoints";

import { PagePreview } from "./PagePreview";

export function ValidBreakpoint(props: {
  breakpoint: (typeof BREAKPOINTS)[number] | undefined;
  insufficientWidth: boolean;
}) {
  const { breakpoint, insufficientWidth } = props;
  return (
    <>
      {insufficientWidth ? (
        <p className="p-4 text-sm" role="status">
          At least {BREAKPOINTS[0].previewWidth + 2 * PREVIEW_BORDER_WIDTH}px is needed to preview{" "}
          {BREAKPOINTS[0].previewWidth}px of page content with its borders.
        </p>
      ) : null}
      {breakpoint === undefined ? null : (
        <PagePreview key={breakpoint.id} breakpoint={breakpoint} />
      )}
    </>
  );
}
