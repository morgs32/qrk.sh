"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ContextType, ReactNode, RefCallback } from "react";

import { BREAKPOINTS, resolveBreakpoint } from "./breakpoints";

const BrickBreakpointContext = createContext<{
  gridWidth: number;
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  containerRef: RefCallback<HTMLElement>;
  regionRef: RefCallback<HTMLElement>;
  availableWidth: number;
  selectedWidth: number | null;
} | null>(null);

export function BrickBreakpointProvider({
  children,
  persistedWidth = null,
}: {
  children:
    | ReactNode
    | ((value: NonNullable<ContextType<typeof BrickBreakpointContext>>) => ReactNode);
  persistedWidth?: number | null;
}) {
  const [gridWidth, setGridWidth] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(0);
  const breakpoint = resolveBreakpoint(gridWidth);
  const previewWidths = BREAKPOINTS.map((row) => row.previewWidth);
  const selectedWidth =
    persistedWidth !== null && persistedWidth <= availableWidth
      ? persistedWidth
      : ([...previewWidths].reverse().find((preset) => preset <= availableWidth) ?? null);

  const containerRef = useCallback<RefCallback<HTMLElement>>((element) => {
    if (!element) return;

    // Observe the page's full grid container, shared by every preview on the page.
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setGridWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const regionRef = useCallback<RefCallback<HTMLElement>>((element) => {
    if (!element) return;

    // Measure the region, not the narrowed preview, so larger fitting choices stay enabled.
    const observer = new ResizeObserver(() => {
      const width = element.getBoundingClientRect().width;
      setAvailableWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const value = {
    gridWidth,
    breakpoint,
    containerRef,
    regionRef,
    availableWidth,
    selectedWidth,
  };
  return (
    <BrickBreakpointContext value={value}>
      {typeof children === "function" ? children(value) : children}
    </BrickBreakpointContext>
  );
}

export function useBrickBreakpoint() {
  const value = useContext(BrickBreakpointContext);
  if (!value) throw new Error("useBrickBreakpoint requires BrickBreakpointProvider");
  return value;
}
