"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode, RefCallback } from "react";

import { useBrickBreakpoint } from "./BrickBreakpointProvider";
import { BREAKPOINTS } from "./breakpoints";

/** Smallest integer grid units whose pixel size is ≥ intrinsicPx. */
export function minGridUnits(gridItemWidth: number, intrinsicPx: number): number {
  if (intrinsicPx <= 0) return 1;
  return Math.max(1, Math.ceil(intrinsicPx / gridItemWidth));
}

function resolveGridItemWidth(breakpointId: (typeof BREAKPOINTS)[number]["id"]) {
  const breakpointEntry = BREAKPOINTS.find((row) => row.id === breakpointId);
  if (!breakpointEntry) {
    throw new Error(`Unknown breakpoint: ${breakpointId}`);
  }
  return breakpointEntry.gridItemWidth;
}

export function BrickPreview(
  props:
    | {
        w: number;
        h: number;
        children: ReactNode;
        breakpoint?: (typeof BREAKPOINTS)[number]["id"];
      }
    | {
        breakpoint: (typeof BREAKPOINTS)[number]["id"];
        measure: ReactNode;
        children: ReactNode;
        onGridUnits?: (size: { w: number; h: number }) => void;
      },
) {
  const ambient = useBrickBreakpoint();
  const breakpointId =
    "breakpoint" in props && props.breakpoint !== undefined
      ? props.breakpoint
      : ambient.breakpoint;
  const gridItemWidth = resolveGridItemWidth(breakpointId);
  const [intrinsicSize, setIntrinsicSize] = useState<{
    widthPx: number;
    heightPx: number;
  }>();

  const measureRef = useCallback<RefCallback<HTMLDivElement>>((element) => {
    if (!element) return;

    const updateSize = () => {
      const bounds = element.getBoundingClientRect();
      const widthPx = Math.round(bounds.width);
      const heightPx = Math.round(bounds.height);
      setIntrinsicSize((current) => {
        if (current?.widthPx === widthPx && current?.heightPx === heightPx) {
          return current;
        }
        return { widthPx, heightPx };
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  let w: number;
  let h: number;
  if ("measure" in props) {
    w = intrinsicSize ? minGridUnits(gridItemWidth, intrinsicSize.widthPx) : 1;
    h = intrinsicSize ? minGridUnits(gridItemWidth, intrinsicSize.heightPx) : 1;
  } else {
    w = props.w;
    h = props.h;
  }

  const onGridUnits = "measure" in props ? props.onGridUnits : undefined;
  useEffect(() => {
    if (onGridUnits === undefined) return;
    onGridUnits({ w, h });
  }, [onGridUnits, w, h]);

  // Same cell math as BREAKPOINTS.gridItemWidth (previewWidth / 8).
  const fullW = Math.round(gridItemWidth * w);
  const fullH = Math.round(gridItemWidth * h);

  return (
    <div
      className="relative shrink-0 shadow-[0_8px_28px_rgb(0_0_0/0.06),0_1px_6px_rgb(0_0_0/0.04)]"
      style={{
        width: fullW,
        height: fullH,
      }}
    >
      {"measure" in props ? (
        <div
          aria-hidden
          className="pointer-events-none absolute overflow-hidden"
          style={{ width: 0, height: 0 }}
        >
          <div
            ref={measureRef}
            className="qrk-bricks"
            style={{ width: "max-content", height: "max-content" }}
          >
            {props.measure}
          </div>
        </div>
      ) : null}
      {props.children}
    </div>
  );
}
