"use client";

import { useRef } from "react";

import { useUser } from "@clerk/react";
import { modulesHash } from "@qrk.sh/library";
import { useBrickBreakpoint } from "@qrk.sh/library/BrickBreakpointProvider";
import { Schema } from "effect";
import GridLayout, { verticalCompactor } from "react-grid-layout";
import { href, useNavigate } from "react-router";

import { useSiteStore } from "../../siteStore";

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
  const suppressBrickClickRef = useRef(false);
  const pageKey = JSON.stringify([user?.id, params.siteId, params.pageId]);
  const pageGrid = useBrickDrawerStore((state) => state.pageGrids[pageKey]);
  const draftLayout = useSiteStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId]?.layout,
  );
  const layout = pageGrid?.layout ?? draftLayout;

  const rowHeight = gridWidth / GRID_COLS;

  if (user === null || user === undefined || layout === undefined) {
    return null;
  }

  return (
    <div ref={containerRef} className="min-h-full w-full" data-testid="grid-layout">
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
            const content = brickDef
              ? modulesHash[brickDef.moduleId]
              : undefined;
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
    </div>
  );
}
