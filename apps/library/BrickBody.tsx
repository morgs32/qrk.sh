import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

export function BrickBody({
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
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto", className)}
    >
      {children}
    </div>
  );
}
