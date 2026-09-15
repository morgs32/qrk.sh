import { useEffect, useLayoutEffect, useRef, useState } from "react";

import GridLayout, { verticalCompactor } from "react-grid-layout";
import { useNavigate } from "react-router";

import { useBrickBreakpoint } from "../BrickBreakpointProvider";
import { modulesHash } from "../modulesHash";

import { resolveBrickBreakpoint } from "./resolveBrickBreakpoint";
import { useGridStore } from "./useGridStore";

export function SandboxGrid() {
  const navigate = useNavigate();
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
      style={dragging ? { overflow: "visible" } : undefined}
      className="min-h-screen bg-black lg:sticky lg:top-0 lg:h-screen lg:self-start lg:overflow-y-auto"
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
          layout={layout.map((item) => ({
            ...item,
            isDraggable: true,
            isResizable: true}))}
          autoSize
          className="grid-layout min-h-screen"
          compactor={verticalCompactor}
          gridConfig={{
            cols: 8,
            rowHeight,
            margin: [0, 0],
            containerPadding: [0, 0],
            maxRows: Number.POSITIVE_INFINITY}}
          dragConfig={{
            enabled: true,
            bounded: false,
            threshold: 3}}
          onResizeStop={(nextLayout) => setLayout(nextLayout, breakpoint)}
          dropConfig={{
            enabled: true,
            defaultItem: { w: 2, h: 2 },
            onDragOver: () => {
              if (!activeBrickDrag) {
                return false;
              }

              return { w: activeBrickDrag[breakpoint].w, h: activeBrickDrag[breakpoint].h };
            }}}
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
                w: activeBrickDrag[breakpoint].w,
                h: activeBrickDrag[breakpoint].h};
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
                  bricksById: remainingBricks};
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
                    navigate(
                      `/modules/${encodeURIComponent(brickDef.moduleId)}/brick/${encodeURIComponent(layoutItem.i)}`,
                    );
                  }}
                >
                  <div className="relative size-full">
                    <div className="brick-drag-content size-full">
                      <BrickComponent
                        breakpoint={breakpoint}
                        data={brickDef.data}
                        options={resolveBrickBreakpoint(brickDef, breakpoint).options}
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
