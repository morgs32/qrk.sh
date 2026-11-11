"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import {
  useBlocker,
  useMatches,
  useNavigate,
  useParams,
  type ShouldBlockFn,
} from "@tanstack/react-router";
import { useAuth } from "@clerk/react";
import { ClerkOfflineError } from "@clerk/react/errors";
import { useLiveQuery, useSession } from "@zerospin/react";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { SWRConfig } from "swr";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { PREVIEW_BORDER_WIDTH } from "../../../../../../modules/lib/breakpoints";
import { Drawer } from "../../../../../../modules/lib/Drawer";
import { Toolbars } from "../../Toolbars/Toolbars";
import WorkspacePanelControls from "./(drawer)/layout";
import { BrickAutosaveContext } from "./BrickAutosaveContext";
import { ValidBreakpoint } from "./ValidBreakpoint";
import { useBreakpointGuard } from "./useBreakpointGuard";
import { useMatchMedia } from "./useMatchMedia";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import NotFound from "@/app/not-found";

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

function isPreviewBackground(preview: HTMLDivElement, target: EventTarget) {
  return (
    target instanceof Element &&
    preview.contains(target) &&
    target.closest(previewControlSelector) === null
  );
}

export default function PageLayout(props: { children: ReactNode }) {
  const { children } = props;
  const params = useValidatedParams(ParamsSchema);
  const { username, siteId, pageId } = params;
  const { brickId } = useParams({ strict: false });
  const navigate = useNavigate({ from: "/$username/site/$siteId/page/$pageId" });
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
  const panelOpen = useMatches({
    select: (matches) =>
      matches.some((match) => match.routeId === "/$username/site/$siteId/page/$pageId/_drawer"),
  });
  const isDesktop = useMatchMedia("(min-width: 64rem)");
  const sidebarOpen = panelOpen && isDesktop;
  const drawerOpen = panelOpen && !isDesktop;
  const [panelBody] = useState(() => {
    const body = document.createElement("div");
    body.className = "@container/workspace flex min-h-0 min-w-0 flex-1 flex-col";
    return body;
  });
  const attachPanelBody = useCallback<RefCallback<HTMLDivElement>>(
    (slot) => {
      if (slot === null) return;
      slot.append(panelBody);
      return () => {
        if (panelBody.parentNode === slot) panelBody.remove();
      };
    },
    [panelBody],
  );
  const isBrickDetails = useMatches({
    select: (matches) =>
      matches.at(-1)?.routeId === "/$username/site/$siteId/page/$pageId/_drawer/brick/$brickId",
  });
  const reducedMotion = useReducedMotion();
  const editorScroll = useRef<HTMLDivElement>(null);
  const previewPress = useRef<number | null>(null);
  const { getToken } = useAuth();
  const session = useSession(userSessionDefinition);
  const { breakpoint, previewRef, retainingPreview, visibleBreakpoint, insufficientWidth } =
    useBreakpointGuard(flushPageEditors, sidebarOpen);
  const scrollRef = useCallback<RefCallback<HTMLDivElement>>(
    (element) => {
      editorScroll.current = element;
      const cleanup = previewRef(element);
      return () => {
        if (typeof cleanup === "function") cleanup();
        else previewRef(null);
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
      search: ({ breakpoint }) => ({ breakpoint }),
      resetScroll: false,
    });
  };

  return (
    <SWRConfig value={{ uploadImage }}>
      <BrickAutosaveContext value={{ registerBrickFlush, flushBrick, flushPageEditors }}>
        <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
          <title>
            {pageTitle === "" ? `[Editing] ${siteName}` : `[Editing] ${siteName} - ${pageTitle}`}
          </title>
          <div
            className="wall-preview-viewport relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            data-drawer-open={drawerOpen}
            data-sidebar-open={sidebarOpen}
          >
            <div
              ref={scrollRef}
              onPointerDownCapture={(event) => {
                if (!event.isPrimary || event.button !== 0) return;
                // A click can target a shared ancestor when the press and release differ.
                previewPress.current =
                  isBrickDetails && isPreviewBackground(event.currentTarget, event.target)
                    ? event.pointerId
                    : null;
              }}
              onPointerUpCapture={(event) => {
                if (
                  previewPress.current === event.pointerId &&
                  !isPreviewBackground(event.currentTarget, event.target)
                )
                  previewPress.current = null;
              }}
              onPointerCancelCapture={(event) => {
                if (previewPress.current === event.pointerId) previewPress.current = null;
              }}
              onClick={(event) => {
                const pointerId = previewPress.current;
                previewPress.current = null;
                if (
                  !isBrickDetails ||
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
                  !isPreviewBackground(event.currentTarget, event.target)
                )
                  return;

                const selection = event.currentTarget.ownerDocument.getSelection();
                if (
                  selection !== null &&
                  !selection.isCollapsed &&
                  selection.rangeCount > 0 &&
                  selection.getRangeAt(0).intersectsNode(event.currentTarget)
                )
                  return;

                closePanel();
              }}
              className="wall-preview-scroll relative min-h-0 min-w-0 shrink-0 overflow-y-auto pt-[var(--wall-preview-top-gap)] pb-[var(--wall-preview-bottom-gap)]"
              style={{
                height: "calc(100% - var(--wall-preview-drawer-height))",
                overflowX: sidebarOpen || retainingPreview ? "auto" : "hidden",
              }}
            >
              <div
                className="wall-preview-canvas"
                style={
                  (sidebarOpen || retainingPreview) && visibleBreakpoint !== undefined
                    ? {
                        minWidth:
                          visibleBreakpoint.previewWidth +
                          2 * PREVIEW_BORDER_WIDTH +
                          (sidebarOpen ? 64 : 0),
                      }
                    : undefined
                }
              >
                <ValidBreakpoint
                  breakpoint={visibleBreakpoint}
                  insufficientWidth={insufficientWidth}
                />
              </div>
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 z-80 flex justify-center px-2"
              style={{
                bottom: "calc(var(--wall-preview-drawer-height) + var(--wall-preview-toolbar-gap))",
                transition: reducedMotion ? "none" : "bottom 300ms cubic-bezier(0, 0, 0.2, 1)",
              }}
            >
              <Toolbars isSitePublished={site.isPublished} />
            </div>
          </div>
          {isDesktop ? (
            sidebarOpen && (
              <WorkspacePanelControls
                sidebar
                bodyRef={attachPanelBody}
                isSitePublished={site.isPublished}
                onClose={closePanel}
              />
            )
          ) : (
            <Drawer
              side="bottom"
              open={drawerOpen}
              animated={
                drawerOpen ||
                (typeof document !== "undefined" &&
                  typeof document.startViewTransition === "function")
              }
              aria-label="Workspace drawer"
            >
              {drawerOpen && breakpoint !== undefined && (
                <WorkspacePanelControls
                  sidebar={false}
                  bodyRef={attachPanelBody}
                  isSitePublished={site.isPublished}
                  onClose={closePanel}
                />
              )}
            </Drawer>
          )}
          {breakpoint !== undefined &&
            (panelOpen
              ? createPortal(
                  <>
                    {brickId === undefined ? null : <div id={`brick-editor-drawer-${brickId}`} />}
                    {children}
                  </>,
                  panelBody,
                )
              : children)}
        </div>
      </BrickAutosaveContext>
    </SWRConfig>
  );
}
