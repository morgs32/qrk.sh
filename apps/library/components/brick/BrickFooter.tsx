import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "cn";

export function BrickFooter({
  children,
  className,
  ...props
}: {
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "children" | "className">) {
  return (
    <div {...props} className={cn("mt-auto flex shrink-0 items-center", className)}>
      {children}
    </div>
  );
}
