"use client";

import type { ReactNode } from "react";

export function BrickPreviewFrame(props: { w: number; h: number; children: ReactNode }) {
  return (
    <div
      className="shrink-0"
      style={{
        width: `${(props.w / 8) * 100}%`,
        aspectRatio: `${props.w} / ${props.h}`,
      }}
    >
      {props.children}
    </div>
  );
}
