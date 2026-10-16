"use client";

import { useContext } from "react";
import type { ReactNode } from "react";

import { BrickWrapper } from "../components/brick/BrickWrapper";
import { BrickCardStyleContext } from "./BrickCardStyleContext";
import { BREAKPOINTS } from "./breakpoints";

export function GridItemPreview(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  w: number;
  h: number;
  children: ReactNode;
}) {
  const { breakpoint, w, h, children } = props;
  const cardStyle = useContext(BrickCardStyleContext);
  const breakpointEntry = BREAKPOINTS.find((row) => row.id === breakpoint);
  if (!breakpointEntry) {
    throw new Error(`Unknown breakpoint: ${breakpoint}`);
  }
  const gap = cardStyle ? 16 : 0;
  const pitch = (breakpointEntry.previewWidth - gap) / 8;
  const fullW = Math.round(w * pitch - gap);
  const fullH = Math.round(h * pitch - gap);

  return (
    <div
      data-brick-surface=""
      data-card-style={cardStyle}
      className="brick-hover-target relative shrink-0"
      style={{
        width: fullW,
        height: fullH,
      }}
    >
      <BrickWrapper className="brick-hover-surface">{children}</BrickWrapper>
    </div>
  );
}
