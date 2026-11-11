import type { ComponentProps } from "react";
import { cn } from "cn";

export function Skeleton(props: ComponentProps<"div">) {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...rest}
    />
  );
}
