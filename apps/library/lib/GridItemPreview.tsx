"use client";

import type { ReactNode } from "react";

import { BrickWrapper } from "../components/brick/BrickWrapper";
import { BREAKPOINTS } from "./breakpoints";

export function GridItemPreview(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  w: number;
  h: number;
  children: ReactNode;
}) {
  const breakpointEntry = BREAKPOINTS.find((row) => row.id === props.breakpoint);
  if (!breakpointEntry) {
    throw new Error(`Unknown breakpoint: ${props.breakpoint}`);
  }
  const gridItemWidth = breakpointEntry.gridItemWidth;
  const fullW = Math.round(gridItemWidth * props.w);
  const fullH = Math.round(gridItemWidth * props.h);

  return (
    <div
      className="relative shrink-0 shadow-[0_8px_28px_rgb(0_0_0/0.06),0_1px_6px_rgb(0_0_0/0.04)]"
      style={{
        width: fullW,
        height: fullH,
      }}
    >
      <BrickWrapper>{props.children}</BrickWrapper>
    </div>
  );
}
