"use client";

import type { ReactNode } from "react";
import { useBrickBreakpoint } from "./BrickBreakpointProvider";

export function BrickPreviewFrame(props: { w: number; h: number; children: ReactNode }) {
  const { gridWidth } = useBrickBreakpoint();
  // Match react-grid-layout's whole-pixel item dimensions.
  return (
    <div
      className="shrink-0"
      style={{
        width: Math.round((gridWidth / 8) * props.w),
        height: Math.round((gridWidth / 8) * props.h),
      }}
    >
      {props.children}
    </div>
  );
}
