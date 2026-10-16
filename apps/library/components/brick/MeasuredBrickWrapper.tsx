"use client";

import { useCallback, useContext } from "react";
import type { ReactNode, RefCallback } from "react";
import { cn } from "cn";

import { BrickCardStyleContext } from "../../lib/BrickCardStyleContext";
import { brickStackGapClass } from "./brickTokens";

export function MeasuredBrickWrapper(props: {
  children?: ReactNode;
  onChange?: (dimensions: { widthPx: number; heightPx: number }) => void;
}) {
  const { children, onChange } = props;
  const cardStyle = useContext(BrickCardStyleContext);
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
      data-brick-surface=""
      data-card-style={cardStyle}
      data-brick-intrinsic=""
      className="brick-hover-target relative"
      style={{ width: "max-content", height: "max-content" }}
    >
      <div className="brick-hover-surface">
        {/* Measure content independently of the decorative card gutter. */}
        <div
          ref={rootRef}
          data-brick-measure=""
          className={cn(
            "qrk-bricks relative flex flex-col items-start [&_svg]:select-none",
            brickStackGapClass,
          )}
          style={{ width: "max-content", height: "max-content", overflow: "visible" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
