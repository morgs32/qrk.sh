import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

export function BrickShell(
  props: {
    children?: ReactNode;
    className?: string;
  } & Omit<ComponentPropsWithoutRef<"div">, "children" | "className">,
) {
  const { children, className, ...divProps } = props;
  return (
    <div
      {...divProps}
      className={cn("flex h-full min-h-0 w-full flex-[1_0_auto] flex-col", className)}
    >
      {children}
    </div>
  );
}
