import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

import { brickStackGapClass } from "./brickTokens";

export function BrickWrapper(
  props: {
    children?: ReactNode;
    className?: string;
    borderWidth?: number;
  } & Omit<ComponentPropsWithoutRef<"div">, "children" | "className">,
) {
  const { children, className, borderWidth = 0, ...divProps } = props;
  return (
    <div
      {...divProps}
      className={cn(
        "qrk-bricks brick-hover-surface relative h-auto min-h-0 min-w-0 w-full overflow-visible [&_svg]:select-none",
        className,
      )}
    >
      {/* Clip module content without clipping the surface's outer interaction halo. */}
      <div
        className={cn(
          "brick-content @container relative z-0 flex min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-[inherit]",
          brickStackGapClass,
        )}
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[18] rounded-[inherit]"
        style={{ border: `${borderWidth}px solid var(--border)` }}
      />
    </div>
  );
}
