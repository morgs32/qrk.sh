"use client";

import { GridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import { BottomToolbar } from "@/components/home/BottomToolbar";
import { findCollectionTile } from "@/components/home/tiles/findCollectionTile";
import { catalogKey } from "@/components/home/tiles/types";
import { useGridLayoutStore } from "@/components/home/useGridLayoutStore";

/**
 * Set `NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED=true` when running a second dev
 * server (e.g. port 3001) to A/B `dragConfig.bounded` vs grid math issues.
 */
const GRID_DRAG_BOUNDED = process.env.NEXT_PUBLIC_PLAYWRIGHT_GRID_UNBOUNDED !== "true";

const GRID_COLS = 4;

export function Grid({ onAddClick }: { onAddClick: () => void }) {
  const { containerRef, width } = useContainerWidth();
  const layout = useGridLayoutStore((s) => s.layout);

  const gridWidth = Math.max(width, 1);
  const rowHeight = gridWidth / GRID_COLS;

  return (
    <>
      <div
        ref={containerRef}
        className="grid-layout-wrapper w-full"
        data-testid="grid-layout"
      >
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
            bounded: GRID_DRAG_BOUNDED,
            threshold: 3,
          }}
          resizeConfig={{
            enabled: false,
            handles: [],
          }}
        >
          {layout.map((item) => {
            const catalogTile = findCollectionTile(item.def);
            const TileComponent = catalogTile?.component;
            if (!TileComponent) {
              return null;
            }

            return (
              <div
                key={item.i}
                data-tile-instance-id={item.i}
                data-tile-type-id={catalogKey(item.def)}
                className="cursor-grab touch-none active:cursor-grabbing"
              >
                <TileComponent />
              </div>
            );
          })}
        </GridLayout>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-1/2 right-0 z-30 flex justify-center px-4">
        <div className="pointer-events-auto">
          <BottomToolbar onAddClick={onAddClick} />
        </div>
      </div>
    </>
  );
}
