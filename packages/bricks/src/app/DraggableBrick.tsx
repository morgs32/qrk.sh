import { GripHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import type { ICollectionBrickDef } from "../types";
import type { ComponentProps } from "react";

import { useGridStore } from "./useGridStore";

export function DraggableBrick({
  brickDef,
  children,
  className,
  ...props
}: {
  brickDef: ICollectionBrickDef;
} & Omit<ComponentProps<"div">, "draggable" | "onDragStart" | "onDragEnd">) {
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);

  return (
    <div {...props} className={`brick-drag-surface ${className ?? ""}`}>
      <div className="brick-drag-content size-full select-none">{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="brick-drag-handle"
        aria-label="Drag brick"
        draggable
        onDragStart={(event) => {
          setActiveBrickDrag(structuredClone(brickDef));
          const surface = event.currentTarget.parentElement;
          if (surface) {
            const bounds = surface.getBoundingClientRect();
            event.dataTransfer.setDragImage(
              surface,
              event.clientX - bounds.left,
              event.clientY - bounds.top,
            );
          }
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("text/plain", brickDef.view);
        }}
        onDragEnd={() => {
          setActiveBrickDrag(null);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <GripHorizontal aria-hidden className="size-4" />
      </Button>
    </div>
  );
}
