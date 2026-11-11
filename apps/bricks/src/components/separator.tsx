import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "cn";

export function Separator(
  props: Omit<SeparatorPrimitive.Props, "className"> & { className?: string },
) {
  const { className, ...separatorProps } = props;
  return (
    <SeparatorPrimitive
      data-slot="separator"
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:h-full data-vertical:w-px",
        className,
      )}
      {...separatorProps}
    />
  );
}
