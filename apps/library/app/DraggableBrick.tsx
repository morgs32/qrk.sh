import type { ComponentProps } from "react";

import type { IModuleBrickDef } from "../lib/types";
import { useBricksStore } from "../lib/BrickStoreProvider";

export function DraggableBrick({
  brickDef,
  children,
  className,
  ...props
}: {
  brickDef: IModuleBrickDef;
} & Omit<ComponentProps<"div">, "draggable" | "onDragStart" | "onDragEnd">) {
  const setActiveBrickDrag = useBricksStore((state) => state.setActiveBrickDrag);

  return (
    <div
      {...props}
      className={`brick-drag-surface ${className ?? ""}`}
      draggable
      onDragStart={(event) => {
        setActiveBrickDrag(structuredClone(brickDef));
        const surface = event.currentTarget;
        if (surface) {
          const bounds = surface.getBoundingClientRect();
          event.dataTransfer.setDragImage(
            surface,
            event.clientX - bounds.left,
            event.clientY - bounds.top,
          );
        }
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", brickDef.moduleId);
      }}
      onDragEnd={() => {
        setActiveBrickDrag(null);
      }}
    >
      {children}
    </div>
  );
}
