"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ContextType, ReactNode, RefCallback } from "react";

const BrickBreakpointContext = createContext<{
  breakpoint: "xs" | "sm" | "md" | "lg";
  containerRef: RefCallback<HTMLDivElement>;
} | null>(null);

export function BrickBreakpointProvider({
  children,
}: {
  children:
    | ReactNode
    | ((value: NonNullable<ContextType<typeof BrickBreakpointContext>>) => ReactNode);
}) {
  const [breakpoint, setBreakpoint] = useState<"xs" | "sm" | "md" | "lg">("xs");
  const containerRef = useCallback<RefCallback<HTMLDivElement>>((element) => {
    if (!element) return;

    // Observe the page's full grid container, shared by every preview on the page.
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = entry.contentRect.width;
      setBreakpoint(width < 640 ? "xs" : width < 768 ? "sm" : width < 1024 ? "md" : "lg");
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const value = { breakpoint, containerRef };
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
