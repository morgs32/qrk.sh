import { useLayoutEffect, useRef, useState } from "react";

import { isNonEmptySpec } from "@json-render/core";
import { prefixId } from "@zerospin/core/models/prefixId";
import { stageCommand, useLiveQuery } from "@zerospin/react";
import GridLayout, { noCompactor } from "react-grid-layout";

import { libraryModule } from "../libraryModule/libraryModule";
import type { ILibrarySession } from "../session/createLibraryStandaloneSession";
import { BrickWrapper } from "../components/brick/BrickWrapper";
import { brickDragStore } from "./GridStore";
import { modulesHash } from "./modulesHash";

function makeGridItem(item: { i: string; x: number; y: number; w: number; h: number }) {
  return {
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  };
}

function isLibraryModuleId(
  value: string,
): value is
  | "figma-thumbnail"
  | "github-activity"
  | "github-profile"
  | "github-repo"
  | "image"
  | "instagram"
  | "link"
  | "map-place"
  | "swatch-and-icon"
  | "text" {
  return (
    value === "figma-thumbnail" ||
    value === "github-activity" ||
    value === "github-profile" ||
    value === "github-repo" ||
    value === "image" ||
    value === "instagram" ||
    value === "link" ||
    value === "map-place" ||
    value === "swatch-and-icon" ||
    value === "text"
  );
}

function commandErrorMessage(failure: { message?: string; code?: string }) {
  if (typeof failure.message === "string" && failure.message.length > 0) {
    return failure.message;
  }
  if (typeof failure.code === "string" && failure.code.length > 0) {
    return failure.code;
  }
  return "Command failed";
}

