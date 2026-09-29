"use client";

import { useRouter, usePathname, useSelectedLayoutSegments } from "next/navigation";

import { BREAKPOINTS, resolveBreakpoint } from "@qrk.sh/library/breakpoints";
import { BrickWall } from "@qrk.sh/library/BrickWall";
import { useLibrarySession } from "@qrk.sh/library/createLibraryStandaloneSession";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { prefixId } from "@zerospin/core/models/prefixId";
import { Schema } from "effect";
import { useCallback, useState, type RefCallback } from "react";

import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

const WALL_ID = prefixId(libraryModule.models.wall, "library");

export function Grid() {
  const { regionRef, availableWidth, activeBreakpoint } = useWallViewport();
  const session = useLibrarySession();
  const params = useValidatedParams(ParamsSchema);
  const router = useRouter();
  const pathname = usePathname();
  const isBreakpointsRoute = /\/breakpoints\/?$/.test(pathname);
  const isBrickDrawer = useSelectedLayoutSegments().includes("(bricks)");
  const useFixedPreview = isBreakpointsRoute || isBrickDrawer;
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
      : (BREAKPOINTS.find((row) => row.id === activeBreakpoint)?.previewWidth ?? null);

  const wall = (breakpoint: "sm" | "md" | "lg" | "xl", gridWidth: number) => (
    <BrickWall
      session={session}
      wallId={WALL_ID}
      breakpoint={breakpoint}
      gridWidth={gridWidth}
      onBrickActivate={({ brickId }) => {
        void router.push(
          `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}/brick/${encodeURIComponent(brickId)}`,
          { scroll: false },
        );
      }}
    />
  );

  const fluidBreakpoint = resolveBreakpoint(fluidWidth);
  const gridWidth = useFixedPreview
    ? (fixedPreviewWidth ?? BREAKPOINTS[0].previewWidth)
    : fluidWidth;

  return (
    <div ref={fluidAndRegionRef} className="min-h-full w-full" data-testid="grid-region">
      {useFixedPreview && availableWidth > 0 && availableWidth < BREAKPOINTS[0].previewWidth ? (
        <p className="p-4 text-sm" role="status">
          At least {BREAKPOINTS[0].previewWidth}px is needed to preview the grid.
        </p>
      ) : null}
      <div
        hidden={useFixedPreview && activeBreakpoint === null}
        className="mx-auto min-h-full"
        style={{ width: useFixedPreview ? gridWidth : "100%" }}
        data-testid="grid-layout"
      >
        {wall(
          useFixedPreview ? (activeBreakpoint ?? BREAKPOINTS[0].id) : fluidBreakpoint,
          gridWidth,
        )}
      </div>
    </div>
  );
}
