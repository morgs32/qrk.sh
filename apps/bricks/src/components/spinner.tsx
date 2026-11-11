import { LoaderCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "cn";

export function Spinner(props: ComponentProps<typeof LoaderCircle>) {
  const { className, ...iconProps } = props;
  return (
    <LoaderCircle
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...iconProps}
    />
  );
}
