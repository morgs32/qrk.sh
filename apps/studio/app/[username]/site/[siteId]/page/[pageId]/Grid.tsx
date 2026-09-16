"use client";

import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { useBrickBreakpoint } from "@qrk.sh/library/BrickBreakpointProvider";
import { BrickWall } from "@qrk.sh/library/BrickWall";
import { Schema } from "effect";
import { href, useLocation, useNavigate } from "react-router";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function Grid() {
  const { containerRef, regionRef, availableWidth, selectedWidth } = useBrickBreakpoint();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const location = useLocation();
  const isBreakpointsRoute = /\/breakpoints\/?$/.test(location.pathname);

  const wall = (
    <BrickWall
      onBrickActivate={({ brickId }) => {
        void navigate(
          href("/:username/site/:siteId/page/:pageId/brick/:brickId", {
            ...params,
            brickId,
          }),
        );
      }}
    />
  );

  if (isBreakpointsRoute) {
    return (
      <div ref={regionRef} className="min-h-full w-full" data-testid="grid-region">
        {availableWidth > 0 && availableWidth < BREAKPOINTS[0].previewWidth ? (
          <p className="p-4 text-sm" role="status">
            At least {BREAKPOINTS[0].previewWidth}px is needed to preview the grid.
          </p>
        ) : null}
        <div
          ref={containerRef}
          hidden={selectedWidth === null}
          className="mx-auto min-h-full"
          style={{ width: selectedWidth ?? BREAKPOINTS[0].previewWidth }}
          data-testid="grid-layout"
        >
          {wall}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-full w-full" data-testid="grid-layout">
      {wall}
    </div>
  );
}
