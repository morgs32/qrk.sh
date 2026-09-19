import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useLiveQuery, useSession } from "@zerospin/react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import { cn } from "cn";
import { Drawer } from "@qrk.sh/web/library/Drawer";

import { LibraryFrontend } from "../aggregates/library/libraryFrontend";
import { Button } from "../components/ui/button";
import { BREAKPOINTS } from "../lib/breakpoints";
import { modulesHash } from "../lib/modulesHash";
import {
  BrickStoreProvider,
  useBricksStoreApi,
} from "../lib/BrickStoreProvider";
import {
  useWallViewport,
  useWallViewportStoreApi,
  WallViewportProvider,
} from "../lib/WallViewportProvider";
import { LibrarySandboxProvider, SANDBOX_WALL_ID } from "./LibrarySandboxProvider";
import { LibraryWall } from "./LibraryWall";
import { readGridItem } from "./readGridItem";

const LIBRARY_VIEWPORT_STORAGE_NAME = "qrk-bricks-sandbox-viewport-v1";

const wallSlideTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

function readSelectedBreakpoint(persistedState: object): (typeof BREAKPOINTS)[number]["id"] | null {
  if (
    "selectedBreakpoint" in persistedState &&
    (persistedState.selectedBreakpoint === null ||
      persistedState.selectedBreakpoint === "sm" ||
      persistedState.selectedBreakpoint === "md" ||
      persistedState.selectedBreakpoint === "lg" ||
      persistedState.selectedBreakpoint === "xl")
  ) {
    return persistedState.selectedBreakpoint;
  }

  return null;
}

function readLibraryViewportState() {
  try {
    const raw = localStorage.getItem(LIBRARY_VIEWPORT_STORAGE_NAME);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    const persistedState =
      parsed !== null && typeof parsed === "object" && "state" in parsed
        ? parsed.state
        : parsed;
    if (persistedState === null || typeof persistedState !== "object") {
      return undefined;
    }
    return { selectedBreakpoint: readSelectedBreakpoint(persistedState) };
  } catch {
    return undefined;
  }
}

function writeLibraryViewportState(state: {
  selectedBreakpoint: (typeof BREAKPOINTS)[number]["id"] | null;
}) {
  try {
    localStorage.setItem(
      LIBRARY_VIEWPORT_STORAGE_NAME,
      JSON.stringify({
        state: {
          selectedBreakpoint: state.selectedBreakpoint,
        },
        version: 1,
      }),
    );
  } catch {
    // Ignore quota / private-mode write failures.
  }
}

function breakpointIndex(id: (typeof BREAKPOINTS)[number]["id"]) {
  return BREAKPOINTS.findIndex(row => row.id === id);
}

function LibraryWallPane(props: {
  children: ReactNode;
  previewWidth: number;
  isActive: boolean;
  isOutgoing: boolean;
  isOnStage: boolean;
  isTransitioning: boolean;
  direction: 1 | -1 | 0;
  reducedMotion: boolean;
  onOutgoingComplete: () => void;
}) {
  const {
    children,
    previewWidth,
    isActive,
    isOutgoing,
    isOnStage,
    isTransitioning,
    direction,
    reducedMotion,
    onOutgoingComplete,
  } = props;
  const controls = useAnimationControls();
  const onOutgoingCompleteRef = useRef(onOutgoingComplete);
  useEffect(() => {
    onOutgoingCompleteRef.current = onOutgoingComplete;
  });

  useLayoutEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isOnStage) {
        await controls.set({ x: 0 });
        return;
      }

      if (reducedMotion || direction === 0 || !isTransitioning) {
        await controls.set({ x: 0 });
        if (isOutgoing && !cancelled) {
          onOutgoingCompleteRef.current();
        }
        return;
      }

      if (isOutgoing) {
        const exitX = direction === 1 ? "-100%" : "100%";
        await controls.start({ x: exitX, transition: wallSlideTransition });
        if (!cancelled) {
          onOutgoingCompleteRef.current();
        }
        return;
      }

      if (isActive) {
        const enterX = direction === 1 ? "100%" : "-100%";
        await controls.set({ x: enterX });
        if (cancelled) {
          return;
        }
        await controls.start({ x: 0, transition: wallSlideTransition });
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    controls,
    direction,
    isActive,
    isOnStage,
    isOutgoing,
    isTransitioning,
    reducedMotion,
  ]);

  return (
    <motion.div
      animate={controls}
      hidden={!isOnStage}
      inert={!isActive}
      className={cn(
        isOutgoing && "absolute inset-x-0 top-0",
        isActive && "relative w-full",
      )}
    >
      <div className="mx-auto" style={{ width: previewWidth }}>
        {children}
      </div>
    </motion.div>
  );
}

