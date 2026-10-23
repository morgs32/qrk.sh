import { GripVertical } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "./ui/button";

export function DragHandle(
  props: Pick<ComponentProps<"button">, "id" | "ref" | "aria-label"> & {
    "data-placement-grip"?: boolean;
    "data-stack-grip"?: boolean;
  },
) {
  const {
    id,
    ref,
    "aria-label": ariaLabel,
    "data-placement-grip": placementGrip,
    "data-stack-grip": stackGrip,
  } = props;
  return (
    <Button
      id={id}
      ref={ref}
      type="button"
      variant="ghost"
      aria-label={ariaLabel}
      data-placement-grip={placementGrip}
      data-stack-grip={stackGrip}
      className="size-7 cursor-grab rounded-none p-0 active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </Button>
  );
}
