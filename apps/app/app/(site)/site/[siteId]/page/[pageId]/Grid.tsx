"use client";

import GridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";

import { useGridLayoutStore } from "@/components/home/useGridLayoutStore";

const GRID_COLS = 8;

export function Grid() {
  const { containerRef, width, mounted } = useContainerWidth();
  const layout = useGridLayoutStore((state) => state.layout);
  const setLayout = useGridLayoutStore((state) => state.setLayout);

  const gridWidth = Math.max(width, 1);
  const rowHeight = gridWidth / GRID_COLS;

  return (
    <div ref={containerRef} className="min-h-full w-full" data-testid="grid-layout">
      {mounted ? (
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
          onDragStop={(nextLayout) => {
            setLayout(nextLayout);
          }}
        >
          {layout.map((layoutItem) => (
            <div
              key={layoutItem.i}
              className="size-full cursor-grab bg-zinc-300 active:cursor-grabbing"
              data-testid={`grid-${layoutItem.i}`}
            />
          ))}
        </GridLayout>
      ) : null}
    </div>
  );
}
