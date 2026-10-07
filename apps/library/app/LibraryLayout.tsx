"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Drawer } from "../lib/Drawer";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Result, Schema } from "effect";
import { makeEffectSchema } from "@zerospin/shapes";
import { prefixId } from "@zerospin/core/models/prefixId";
import { useInitializeStandaloneSession, useLiveQuery } from "@zerospin/react";
import { useReducedMotion } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../components/ui/button";
import { Toaster } from "../components/ui/sonner";
import { BREAKPOINTS } from "../lib/breakpoints";
import { BrickWall } from "../lib/BrickWall";
import { WallBreakpointPane } from "../lib/WallBreakpointPane";
import { brickDragStore } from "../lib/brickDragStore";
import { modulesHash } from "../lib/modulesHash";
import {
  useWallViewport,
  useWallViewportStoreApi,
  WallViewportProvider,
} from "../lib/WallViewportProvider";
import { LibrarySessionContext } from "../session/createLibraryStandaloneSession";
import { libraryModule } from "../libraryModule/libraryModule";

import { librarySession } from "./librarySession";

const WALL_ID = prefixId(libraryModule.models.wall, "library");
const LIBRARY_VIEWPORT_STORAGE_NAME = "qrk-bricks-library-viewport-v1";

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
      parsed !== null && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed;
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
  return BREAKPOINTS.findIndex((row) => row.id === id);
}

export function LibraryLayout(props: { children: ReactNode }) {
  const { children } = props;
  const [sessionKey, setSessionKey] = useState(0);
  const [resetError, setResetError] = useState<unknown>(null);
  const session = librarySession;
  const { isInitialized } = useInitializeStandaloneSession({ session });
  if (resetError !== null) throw resetError;
  if (!isInitialized) {
    return null;
  }

  return (
    <LibrarySessionContext value={session}>
      <WallViewportProvider
        key={sessionKey}
        selectedBreakpoint={readLibraryViewportState()?.selectedBreakpoint ?? null}
      >
        <LayoutBody
          session={session}
          onResetSession={() => {
            void session
              .reset()
              .then(() => setSessionKey((key) => key + 1))
              .catch(setResetError);
          }}
        >
          {children}
        </LayoutBody>
      </WallViewportProvider>
    </LibrarySessionContext>
  );
}

