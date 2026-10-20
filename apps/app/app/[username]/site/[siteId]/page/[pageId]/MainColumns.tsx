"use client";

import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";

import { Grid } from "./Grid";

export function MainColumns() {
  const { availableWidth, activeBreakpoint } = useWallViewport();
  const insufficientWidth = availableWidth > 0 && activeBreakpoint === null;

  return (
    <div className="w-full" data-testid="page-preview-region">
      {insufficientWidth ? (
        <p className="p-4 text-sm" role="status">
          At least 360px is needed to preview the page.
        </p>
      ) : null}
      <div hidden={insufficientWidth} className="w-full" data-testid="page-composition">
        <Grid />
      </div>
    </div>
  );
}
