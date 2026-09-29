"use client";

import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { useSelectedLayoutSegments } from "next/navigation";

import { Grid } from "./Grid";

export function MainColumns() {
  const segments = useSelectedLayoutSegments();
  const { regionRef, availableWidth, activeBreakpoint } = useWallViewport();
  const route = segments.find((segment) => !segment.startsWith("("));
  const isPreviewRoute =
    route === "breakpoints" || route === "page-settings" || segments.includes("(bricks)");
  const previewWidth = BREAKPOINTS.find((row) => row.id === activeBreakpoint)?.previewWidth ?? 360;
  const insufficientWidth = isPreviewRoute && availableWidth > 0 && activeBreakpoint === null;

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
      <div
        hidden={insufficientWidth}
        className="mx-auto h-full"
        style={{ width: isPreviewRoute ? previewWidth : "100%" }}
        data-testid="page-composition"
      >
        <div
          className="h-full min-h-0 overflow-y-auto"
          data-site-right-scroll
          data-brick-scroll-root
        >
          <Grid />
        </div>
      </div>
    </div>
  );
}
