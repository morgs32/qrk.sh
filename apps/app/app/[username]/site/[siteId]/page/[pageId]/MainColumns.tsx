"use client";

import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";

import { Grid } from "./Grid";

export function MainColumns() {
  const { regionRef, availableWidth, activeBreakpoint } = useWallViewport();
  const insufficientWidth = availableWidth > 0 && activeBreakpoint === null;

  return (
    <div
      ref={regionRef}
      className="h-full w-full overflow-hidden"
      data-testid="page-preview-region"
    >
      {insufficientWidth ? (
        <p className="p-4 text-sm" role="status">
          At least 360px is needed to preview the page.
        </p>
      ) : null}
      <div hidden={insufficientWidth} className="h-full w-full" data-testid="page-composition">
        <div
          className="h-full min-h-0 overflow-hidden pt-8 pb-[calc(1.5rem+(1.75rem+0.5rem+2px)/2)] [--wall-top-offset:calc(2rem+1.5rem+(1.75rem+0.5rem+2px)/2)]"
        >
          <Grid />
        </div>
      </div>
    </div>
  );
}
