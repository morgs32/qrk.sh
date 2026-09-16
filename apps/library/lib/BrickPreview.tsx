"use client";

import type { ReactNode } from "react";
import { useBrickBreakpoint } from "./BrickBreakpointProvider";

const PREVIEW_GRID_COLS = 8;

export function BrickPreview(props: {
  w: number;
  h: number;
  children: ReactNode;
}) {
  const { gridWidth } = useBrickBreakpoint();
  // Match react-grid-layout's whole-pixel item dimensions.
  const fullW = Math.round((gridWidth / PREVIEW_GRID_COLS) * props.w);
  const fullH = Math.round((gridWidth / PREVIEW_GRID_COLS) * props.h);
  return (
    <div
      className="shrink-0 shadow-[0_0_12px_rgb(0_0_0/0.18),0_0_3px_rgb(0_0_0/0.12)]"
      style={{
        width: fullW,
        height: fullH,
      }}
    >
      {props.children}
    </div>
  );
}
