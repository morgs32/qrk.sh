"use client";

import { BREAKPOINTS, resolveBreakpoint } from "@qrk.sh/library/breakpoints";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { BrickWall } from "@qrk.sh/library/BrickWall";
import { Schema } from "effect";
import { useCallback, useState, type RefCallback } from "react";
import { href, useLocation, useNavigate } from "react-router";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function Grid() {
  const { regionRef, availableWidth, activeBreakpoint } = useWallViewport();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const location = useLocation();
  const isBreakpointsRoute = /\/breakpoints\/?$/.test(location.pathname);
  const [fluidWidth, setFluidWidth] = useState(0);
  const fluidRef = useCallback<RefCallback<HTMLElement>>((element) => {
    if (!element) return;
    const notify = () => setFluidWidth(element.getBoundingClientRect().width);
    notify();
    const observer = new ResizeObserver(notify);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fluidAndRegionRef = useCallback<RefCallback<HTMLElement>>(
    (element) => {
      const cleanFluid = fluidRef(element);
      const cleanRegion = regionRef(element);
      return () => {
        if (typeof cleanFluid === "function") cleanFluid();
        if (typeof cleanRegion === "function") cleanRegion();
      };
    },
    [fluidRef, regionRef],
  );

  const fixedPreviewWidth =
    activeBreakpoint === null
      ? null
      : BREAKPOINTS.find((row) => row.id === activeBreakpoint)?.previewWidth ?? null;

  const wall = (breakpoint: "sm" | "md" | "lg" | "xl", gridWidth: number) => (
    <BrickWall
      breakpoint={breakpoint}
      gridWidth={gridWidth}
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
          hidden={fixedPreviewWidth === null || activeBreakpoint === null}
          className="mx-auto min-h-full"
          style={{ width: fixedPreviewWidth ?? BREAKPOINTS[0].previewWidth }}
          data-testid="grid-layout"
        >
          {activeBreakpoint !== null && fixedPreviewWidth !== null
            ? wall(activeBreakpoint, fixedPreviewWidth)
            : null}
        </div>
      </div>
    );
  }

  const fluidBreakpoint = resolveBreakpoint(fluidWidth);

  return (
    <div ref={fluidAndRegionRef} className="min-h-full w-full" data-testid="grid-layout">
      {wall(fluidBreakpoint, fluidWidth)}
    </div>
  );
}
