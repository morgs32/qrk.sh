"use client";

import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { useSelectedLayoutSegments } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

import { Grid } from "./Grid";

export function MainColumns() {
  const segments = useSelectedLayoutSegments();
  const drawerOpen = segments.includes("(drawer)");

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

  const { regionRef, availableWidth, activeBreakpoint } = useWallViewport();
  const insufficientWidth = availableWidth > 0 && activeBreakpoint === null;

  return (
    <div
      ref={regionRef}
      className="h-full w-full overflow-hidden"
      data-testid="page-preview-region"
    >
      {insufficientWidth ? (
        <p className="p-4 text-sm" role="status">
          At least 360px is needed to preview the page.
        </p>
      ) : null}
      <div hidden={insufficientWidth} className="h-full w-full" data-testid="page-composition">
        <div
          ref={editorScroll}
          className="h-full min-h-0 overflow-y-auto pt-8 pb-[calc(5.25rem+2px)] [--wall-top-offset:calc(7.25rem+2px)]"
          data-site-right-scroll
          data-brick-scroll-root
        >
          <Grid />
          <div ref={drawerSpace} data-editor-drawer-space aria-hidden />
        </div>
      </div>
    </div>
  );
}
