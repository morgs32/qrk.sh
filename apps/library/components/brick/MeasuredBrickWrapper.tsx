"use client";

import { useCallback } from "react";
import type { ReactNode, RefCallback } from "react";
import { cn } from "cn";

import { brickStackGapClass } from "./brickTokens";

export function MeasuredBrickWrapper({
  children,
  onChange,
}: {
  children?: ReactNode;
  onChange?: (dimensions: { widthPx: number; heightPx: number }) => void;
}) {
  const rootRef = useCallback<RefCallback<HTMLDivElement>>(
    (element) => {
      if (!element) return;

      const updateSize = () => {
        const bounds = element.getBoundingClientRect();
        const widthPx = Math.round(bounds.width);
        const heightPx = Math.round(bounds.height);
        onChange?.({ widthPx, heightPx });
      };

      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [onChange],
  );

  return (
    <div
      ref={rootRef}
      data-brick-measure=""
      className={cn(
        "qrk-bricks relative flex flex-col items-start bg-white shadow-[0_8px_28px_rgb(0_0_0/0.06),0_1px_6px_rgb(0_0_0/0.04)] [&_svg]:select-none",
        brickStackGapClass,
      )}
      style={{ width: "max-content", height: "max-content", overflow: "visible" }}
    >
      {children}
    </div>
  );
}
