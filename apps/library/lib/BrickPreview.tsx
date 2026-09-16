"use client";

import { useCallback, useState } from "react";
import type { ReactNode, RefCallback } from "react";

import { useBrickGridWidth } from "./BrickBreakpointProvider";
import { BREAKPOINTS } from "./breakpoints";

const PREVIEW_GRID_COLS = 8;

/** Smallest integer grid units whose pixel size is ≥ intrinsicPx. */
function minGridUnits(gridItemWidth: number, intrinsicPx: number): number {
  if (intrinsicPx <= 0) return 1;
  return Math.max(1, Math.ceil(intrinsicPx / gridItemWidth));
}

export function BrickPreview(
  props:
    | {
        w: number;
        h: number;
        children: ReactNode;
        gridWidth?: number;
      }
    | {
        breakpoint: (typeof BREAKPOINTS)[number]["id"];
        measure: ReactNode;
        children: ReactNode;
        gridWidth?: number;
      },
) {
  const gridWidth = useBrickGridWidth(props.gridWidth);
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
  if ("w" in props) {
    w = props.w;
    h = props.h;
  } else {
    const breakpointEntry = BREAKPOINTS.find((row) => row.id === props.breakpoint);
    if (!breakpointEntry) {
      throw new Error(`Unknown breakpoint: ${props.breakpoint}`);
    }
    w = intrinsicSize
      ? minGridUnits(breakpointEntry.gridItemWidth, intrinsicSize.widthPx)
      : 1;
    h = intrinsicSize
      ? minGridUnits(breakpointEntry.gridItemWidth, intrinsicSize.heightPx)
      : 1;
  }

  // Match react-grid-layout's whole-pixel item dimensions.
  const fullW = Math.round((gridWidth / PREVIEW_GRID_COLS) * w);
  const fullH = Math.round((gridWidth / PREVIEW_GRID_COLS) * h);

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
