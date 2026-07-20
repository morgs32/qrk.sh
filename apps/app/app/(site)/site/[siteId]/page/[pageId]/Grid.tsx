"use client";

import { useUser } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import GridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";

import { useSiteStore } from "../../siteStore";

const GRID_COLS = 8;

export function Grid() {
  const { containerRef, width, mounted } = useContainerWidth();
  const params = useParams<{ siteId: string; pageId: string }>();
  const { user } = useUser();
  const layout = useSiteStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId]?.layout,
  );
  const setGridLayout = useSiteStore((state) => state.setGridLayout);

  const gridWidth = Math.max(width, 1);
  const rowHeight = gridWidth / GRID_COLS;

  if (user === null || user === undefined || layout === undefined) {
    return null;
  }

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
            setGridLayout(user.id, params.siteId, params.pageId, nextLayout);
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