export function Layout(props: { children: ReactNode }) {
  const [sessionKey, setSessionKey] = useState(0);

  return (
    <LibrarySandboxProvider sessionKey={sessionKey}>
      <BrickStoreProvider>
        <WallViewportProvider
          key={sessionKey}
          selectedBreakpoint={
            readLibraryViewportState()?.selectedBreakpoint ?? null
          }
        >
          <LayoutBody onResetSession={() => setSessionKey(key => key + 1)}>
            {props.children}
          </LayoutBody>
        </WallViewportProvider>
      </BrickStoreProvider>
    </LibrarySandboxProvider>
  );
}

function LayoutBody(props: {
  children: ReactNode;
  onResetSession: () => void;
}) {
  const { children, onResetSession } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const bricksStore = useBricksStoreApi();
  const wallViewportStore = useWallViewportStoreApi();
  const session = useSession(LibraryFrontend);
  const {
    regionRef,
    availableWidth,
    activeBreakpoint,
    setSelectedBreakpoint,
  } = useWallViewport();
  const reducedMotion = useReducedMotion() ?? false;
  const moduleId = params.moduleId;
  const brickId = params.brickId;
  const locationKey = `${location.pathname}${location.searchStr}`;
  const [drawerOpen, setDrawerOpen] = useState(
    () => location.pathname !== "/" || location.searchStr.length > 0,
  );
  const [drawerOpenForLocationKey, setDrawerOpenForLocationKey] = useState(locationKey);
  const hasMeasuredRef = useRef(false);
  const previousBreakpointRef = useRef<(typeof BREAKPOINTS)[number]["id"] | null>(null);
  const [fromBreakpoint, setFromBreakpoint] = useState<
    (typeof BREAKPOINTS)[number]["id"] | null
  >(null);
  const [direction, setDirection] = useState<1 | -1 | 0>(0);
  const [commandError, setCommandError] = useState<string | null>(null);

  const placementsQuery = useLiveQuery(LibraryFrontend, {
    query: db => db.query.placement.findMany(),
  });
  const bricksQuery = useLiveQuery(LibraryFrontend, {
    query: db =>
      db.query.brick.findMany({
        where: { wallId: { eq: SANDBOX_WALL_ID } },
      }),
  });
  const brickRow =
    brickId === undefined
      ? undefined
      : (bricksQuery.data ?? []).find(candidate => candidate.id === brickId);
  const breadcrumbModuleId = moduleId ?? brickRow?.moduleId;
  const moduleLabel =
    breadcrumbModuleId !== undefined
      ? modulesHash[breadcrumbModuleId]?.label
      : undefined;
  const drawerTitle = moduleLabel !== undefined ? `Bricks / ${moduleLabel}` : "Bricks";

  if (locationKey !== drawerOpenForLocationKey) {
    setDrawerOpenForLocationKey(locationKey);
    if (location.pathname !== "/" || location.searchStr.length > 0) {
      setDrawerOpen(true);
    }
  }

  useEffect(() => {
    if (activeBreakpoint === null) {
      return;
    }
    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      previousBreakpointRef.current = activeBreakpoint;
      return;
    }
    const previous = previousBreakpointRef.current;
    previousBreakpointRef.current = activeBreakpoint;
    if (previous === null || previous === activeBreakpoint) {
      return;
    }
    const previousIndex = breakpointIndex(previous);
    const nextIndex = breakpointIndex(activeBreakpoint);
    setFromBreakpoint(previous);
    setDirection(nextIndex > previousIndex ? 1 : -1);
  }, [activeBreakpoint]);

  useEffect(() => {
    function persist() {
      writeLibraryViewportState({
        selectedBreakpoint: wallViewportStore.getState().selectedBreakpoint,
      });
    }
    const unsubscribeViewport = wallViewportStore.subscribe(persist);
    return () => {
      unsubscribeViewport();
    };
  }, [wallViewportStore]);

  function openDrawer() {
    setDrawerOpen(true);
    if (location.pathname === "/") {
      void navigate({ to: "/modules" });
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function compactActiveLayout() {
    if (activeBreakpoint === null) {
      return;
    }
    const brickIds = new Set(
      (bricksQuery.data ?? []).map(candidate => candidate.id),
    );
    const visibleLayout = (placementsQuery.data ?? []).flatMap(placement => {
      if (
        placement.breakpoint !== activeBreakpoint ||
        !placement.isVisible ||
        placement.brickId === null ||
        !brickIds.has(placement.brickId)
      ) {
        return [];
      }
      return [readGridItem(placement.gridItem)];
    });
    const result = session.executeCommand({
      contractName: "compactLayoutAtBreakpoint",
      payload: {
        wallId: SANDBOX_WALL_ID,
        breakpoint: activeBreakpoint,
        visibleLayout,
      },
    });
    if (result._tag === "Failure") {
      setCommandError(result.failure.message ?? result.failure.code ?? "Compact failed");
      return;
    }
    setCommandError(null);
  }

  return (
    <main className="relative h-dvh overflow-hidden">
      {commandError !== null ? (
        <div
          role="alert"
          className="pointer-events-auto fixed inset-x-4 top-16 z-90 mx-auto max-w-lg rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="m-0">{commandError}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2"
              onClick={() => setCommandError(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "grid h-full overflow-hidden transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0,0,0.2,1)] motion-reduce:transition-none",
          drawerOpen
            ? "grid-rows-[minmax(0,1fr)_50dvh]"
            : "grid-rows-[minmax(0,1fr)_0dvh]",
        )}
      >
        <div
          ref={regionRef}
          data-testid="grid-region"
          data-brick-scroll-root=""
          className="relative min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pt-14"
        >
          {availableWidth > 0 && availableWidth < BREAKPOINTS[0].previewWidth && (
            <p className="p-4" role="status">
              At least {BREAKPOINTS[0].previewWidth}px is needed to preview the grid.
            </p>
          )}
          <div className="relative">
            {BREAKPOINTS.map(row => {
              const isActive = activeBreakpoint === row.id;
              const isOutgoing = fromBreakpoint === row.id;
              const isOnStage = isActive || isOutgoing;
              const isTransitioning = fromBreakpoint !== null;
              return (
                <LibraryWallPane
                  key={row.id}
                  previewWidth={row.previewWidth}
                  isActive={isActive}
                  isOutgoing={isOutgoing}
                  isOnStage={isOnStage}
                  isTransitioning={isTransitioning}
                  direction={direction}
                  reducedMotion={reducedMotion}
                  onOutgoingComplete={() => {
                    setFromBreakpoint(current => (current === row.id ? null : current));
                  }}
                >
                  <LibraryWall
                    breakpoint={row.id}
                    gridWidth={row.previewWidth}
                    onCommandError={setCommandError}
                    onBrickActivate={({
                      brickId: activatedBrickId,
                    }) => {
                      void navigate({
                        to: "/bricks/$brickId",
                        params: {
                          brickId: activatedBrickId,
                        },
                      });
                    }}
                  />
                </LibraryWallPane>
              );
            })}
          </div>
        </div>
        <div className="min-h-0 overflow-hidden">
          {drawerOpen ? (
            <Drawer
              side="bottom"
              layoutMode="flow"
              aria-label={drawerTitle}
              className="border-zinc-300 bg-white"
            >
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-4 py-2.5">
                <nav aria-label="Drawer breadcrumbs" className="flex min-w-0 items-center gap-2">
                  <Link to="/modules">Bricks</Link>
                  {moduleLabel !== undefined && breadcrumbModuleId !== undefined ? (
                    <>
                      <span aria-hidden className="text-muted-foreground">
                        /
                      </span>
                      {brickId !== undefined ? (
                        <Link
                          to="/modules/$moduleId"
                          params={{ moduleId: breadcrumbModuleId }}
                          className="truncate"
                        >
                          {moduleLabel}
                        </Link>
                      ) : (
                        <span className="truncate">{moduleLabel}</span>
                      )}
                      {brickId !== undefined ? (
                        <>
                          <span aria-hidden className="text-muted-foreground">
                            /
                          </span>
                          <span className="truncate">{`~${brickId.slice(-5)}`}</span>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </nav>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer"
                  aria-label="Close drawer"
                  onClick={closeDrawer}
                >
                  <X aria-hidden />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
                  <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                    {children}
                  </div>
                </div>
              </div>
            </Drawer>
          ) : null}
        </div>
      </div>
      <div className="pointer-events-none fixed inset-x-0 top-3 z-80 flex justify-center px-2 lg:bottom-6 lg:top-auto">
        <div
          role="toolbar"
          aria-label="Grid controls"
          className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center rounded-sm border border-border/80 bg-background px-1 py-1 shadow-md"
        >
          <Button
            type="button"
            variant={drawerOpen ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2"
            aria-expanded={drawerOpen}
            onClick={() => {
              if (drawerOpen) {
                closeDrawer();
              } else {
                openDrawer();
              }
            }}
          >
            Bricks
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            disabled={activeBreakpoint === null}
            onClick={compactActiveLayout}
          >
            Compact layout
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Reset grid layout"
            title="Reset grid layout"
            onClick={() => {
              bricksStore.setState({
                activeBrickDrag: null,
              });
              setCommandError(null);
              onResetSession();
              if (brickId !== undefined) {
                void navigate({ to: "/modules" });
              }
            }}
          >
            <RotateCcw aria-hidden />
          </Button>
          <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
          {BREAKPOINTS.map(row => (
            <Button
              key={row.id}
              type="button"
              variant={activeBreakpoint === row.id ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2"
              aria-label={`${row.previewWidth}px grid width`}
              aria-pressed={activeBreakpoint === row.id}
              disabled={row.previewWidth > availableWidth}
              onClick={() => setSelectedBreakpoint(row.id)}
            >
              {row.previewWidth}
            </Button>
          ))}
        </div>
      </div>
    </main>
  );
}
