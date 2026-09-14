"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ContextType, ReactNode, RefCallback } from "react";

const BrickBreakpointContext = createContext<{
  gridWidth: number;
  breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
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
  const breakpoint: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" =
    gridWidth < 640
      ? "xs"
      : gridWidth < 768
        ? "sm"
        : gridWidth < 1024
          ? "md"
          : gridWidth < 1280
            ? "lg"
            : gridWidth < 1536
              ? "xl"
              : "2xl";
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
