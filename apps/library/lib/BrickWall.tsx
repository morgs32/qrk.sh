import { stageAggregateSessionCommand } from "@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Pencil } from "lucide-react";

import { isNonEmptySpec } from "@json-render/core";
import { Schema } from "effect";
import { prefixId } from "@zerospin/core/models/prefixId";
import { useLiveQuery } from "@zerospin/react";
import GridLayout, { verticalCompactor } from "react-grid-layout";

import { libraryModule } from "../libraryModule/libraryModule";
import { makeCompactLayout } from "../libraryModule/resolveVisibleCollisions";
import type { ILibrarySession } from "../session/createLibraryStandaloneSession";
import { BrickWrapper } from "../components/brick/BrickWrapper";
import { BrickCardStyleContext } from "./BrickCardStyleContext";
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
  executeCommand: typeof stageAggregateSessionCommand;
  wallId: `wal_${string}`;
  breakpoint: "sm" | "md" | "lg" | "xl";
  gridWidth: number;
  isActive?: boolean;
  selectedBrickId?: string;
  gridGestureActive?: boolean;
  showArticleEditAction?: boolean;
  onGestureChange?: (active: boolean) => void;
  onBrickActivate?: (args: { moduleId: keyof typeof modulesHash; brickId: string }) => void;
  onCommandError?: (message: string) => void;
}) {
  const {
    session,
    executeCommand,
    wallId,
    breakpoint,
    gridWidth,
    isActive = true,
    selectedBrickId,
    gridGestureActive = false,
    showArticleEditAction = true,
    onGestureChange,
    onBrickActivate,
    onCommandError,
  } = props;
  const cardStyle = useContext(BrickCardStyleContext);
  const catalogDragActive = useSyncExternalStore(
    brickDragStore.subscribe,
    () => brickDragStore.getState().brickDef !== null,
    () => false,
  );
  const gesture = useRef(false);
  const normalizationAttempt = useRef<{ session: ILibrarySession; snapshot: string } | null>(null);
  const containerRef = useRef<HTMLElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const [gestureActive, setGestureActive] = useState(false);
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

  useEffect(() => {
    if (
      gestureActive ||
      gridGestureActive ||
      gesture.current ||
      catalogDragActive ||
      brickDragStore.getState().brickDef !== null ||
      bricksQuery.error ||
      placementsQuery.error
    ) {
      return;
    }
    const initialized = session.store.getState().initialized;
    if (initialized === null) return;
    const { db } = initialized;

    // Read one current baseline rather than persisting RGL's temporary geometry.
    const currentBricks = db.query.brick.findMany({ where: { wallId: { eq: wallId } } }).sync();
    const currentBrickIds = new Set(currentBricks.map((brick) => brick.id));
    const visibleLayout = db.query.placement
      .findMany({ where: { breakpoint: { eq: breakpoint }, isVisible: { eq: true } } })
      .sync()
      .flatMap((placement) =>
        placement.brickId !== null && currentBrickIds.has(placement.brickId)
          ? [makeGridItem(placement.gridItem)]
          : [],
      );
    const compacted = makeCompactLayout(visibleLayout);
    const changed = compacted.some((item) => {
      const previous = visibleLayout.find((candidate) => candidate.i === item.i);
      return (
        previous?.x !== item.x ||
        previous.y !== item.y ||
        previous.w !== item.w ||
        previous.h !== item.h
      );
    });
    if (!changed) {
      normalizationAttempt.current = null;
      return;
    }

    const snapshot = JSON.stringify([
      wallId,
      breakpoint,
      [...visibleLayout].sort((left, right) => left.i.localeCompare(right.i)),
    ]);
    if (
      normalizationAttempt.current?.session === session &&
      normalizationAttempt.current.snapshot === snapshot
    ) {
      return;
    }
    normalizationAttempt.current = { session, snapshot };
    const result = executeCommand({
      session,
      contractName: "compactLayoutAtBreakpoint",
      payload: { wallId, breakpoint, visibleLayout },
    });
    if (result._tag === "Failure") {
      const message = commandErrorMessage(result.failure);
      if (onCommandError) onCommandError(message);
      else window.alert(message);
    }
  }, [
    session,
    executeCommand,
    wallId,
    breakpoint,
    bricksQuery.data,
    bricksQuery.error,
    placementsQuery.data,
    placementsQuery.error,
    gestureActive,
    gridGestureActive,
    catalogDragActive,
    onCommandError,
  ]);

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
  const bottomRow = Math.max(0, ...layout.map((item) => item.y + item.h));
  const gap = cardStyle ? 16 : 0;
  const pitch = (gridWidth - gap) / 8;
  const rowHeight = pitch - gap;

  function beginGesture() {
    gesture.current = true;
    setGestureActive(true);
    onGestureChange?.(true);
  }
  function endGesture() {
    if (!gesture.current) return;
    gesture.current = false;
    setGestureActive(false);
    onGestureChange?.(false);
  }

  useEffect(
    () => () => {
      if (gesture.current) {
        scrollRootRef.current?.style.removeProperty("--wall-drag-scroll-offset");
        onGestureChange?.(false);
      }
    },
    [onGestureChange],
  );

  return (
    <section ref={containerRef} aria-label="Brick grid" className="bg-white">
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
            };
          })}
          autoSize
          className="grid-layout bg-white min-h-[calc(100dvh-var(--wall-top-offset,3.5rem)-var(--wall-chrome-height,0px))]"
          compactor={verticalCompactor}
          gridConfig={{
            cols: 8,
            rowHeight,
            margin: [gap, gap],
            containerPadding: [gap, gap],
            maxRows: Number.POSITIVE_INFINITY,
          }}
          dragConfig={{
            enabled: isActive,
            cancel: ".qrk-article-edit",
            bounded: false,
            threshold: 3,
          }}
          resizeConfig={{
            enabled: isActive,
            handles: ["n", "e", "s", "w"],
          }}
          onResizeStart={beginGesture}
          onResizeStop={(nextLayout) => {
            try {
              const result = executeCommand({
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

              const { maxPerPage } = modulesHash[brickDef.moduleId];
              if (
                maxPerPage !== undefined &&
                bricks.filter((brick) => brick.moduleId === brickDef.moduleId).length >= maxPerPage
              ) {
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
              const result = executeCommand({
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
              } else {
                onBrickActivate?.({ moduleId, brickId });
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
            const scrollTop = scrollRootRef.current?.scrollTop ?? 0;
            setDragScrollTop(scrollTop);
            if (scrollRootRef.current) {
              scrollRootRef.current.style.setProperty(
                "--wall-drag-scroll-offset",
                `${-scrollTop}px`,
              );
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
                  const result = executeCommand({
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
                const result = executeCommand({
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
                scrollRootRef.current.style.removeProperty("--wall-drag-scroll-offset");
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
                  className="brick-drag-surface brick-hover-target size-full"
                  data-brick-surface=""
                  data-card-style={cardStyle}
                  data-brick={catalog.def.moduleId}
                  data-brick-id={layoutItem.i}
                  data-selected={isActive && selectedBrickId === layoutItem.i}
                  data-grid-x={layoutItem.x}
                  data-grid-y={layoutItem.y}
                  data-grid-w={layoutItem.w}
                  data-grid-h={layoutItem.h}
                  data-wall-right-edge={layoutItem.x + layoutItem.w === 8}
                  data-wall-bottom-edge={layoutItem.y + layoutItem.h === bottomRow}
                  onDoubleClick={() => {
                    if (!isActive) return;
                    onBrickActivate?.({
                      moduleId: brickRow.moduleId,
                      brickId: layoutItem.i,
                    });
                  }}
                >
                  <div className="brick-hover-surface relative size-full">
                    {brickRow.moduleId === "article" && isActive && showArticleEditAction && (
                      <button
                        type="button"
                        className="qrk-article-edit"
                        aria-label="Edit article"
                        title="Edit article"
                        onClick={() => {
                          onBrickActivate?.({
                            moduleId: brickRow.moduleId,
                            brickId: brickRow.id,
                          });
                        }}
                      >
                        <Pencil size={14} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    )}
                    <div className="brick-drag-content size-full">
                      <BrickWrapper
                        className={brickRow.moduleId === "github-activity" ? "bg-white" : undefined}
                      >
                        <BrickComponent breakpoint={breakpoint} state={state} spec={spec} />
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
