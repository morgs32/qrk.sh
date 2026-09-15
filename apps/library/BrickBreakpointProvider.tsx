"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ContextType, ReactNode, RefCallback } from "react";

import { BREAKPOINTS, resolveBreakpoint } from "./breakpoints";

const BrickBreakpointContext = createContext<{
  gridWidth: number;
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  containerRef: RefCallback<HTMLElement>;
} | null>(null);

export function BrickBreakpointProvider({
  children,
}: {
  children:
    | ReactNode
    | ((value: NonNullable<ContextType<typeof BrickBreakpointContext>>) => ReactNode);
}) {
  const [gridWidth, setGridWidth] = useState(0);
  const breakpoint = resolveBreakpoint(gridWidth);
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

  const value = { gridWidth, breakpoint, containerRef };
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
