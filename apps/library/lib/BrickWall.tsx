import { useLayoutEffect, useRef, useState } from "react";

import GridLayout, { verticalCompactor } from "react-grid-layout";

import { useBrickBreakpoint } from "./BrickBreakpointProvider";
import { modulesHash } from "./modulesHash";
import { useBricksStore, useBricksStoreApi } from "./BrickStoreProvider";

export function BrickWall(props: {
  onBrickActivate?: (args: { moduleId: string; brickId: string }) => void;
}) {
  const bricksStore = useBricksStoreApi();
  const containerRef = useRef<HTMLElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const { gridWidth, breakpoint, containerRef: observeGrid } = useBrickBreakpoint();
  const [dragging, setDragging] = useState(false);
  const [outsideBrickId, setOutsideBrickId] = useState<string | null>(null);
  const [dragScrollTop, setDragScrollTop] = useState(0);
  const bricksById = useBricksStore((state) => state.bricksById);
  const activeBrickDrag = useBricksStore((state) => state.activeBrickDrag);
  const hasHydrated = useBricksStore((state) => state.hasHydrated);
  const setLayout = useBricksStore((state) => state.setLayout);
  const addBrick = useBricksStore((state) => state.addBrick);
  const setActiveBrickDrag = useBricksStore((state) => state.setActiveBrickDrag);
  useLayoutEffect(() => {
    if (!dragging && scrollRootRef.current) {
      scrollRootRef.current.scrollTop = dragScrollTop;
      scrollRootRef.current.style.overflow = "";
    }
  }, [dragging, dragScrollTop]);

  const layout = Object.values(bricksById).flatMap((brick) => {
    const entry = brick[breakpoint];
    return entry.gridItem === null ? [] : [{ ...entry.gridItem }];
  });
  const rowHeight = gridWidth / 8;

  return (
    <section
      ref={(element) => {
        containerRef.current = element;
        return observeGrid(element);
      }}
      aria-label="Brick grid"
      className="bg-black"
    >
      {outsideBrickId && (
        <div
          role="status"
          className="pointer-events-none fixed right-4 top-4 z-80 rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          Release to remove
        </div>
      )}
      {gridWidth > 0 && hasHydrated && (
        <GridLayout
          width={gridWidth}
          style={dragging ? { transform: `translateY(-${dragScrollTop}px)` } : undefined}
          // Dropped items carry isDraggable, which overrides dragConfig.enabled.
          layout={layout.map((item) => ({
            ...item,
            isDraggable: true,
            isResizable: true,
          }))}
          autoSize
          className="grid-layout min-h-[calc(100dvh-3.5rem)]"
          compactor={verticalCompactor}
          gridConfig={{
            cols: 8,
            rowHeight,
            margin: [0, 0],
            containerPadding: [0, 0],
            maxRows: Number.POSITIVE_INFINITY,
          }}
          dragConfig={{
            enabled: true,
            bounded: false,
            threshold: 3,
          }}
          onResizeStop={(nextLayout) => setLayout(nextLayout, breakpoint)}
          dropConfig={{
            enabled: true,
            defaultItem: { w: 2, h: 2 },
            onDragOver: () => {
              if (!activeBrickDrag) {
                return false;
              }

              return { w: activeBrickDrag[breakpoint].w ?? 1, h: activeBrickDrag[breakpoint].h ?? 1 };
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
              };
            });
            addBrick(brickId, activeBrickDrag, gridLayoutWithDroppedBrick, breakpoint);
            setActiveBrickDrag(null);
          }}
          onDragStart={() => {
            const scrollRoot = containerRef.current?.closest("[data-brick-scroll-root]");
            scrollRootRef.current = scrollRoot instanceof HTMLElement ? scrollRoot : null;
            setDragScrollTop(scrollRootRef.current?.scrollTop ?? 0);
            if (scrollRootRef.current) {
              scrollRootRef.current.style.overflow = "visible";
            }
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
              bricksStore.setState((state) => {
                const remainingBricks = { ...state.bricksById };
                delete remainingBricks[item.i];
                return {
                  bricksById: remainingBricks,
                };
              });
              setLayout(
                verticalCompactor.compact(
                  nextLayout.filter((layoutItem) => layoutItem.i !== item.i),
                  8,
                ),
                breakpoint,
              );
            } else {
              setLayout(nextLayout, breakpoint);
            }
            setOutsideBrickId(null);
            setDragging(false);
          }}
        >
          {layout.map((layoutItem) => {
            const brickDef = bricksById[layoutItem.i];
            const catalog = brickDef ? modulesHash[brickDef.moduleId] : undefined;
            const brick = catalog;

            if (brick) {
              const BrickComponent = brick.component;

              return (
                <div
                  key={layoutItem.i}
                  style={{ opacity: outsideBrickId === layoutItem.i ? 0.4 : 1 }}
                  className="brick-drag-surface size-full"
                  data-brick={brick.def.moduleId}
                  data-brick-id={layoutItem.i}
                  data-grid-x={layoutItem.x}
                  data-grid-y={layoutItem.y}
                  data-grid-w={layoutItem.w}
                  data-grid-h={layoutItem.h}
                  onDoubleClick={() => {
                    props.onBrickActivate?.({
                      moduleId: brickDef.moduleId,
                      brickId: layoutItem.i,
                    });
                  }}
                >
                  <div className="relative size-full">
                    <div className="brick-drag-content size-full">
                      <BrickComponent
                        breakpoint={breakpoint}
                        state={brickDef.state}
                        spec={brickDef[breakpoint].spec}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })}
        </GridLayout>
      )}
    </section>
  );
}
