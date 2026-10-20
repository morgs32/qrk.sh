"use client";

import { useEffect, useState, useSyncExternalStore, Suspense, type ReactNode } from "react";

import { Drawer } from "../lib/Drawer";
import { Link, useLocation, useMatches, useNavigate, useParams } from "@tanstack/react-router";
import { Effect, Layer, Result, Schema } from "effect";
import { makeEffectSchema } from "@zerospin/shapes";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { useLiveQuery } from "@zerospin/react";
import { useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../components/ui/button";
import { Toaster } from "../components/ui/sonner";
import { BREAKPOINTS } from "../lib/breakpoints";
import { BrickCardStyleContext } from "../lib/BrickCardStyleContext";
import { WallBreakpointPane } from "../lib/WallBreakpointPane";
import { WallPreviewViewport } from "../lib/WallPreviewViewport";
import { WallPreviewToolbar } from "../lib/WallPreviewToolbar";
import { modulesHash } from "../lib/modulesHash";
import {
  useWallViewport,
  useWallViewportStoreApi,
  WallViewportProvider,
} from "../lib/WallViewportProvider";
import { LibrarySessionContext } from "../session/createLibraryStandaloneSession";
import { libraryModule } from "../libraryModule/libraryModule";

import { startLibrarySessionWork } from "../session/startLibrarySessionWork";

import { LibraryApp, librarySessionInputs } from "./librarySession";
import LibraryError from "./error";
import { ImageUploadEnvironment } from "../modules/image/ImageUploadEnvironment";
import { ImageUploadRuntimeContext } from "../modules/image/ImageUploadRuntimeContext";

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
  const mounted = useSyncExternalStore(subscribeToClientMount, readClientMount, readServerMount);
  return (
    <LibraryApp.Initializer
      {...librarySessionInputs}
      renderError={(error) => <LibraryError error={error} />}
    >
      <Suspense fallback={null}>
        {mounted ? <InitializedLibraryLayout>{children}</InitializedLibraryLayout> : null}
      </Suspense>
    </LibraryApp.Initializer>
  );
}

function InitializedLibraryLayout(props: { children: ReactNode }) {
  const { children } = props;
  const session = LibraryApp.useInitializedSession();
  useEffect(() => {
    const stopWork = startLibrarySessionWork(session);
    const stopFailures = session.store.subscribe((state, previous) => {
      if (state.status !== "failed" && state.failure !== null && state.failure !== previous.failure)
        toast.error(state.failure.message);
    });
    return () => {
      stopWork();
      stopFailures();
    };
  }, [session]);
  const imageLayer = Layer.succeed(ImageUploadEnvironment, {
    upload: Effect.fn("Library.Image.upload")(function* (file: File) {
      const body = new FormData();
      body.set("file", file);
      const response = yield* Effect.tryPromise((signal) =>
        fetch("/image/upload", {
          method: "POST",
          headers: {},
          body,
          signal,
        }),
      );
      const result: unknown = yield* Effect.tryPromise(() => response.json());
      if (!response.ok) {
        const error = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ code: Schema.String, message: Schema.String }),
        )(result);
        return yield* Effect.fail(new Error(error.message));
      }
      const uploaded = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ key: Schema.String, url: Schema.String, contentType: Schema.String }),
      )(result);
      return uploaded.url;
    }),
  });
  return (
    <ImageUploadRuntimeContext
      value={{
        runPromise: (program, options) =>
          session.runPromise(program.pipe(Effect.provide(imageLayer)), options),
      }}
    >
      <LibrarySessionContext value={session}>
        <WallViewportProvider
          selectedBreakpoint={readLibraryViewportState()?.selectedBreakpoint ?? null}
        >
          <LayoutBody session={session}>{children}</LayoutBody>
        </WallViewportProvider>
      </LibrarySessionContext>
    </ImageUploadRuntimeContext>
  );
}

