import { Link } from "react-router";
import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";
import { useBrickBreakpoint } from "../BrickBreakpointProvider";
import { GripHorizontal, Pencil } from "lucide-react";
import { Button } from "../ui/button";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { catalogsHash } from "../catalogsHash";
import GridLayout, { verticalCompactor } from "react-grid-layout";

import { useGridStore } from "./useGridStore";

export function SandboxGrid() {
  const containerRef = useRef<HTMLElement>(null);
  const { gridWidth, breakpoint, containerRef: observeGrid } = useBrickBreakpoint();
  const [dragging, setDragging] = useState(false);
  const [outsideBrickId, setOutsideBrickId] = useState<string | null>(null);
  const dragScrollTopRef = useRef(0);
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

  const layout = Object.values(bricksById).flatMap((brick) => {
    const entry = resolveBrickBreakpoint(brick, breakpoint);
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
      style={dragging ? { overflow: "visible", zIndex: 70 } : undefined}
      className="min-h-screen bg-white lg:sticky lg:top-0 lg:h-screen lg:self-start lg:overflow-y-auto"
    >
      {outsideBrickId && (
        <div
          role="status"
          className="pointer-events-none fixed right-4 top-4 z-80 rounded bg-zinc-900 px-3 py-2 text-sm text-white"
        >
          Release to remove
        </div>
      )}
      {gridWidth > 0 && hasHydrated && (
        <GridLayout
          width={gridWidth}
          style={dragging ? { transform: `translateY(-${dragScrollTopRef.current}px)` } : undefined}
          // Dropped items carry isDraggable, which overrides dragConfig.enabled.
          layout={layout.map((item) => ({ ...item, isDraggable: true }))}
          autoSize
          className="grid-layout min-h-screen"
          compactor={verticalCompactor}
          gridConfig={{
            cols: 8,
            rowHeight,
            margin: [0, 0],
            containerPadding: [0, 0],
            maxRows: Number.POSITIVE_INFINITY,
          }}
          dragConfig={{ enabled: true, handle: ".brick-drag-handle", bounded: false, threshold: 3 }}
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
            addBrick(brickId, activeBrickDrag, gridLayoutWithDroppedBrick, breakpoint);
            setActiveBrickDrag(null);
          }}
          onDragStart={() => {
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
            const catalog = brickDef ? catalogsHash[brickDef.catalogId] : undefined;
            const content = catalog?.contents[brickDef.contentId];
            const brick = content?.views[brickDef.viewId];

            if (brick) {
              const BrickComponent = brick.component;

              return (
                <div
                  key={layoutItem.i}
                  style={{ opacity: outsideBrickId === layoutItem.i ? 0.4 : 1 }}
                  className="brick-drag-surface size-full"
                  data-brick={`${brick.def.catalogName}/${brick.def.content}/${brick.def.view}`}
                  data-brick-id={layoutItem.i}
                  data-grid-x={layoutItem.x}
                  data-grid-y={layoutItem.y}
                  data-grid-w={layoutItem.w}
                  data-grid-h={layoutItem.h}
                >
                  <div className="relative size-full">
                    <div className="brick-drag-content size-full">
                      <BrickComponent
                        breakpoint={breakpoint}
                        data={brickDef.data}
                        viewOptions={resolveBrickBreakpoint(brickDef, breakpoint).viewOptions}
                      />
                    </div>
                    <Button asChild variant="ghost" size="icon" className="brick-edit-handle">
                      <Link
                        aria-label="Edit brick"
                        to={`/catalogs/${encodeURIComponent(brickDef.catalogId)}/brick/${encodeURIComponent(layoutItem.i)}`}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="brick-drag-handle"
                      aria-label="Drag brick"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <GripHorizontal aria-hidden className="size-4" />
                    </Button>
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
