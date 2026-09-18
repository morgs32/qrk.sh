import { useLayoutEffect, useRef, useState } from "react";

import { isNonEmptySpec } from "@json-render/core";
import { prefixId } from "@zerospin/core/models/prefixId";
import { useLiveQuery, useSession } from "@zerospin/react";
import GridLayout, { noCompactor } from "react-grid-layout";

import { LibraryFrontend } from "../aggregates/library/libraryFrontend";
import { membershipModelV1 } from "../aggregates/library/models/membership/membershipModelV1";
import { modulesHash } from "../lib/modulesHash";
import { useBricksStore } from "../lib/BrickStoreProvider";
import { SANDBOX_WALL_ID } from "./LibrarySandboxProvider";
import { readGridItem } from "./readGridItem";

function toGridItem(item: {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
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

export function LibraryWall(props: {
  breakpoint: "sm" | "md" | "lg" | "xl";
  gridWidth: number;
  onBrickActivate?: (args: { moduleId: string; brickId: string }) => void;
  onCommandError?: (message: string) => void;
}) {
  const { breakpoint, gridWidth } = props;
  const session = useSession(LibraryFrontend);
  const containerRef = useRef<HTMLElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [outsideBrickId, setOutsideBrickId] = useState<string | null>(null);
  const [dragScrollTop, setDragScrollTop] = useState(0);
  const activeBrickDrag = useBricksStore(state => state.activeBrickDrag);
  const setActiveBrickDrag = useBricksStore(state => state.setActiveBrickDrag);

  const membershipsQuery = useLiveQuery(LibraryFrontend, {
    query: db =>
      db.query.membership.findMany({
        where: { wallId: { eq: SANDBOX_WALL_ID } },
      }),
  });
  const placementsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.placement.findMany(),
  });
  const figmaThumbnailsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.figmaThumbnail.findMany(),
  });
  const githubActivitiesQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.githubActivity.findMany(),
  });
  const githubProfilesQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.githubProfile.findMany(),
  });
  const githubReposQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.githubRepo.findMany(),
  });
  const imagesQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.image.findMany(),
  });
  const instagramsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.instagram.findMany(),
  });
  const linksQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.link.findMany(),
  });
  const mapPlacesQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.mapPlace.findMany(),
  });
  const swatchAndIconsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.swatchAndIcon.findMany(),
  });
  const textsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.text.findMany(),
  });

  useLayoutEffect(() => {
    if (!dragging && scrollRootRef.current) {
      scrollRootRef.current.scrollTop = dragScrollTop;
      scrollRootRef.current.style.overflow = "";
    }
  }, [dragging, dragScrollTop]);

  const memberships = membershipsQuery.data ?? [];
  const placements = placementsQuery.data ?? [];
  const membershipIds = new Set(memberships.map(membership => membership.id));

  function visibleLayoutAt(targetBreakpoint: "sm" | "md" | "lg" | "xl") {
    return placements.flatMap(placement => {
      if (
        placement.breakpoint !== targetBreakpoint ||
        !placement.isVisible ||
        placement.membershipId === null ||
        !membershipIds.has(placement.membershipId)
      ) {
        return [];
      }
      return [toGridItem(readGridItem(placement.gridItem))];
    });
  }

  function moduleStateFor(moduleId: string, moduleResourceId: string) {
    if (moduleId === "figma-thumbnail") {
      return figmaThumbnailsQuery.data?.find(row => row.id === moduleResourceId)
        ?.state;
    }
    if (moduleId === "github-activity") {
      return githubActivitiesQuery.data?.find(row => row.id === moduleResourceId)
        ?.state;
    }
    if (moduleId === "github-profile") {
      return githubProfilesQuery.data?.find(row => row.id === moduleResourceId)
        ?.state;
    }
    if (moduleId === "github-repo") {
      return githubReposQuery.data?.find(row => row.id === moduleResourceId)
        ?.state;
    }
    if (moduleId === "image") {
      return imagesQuery.data?.find(row => row.id === moduleResourceId)?.state;
    }
    if (moduleId === "instagram") {
      return instagramsQuery.data?.find(row => row.id === moduleResourceId)
        ?.state;
    }
    if (moduleId === "link") {
      return linksQuery.data?.find(row => row.id === moduleResourceId)?.state;
    }
    if (moduleId === "map-place") {
      return mapPlacesQuery.data?.find(row => row.id === moduleResourceId)
        ?.state;
    }
    if (moduleId === "swatch-and-icon") {
      return swatchAndIconsQuery.data?.find(row => row.id === moduleResourceId)
        ?.state;
    }
    return textsQuery.data?.find(row => row.id === moduleResourceId)?.state;
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
          style={
            dragging ? { transform: `translateY(-${dragScrollTop}px)` } : undefined
          }
          layout={layout.map(item => ({
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
          onResizeStop={nextLayout => {
            const result = session.executeCommand({
              contractName: "updateLayoutAtBreakpoint",
              payload: {
                wallId: SANDBOX_WALL_ID,
                breakpoint,
                layout: nextLayout.map(toGridItem),
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

            const catalog = modulesHash[activeBrickDrag.moduleId];
            if (catalog === undefined || !isLibraryModuleId(activeBrickDrag.moduleId)) {
              reportCommandError({
                message: `Unknown module ${activeBrickDrag.moduleId}`,
              });
              return;
            }
            const moduleId = activeBrickDrag.moduleId;

            const idSuffix = crypto.randomUUID().replace(/-/g, "");
            const membershipId = prefixId(membershipModelV1, idSuffix);
            const moduleResourceId = `${catalog.abbreviation}_${idSuffix}`;
            const droppedItem = {
              i: membershipId,
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
            };
            const resolvedActiveLayout = nextLayout.map(layoutItem => {
              if (layoutItem.i !== item.i) {
                return toGridItem(layoutItem);
              }
              return droppedItem;
            });
            const otherBreakpointVisibleLayouts = {
              sm: visibleLayoutAt("sm"),
              md: visibleLayoutAt("md"),
              lg: visibleLayoutAt("lg"),
              xl: visibleLayoutAt("xl"),
            };

            const result = session.executeCommand({
              contractName: "addBrick",
              payload: {
                wallId: SANDBOX_WALL_ID,
                membershipId,
                moduleResourceId,
                moduleId,
                state: structuredClone(activeBrickDrag.state),
                spec: structuredClone(activeBrickDrag.spec),
                breakpoint,
                droppedItem,
                resolvedActiveLayout,
                otherBreakpointVisibleLayouts,
              },
            });
            if (result._tag === "Failure") {
              reportCommandError(result.failure);
            }
            setActiveBrickDrag(null);
          }}
          onDragStart={() => {
            const scrollRoot = containerRef.current?.closest(
              "[data-brick-scroll-root]",
            );
            scrollRootRef.current =
              scrollRoot instanceof HTMLElement ? scrollRoot : null;
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
              const membership = memberships.find(
                candidate => candidate.id === item.i,
              );
              if (membership !== undefined) {
                const result = session.executeCommand({
                  contractName: "removeBrick",
                  payload: {
                    membershipId: membership.id,
                    wallId: SANDBOX_WALL_ID,
                    moduleId: membership.moduleId,
                    moduleResourceId: membership.moduleResourceId,
                  },
                });
                if (result._tag === "Failure") {
                  reportCommandError(result.failure);
                }
              }
            } else {
              const result = session.executeCommand({
                contractName: "updateLayoutAtBreakpoint",
                payload: {
                  wallId: SANDBOX_WALL_ID,
                  breakpoint,
                  layout: nextLayout.map(toGridItem),
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
          {layout.map(layoutItem => {
            const membership = memberships.find(
              candidate => candidate.id === layoutItem.i,
            );
            const placement = placements.find(
              candidate =>
                candidate.membershipId === layoutItem.i &&
                candidate.breakpoint === breakpoint &&
                candidate.isVisible,
            );
            const catalog =
              membership !== undefined
                ? modulesHash[membership.moduleId]
                : undefined;

            if (membership && placement && catalog) {
              const BrickComponent = catalog.component;
              const state = moduleStateFor(
                membership.moduleId,
                membership.moduleResourceId,
              );
              const rawSpec: unknown =
                typeof placement.spec === "string"
                  ? JSON.parse(placement.spec)
                  : placement.spec;
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
                      moduleId: membership.moduleId,
                      brickId: layoutItem.i,
                    });
                  }}
                >
                  <div className="relative size-full">
                    <div className="brick-drag-content size-full">
                      <BrickComponent
                        breakpoint={breakpoint}
                        state={state}
                        spec={rawSpec}
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
