"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode, type RefCallback } from "react";
import { useReducedMotion } from "framer-motion";
import { useMatches } from "@tanstack/react-router";
import { useAuth } from "@clerk/react";
import { ClerkOfflineError } from "@clerk/react/errors";
import { useLiveQuery, useSession } from "@zerospin/react";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { SWRConfig } from "swr";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { Drawer } from "../../../../../../modules/lib/Drawer";
import { Toolbars } from "../../Toolbars/Toolbars";
import { ValidBreakpoint } from "./ValidBreakpoint";
import { useBreakpointGuard } from "./useBreakpointGuard";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import NotFound from "@/app/not-found";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(Site),
  pageId: makeIdSchema(Page),
});

export default function PageLayout(props: { children: ReactNode }) {
  const { children } = props;
  const params = useValidatedParams(ParamsSchema);
  const drawerOpen = useMatches({
    select: (matches) =>
      matches.some((match) => match.routeId === "/$username/site/$siteId/page/$pageId/_drawer"),
  });
  const reducedMotion = useReducedMotion();
  const editorScroll = useRef<HTMLDivElement>(null);
  const { getToken } = useAuth();
  const session = useSession(userSessionDefinition);
  const { breakpoint, previewRef } = useBreakpointGuard();
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

  return (
    <SWRConfig value={{ uploadImage }}>
      <div
        className="wall-preview-viewport relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        data-drawer-open={drawerOpen}
      >
        <title>
          {pageTitle === "" ? `[Editing] ${siteName}` : `[Editing] ${siteName} - ${pageTitle}`}
        </title>
        <div
          ref={scrollRef}
          className="relative min-h-0 min-w-0 shrink-0 overflow-x-hidden overflow-y-auto pt-[var(--wall-preview-top-gap)] pb-[var(--wall-preview-bottom-gap)]"
          style={{ height: "calc(100% - var(--wall-preview-drawer-height))" }}
        >
          <ValidBreakpoint />
        </div>
        <div
          className="pointer-events-none fixed inset-x-0 z-80 flex justify-center px-2"
          style={{
            bottom: drawerOpen
              ? "calc(25dvh + var(--wall-preview-toolbar-gap))"
              : "var(--wall-preview-toolbar-gap)",
            transition: reducedMotion ? "none" : "bottom 300ms cubic-bezier(0, 0, 0.2, 1)",
          }}
        >
          <Toolbars />
        </div>
        <Drawer
          side="bottom"
          open={drawerOpen}
          animated={
            drawerOpen ||
            (typeof document !== "undefined" && typeof document.startViewTransition === "function")
          }
          aria-label="Workspace drawer"
        >
          {breakpoint === undefined ? null : children}
        </Drawer>
      </div>
    </SWRConfig>
  );
}
