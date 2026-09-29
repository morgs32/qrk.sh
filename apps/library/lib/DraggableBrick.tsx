import type { ComponentProps } from "react";

import { brickDragStore, type IDraggedBrick } from "./GridStore";

export function DraggableBrick(
  props: {
    brickDef: IDraggedBrick | null;
  } & Omit<ComponentProps<"div">, "draggable" | "onDragStart" | "onDragEnd">,
) {
  const { brickDef, children, className, ...rest } = props;
  return (
    <div
      {...rest}
      className={`brick-drag-surface ${className ?? ""}`}
      draggable={brickDef !== null}
      onDragStart={(event) => {
        if (brickDef === null) {
          event.preventDefault();
          return;
        }
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
