import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

import { brickStackGapClass } from "./brickTokens";

export function BrickWrapper({
  children,
  className,
  ...props
}: {
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "children" | "className">) {
  return (
    <div
      {...props}
      className={cn(
        "qrk-bricks relative flex h-full min-h-0 min-w-0 w-full overflow-hidden [&_svg]:select-none",
        "@container flex-col",
        brickStackGapClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