export function BrickWall(props: {
  session: ILibrarySession;
  wallId: `wal_${string}`;
  breakpoint: "sm" | "md" | "lg" | "xl";
  gridWidth: number;
  onBrickActivate?: (args: { moduleId: string; brickId: string }) => void;
  onCommandError?: (message: string) => void;
}) {
  const { session, wallId, breakpoint, gridWidth } = props;
  const containerRef = useRef<HTMLElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [outsideBrickId, setOutsideBrickId] = useState<string | null>(null);
  const [dragScrollTop, setDragScrollTop] = useState(0);

  const bricksQuery = useLiveQuery({
    session,
    query: (db) =>
      db.query.brick.findMany({
        where: { wallId: { eq: wallId } },
      }),
  });
  const placementsQuery = useLiveQuery({
    session,
    query: (db) => db.query.placement.findMany(),
  });

  useLayoutEffect(() => {
    if (!dragging && scrollRootRef.current) {
      scrollRootRef.current.scrollTop = dragScrollTop;
      scrollRootRef.current.style.overflow = "";
    }
  }, [dragging, dragScrollTop]);

  const bricks = bricksQuery.data
  const placements = placementsQuery.data ?? [];
  const brickIds = new Set(bricks.map((brickRow) => brickRow.id));

  function visibleLayoutAt(targetBreakpoint: "sm" | "md" | "lg" | "xl") {
    return placements.flatMap((placement) => {
      if (
        placement.breakpoint !== targetBreakpoint ||
        !placement.isVisible ||
        placement.brickId === null ||
        !brickIds.has(placement.brickId)
      ) {
        return [];
      }
      return [makeGridItem(placement.gridItem)];
    });
  }

  function reportCommandError(failure: { message?: string; code?: string }) {
    const message = commandErrorMessage(failure);
    if (props.onCommandError) {
      props.onCommandError(message);
      return;
    }
    window.alert(message);
  }

  const layout = visibleLayoutAt(breakpoint);
  const rowHeight = gridWidth / 8;

  return (
    <section ref={containerRef} aria-label="Brick grid" className="bg-black">
      {outsideBrickId && (
        <div
          role="status"
          className="pointer-events-none fixed right-4 top-4 z-80 rounded bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          Release to remove
        </div>
      )}
      {gridWidth > 0 && (
        <GridLayout
          width={gridWidth}
          style={dragging ? { transform: `translateY(-${dragScrollTop}px)` } : undefined}
          layout={layout.map((item) => ({
            ...item,
            isDraggable: true,
            isResizable: true,
          }))}
          autoSize
          className="grid-layout min-h-[calc(100dvh-3.5rem)]"
          compactor={noCompactor}
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
          onResizeStop={(nextLayout) => {
            const result = stageCommand({
              session,
              contractName: "updateLayoutAtBreakpoint",
              payload: {
                wallId,
                breakpoint,
                layout: nextLayout.map(makeGridItem),
              },
            });
            if (result._tag === "Failure") {
              reportCommandError(result.failure);
            }
          }}
          dropConfig={{
            enabled: true,
            defaultItem: { w: 2, h: 2 },
            onDragOver: () => {
              const brickDef = brickDragStore.getState().brickDef;
              if (!brickDef) {
                return false;
              }

              return { w: brickDef.w, h: brickDef.h };
            },
          }}
          onDrop={(nextLayout, item) => {
            const brickDef = brickDragStore.getState().brickDef;
            if (!item || !brickDef) {
              return;
            }

            const catalog = modulesHash[brickDef.moduleId];
            if (catalog === undefined || !isLibraryModuleId(brickDef.moduleId)) {
              reportCommandError({
                message: `Unknown module ${brickDef.moduleId}`,
              });
              return;
            }
            const moduleId = brickDef.moduleId;

            const idSuffix = crypto.randomUUID().replace(/-/g, "");
            const brickId = prefixId(libraryModule.models.brick, idSuffix);
            const droppedItem = {
              i: brickId,
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
            };
            const resolvedActiveLayout = nextLayout.map((layoutItem) => {
              if (layoutItem.i !== item.i) {
                return makeGridItem(layoutItem);
              }
              return droppedItem;
            });
            const otherBreakpointVisibleLayouts = {
              sm: visibleLayoutAt("sm"),
              md: visibleLayoutAt("md"),
              lg: visibleLayoutAt("lg"),
              xl: visibleLayoutAt("xl"),
            };

            const result = stageCommand({
              session,
              contractName: "addBrick",
              payload: {
                wallId,
                brickId,
                moduleId,
                state: structuredClone(brickDef.state),
                spec: structuredClone(brickDef.spec),
                breakpoint,
                droppedItem,
                resolvedActiveLayout,
                otherBreakpointVisibleLayouts,
              },
            });
            if (result._tag === "Failure") {
              reportCommandError(result.failure);
            } else if ("failure" in result.success && result.success.failure != null) {
              const failure = result.success.failure;
              reportCommandError(
                typeof failure === "object" && failure !== null && "message" in failure
                  ? { message: String(failure.message) }
                  : { message: "addBrick failed" },
              );
            }
            brickDragStore.getState().setBrickDef(null);
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
              const brickRow = bricks.find((candidate) => candidate.id === item.i);
              if (brickRow !== undefined) {
                const result = stageCommand({
                  session,
                  contractName: "removeBrick",
                  payload: {
                    brickId: brickRow.id,
                    wallId,
                  },
                });
                if (result._tag === "Failure") {
                  reportCommandError(result.failure);
                }
              }
            } else {
              const result = stageCommand({
                session,
                contractName: "updateLayoutAtBreakpoint",
                payload: {
                  wallId,
                  breakpoint,
                  layout: nextLayout.map(makeGridItem),
                },
              });
              if (result._tag === "Failure") {
                reportCommandError(result.failure);
              }
            }
            setOutsideBrickId(null);
            setDragging(false);
          }}
        >
          {layout.map((layoutItem) => {
            const brickRow = bricks.find((candidate) => candidate.id === layoutItem.i);
            const placement = placements.find(
              (candidate) =>
                candidate.brickId === layoutItem.i &&
                candidate.breakpoint === breakpoint &&
                candidate.isVisible,
            );
            const catalog = brickRow !== undefined ? modulesHash[brickRow.moduleId] : undefined;

            if (brickRow && placement && catalog) {
              const BrickComponent = catalog.component;
              const state = brickRow.state;
              const rawSpec = placement.spec;
              if (!isNonEmptySpec(rawSpec)) {
                return null;
              }

              return (
                <div
                  key={layoutItem.i}
                  style={{
                    opacity: outsideBrickId === layoutItem.i ? 0.4 : 1,
                  }}
                  className="brick-drag-surface size-full"
                  data-brick={catalog.def.moduleId}
                  data-brick-id={layoutItem.i}
                  data-grid-x={layoutItem.x}
                  data-grid-y={layoutItem.y}
                  data-grid-w={layoutItem.w}
                  data-grid-h={layoutItem.h}
                  onDoubleClick={() => {
                    props.onBrickActivate?.({
                      moduleId: brickRow.moduleId,
                      brickId: layoutItem.i,
                    });
                  }}
                >
                  <div className="relative size-full">
                    <div className="brick-drag-content size-full">
                      <BrickWrapper>
                        <BrickComponent breakpoint={breakpoint} state={state} spec={rawSpec} />
                      </BrickWrapper>
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
