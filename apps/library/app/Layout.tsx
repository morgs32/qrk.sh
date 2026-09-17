import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { RotateCcw, X } from "lucide-react";
import { cn } from "cn";
import { Drawer } from "@qrk.sh/web/library/Drawer";

import { Button } from "../components/ui/button";
import { BrickBreakpointProvider } from "../lib/BrickBreakpointProvider";
import { BrickWall } from "../lib/BrickWall";
import { BREAKPOINTS } from "../lib/breakpoints";
import { modulesHash } from "../lib/modulesHash";
import {
  BrickStoreProvider,
  useBricksStore,
  useBricksStoreApi,
} from "../lib/BrickStoreProvider";

const LIBRARY_BRICKS_STORAGE_NAME = "qrk-bricks-sandbox-responsive-bricks-v5";
const LIBRARY_BRICKS_STORAGE_VERSION = 5;

function readLibraryBricksState() {
  try {
    const raw = localStorage.getItem(LIBRARY_BRICKS_STORAGE_NAME);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    const persistedState =
      parsed !== null && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed;
    if (persistedState === null || typeof persistedState !== "object") return undefined;
    const selectedWidth =
      "selectedWidth" in persistedState &&
      (typeof persistedState.selectedWidth === "number" || persistedState.selectedWidth === null)
        ? persistedState.selectedWidth
        : null;
    if (
      !("bricksById" in persistedState) ||
      persistedState.bricksById === null ||
      typeof persistedState.bricksById !== "object"
    ) {
      return { bricksById: {}, selectedWidth };
    }
    return {
      bricksById: persistedState.bricksById,
      selectedWidth,
    };
  } catch {
    return undefined;
  }
}

function writeLibraryBricksState(state: {
  bricksById: Record<string, unknown>;
  selectedWidth: number | null;
}) {
  try {
    localStorage.setItem(
      LIBRARY_BRICKS_STORAGE_NAME,
      JSON.stringify({
        state: {
          bricksById: state.bricksById,
          selectedWidth: state.selectedWidth,
        },
        version: LIBRARY_BRICKS_STORAGE_VERSION,
      }),
    );
  } catch {
    // Ignore quota / private-mode write failures.
  }
}

export function Layout(props: { children: ReactNode }) {
  const [initialState] = useState(readLibraryBricksState);

  return (
    <BrickStoreProvider initialState={initialState} onChange={writeLibraryBricksState}>
      <LayoutBody>{props.children}</LayoutBody>
    </BrickStoreProvider>
  );
}

function LayoutBody(props: { children: ReactNode }) {
  const { children } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const bricksStore = useBricksStoreApi();
  const moduleId = params.moduleId;
  const brickId = params.brickId;
  const moduleLabel = moduleId ? modulesHash[moduleId]?.label : undefined;
  const drawerTitle = moduleLabel !== undefined ? `Bricks / ${moduleLabel}` : "Bricks";
  const persistedWidth = useBricksStore((state) => state.selectedWidth);
  const locationKey = `${location.pathname}${location.searchStr}`;
  const [drawerOpen, setDrawerOpen] = useState(
    () => location.pathname !== "/" || location.searchStr.length > 0,
  );
  const [drawerOpenForLocationKey, setDrawerOpenForLocationKey] = useState(locationKey);
  if (locationKey !== drawerOpenForLocationKey) {
    setDrawerOpenForLocationKey(locationKey);
    if (location.pathname !== "/" || location.searchStr.length > 0) {
      setDrawerOpen(true);
    }
  }

  function openDrawer() {
    setDrawerOpen(true);
    if (location.pathname === "/") {
      void navigate({ to: "/modules" });
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <BrickBreakpointProvider persistedWidth={persistedWidth}>
      {({ regionRef, availableWidth, selectedWidth }) => (
        <main
          className={cn(
            "grid h-dvh overflow-hidden transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0,0,0.2,1)] motion-reduce:transition-none",
            drawerOpen
              ? "grid-rows-[minmax(0,1fr)_50dvh]"
              : "grid-rows-[minmax(0,1fr)_0fr]",
          )}
        >
          <div
            ref={regionRef}
            data-testid="grid-region"
            data-brick-scroll-root=""
            className="relative min-h-0 min-w-0 overflow-y-auto pt-14"
          >
            {availableWidth > 0 && availableWidth < BREAKPOINTS[0].previewWidth && (
              <p className="p-4" role="status">
                At least {BREAKPOINTS[0].previewWidth}px is needed to preview the grid.
              </p>
            )}
            <div
              hidden={selectedWidth === null}
              className="mx-auto"
              style={{ width: selectedWidth ?? BREAKPOINTS[0].previewWidth }}
            >
              <BrickWall
                onBrickActivate={({ moduleId, brickId }) => {
                  void navigate({
                    to: "/modules/$moduleId/$brickId",
                    params: { moduleId, brickId },
                  });
                }}
              />
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
                    {moduleLabel !== undefined && moduleId !== undefined ? (
                      <>
                        <span aria-hidden className="text-muted-foreground">
                          /
                        </span>
                        {brickId !== undefined ? (
                          <Link
                            to="/modules/$moduleId"
                            params={{ moduleId }}
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
                size="icon"
                className="size-8"
                aria-label="Reset grid layout"
                title="Reset grid layout"
                onClick={() => {
                  bricksStore.setState({
                    bricksById: {},
                    activeBrickDrag: null,
                  });
                }}
              >
                <RotateCcw aria-hidden />
              </Button>
              <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
              {BREAKPOINTS.map((row) => (
                <Button
                  key={row.id}
                  type="button"
                  variant={selectedWidth === row.previewWidth ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2"
                  aria-label={`${row.previewWidth}px grid width`}
                  aria-pressed={selectedWidth === row.previewWidth}
                  disabled={row.previewWidth > availableWidth}
                  onClick={() => bricksStore.setState({ selectedWidth: row.previewWidth })}
                >
                  {row.previewWidth}
                </Button>
              ))}
            </div>
          </div>
        </main>
      )}
    </BrickBreakpointProvider>
  );
}
