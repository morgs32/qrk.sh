import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

import { brickInsetClass } from "./brickTokens";

export function BrickBody(
  props: {
    children?: ReactNode;
    className?: string;
  } & Omit<ComponentPropsWithoutRef<"div">, "children" | "className">,
) {
  const { children, className, ...divProps } = props;
  return (
    <div
      {...divProps}
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto", brickInsetClass, className)}
    >
      {children}
    </div>
  );
}
