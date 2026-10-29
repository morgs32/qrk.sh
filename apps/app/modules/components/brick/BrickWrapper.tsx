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
        "qrk-bricks relative flex h-full min-h-0 min-w-0 w-full overflow-hidden [&_svg]:select-none",
        "@container flex-col",
        brickStackGapClass,
        className,
      )}
    >
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[18] rounded-[inherit]"
        style={{ border: `${borderWidth}px solid var(--border)` }}
      />
    </div>
  );
}