function LayoutBody(props: {
  children: ReactNode;
  session: ReturnType<typeof LibraryApp.useInitializedSession>;
}) {
  const { children, session } = props;
  const [cardStyle, setCardStyle] = useState(false);
  const { pathname, searchStr } = useLocation();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const isBrickAdmin = useMatches({
    select: (matches) => matches.some((match) => match.routeId === "/bricks/$brickId_/admin"),
  });
  const wallViewportStore = useWallViewportStoreApi();
  const {
    availableWidth,
    activeBreakpoint,
    setSelectedBreakpoint,
    displayPlaceholders,
    setDisplayPlaceholders,
  } = useWallViewport();
  const reducedMotion = useReducedMotion() ?? false;
  const decodedModule = Schema.decodeUnknownResult(
    makeEffectSchema({ moduleId: libraryModule.models.brick.attributes.moduleId }),
  )({ moduleId: params.moduleId });
  const moduleId = Result.isSuccess(decodedModule) ? decodedModule.success.moduleId : undefined;
  const decodedBrickId = Schema.decodeUnknownResult(makeModelIdSchema(libraryModule.models.brick))(
    params.brickId,
  );
  const brickId = Result.isSuccess(decodedBrickId) ? decodedBrickId.success : undefined;
  const search = searchStr.slice(1);
  const locationKey = `${pathname}${searchStr}`;
  const [drawerOpen, setDrawerOpen] = useState(() => pathname !== "/" || search.length > 0);
  const [drawerOpenForLocationKey, setDrawerOpenForLocationKey] = useState(locationKey);

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

  const brickQuery = useLiveQuery({
    session,
    key: brickId,
    query: (db, id) =>
      db.query.brick.findFirst({
        where: { id: { eq: id ?? "brk_missing" } },
      }),
  });
  const brickRow = brickQuery.data;
  const breadcrumbModuleId = moduleId ?? brickRow?.moduleId;
  const moduleLabel =
    breadcrumbModuleId !== undefined ? modulesHash[breadcrumbModuleId].label : undefined;
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
      void navigate({ to: "/modules", resetScroll: false });
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    if (brickId !== undefined) void navigate({ to: "/", resetScroll: false });
  }

  useEffect(() => {
    if (brickId !== undefined && brickRow === undefined) {
      queueMicrotask(() => {
        setDrawerOpen(false);
        void navigate({ to: "/", resetScroll: false });
      });
    }
  }, [brickId, brickRow, navigate]);

  useEffect(() => {
    if (!drawerOpen || brickId === undefined) return;
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setTimeout(() => {
        if (!event.defaultPrevented) {
          setDrawerOpen(false);
          void navigate({ to: "/", resetScroll: false });
        }
      }, 0);
    }
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [drawerOpen, brickId, navigate]);

  const toolbar = (
    <WallPreviewToolbar aria-label="Preview controls">
      <Button
        type="button"
        variant={drawerOpen ? "secondary" : "ghost"}
        size="sm"
        className="px-2"
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
        variant={cardStyle ? "secondary" : "ghost"}
        size="sm"
        className="px-2"
        aria-pressed={cardStyle}
        onClick={() => setCardStyle((current) => !current)}
      >
        Cards
      </Button>
      <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
      {BREAKPOINTS.map((row) => (
        <Button
          key={row.id}
          type="button"
          variant={activeBreakpoint === row.id ? "secondary" : "ghost"}
          size="sm"
          className="px-2"
          aria-label={`${row.previewWidth}px preview width`}
          aria-pressed={activeBreakpoint === row.id}
          disabled={row.previewWidth > availableWidth}
          onClick={() => setSelectedBreakpoint(row.id)}
        >
          {row.previewWidth}
        </Button>
      ))}
    </WallPreviewToolbar>
  );

  return (
    <BrickCardStyleContext value={cardStyle}>
      <main className="relative h-dvh overflow-hidden">
        <Toaster />
        <div className="h-full overflow-hidden">
          <WallPreviewViewport drawerOpen={drawerOpen} toolbar={toolbar}>
            {availableWidth > 0 && activeBreakpoint === null && (
              <p className="p-4" role="status">
                At least {BREAKPOINTS[0].previewWidth}px is needed to preview the page.
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
                    <div
                      className="bg-white"
                      data-site-right-scroll
                      role="region"
                      aria-label={`${row.id} page preview`}
                    />
                  </WallBreakpointPane>
                );
              })}
            </div>
          </WallPreviewViewport>
          <div className="min-h-0 overflow-hidden">
            <Drawer
              side="bottom"
              open={drawerOpen}
              aria-label={drawerTitle}
              className="border-zinc-300 bg-white"
            >
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-4 py-2.5">
                <nav aria-label="Drawer breadcrumbs" className="flex min-w-0 items-center gap-2">
                  <Link to="/modules" resetScroll={false}>
                    Bricks
                  </Link>
                  {moduleLabel !== undefined && breadcrumbModuleId !== undefined ? (
                    <>
                      <span aria-hidden className="text-muted-foreground">
                        /
                      </span>
                      {brickId !== undefined ? (
                        <Link
                          to="/modules/$moduleId"
                          params={{ moduleId: breadcrumbModuleId }}
                          resetScroll={false}
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
                            <Link
                              to="/bricks/$brickId"
                              params={{ brickId }}
                              resetScroll={false}
                              className="truncate"
                            >
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
                            <Link
                              to="/bricks/$brickId/admin"
                              params={{ brickId }}
                              resetScroll={false}
                            >
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
      </main>
    </BrickCardStyleContext>
  );
}

function subscribeToClientMount() {
  return () => {};
}
function readClientMount() {
  return true;
}
function readServerMount() {
  return false;
}
