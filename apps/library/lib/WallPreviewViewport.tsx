"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

import { useWallViewport } from "./WallViewportProvider";

export function WallPreviewViewport(props: {
  children: ReactNode;
  toolbar: ReactNode;
  drawerOpen: boolean;
}) {
  const { children, toolbar, drawerOpen } = props;
  const { regionRef } = useWallViewport();
  const reducedMotion = useReducedMotion();
  const editorScroll = useRef<HTMLDivElement>(null);
  const drawerSpace = useRef<HTMLDivElement>(null);
  const hasReservedDrawerSpace = useRef(false);

  useLayoutEffect(() => {
    const scroll = editorScroll.current;
    const space = drawerSpace.current;
    if (scroll === null || space === null) return;

    // Change only trailing space, leaving the preview frame height intact.
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

  return (
    <div data-wall-preview-viewport className="relative h-full min-h-0 min-w-0 overflow-hidden">
      <div
        ref={(element) => {
          editorScroll.current = element;
          return regionRef(element);
        }}
        data-testid="preview-region"
        className="relative h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pt-[var(--wall-preview-top-gap)] pb-[var(--wall-preview-bottom-gap)]"
      >
        <div className="relative">{children}</div>
        <div ref={drawerSpace} data-editor-drawer-space aria-hidden />
      </div>
      <div
        className="pointer-events-none fixed inset-x-0 z-80 flex justify-center px-2"
        style={{
          bottom: drawerOpen
            ? "calc(50dvh + var(--wall-preview-toolbar-gap))"
            : "var(--wall-preview-toolbar-gap)",
          transition: reducedMotion ? "none" : "bottom 300ms cubic-bezier(0, 0, 0.2, 1)",
        }}
      >
        {toolbar}
      </div>
    </div>
  );
}
