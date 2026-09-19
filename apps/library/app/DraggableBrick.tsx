import type { ComponentProps } from "react";

import type { Spec } from "@json-render/core";

import type { IModuleBrickDef } from "../lib/types";
import { brickDragStore } from "../lib/GridStore";

export function DraggableBrick({
  brickDef,
  children,
  className,
  ...props
}: {
  brickDef: IModuleBrickDef & { spec: Spec; w: number; h: number };
} & Omit<ComponentProps<"div">, "draggable" | "onDragStart" | "onDragEnd">) {
  return (
    <div
      {...props}
      className={`brick-drag-surface ${className ?? ""}`}
      draggable
      onDragStart={(event) => {
        brickDragStore.getState().setBrickDef(structuredClone(brickDef));
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
        brickDragStore.getState().setBrickDef(null);
      }}
    >
      {children}
    </div>
  );
}
