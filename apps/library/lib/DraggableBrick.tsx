import { useEffect, useRef, type ComponentProps } from "react";

import { brickDragStore, type IDraggedBrick } from "./brickDragStore";

export function DraggableBrick(
  props: {
    brickDef: IDraggedBrick | null;
  } & Omit<ComponentProps<"div">, "draggable" | "onDragStart" | "onDragEnd">,
) {
  const { brickDef, children, className, ...rest } = props;
  const published = useRef<IDraggedBrick | null>(null);
  useEffect(
    () => () => {
      if (published.current !== null && brickDragStore.getState().brickDef === published.current) {
        brickDragStore.getState().setBrickDef(null);
      }
    },
    [],
  );
  function clearPublished() {
    if (published.current !== null && brickDragStore.getState().brickDef === published.current) {
      brickDragStore.getState().setBrickDef(null);
    }
    published.current = null;
  }
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
        const payload = structuredClone(brickDef);
        published.current = payload;
        brickDragStore.getState().setBrickDef(payload);
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
        clearPublished();
      }}
    >
      {children}
    </div>
  );
}
