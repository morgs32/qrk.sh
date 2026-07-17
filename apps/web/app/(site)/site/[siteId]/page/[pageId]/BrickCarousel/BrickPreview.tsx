"use client";

import { useLayoutEffect, useRef } from "react";
import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";
import { type ICollectionBrick } from "@qrk.sh/bricks";
import { makeId } from "@/lib/makeId";

/** Matches site workspace: half viewport (right column `w-1/2`) / 8 columns, same as `Grid` `GRID_COLS`. */
const PREVIEW_GRID_COLS = 8;

export function BrickPreview({ brick }: { brick: ICollectionBrick }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const brickRef = useRef(brick);
  brickRef.current = brick;

  // Native listener on the draggable node runs before `dragstart` bubbles to Embla’s viewport.
  // Drawer carousels use `watchDrag` / `watchFocus` to skip Embla pointer/focus behavior, but
  // React’s delegated `onDragStart` still fires too late relative to the viewport.
  useLayoutEffect(() => {
    const node = slotRef.current;
    if (!node) {
      return;
    }

    const onDragStart = (event: DragEvent) => {
      const dt = event.dataTransfer;
      if (!dt) {
        return;
      }

      const payload = brickRef.current.def;
      dt.effectAllowed = "copy";
      dt.setData(BRICK_DRAG_MIME, JSON.stringify(payload));
      dt.setData("text/plain", makeId());
      useBrickDrawerStore.getState().registerActiveBrickDragGridShape(payload.w, payload.h);
      event.stopPropagation();
    };

    node.addEventListener("dragstart", onDragStart);
    return () => {
      node.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  const BrickComponent = brick.component;

  return (
    <div className="drawer-brick-preview flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center touch-manipulation">
      <div
        ref={slotRef}
        data-brick-drawer-brick-slot
        data-brick-drawer-collection-name={brick.def.collectionName}
        data-brick-drawer-brick-name={brick.def.name}
        draggable
        tabIndex={0}
        className="shrink-0 cursor-grab overflow-hidden bg-background/80 outline-none ring-1 ring-border/60 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          width: `calc(${brick.def.w} * 50vw / ${PREVIEW_GRID_COLS})`,
          height: `calc(${brick.def.h} * 50vw / ${PREVIEW_GRID_COLS})`,
        }}
        aria-label={`${brick.def.collectionLabel} ${brick.def.w}×${brick.def.h}`}
      >
        <div className="h-full w-full">
          <BrickComponent />
        </div>
      </div>
    </div>
  );
}
