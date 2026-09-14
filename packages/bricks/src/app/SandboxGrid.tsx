import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { collectionsHash } from "@qrk.sh/bricks";
import { useNavigate } from "react-router";
import GridLayout, { useContainerWidth, verticalCompactor } from "react-grid-layout";

import { useGridStore } from "./useGridStore";

export function SandboxGrid() {
  const { containerRef, mounted, width } = useContainerWidth();
  const navigate = useNavigate();
  const suppressBrickClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [outsideBrickId, setOutsideBrickId] = useState<string | null>(null);
  const dragScrollTopRef = useRef(0);
  const layout = useGridStore((state) => state.layout);
  const bricksById = useGridStore((state) => state.bricksById);
  const activeBrickDrag = useGridStore((state) => state.activeBrickDrag);
  const hasHydrated = useGridStore((state) => state.hasHydrated);
  const setLayout = useGridStore((state) => state.setLayout);
  const addBrick = useGridStore((state) => state.addBrick);
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);

  useEffect(() => {
    if (!useGridStore.persist.hasHydrated()) {
      void useGridStore.persist.rehydrate();
    }
  }, []);

  useLayoutEffect(() => {
    if (!dragging && containerRef.current) {
      containerRef.current.scrollTop = dragScrollTopRef.current;
    }
  }, [dragging, containerRef]);

  const gridWidth = Math.max(width, 1);
  const rowHeight = gridWidth / 8;

  return (
    <section
      ref={containerRef}
      aria-label="Brick grid"
      style={dragging ? { overflow: "visible", zIndex: 70 } : undefined}
      className="min-h-screen bg-white md:sticky md:top-0 md:h-screen md:self-start md:overflow-y-auto"
    >
      {outsideBrickId && (
        <div
          role="status"
          className="pointer-events-none fixed right-4 top-4 z-80 rounded bg-zinc-900 px-3 py-2 text-sm text-white"
        >
          Release to remove
        </div>
      )}
      {mounted && hasHydrated && (
        <GridLayout
          width={gridWidth}
          style={dragging ? { transform: `translateY(-${dragScrollTopRef.current}px)` } : undefined}
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
          dragConfig={{ enabled: true, bounded: false, threshold: 3 }}
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

            const brickId = crypto.randomUUID();
            const gridLayoutWithDroppedBrick = nextLayout.map((layoutItem) => {
              if (layoutItem.i !== item.i) {
                return layoutItem;
              }

              return {
                ...layoutItem,
                i: brickId,
                w: activeBrickDrag.w,
                h: activeBrickDrag.h,
              };
            });
            addBrick(brickId, activeBrickDrag, gridLayoutWithDroppedBrick);
            setActiveBrickDrag(null);
          }}
          onDragStart={() => {
            suppressBrickClickRef.current = true;
            dragScrollTopRef.current = containerRef.current?.scrollTop ?? 0;
            setDragging(true);
          }}
          onDrag={(_nextLayout, _oldItem, item, _placeholder, event) => {
            const bounds = containerRef.current?.getBoundingClientRect();
            const pointer =
              event instanceof MouseEvent
                ? event
                : event instanceof TouchEvent
                  ? event.touches[0]
                  : undefined;
            if (!bounds || !pointer || !item) {
              return;
            }
            const outside =
              pointer.clientX < bounds.left ||
              pointer.clientX > bounds.right ||
              pointer.clientY < bounds.top ||
              pointer.clientY > bounds.bottom;
            setOutsideBrickId(outside ? item.i : null);
          }}
          onDragStop={(nextLayout, _oldItem, item, _placeholder, event) => {
            const bounds = containerRef.current?.getBoundingClientRect();
            const pointer =
              event instanceof MouseEvent
                ? event
                : event instanceof TouchEvent
                  ? event.changedTouches[0]
                  : undefined;
            const outside =
              bounds &&
              pointer &&
              (pointer.clientX < bounds.left ||
                pointer.clientX > bounds.right ||
                pointer.clientY < bounds.top ||
                pointer.clientY > bounds.bottom);
            if (outside && item) {
              useGridStore.setState((state) => {
                const remainingBricks = { ...state.bricksById };
                delete remainingBricks[item.i];
                return {
                  layout: nextLayout.filter((layoutItem) => layoutItem.i !== item.i),
                  bricksById: remainingBricks,
                };
              });
            } else {
              setLayout(nextLayout);
            }
            setOutsideBrickId(null);
            setDragging(false);
            window.setTimeout(() => {
              suppressBrickClickRef.current = false;
            }, 0);
          }}
        >
          {layout.map((layoutItem) => {
            const brickDef = bricksById[layoutItem.i];
            const collection = brickDef ? collectionsHash[brickDef.collectionName] : undefined;
            const variant = collection?.variants[brickDef.variant];
            const brick = variant?.sizes[brickDef.size];

            if (brick) {
              const BrickComponent = brick.component;

              return (
                <div
                  key={layoutItem.i}
                  style={{ opacity: outsideBrickId === layoutItem.i ? 0.4 : 1 }}
                  className="size-full cursor-grab active:cursor-grabbing"
                  data-brick={`${brick.def.collectionName}/${brick.def.variant}/${brick.def.size}`}
                  data-brick-id={layoutItem.i}
                  data-grid-x={layoutItem.x}
                  data-grid-y={layoutItem.y}
                  onClick={() => {
                    if (suppressBrickClickRef.current) {
                      return;
                    }

                    void navigate(
                      `/collections/${encodeURIComponent(brick.def.collectionName)}/brick/${encodeURIComponent(layoutItem.i)}`,
                    );
                  }}
                >
                  <BrickComponent data={variant.defaultData} />
                </div>
              );
            }

            return (
              <div
                key={layoutItem.i}
                style={{ opacity: outsideBrickId === layoutItem.i ? 0.4 : 1 }}
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
