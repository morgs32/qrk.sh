import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

import { brickInsetClass, brickStackGapClass, brickTextClass } from "./brickTokens";

export function BrickShell({
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
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        brickInsetClass,
        brickStackGapClass,
        brickTextClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
