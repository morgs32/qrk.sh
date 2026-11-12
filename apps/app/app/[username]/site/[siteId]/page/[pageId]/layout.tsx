"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode, type RefCallback } from "react";
import {
  useBlocker,
  useMatches,
  useNavigate,
  useSearch,
  type ShouldBlockFn,
} from "@tanstack/react-router";
import { useAuth } from "@clerk/react";
import { ClerkOfflineError } from "@clerk/react/errors";
import { useLiveQuery, useSession } from "@zerospin/react";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { SWRConfig } from "swr";
import { Tabs, TabsContent } from "@qrk.sh/bricks/components/tabs";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { BREAKPOINTS, PREVIEW_BORDER_WIDTH } from "../../../../../../lib/breakpoints";
import { Toolbars } from "../../Toolbars/Toolbars";
import WorkspacePanelControls from "./(sidebar)/layout";
import { BrickAutosaveContext } from "./BrickAutosaveContext";
import { PageEditorNavbar } from "./PageEditorNavbar";
import { PagePreview } from "./PagePreview";
import { useBreakpointGuard } from "./useBreakpointGuard";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import NotFound from "@/app/not-found";

const PREVIEW_GUTTERS = { sm: 32, md: 40, lg: 60, xl: 80 };

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(Site),
  pageId: makeIdSchema(Page),
});

const previewControlSelector = [
  ".wall-placement-content",
  ".wall-action-tag",
  ".wall-resize-grip",
  "a, button, input, textarea, select, label, summary, audio, video, canvas",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"], [role="link"], [role^="menuitem"], [tabindex]:not([tabindex="-1"])',
].join(", ");

function isEditorBackground(surface: HTMLDivElement, target: EventTarget) {
  return (
    target instanceof Element &&
    surface.contains(target) &&
    target.closest(previewControlSelector) === null
  );
}

