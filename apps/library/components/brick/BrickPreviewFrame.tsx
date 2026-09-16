"use client";

import type { ReactNode } from "react";
import { useBrickBreakpoint } from "./BrickBreakpointProvider";

const PREVIEW_GRID_COLS = 8;

export function BrickPreviewFrame(props: {
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
      className="shrink-0"
      style={{
        width: fullW,
        height: fullH,
      }}
    >
      {props.children}
    </div>
  );
}