function LayoutBody(props: {
  children: ReactNode;
  session: typeof librarySession;
  onResetSession: () => void;
}) {
  const { children, session, onResetSession } = props;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const wallViewportStore = useWallViewportStoreApi();
  const {
    regionRef,
    availableWidth,
    activeBreakpoint,
    gridGesture,
    setGridGesture,
    setSelectedBreakpoint,
    displayPlaceholders,
    setDisplayPlaceholders,
  } = useWallViewport();
  const reducedMotion = useReducedMotion() ?? false;
  const decodedModule = Schema.decodeUnknownResult(
    makeEffectSchema({ moduleId: libraryModule.models.brick.attributes.moduleId }),
  )({ moduleId: params.moduleId });
  const moduleId = Result.isSuccess(decodedModule) ? decodedModule.success.moduleId : undefined;
  const brickId = typeof params.brickId === "string" ? params.brickId : undefined;
  const search = searchParams.toString();
  const locationKey = `${pathname}${search.length > 0 ? `?${search}` : ""}`;
  const [drawerOpen, setDrawerOpen] = useState(() => pathname !== "/" || search.length > 0);
  const [drawerOpenForLocationKey, setDrawerOpenForLocationKey] = useState(locationKey);

  const editorScroll = useRef<HTMLDivElement>(null);
  const drawerSpace = useRef<HTMLDivElement>(null);
  const hasReservedDrawerSpace = useRef(false);

  useLayoutEffect(() => {
    const scroll = editorScroll.current;
    const space = drawerSpace.current;
    if (scroll === null || space === null) return;

    // Change only trailing space, leaving the wall's percentage height intact.
    const previousTop = scroll.scrollTop;
    const previousMax = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const wasAtBottom =
      hasReservedDrawerSpace.current && previousMax > 0 && Math.abs(previousMax - previousTop) <= 1;
    space.style.paddingBottom = drawerOpen ? "50dvh" : "0px";
    const nextMax = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollTop = wasAtBottom ? nextMax : Math.min(Math.max(previousTop, 0), nextMax);
    hasReservedDrawerSpace.current = true;

    let position = {
      top: scroll.scrollTop,
      max: nextMax,
      viewportHeight: scroll.clientHeight,
      reservedHeight: space.getBoundingClientRect().height,
    };
    function rememberScroll() {
      // A resize may clamp scrollTop before its observer runs. Keep the old anchor.
      if (
        scroll === null ||
        space === null ||
        scroll.clientHeight !== position.viewportHeight ||
        space.getBoundingClientRect().height !== position.reservedHeight
      )
        return;
      position.top = scroll.scrollTop;
      position.max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    }
    const observer = new ResizeObserver(() => {
      const viewportHeight = scroll.clientHeight;
      const reservedHeight = space.getBoundingClientRect().height;
      if (
        viewportHeight === position.viewportHeight &&
        reservedHeight === position.reservedHeight
      ) {
        // Content growth updates the anchor measurement without following it.
        rememberScroll();
        return;
      }
      const max = Math.max(0, scroll.scrollHeight - viewportHeight);
      const atBottom = position.max > 0 && Math.abs(position.max - position.top) <= 1;
      scroll.scrollTop = atBottom ? max : Math.min(Math.max(position.top, 0), max);
      position = { top: scroll.scrollTop, max, viewportHeight, reservedHeight };
    });
    scroll.addEventListener("scroll", rememberScroll, { passive: true });
    observer.observe(scroll);
    observer.observe(space);
    if (space.previousElementSibling !== null) observer.observe(space.previousElementSibling);
    return () => {
      scroll.removeEventListener("scroll", rememberScroll);
      observer.disconnect();
    };
  }, [drawerOpen]);

  const [transition, setTransition] = useState<{
    active: (typeof BREAKPOINTS)[number]["id"] | null;
    from: (typeof BREAKPOINTS)[number]["id"] | null;
    direction: 1 | -1 | 0;
    version: number;
  }>({ active: null, from: null, direction: 0, version: 0 });
  if (transition.active !== activeBreakpoint) {
    setTransition({
      active: activeBreakpoint,
      from: transition.active !== null && activeBreakpoint !== null ? transition.active : null,
      direction:
        transition.active !== null && activeBreakpoint !== null
          ? breakpointIndex(activeBreakpoint) > breakpointIndex(transition.active)
            ? 1
            : -1
          : 0,
      version: transition.version + 1,
    });
  }
  const fromBreakpoint = transition.active === activeBreakpoint ? transition.from : null;
  const direction = transition.active === activeBreakpoint ? transition.direction : 0;

  const bricksQuery = useLiveQuery({
    session,
    query: (db) =>
      db.query.brick.findMany({
        where: { wallId: { eq: WALL_ID } },
      }),
  });
  const brickRow =
    brickId === undefined
      ? undefined
      : (bricksQuery.data ?? []).find((candidate) => candidate.id === brickId);
  const breadcrumbModuleId = moduleId ?? brickRow?.moduleId;
  const moduleLabel =
    breadcrumbModuleId !== undefined ? modulesHash[breadcrumbModuleId].label : undefined;
  const isBrickAdmin = brickId !== undefined && pathname === `/bricks/${brickId}/admin`;
  const drawerTitle =
    moduleLabel !== undefined
      ? `Bricks / ${moduleLabel}${isBrickAdmin ? " / Admin" : ""}`
      : "Bricks";

  if (locationKey !== drawerOpenForLocationKey) {
    setDrawerOpenForLocationKey(locationKey);
    if (pathname !== "/" || search.length > 0) {
      setDrawerOpen(true);
    }
  }

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
    if (pathname === "/") {
      router.push("/modules", { scroll: false });
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    if (brickId !== undefined) router.push("/", { scroll: false });
  }

  useEffect(() => {
    if (brickId !== undefined && bricksQuery.data !== undefined && brickRow === undefined) {
      queueMicrotask(() => {
        setDrawerOpen(false);
        router.push("/", { scroll: false });
      });
    }
  }, [brickId, brickRow, bricksQuery.data, router]);

  useEffect(() => {
    if (!drawerOpen || brickId === undefined) return;
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const popoverOpen = document.querySelector(
        ".tiptap-popover[data-state=open], .tiptap-dropdown-menu-content[data-state=open]",
      );
      queueMicrotask(() => {
        if (!event.defaultPrevented && !popoverOpen) {
          setDrawerOpen(false);
          router.push("/", { scroll: false });
        }
      });
    }
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [drawerOpen, brickId, router]);

  return (
    <main className="relative h-dvh overflow-hidden">
      <Toaster />
      <div className="h-full overflow-hidden">
        <div
          ref={(element) => {
            editorScroll.current = element;
            return regionRef(element);
          }}
          data-testid="grid-region"
          data-brick-scroll-root=""
          className="relative h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pt-[var(--wall-top-offset)] [--wall-top-offset:6rem] lg:[--wall-top-offset:3.5rem]"
        >
          {availableWidth > 0 && activeBreakpoint === null && (
            <p className="p-4" role="status">
              At least {BREAKPOINTS[0].previewWidth}px is needed to preview the grid.
            </p>
          )}
          <div className="relative">
            {BREAKPOINTS.map((row) => {
              const isActive = activeBreakpoint === row.id;
              const isOutgoing = fromBreakpoint === row.id;
              const isOnStage = isActive || isOutgoing;
              const isTransitioning = fromBreakpoint !== null;
              return (
                <WallBreakpointPane
                  key={row.id}
                  breakpoint={row.id}
                  previewWidth={row.previewWidth}
                  isActive={isActive}
                  isOutgoing={isOutgoing}
                  isOnStage={isOnStage}
                  isTransitioning={isTransitioning}
                  direction={direction}
                  reducedMotion={reducedMotion}
                  onOutgoingComplete={() => {
                    setTransition((current) =>
                      current.version === transition.version && current.from === row.id
                        ? { ...current, from: null }
                        : current,
                    );
                  }}
                >
                  <div className="[--wall-chrome-height:7rem]">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none relative flex h-16 translate-y-[var(--wall-drag-scroll-offset,0px)] items-center border-b border-border bg-background px-6"
                    >
                      <span className="text-sm font-medium">qrk.sh</span>
                    </div>
                    <BrickWall
                      session={session}
                      wallId={WALL_ID}
                      breakpoint={row.id}
                      gridWidth={row.previewWidth}
                      isActive={isActive}
                      gridGestureActive={gridGesture}
                      onGestureChange={setGridGesture}
                      onCommandError={(message) => toast.error(message)}
                      onBrickActivate={({ brickId: activatedBrickId }) => {
                        setDrawerOpen(true);
                        router.push(`/bricks/${activatedBrickId}`, { scroll: false });
                      }}
                    />
                  </div>
                </WallBreakpointPane>
              );
            })}
          </div>
          <div ref={drawerSpace} data-editor-drawer-space aria-hidden />
        </div>
        <div className="min-h-0 overflow-hidden">
          <Drawer
            side="bottom"
            open={drawerOpen}
            aria-label={drawerTitle}
            className="border-zinc-300 bg-white"
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-4 py-2.5">
              <nav aria-label="Drawer breadcrumbs" className="flex min-w-0 items-center gap-2">
                <Link href="/modules" scroll={false}>
                  Bricks
                </Link>
                {moduleLabel !== undefined && breadcrumbModuleId !== undefined ? (
                  <>
                    <span aria-hidden className="text-muted-foreground">
                      /
                    </span>
                    {brickId !== undefined ? (
                      <Link
                        href={`/modules/${breadcrumbModuleId}`}
                        scroll={false}
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
                        {isBrickAdmin ? (
                          <Link href={`/bricks/${brickId}`} scroll={false} className="truncate">
                            {`~${brickId.slice(-5)}`}
                          </Link>
                        ) : (
                          <span className="truncate">{`~${brickId.slice(-5)}`}</span>
                        )}
                        <span aria-hidden className="text-muted-foreground">
                          /
                        </span>
                        {isBrickAdmin ? (
                          <span aria-current="page">Admin</span>
                        ) : (
                          <Link href={`/bricks/${brickId}/admin`} scroll={false}>
                            Admin
                          </Link>
                        )}
                      </>
                    ) : null}
                  </>
                ) : null}
              </nav>
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={displayPlaceholders}
                    onChange={(event) => setDisplayPlaceholders(event.target.checked)}
                  />
                  Display placeholders
                </label>
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
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                  {drawerOpen || brickId === undefined ? children : null}
                </div>
              </div>
            </div>
          </Drawer>
        </div>
      </div>
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-80 flex justify-center px-2 lg:bottom-6 lg:top-auto"
        style={{
          ...(drawerOpen ? { top: "auto", bottom: "calc(50dvh + 1.5rem)" } : {}),
          transition: reducedMotion ? "none" : "bottom 300ms cubic-bezier(0, 0, 0.2, 1)",
        }}
      >
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
              brickDragStore.getState().setBrickDef(null);
              toast.dismiss();
              onResetSession();
              if (brickId !== undefined) {
                router.push("/modules", { scroll: false });
              }
            }}
          >
            <RotateCcw aria-hidden />
          </Button>
          <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
          {BREAKPOINTS.map((row) => (
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
