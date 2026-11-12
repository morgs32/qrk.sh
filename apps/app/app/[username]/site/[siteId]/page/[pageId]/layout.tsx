"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode, type RefCallback } from "react";
import { useBlocker, useMatches, useNavigate, type ShouldBlockFn } from "@tanstack/react-router";
import { useAuth } from "@clerk/react";
import { ClerkOfflineError } from "@clerk/react/errors";
import { useLiveQuery, useSession } from "@zerospin/react";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { SWRConfig } from "swr";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { PREVIEW_BORDER_WIDTH } from "../../../../../../lib/breakpoints";
import { Toolbars } from "../../Toolbars/Toolbars";
import WorkspacePanelControls from "./(sidebar)/layout";
import { BrickAutosaveContext } from "./BrickAutosaveContext";
import { PageEditorNavbar } from "./PageEditorNavbar";
import { PagePreview } from "./PagePreview";
import { useBreakpointGuard } from "./useBreakpointGuard";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import NotFound from "@/app/not-found";

const PREVIEW_INLINE_GUTTER = 32;

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
  const sidebarOpen = useMatches({
    select: (matches) =>
      matches.some((match) => match.routeId === "/$username/site/$siteId/page/$pageId/_sidebar"),
  });
  const isBrickDetails = useMatches({
    select: (matches) =>
      matches.at(-1)?.routeId === "/$username/site/$siteId/page/$pageId/_sidebar/brick/$brickId",
  });
  const editorScroll = useRef<HTMLDivElement>(null);
  const previewPress = useRef<number | null>(null);
  const { getToken } = useAuth();
  const session = useSession(userSessionDefinition);
  const { breakpoint, previewRef } = useBreakpointGuard(PREVIEW_INLINE_GUTTER);
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
      search: ({ breakpoint }) => ({ breakpoint }),
      resetScroll: false,
    });
  };

  return (
    <SWRConfig value={{ uploadImage }}>
      <BrickAutosaveContext value={{ registerBrickFlush, flushBrick, flushPageEditors }}>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <PageEditorNavbar username={username} siteId={siteId} isPublished={site.isPublished} />
          <div className="relative isolate flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <title>
              {pageTitle === "" ? `[Editing] ${siteName}` : `[Editing] ${siteName} - ${pageTitle}`}
            </title>
            <div className="wall-preview-viewport relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                className="wall-preview-scroll relative h-full min-h-0 min-w-0 shrink-0 overflow-auto pt-[var(--wall-preview-top-gap)] pb-[var(--wall-preview-bottom-gap)]"
              >
                <div
                  className="wall-preview-canvas grid min-h-full"
                  style={{
                    paddingInline: PREVIEW_INLINE_GUTTER,
                    minWidth: frameWidth + 2 * PREVIEW_INLINE_GUTTER,
                  }}
                >
                  {breakpoint !== undefined && (
                    <PagePreview key={breakpoint.id} breakpoint={breakpoint} />
                  )}
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-(--wall-preview-toolbar-gap) z-80 flex justify-center px-2">
                <Toolbars />
              </div>
            </div>
            {breakpoint !== undefined &&
              (sidebarOpen ? (
                <WorkspacePanelControls isSitePublished={site.isPublished} onClose={closePanel}>
                  {children}
                </WorkspacePanelControls>
              ) : (
                children
              ))}
          </div>
        </div>
      </BrickAutosaveContext>
    </SWRConfig>
  );
}
