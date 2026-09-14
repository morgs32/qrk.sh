"use client";
import { BrickPreviewFrame } from "@qrk.sh/bricks/BrickPreviewFrame";

import { useBrickBreakpoint } from "@qrk.sh/bricks/BrickBreakpointProvider";

import { useLayoutEffect, useRef } from "react";
import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";
import { collectionsHash, type ICollectionBrick } from "@qrk.sh/bricks";
import { makeId } from "@/lib/makeId";

export function BrickPreview({ brick }: { brick: ICollectionBrick }) {
  const { breakpoint } = useBrickBreakpoint();
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
  const content = collectionsHash[brick.def.collectionName]?.contents[brick.def.content];

  return (
    <div className="drawer-brick-preview flex h-full min-h-0 w-full flex-1 flex-col items-start justify-center overflow-x-auto touch-manipulation">
      <BrickPreviewFrame w={brick.def.w} h={brick.def.h}>
        <div
          ref={slotRef}
          data-brick-drawer-brick-slot
          data-brick-drawer-collection-name={brick.def.collectionName}
          data-brick-drawer-content={brick.def.content}
          data-brick-drawer-view={brick.def.view}
          draggable
          tabIndex={0}
          className="size-full shrink-0 cursor-grab overflow-hidden bg-background/80 outline-none ring-1 ring-border/60 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${brick.def.collectionLabel} ${brick.def.w}×${brick.def.h}`}
        >
          <div className="h-full w-full">
            <BrickComponent breakpoint={breakpoint} data={content?.defaultData} />
          </div>
        </div>
      </BrickPreviewFrame>
    </div>
  );
}
