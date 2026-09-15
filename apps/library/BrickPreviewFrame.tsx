"use client";

import type { ReactNode } from "react";
import { useBrickBreakpoint } from "./BrickBreakpointProvider";

/** Bottom drawer is ~half viewport; previews cap at half of that (quarter screen). */
const PREVIEW_MAX_HEIGHT = "25vh";
const PREVIEW_GRID_COLS = 8;

export function BrickPreviewFrame(props: {
  w: number;
  h: number;
  children: ReactNode;
  /**
   * Drawer / filmstrip previews shrink so height never exceeds 25vh.
   * Standalone slider pages pass false to keep exact grid-unit sizing.
   */
  maxHeightQuarterViewport?: boolean;
}) {
  const { gridWidth } = useBrickBreakpoint();
  const maxHeightQuarterViewport = props.maxHeightQuarterViewport !== false;
  // Match react-grid-layout's whole-pixel item dimensions.
  const fullW = Math.round((gridWidth / PREVIEW_GRID_COLS) * props.w);
  const fullH = Math.round((gridWidth / PREVIEW_GRID_COLS) * props.h);
  return (
    <div
      className="shrink-0"
      style={
        maxHeightQuarterViewport
          ? {
              width: `min(${fullW}px, calc(${props.w} * ${PREVIEW_MAX_HEIGHT} / ${props.h}))`,
              height: `min(${fullH}px, ${PREVIEW_MAX_HEIGHT})`,
            }
          : {
              width: fullW,
              height: fullH,
            }
      }
    >
      {props.children}
    </div>
  );
}
