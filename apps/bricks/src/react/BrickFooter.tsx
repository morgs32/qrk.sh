import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

import { brickInsetClass } from "./brickTokens";

export function BrickFooter(
  props: {
    children?: ReactNode;
    className?: string;
  } & Omit<ComponentPropsWithoutRef<"div">, "children" | "className">,
) {
  const { children, className, ...divProps } = props;
  return (
    <div {...divProps} className={cn("flex shrink-0 items-center", brickInsetClass, className)}>
      {children}
    </div>
  );
}
