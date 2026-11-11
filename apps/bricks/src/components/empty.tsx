import { cn } from "cn";
import type { ComponentProps } from "react";

export function Empty(props: ComponentProps<"div">) {
  const { className, ...emptyProps } = props;
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-col items-center gap-4 rounded-lg border-dashed p-6 text-center",
        className,
      )}
      {...emptyProps}
    />
  );
}
