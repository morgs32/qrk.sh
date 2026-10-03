import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { isNonEmptySpec } from "@json-render/core";
import { Schema } from "effect";
import { prefixId } from "@zerospin/core/models/prefixId";
import { stageCommand, useLiveQuery } from "@zerospin/react";
import { TextBrickEditingContext } from "../modules/text/TextBrickEditingContext";
import { makeCollisionResolvedLayout } from "../libraryModule/resolveVisibleCollisions";
import GridLayout, { noCompactor } from "react-grid-layout";

import { libraryModule } from "../libraryModule/libraryModule";
import type { ILibrarySession } from "../session/createLibraryStandaloneSession";
import { BrickWrapper } from "../components/brick/BrickWrapper";
import { brickDragStore } from "./brickDragStore";
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
  isActive?: boolean;
  showTextEditAction?: boolean;
  onGestureChange?: (active: boolean) => void;
  onBrickActivate?: (args: { moduleId: keyof typeof modulesHash; brickId: string }) => void;
  onCommandError?: (message: string) => void;
}) {
  const {
    session,
    wallId,
    breakpoint,
    gridWidth,
    isActive = true,
    showTextEditAction = true,
    onGestureChange,
    onBrickActivate,
    onCommandError,
  } = props;
  const backupStatus = useSyncExternalStore(
    session.store.subscribe,
    () => session.store.getState().backupState?.status ?? "released",
    () => "released",
  );
  const gesture = useRef(false);
  const heights = useRef(new Map<string, number>());
  const frame = useRef<number | null>(null);
  const applyHeights = useRef<() => void>(() => {});
  const [measurementEpoch, setMeasurementEpoch] = useState(0);
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

  const bricks = bricksQuery.data;
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
    if (onCommandError) {
      onCommandError(message);
      return;
    }
    window.alert(message);
  }

  const layout = visibleLayoutAt(breakpoint);
  const rowHeight = gridWidth / 8;

  // Measure all changed Text bricks against one current database snapshot.
  useLayoutEffect(() => {
    applyHeights.current = () => {
      frame.current = null;
      if (!isActive || gesture.current || gridWidth <= 0) {
        heights.current.clear();
        return;
      }
      const state = session.store.getState();
      if (!state.isInitialized || state.db === null) return;
      const currentBricks = state.db.query.brick
        .findMany({ where: { wallId: { eq: wallId } } })
        .sync();
      const ids = new Set(currentBricks.map((brick) => brick.id));
      const currentPlacements = state.db.query.placement.findMany().sync();
      let nextLayout = currentPlacements.flatMap((placement) =>
        placement.breakpoint === breakpoint &&
        placement.isVisible &&
        placement.brickId !== null &&
        ids.has(placement.brickId)
          ? [makeGridItem(placement.gridItem)]
          : [],
      );
      let changed = false;
      for (const [brickId, height] of heights.current) {
        const item = nextLayout.find((candidate) => candidate.i === brickId);
        const h = Math.max(1, Math.ceil(height / rowHeight));
        if (!item || item.h === h) continue;
        nextLayout = makeCollisionResolvedLayout({
          visibleLayout: nextLayout,
          incoming: { ...item, h },
        });
        changed = true;
      }
      heights.current.clear();
      if (!changed) return;
      try {
        const result = stageCommand({
          session,
          contractName: "updateLayoutAtBreakpoint",
          payload: { wallId, breakpoint, layout: nextLayout },
        });
        if (result._tag === "Failure") reportCommandError(result.failure);
      } catch (error) {
        reportCommandError({
          message: error instanceof Error ? error.message : "Layout update failed",
        });
      }
    };
  });

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  function beginGesture() {
    gesture.current = true;
    heights.current.clear();
    onGestureChange?.(true);
  }
  function endGesture() {
    if (!gesture.current) return;
    gesture.current = false;
    heights.current.clear();
    setMeasurementEpoch((epoch) => epoch + 1);
    onGestureChange?.(false);
  }

  useEffect(
    () => () => {
      if (gesture.current) onGestureChange?.(false);
    },
    [onGestureChange],
  );

  return (
    <section
      ref={containerRef}
      data-backup-status={backupStatus}
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
      {gridWidth > 0 && (
        <GridLayout
          width={gridWidth}
          style={dragging ? { transform: `translateY(-${dragScrollTop}px)` } : undefined}
          layout={layout.map((item) => {
            const brickRow = bricks.find((candidate) => candidate.id === item.i);
            const view = brickRow && modulesHash[brickRow.moduleId].viewFor(breakpoint);
            return {
              ...item,
              minW: view?.minW,
              minH: view?.minH,
              isDraggable: isActive,
              isResizable: isActive,
              ...(brickRow?.moduleId === "text" ? { resizeHandles: ["e" satisfies "e"] } : {}),
            };
          })}
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
            enabled: isActive,
            cancel: ".qrk-text-edit",
            bounded: false,
            threshold: 3,
          }}
          onResizeStart={beginGesture}
          onResizeStop={(nextLayout) => {
            try {
              const result = stageCommand({
                session,
                contractName: "updateLayoutAtBreakpoint",
                payload: {
                  wallId,
                  breakpoint,
                  layout: nextLayout.map(makeGridItem),
                },
              });
              if (result._tag === "Failure") reportCommandError(result.failure);
            } finally {
              endGesture();
            }
          }}
          dropConfig={{
            enabled: isActive,
            defaultItem: { w: 2, h: 2 },
            onDragOver: () => {
              const brickDef = brickDragStore.getState().brickDef;
              if (!brickDef) {
                return false;
              }

              return { w: brickDef.w, h: brickDef.h };
            },
          }}
          onDrop={(_nextLayout, item) => {
            const brickDef = brickDragStore.getState().brickDef;
            if (!item || !brickDef) {
              return;
            }

            const moduleId = brickDef.moduleId;

            const idSuffix = crypto.randomUUID().replace(/-/g, "");
            const brickId = prefixId(libraryModule.models.brick, idSuffix);
            const visibleLayouts = {
              sm: visibleLayoutAt("sm"),
              md: visibleLayoutAt("md"),
              lg: visibleLayoutAt("lg"),
              xl: visibleLayoutAt("xl"),
            };

            try {
              const result = stageCommand({
                session,
                contractName: "addBrick",
                payload: {
                  wallId,
                  brickId,
                  moduleId,
                  state:
                    modulesHash[moduleId].placeholder !== undefined
                      ? null
                      : structuredClone(brickDef.state),
                  spec: structuredClone(brickDef.spec),
                  dropPosition: { x: item.x, y: item.y },
                  placementSizes: brickDef.placementSizes,
                  visibleLayouts,
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
            } finally {
              if (brickDragStore.getState().brickDef === brickDef) {
                brickDragStore.getState().setBrickDef(null);
              }
            }
          }}
          onDragStart={() => {
            // RGL also starts a synthetic gesture for its external-drop placeholder.
            // That path finishes in onDrop, rather than onDragStop.
            if (brickDragStore.getState().brickDef !== null) return;
            beginGesture();
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
            try {
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
            } finally {
              if (scrollRootRef.current) {
                scrollRootRef.current.scrollTop = dragScrollTop;
                scrollRootRef.current.style.overflow = "";
              }
              setOutsideBrickId(null);
              setDragging(false);
              endGesture();
            }
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
            if (brickRow && placement) {
              const catalog = modulesHash[brickRow.moduleId];
              const BrickComponent = catalog.component;
              const state = brickRow.state;
              const rawSpec = placement.spec;
              const spec =
                isNonEmptySpec(rawSpec) ||
                (state === null &&
                  catalog.placeholder !== undefined &&
                  Schema.is(
                    Schema.Struct({
                      root: Schema.String,
                      elements: Schema.Record(Schema.String, Schema.Never),
                      state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
                    }),
                  )(rawSpec))
                  ? rawSpec
                  : undefined;
              if (spec === undefined) {
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
                    if (!isActive) return;
                    onBrickActivate?.({
                      moduleId: brickRow.moduleId,
                      brickId: layoutItem.i,
                    });
                  }}
                >
                  <div className="relative size-full">
                    {brickRow.moduleId === "text" && isActive && showTextEditAction && (
                      <button
                        type="button"
                        className="qrk-text-edit"
                        aria-label="Edit text"
                        onClick={() => {
                          onBrickActivate?.({
                            moduleId: brickRow.moduleId,
                            brickId: brickRow.id,
                          });
                        }}
                      >
                        Edit text
                      </button>
                    )}
                    <div className="brick-drag-content size-full">
                      <BrickWrapper
                        className={brickRow.moduleId === "github-activity" ? "bg-white" : undefined}
                      >
                        <TextBrickEditingContext
                          value={
                            brickRow.moduleId === "text"
                              ? {
                                  isActive,
                                  measurementEpoch: `${measurementEpoch}:${breakpoint}:${gridWidth}`,
                                  onNaturalHeight: (height) => {
                                    if (!isActive || gesture.current) return;
                                    heights.current.set(brickRow.id, height);
                                    if (frame.current === null)
                                      frame.current = requestAnimationFrame(() =>
                                        applyHeights.current(),
                                      );
                                  },
                                }
                              : null
                          }
                        >
                          <BrickComponent breakpoint={breakpoint} state={state} spec={spec} />
                        </TextBrickEditingContext>
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
