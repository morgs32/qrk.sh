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
    <div
      {...props}
      className={`cursor-grab active:cursor-grabbing ${className ?? ""}`}
      draggable
      onDragStart={(event) => {
        setActiveBrickDrag(structuredClone(brickDef));
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", brickDef.size);
      }}
      onDragEnd={() => {
        setActiveBrickDrag(null);
      }}
    >
      <div inert className="pointer-events-none contents select-none">
        {children}
      </div>
    </div>
  );
}
