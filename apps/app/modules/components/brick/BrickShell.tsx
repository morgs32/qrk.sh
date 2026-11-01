import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

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
      className={cn("flex h-full min-h-0 w-full flex-[1_0_auto] flex-col", className)}
    >
      {children}
    </div>
  );
}