export default function PageLayout(props: { children: ReactNode }) {
  const { children } = props;
  const params = useValidatedParams(ParamsSchema);
  const { username, siteId, pageId } = params;
  const navigate = useNavigate();
  const { selected } = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const brickFlushes = useRef(new Map<string, (onRecover?: () => void) => boolean>());
  const pendingFlushes = useRef(new Map<() => boolean, Set<() => void>>());
  const pendingNavigation = useRef<((block: boolean) => void) | null>(null);
  const registerBrickFlush = useCallback(
    (brickId: string, flush: (onRecover?: () => void) => boolean) => {
      const registered = brickFlushes.current;
      registered.set(brickId, flush);
      return () => {
        if (registered.get(brickId) !== flush) return;
        registered.delete(brickId);
        const finishNavigation = pendingNavigation.current;
        queueMicrotask(() => {
          // A Wall rerender can refresh the registration without removing the editor.
          if (registered.get(brickId) === flush) return;
          const recoveries = pendingFlushes.current.get(flush);
          if (recoveries === undefined) return;
          finishNavigation?.(true);
          for (const recover of recoveries) recover();
        });
      };
    },
    [],
  );
  const flushBrick = useCallback(
    (brickId: string) => brickFlushes.current.get(brickId)?.() ?? true,
    [],
  );
  const flushPageEditors = useCallback((onRecover?: () => void) => {
    let pending = 0;
    for (const flush of [...brickFlushes.current.values()]) {
      if (onRecover === undefined) {
        if (!flush()) pending += 1;
        continue;
      }
      const recover = () => {
        const recoveries = pendingFlushes.current.get(flush);
        if (!recoveries?.delete(recover)) return;
        if (recoveries.size === 0) pendingFlushes.current.delete(flush);
        pending -= 1;
        if (pending === 0) onRecover();
      };
      if (flush(recover)) continue;
      pending += 1;
      const recoveries = pendingFlushes.current.get(flush) ?? new Set<() => void>();
      recoveries.add(recover);
      pendingFlushes.current.set(flush, recoveries);
    }
    return pending === 0;
  }, []);
  const shouldBlockNavigation = useCallback<ShouldBlockFn>(
    ({ current, next }) => {
      if (brickFlushes.current.size === 0) return false;
      const staysOnPage =
        "username" in next.params &&
        next.params.username === username &&
        "siteId" in next.params &&
        next.params.siteId === siteId &&
        "pageId" in next.params &&
        next.params.pageId === pageId;
      const previousBreakpoint =
        "breakpoint" in current.search ? current.search.breakpoint : undefined;
      const nextBreakpoint = "breakpoint" in next.search ? next.search.breakpoint : undefined;
      if (staysOnPage && previousBreakpoint === nextBreakpoint) return false;

      pendingNavigation.current?.(true);
      return new Promise<boolean>((resolve) => {
        const finish = (block: boolean) => {
          if (pendingNavigation.current !== finish) return;
          pendingNavigation.current = null;
          resolve(block);
        };
        pendingNavigation.current = finish;
        if (flushPageEditors(() => finish(false))) finish(false);
      });
    },
    [flushPageEditors, pageId, siteId, username],
  );
  useBlocker({ shouldBlockFn: shouldBlockNavigation, enableBeforeUnload: false });
  useLayoutEffect(() => () => pendingNavigation.current?.(true), [pageId, siteId, username]);
  const sidebarOpen = useMatches({
    select: (matches) =>
      matches.some((match) => match.routeId === "/$username/site/$siteId/page/$pageId/_sidebar"),
  });
  const isBrickDetails = useMatches({
    select: (matches) =>
      matches.at(-1)?.routeId === "/$username/site/$siteId/page/$pageId/_sidebar/brick/$brickId",
  });
  const pageTab = useMatches({
    select: (matches) => {
      const routeId = matches.at(-1)?.routeId;
      if (routeId === "/$username/site/$siteId/page/$pageId/_sidebar/modules/") return "modules";
      if (routeId === "/$username/site/$siteId/page/$pageId/_sidebar/page-settings")
        return "page-settings";
      if (routeId === "/$username/site/$siteId/page/$pageId/_sidebar/site-settings")
        return "site-settings";
      return null;
    },
  });
  const editorScroll = useRef<HTMLDivElement>(null);
  const backgroundPress = useRef<number | null>(null);
  const { getToken } = useAuth();
  const session = useSession(userSessionDefinition);
  const { breakpoint, previewRef } = useBreakpointGuard(PREVIEW_GUTTERS);
  const previewGutter =
    breakpoint === undefined ? PREVIEW_GUTTERS.sm : PREVIEW_GUTTERS[breakpoint.id];
  const previewViewportStyle = {
    "--wall-preview-top-gap": `${previewGutter}px`,
    "--wall-preview-bottom-gap": `${previewGutter}px`,
    minWidth: 0,
  };
  const frameWidth =
    breakpoint === undefined ? 0 : breakpoint.previewWidth + 2 * PREVIEW_BORDER_WIDTH;
  const scrollRef = useCallback<RefCallback<HTMLDivElement>>(
    (element) => {
      editorScroll.current = element;
      const cleanup = previewRef(element);
      return () => {
        cleanup?.();
        editorScroll.current = null;
      };
    },
    [previewRef],
  );
  const { data: site } = useLiveQuery({
    session,
    key: params.siteId,
    query: (db, siteId) => db.query.site.findFirst({ where: { id: { eq: siteId } } }),
  });
  const { data: page } = useLiveQuery({
    session,
    key: { pageId: params.pageId, siteId: params.siteId },
    query: (db, { pageId, siteId }) =>
      db.query.page.findFirst({ where: { id: { eq: pageId }, siteId: { eq: siteId } } }),
  });
  const hasEditor = site !== undefined && page !== undefined;
  useLayoutEffect(() => {
    const scroll = editorScroll.current;
    if (!hasEditor || scroll === null) return;

    let position = {
      top: scroll.scrollTop,
      max: Math.max(0, scroll.scrollHeight - scroll.clientHeight),
      viewportHeight: scroll.clientHeight,
      contentHeight: scroll.scrollHeight,
    };
    function rememberScroll() {
      // Resizing can clamp scrollTop before the observer reads the previous anchor.
      if (
        scroll === null ||
        scroll.clientHeight !== position.viewportHeight ||
        scroll.scrollHeight !== position.contentHeight
      )
        return;
      position.top = scroll.scrollTop;
      position.max = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    }
    const observer = new ResizeObserver(() => {
      const viewportHeight = scroll.clientHeight;
      const contentHeight = scroll.scrollHeight;
      if (viewportHeight === position.viewportHeight && contentHeight === position.contentHeight) {
        rememberScroll();
        return;
      }
      const max = Math.max(0, scroll.scrollHeight - viewportHeight);
      const atBottom = position.max > 0 && Math.abs(position.max - position.top) <= 1;
      scroll.scrollTop = atBottom ? max : Math.min(Math.max(position.top, 0), max);
      position = { top: scroll.scrollTop, max, viewportHeight, contentHeight };
    });
    scroll.addEventListener("scroll", rememberScroll, { passive: true });
    observer.observe(scroll);
    if (scroll.firstElementChild !== null) observer.observe(scroll.firstElementChild);
    return () => {
      scroll.removeEventListener("scroll", rememberScroll);
      observer.disconnect();
    };
  }, [hasEditor]);
  if (site === undefined || page === undefined) return <NotFound />;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is required");
  const uploadImage = async (file: File, options: { signal: AbortSignal }): Promise<string> => {
    const { signal } = options;
    const token = await getToken().catch((cause) => {
      if (ClerkOfflineError.is(cause)) throw new Error("Clerk is offline");
      throw cause;
    });
    signal.throwIfAborted();
    if (token === null) throw new Error("Sign in to upload images");
    const body = new FormData();
    body.set("file", file);
    body.set("siteId", params.siteId);
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal,
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const error = Schema.decodeUnknownSync(
        Schema.Struct({ code: Schema.String, message: Schema.String }),
      )(result);
      throw new Error(error.message);
    }
    const uploaded = Schema.decodeUnknownSync(
      Schema.Struct({ key: Schema.String, url: Schema.String, contentType: Schema.String }),
    )(result);
    return uploaded.url;
  };
  const siteName = site.name ?? "";
  const pageTitle = page.title ?? "";
  const closePanel = () => {
    void navigate({
      to: "/$username/site/$siteId/page/$pageId",
      params,
      search: (previous) => ({
        ...previous,
        selected: isBrickDetails ? undefined : previous.selected,
      }),
      resetScroll: false,
    });
  };

  const isOutsideSelection = (editor: HTMLDivElement, target: EventTarget) => {
    if (isBrickDetails) {
      return editorScroll.current !== null && isEditorBackground(editorScroll.current, target);
    }
    return (
      selected !== undefined &&
      target instanceof Element &&
      isEditorBackground(editor, target) &&
      target.closest("[data-wall-selected], .wall-placement.is-selected") === null
    );
  };

  return (
    <SWRConfig value={{ uploadImage }}>
      <BrickAutosaveContext value={{ registerBrickFlush, flushBrick, flushPageEditors }}>
        <Tabs value={pageTab} className="h-full min-h-0 gap-0">
          <div
            data-page-editor=""
            onPointerDownCapture={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              // A click can target a shared ancestor when the press and release differ.
              backgroundPress.current = isOutsideSelection(event.currentTarget, event.target)
                ? event.pointerId
                : null;
            }}
            onPointerUpCapture={(event) => {
              if (
                backgroundPress.current === event.pointerId &&
                !isOutsideSelection(event.currentTarget, event.target)
              )
                backgroundPress.current = null;
            }}
            onPointerCancelCapture={(event) => {
              if (backgroundPress.current === event.pointerId) backgroundPress.current = null;
            }}
            onClick={(event) => {
              const pointerId = backgroundPress.current;
              backgroundPress.current = null;
              if (
                pointerId === null ||
                (event.nativeEvent instanceof PointerEvent &&
                  event.nativeEvent.pointerId !== pointerId) ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.detail === 0 ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                !isOutsideSelection(event.currentTarget, event.target)
              )
                return;

              const selection = event.currentTarget.ownerDocument.getSelection();
              const selectionScope = isBrickDetails ? editorScroll.current : event.currentTarget;
              if (
                selectionScope !== null &&
                selection !== null &&
                !selection.isCollapsed &&
                selection.rangeCount > 0 &&
                selection.getRangeAt(0).intersectsNode(selectionScope)
              )
                return;

              if (isBrickDetails) {
                closePanel();
                return;
              }
              void navigate({
                to: ".",
                search: (previous) => ({ ...previous, selected: undefined }),
                resetScroll: false,
              });
            }}
            className="relative isolate grid h-full min-h-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
          >
            <Tabs
              value={breakpoint?.id ?? null}
              onValueChange={(value) => {
                if (typeof value !== "string" || !BREAKPOINTS.some((entry) => entry.id === value))
                  return;
                void navigate({
                  to: ".",
                  search: (previous) => ({ ...previous, breakpoint: value }),
                  resetScroll: false,
                });
              }}
              className="contents"
            >
              <PageEditorNavbar
                username={username}
                siteId={siteId}
                isPublished={site.isPublished}
              />
              <title>
                {pageTitle === ""
                  ? `[Editing] ${siteName}`
                  : `[Editing] ${siteName} - ${pageTitle}`}
              </title>
              <div
                className="wall-preview-viewport relative col-start-1 row-start-2 flex min-h-0 flex-col overflow-hidden"
                style={previewViewportStyle}
              >
                <div
                  ref={scrollRef}
                  className="wall-preview-scroll relative h-full min-h-0 min-w-0 shrink-0 overflow-auto pt-[var(--wall-preview-top-gap)] pb-[var(--wall-preview-bottom-gap)]"
                >
                  <div
                    className="wall-preview-canvas grid min-h-full"
                    style={{
                      paddingInline: previewGutter,
                      minWidth: frameWidth + 2 * previewGutter,
                    }}
                  >
                    {BREAKPOINTS.map((entry) => (
                      <TabsContent
                        key={entry.id}
                        value={entry.id}
                        tabIndex={-1}
                        className="mt-0 flex min-h-full min-w-0 flex-col"
                      >
                        <PagePreview breakpoint={entry} />
                      </TabsContent>
                    ))}
                  </div>
                </div>
              </div>
            </Tabs>
            <div
              className={`pointer-events-none z-80 col-start-1 row-start-2 flex justify-center self-end px-2${sidebarOpen ? " max-lg:hidden" : ""}`}
              style={{
                marginBottom: `calc(${previewGutter}px - var(--wall-preview-toolbar-height) / 2)`,
              }}
            >
              <Toolbars />
            </div>
            <div className="relative col-start-2 row-start-2 min-h-0">
              {breakpoint !== undefined &&
                (sidebarOpen ? (
                  <WorkspacePanelControls
                    isSitePublished={site.isPublished}
                    sidebarWidth={breakpoint.id === "sm" ? 300 : breakpoint.previewWidth / 2}
                    onClose={closePanel}
                  >
                    {pageTab === null ? (
                      children
                    ) : (
                      <TabsContent
                        value={pageTab}
                        className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col"
                      >
                        {children}
                      </TabsContent>
                    )}
                  </WorkspacePanelControls>
                ) : (
                  children
                ))}
            </div>
          </div>
        </Tabs>
      </BrickAutosaveContext>
    </SWRConfig>
  );
}
