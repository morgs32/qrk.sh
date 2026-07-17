import { useEffect, useRef } from "react";
import { findCollectionBrick } from "@qrk.sh/bricks";
import { useNavigate } from "@tanstack/react-router";
import GridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";

import { useGridStore } from "./useGridStore";

export function SandboxGrid() {
  const { containerRef, mounted, width } = useContainerWidth();
  const navigate = useNavigate();
  const suppressGridBrickClickRef = useRef(false);
  const layout = useGridStore((state) => state.layout);
  const gridBricksById = useGridStore((state) => state.gridBricksById);
  const activeBrickDrag = useGridStore((state) => state.activeBrickDrag);
  const hasHydrated = useGridStore((state) => state.hasHydrated);
  const setLayout = useGridStore((state) => state.setLayout);
  const addGridBrick = useGridStore((state) => state.addGridBrick);
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);

  useEffect(() => {
    if (!useGridStore.persist.hasHydrated()) {
      void useGridStore.persist.rehydrate();
    }
  }, []);

  const gridWidth = Math.max(width, 1);
  const rowHeight = gridWidth / 8;

  return (
    <section ref={containerRef} aria-label="Brick grid" className="min-h-screen bg-white">
      {mounted && hasHydrated && (
        <GridLayout
          width={gridWidth}
          layout={layout}
          autoSize
          className="grid-layout"
          compactor={verticalCompactor}
          gridConfig={{
            cols: 8,
            rowHeight,
            margin: [0, 0],
            containerPadding: [0, 0],
            maxRows: Number.POSITIVE_INFINITY,
          }}
          dragConfig={{ enabled: true, bounded: true, threshold: 3 }}
          resizeConfig={{ enabled: false, handles: [] }}
          dropConfig={{
            enabled: true,
            defaultItem: { w: 2, h: 2 },
            onDragOver: () => {
              if (!activeBrickDrag) {
                return false;
              }

              return { w: activeBrickDrag.w, h: activeBrickDrag.h };
            },
          }}
          onDrop={(nextLayout, item) => {
            if (!item || !activeBrickDrag) {
              return;
            }

            const gridBrickId = crypto.randomUUID();
            const gridLayoutWithDroppedBrick = nextLayout.map((layoutItem) => {
              if (layoutItem.i !== item.i) {
                return layoutItem;
              }

              return {
                ...layoutItem,
                i: gridBrickId,
                w: activeBrickDrag.w,
                h: activeBrickDrag.h,
              };
            });
            addGridBrick(gridBrickId, activeBrickDrag, gridLayoutWithDroppedBrick);
            setActiveBrickDrag(null);
          }}
          onDragStart={() => {
            suppressGridBrickClickRef.current = true;
          }}
          onDragStop={(nextLayout) => {
            setLayout(nextLayout);
            window.setTimeout(() => {
              suppressGridBrickClickRef.current = false;
            }, 0);
          }}
        >
          {layout.map((layoutItem) => {
            const brickDef = gridBricksById[layoutItem.i];
            const brick = brickDef ? findCollectionBrick(brickDef) : undefined;

            if (brick) {
              const BrickComponent = brick.component;

              return (
                <div
                  key={layoutItem.i}
                  className="size-full cursor-grab active:cursor-grabbing"
                  data-grid-brick={`${brick.def.collectionName}/${brick.def.name}`}
                  data-grid-brick-id={layoutItem.i}
                  data-grid-x={layoutItem.x}
                  data-grid-y={layoutItem.y}
                  onClick={() => {
                    if (suppressGridBrickClickRef.current) {
                      return;
                    }

                    void navigate({
                      to: "/collections/$collectionName/gridBrick/$gridBrickId",
                      params: {
                        collectionName: brick.def.collectionName,
                        gridBrickId: layoutItem.i,
                      },
                    });
                  }}
                >
                  <BrickComponent />
                </div>
              );
            }

            return (
              <div
                key={layoutItem.i}
                data-testid={`grid-${layoutItem.i}`}
                className="size-full bg-zinc-300"
              />
            );
          })}
        </GridLayout>
      )}
    </section>
  );
}
