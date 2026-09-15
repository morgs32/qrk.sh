"use client";

import { useLayoutEffect, useRef } from "react";

import { useUser } from "@clerk/react";
import { modulesHash } from "@qrk.sh/library";
import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { useBrickBreakpoint } from "@qrk.sh/library/BrickBreakpointProvider";
import { Schema } from "effect";
import GridLayout, { verticalCompactor } from "react-grid-layout";
import { href, useLocation, useNavigate } from "react-router";

import { useSitePageDraftStore } from "../../sitePageDraftStore";
import { useBreakpointsPreviewStore } from "../../Toolbars/useBreakpointsPreviewStore";

import {
  getActiveBrickDragGridShape,
  parseBrickDefFromDataTransfer,
  useBrickDrawerStore,
} from "@/components/home/useBrickDrawerStore";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const GRID_COLS = 8;

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function Grid() {
  const { containerRef, gridWidth, breakpoint } = useBrickBreakpoint();
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const isBreakpointsRoute = /\/breakpoints\/?$/.test(location.pathname);
  const gridRegionRef = useRef<HTMLDivElement>(null);
  const suppressBrickClickRef = useRef(false);
  const pageKey = JSON.stringify([user?.id, params.siteId, params.pageId]);
  const pageGrid = useBrickDrawerStore((state) => state.pageGrids[pageKey]);
  const draftLayout = useSitePageDraftStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId]?.layout,
  );
  const layout = pageGrid?.layout ?? draftLayout;
  const availableWidth = useBreakpointsPreviewStore((state) => state.availableWidth);
  const savedWidth = useBreakpointsPreviewStore((state) => state.selectedWidth);
  const setAvailableWidth = useBreakpointsPreviewStore((state) => state.setAvailableWidth);
  const previewWidths = BREAKPOINTS.map((row) => row.previewWidth);
  const selectedWidth =
    savedWidth !== null && savedWidth <= availableWidth
      ? savedWidth
      : ([...previewWidths].reverse().find((preset) => preset <= availableWidth) ?? null);

  useLayoutEffect(() => {
    if (!isBreakpointsRoute) {
      setAvailableWidth(0);
      return;
    }
    const region = gridRegionRef.current;
    if (!region) return;

    // Measure the region, not the narrowed preview, so larger fitting choices stay enabled.
    const observer = new ResizeObserver(() => {
      const width = region.getBoundingClientRect().width;
      setAvailableWidth(width);
    });
    observer.observe(region);
    return () => {
      observer.disconnect();
    };
  }, [isBreakpointsRoute, setAvailableWidth]);

  const rowHeight = gridWidth / GRID_COLS;

  if (user === null || user === undefined || layout === undefined) {
    return null;
  }

  const gridBody = (
    <>
      {gridWidth > 0 ? (
        <GridLayout
          width={gridWidth}
          layout={layout}
          autoSize
          className="grid-layout"
          compactor={verticalCompactor}
          gridConfig={{
            cols: GRID_COLS,
            rowHeight,
            margin: [0, 0],
            containerPadding: [0, 0],
            maxRows: Number.POSITIVE_INFINITY,
          }}
          dragConfig={{
            enabled: true,
            bounded: true,
            threshold: 3,
          }}
          resizeConfig={{
            enabled: false,
            handles: [],
          }}
          dropConfig={{
            enabled: true,
            defaultItem: { w: 2, h: 2 },
            onDragOver: () => getActiveBrickDragGridShape() ?? false,
          }}
          onDrop={(nextLayout, item, event) => {
            const brickDef = parseBrickDefFromDataTransfer(
              event instanceof DragEvent ? event.dataTransfer : null,
            );
            useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
            if (!item || !brickDef) return;
            const brick = modulesHash[brickDef.moduleId];
            if (!brick) return;
            const brickId = crypto.randomUUID();
            const droppedLayout = nextLayout.map((layoutItem) =>
              layoutItem.i === item.i
                ? {
                    ...layoutItem,
                    i: brickId,
                    w: brick.def[breakpoint].w,
                    h: brick.def[breakpoint].h,
                  }
                : layoutItem,
            );
            useBrickDrawerStore.setState((state) => ({
              pageGrids: {
                ...state.pageGrids,
                [pageKey]: {
                  layout: droppedLayout,
                  bricksById: {
                    ...state.pageGrids[pageKey]?.bricksById,
                    [brickId]: brick.def,
                  },
                },
              },
            }));
          }}
          onDragStart={() => {
            suppressBrickClickRef.current = true;
          }}
          onDragStop={(nextLayout) => {
            useBrickDrawerStore.setState((state) => ({
              pageGrids: {
                ...state.pageGrids,
                [pageKey]: {
                  layout: nextLayout,
                  bricksById: state.pageGrids[pageKey]?.bricksById ?? {},
                },
              },
            }));
            window.setTimeout(() => {
              suppressBrickClickRef.current = false;
            }, 0);
          }}
        >
          {layout.map((layoutItem) => {
            const brickDef = pageGrid?.bricksById[layoutItem.i];
            const content = brickDef ? modulesHash[brickDef.moduleId] : undefined;
            const brick = brickDef ? content : undefined;
            if (!brick) {
              return (
                <div
                  key={layoutItem.i}
                  className="size-full cursor-grab bg-zinc-300 active:cursor-grabbing"
                  data-testid={`grid-${layoutItem.i}`}
                />
              );
            }
            const BrickComponent = brick.component;
            return (
              <div
                key={layoutItem.i}
                className="qrk-bricks size-full cursor-grab overflow-hidden active:cursor-grabbing"
                data-brick-module-id={brick.def.moduleId}
                data-brick-id={layoutItem.i}
                onClick={() => {
                  if (suppressBrickClickRef.current) return;
                  void navigate(
                    href("/:username/site/:siteId/page/:pageId/brick/:brickId", {
                      ...params,
                      brickId: layoutItem.i,
                    }),
                  );
                }}
              >
                <BrickComponent breakpoint={breakpoint} data={content?.defaultData} />
              </div>
            );
          })}
        </GridLayout>
      ) : null}
    </>
  );

  if (isBreakpointsRoute) {
    return (
      <div ref={gridRegionRef} className="min-h-full w-full" data-testid="grid-region">
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
          {gridBody}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-full w-full" data-testid="grid-layout">
      {gridBody}
    </div>
  );
}
