"use client";

import type { ReactNode } from "react";

import { useBrickGridWidth } from "./BrickBreakpointProvider";

const PREVIEW_GRID_COLS = 8;

export function BrickPreview(props: {
  w: number;
  h: number;
  children: ReactNode;
  gridWidth?: number;
}) {
  const gridWidth = useBrickGridWidth(props.gridWidth);
  // Match react-grid-layout's whole-pixel item dimensions.
  const fullW = Math.round((gridWidth / PREVIEW_GRID_COLS) * props.w);
  const fullH = Math.round((gridWidth / PREVIEW_GRID_COLS) * props.h);
  return (
    <div
      className="shrink-0 shadow-[0_8px_28px_rgb(0_0_0/0.06),0_1px_6px_rgb(0_0_0/0.04)]"
      style={{
        width: fullW,
        height: fullH,
      }}
    >
      {props.children}
    </div>
  );
}
