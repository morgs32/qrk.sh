"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  getBreakpointFromWidth,
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { BottomToolbar } from "@/components/home/BottomToolbar";
import { gridSeed } from "@/components/home/gridState";
import { findCollectionTile } from "@/components/home/tiles/findCollectionTile";
import { catalogKey } from "@/components/home/tiles/types";
import { TextTilePresentation } from "@/components/home/tiles/collections/TextTile/TextTilePresentation";
import {
  GRID_BREAKPOINTS,
  GRID_COLUMNS,
  useGridStore,
  type GridBreakpoint,
} from "@/components/home/useGridStore";

/**
 * Set `NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED=true` when running a second dev
 * server (e.g. port 3001) to A/B `dragConfig.bounded` vs grid math issues.
 */
const GRID_DRAG_BOUNDED = process.env.NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED !== "true";

type ExternalGridDragEvent = DragEvent & {
  qrkDragOffsetX?: number;
  qrkDragOffsetY?: number;
};

export type GridProps = {
  onAddClick: () => void;
};

export function Grid({ onAddClick }: GridProps) {
  const { containerRef, mounted, width, measureWidth } = useContainerWidth();

  useEffect(() => {
    if (!mounted || width > 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      measureWidth();
    });

    return () => cancelAnimationFrame(frame);
  }, [mounted, measureWidth, width]);

  const instances = useGridStore((state) => state.instances);
  const layouts = useGridStore((state) => state.layouts);
  const initializeGrid = useGridStore((state) => state.initializeGrid);
  const setBreakpointLayout = useGridStore((state) => state.setBreakpointLayout);
  const setActiveBreakpoint = useGridStore((state) => state.setActiveBreakpoint);
  const externalDraggingTileDef = useGridStore((state) => state.externalDraggingTileDef);
  const setGridCellHeightPx = useGridStore((state) => state.setGridCellHeightPx);

  useEffect(() => {
    if (!useGridStore.getState().initialized) {
      initializeGrid(gridSeed);
    }
  }, [initializeGrid]);

  useEffect(() => {
    if (!mounted || width <= 0) {
      setGridCellHeightPx(null);
      return;
    }

    const bp = getBreakpointFromWidth(GRID_BREAKPOINTS, Math.max(width, 1)) as GridBreakpoint;
    setGridCellHeightPx(width / GRID_COLUMNS[bp]);
  }, [mounted, setGridCellHeightPx, width]);

  const externalDragW = externalDraggingTileDef?.w;
  const externalDragH = externalDraggingTileDef?.h;
  const externalDraggingDims = useMemo(() => {
    if (externalDragW === undefined || externalDragH === undefined) {
      return null;
    }
    return { w: externalDragW, h: externalDragH };
  }, [externalDragW, externalDragH]);

  const externalDroppingItem = useMemo<LayoutItem>(
    () => ({
      i: "__external-drop__",
      x: 0,
      y: 0,
      w: externalDraggingDims?.w ?? 1,
      h: externalDraggingDims?.h ?? 1,
    }),
    [externalDraggingDims],
  );

  const gridWidth = Math.max(width, 1);
  const resolvedBreakpoint = getBreakpointFromWidth(GRID_BREAKPOINTS, gridWidth) as GridBreakpoint;
  const rowHeight = gridWidth / GRID_COLUMNS[resolvedBreakpoint];

  const handleExternalDropDragOver = useCallback(
    (event: DragEvent) => {
      if (!externalDraggingDims) {
        return false;
      }

      const bridgeEvent = event as ExternalGridDragEvent;

      return {
        w: externalDraggingDims.w,
        h: externalDraggingDims.h,
        dragOffsetX:
          typeof bridgeEvent.qrkDragOffsetX === "number" ? bridgeEvent.qrkDragOffsetX : 0,
        dragOffsetY:
          typeof bridgeEvent.qrkDragOffsetY === "number" ? bridgeEvent.qrkDragOffsetY : 0,
      };
    },
    [externalDraggingDims],
  );

  const handleExternalDrop = useCallback(
    (_layout: Layout, item: LayoutItem | undefined) => {
      if (!item) {
        return;
      }

      const store = useGridStore.getState();
      const tileDef = store.externalDraggingTileDef;
      if (!tileDef) {
        return;
      }

      const bp = getBreakpointFromWidth(GRID_BREAKPOINTS, gridWidth) as GridBreakpoint;
      store.addInstanceAt(bp, tileDef, { x: item.x, y: item.y });
      store.setExternalDraggingTileDef(null);
      store.setExternalDropPosition(null);
    },
    [gridWidth],
  );

  const handleLayoutChange = useCallback(
    (layout: Layout, _allLayouts: Partial<Record<string, Layout>>) => {
      void _allLayouts;
      const bp = getBreakpointFromWidth(GRID_BREAKPOINTS, gridWidth) as GridBreakpoint;
      setBreakpointLayout(bp, [...layout]);
    },
    [gridWidth, setBreakpointLayout],
  );

  const handleBreakpointChange = useCallback(
    (newBreakpoint: string, _cols: number) => {
      void _cols;
      setActiveBreakpoint(newBreakpoint as GridBreakpoint);
    },
    [setActiveBreakpoint],
  );

  return (
    <>
      <div ref={containerRef} className="w-full" data-testid="grid-layout">
        <ResponsiveGridLayout
          width={gridWidth}
          layouts={layouts}
          breakpoints={GRID_BREAKPOINTS}
          cols={GRID_COLUMNS}
          rowHeight={rowHeight}
          maxRows={Number.POSITIVE_INFINITY}
          margin={[0, 0]}
          containerPadding={[0, 0]}
          autoSize
          className="home-grid"
          compactor={verticalCompactor}
          dragConfig={{
            enabled: true,
            bounded: GRID_DRAG_BOUNDED,
            threshold: 3,
          }}
          dropConfig={{
            enabled: true,
            defaultItem: {
              w: externalDroppingItem.w,
              h: externalDroppingItem.h,
            },
            onDragOver: handleExternalDropDragOver,
          }}
          droppingItem={externalDroppingItem}
          resizeConfig={{
            enabled: false,
            handles: [],
          }}
          onLayoutChange={handleLayoutChange}
          onBreakpointChange={handleBreakpointChange}
          onDrop={handleExternalDrop}
        >
          {instances.map((instance) => {
            const catalogTile = findCollectionTile(instance.tileDef);
            const TileComponent = catalogTile?.component;
            if (!TileComponent && !instance.text) {
              return null;
            }

            return (
              <div
                key={instance.instanceId}
                data-tile-instance-id={instance.instanceId}
                data-tile-type-id={catalogKey(instance.tileDef)}
                className="cursor-grab touch-none active:cursor-grabbing"
              >
                {instance.text ? (
                  <TextTilePresentation
                    title={instance.text.title}
                    category={instance.text.category}
                    href={instance.text.href}
                    w={instance.tileDef.w}
                    h={instance.tileDef.h}
                  />
                ) : (
                  TileComponent && <TileComponent />
                )}
              </div>
            );
          })}
        </ResponsiveGridLayout>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-1/2 right-0 z-30 flex justify-center px-4">
        <div className="pointer-events-auto">
          <BottomToolbar onAddClick={onAddClick} />
        </div>
      </div>
    </>
  );
}
