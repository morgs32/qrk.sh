import { useCallback, useState } from "react";
import type { ReactNode, RefCallback } from "react";

export function UnconstrainedBrickPreview({
  children,
  onSizeChange,
}: {
  children: ReactNode;
  /** When omitted, only the local px label updates — nothing drives gridItem sizing. */
  onSizeChange?: (size: { widthPx: number; heightPx: number }) => void;
}) {
  const [sizeLabel, setSizeLabel] = useState<string>();
  const rootRef = useCallback<RefCallback<HTMLDivElement>>(
    element => {
      if (!element) return;

      const updateSize = () => {
        const bounds = element.getBoundingClientRect();
        const widthPx = Math.round(bounds.width);
        const heightPx = Math.round(bounds.height);
        setSizeLabel(`${widthPx}×${heightPx}px`);
        onSizeChange?.({ widthPx, heightPx });
      };

      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [onSizeChange],
  );

  return (
    <div>
      <div
        ref={rootRef}
        className="qrk-bricks shadow-[0_8px_28px_rgb(0_0_0/0.06),0_1px_6px_rgb(0_0_0/0.04)]"
        style={{ float: "left", width: "max-content" }}
      >
        {children}
      </div>
      {sizeLabel !== undefined ? (
        <p className="m-0 clear-both pt-2 font-mono text-neutral-500">{sizeLabel}</p>
      ) : null}
    </div>
  );
}
