"use client";

import { useLayoutEffect, useRef } from "react";
import { DimensionBadge } from "@/components/home/DimensionBadge";
import { TILE_DRAG_MIME } from "@/components/home/tileDragMime";
import { catalogKey, type ICollectionTile } from "@/components/home/tiles/types";

function serializeTileDef(tile: ICollectionTile) {
  return JSON.stringify(tile.def);
}

export function TilePreview({
  tile,
  fullWidth,
  fullHeight,
}: {
  tile: ICollectionTile;
  fullWidth: number;
  fullHeight: number;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const tileRef = useRef(tile);
  tileRef.current = tile;

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

      const t = tileRef.current;
      const payload = serializeTileDef(t);
      dt.effectAllowed = "copy";
      dt.setData(TILE_DRAG_MIME, payload);
      dt.setData("text/plain", catalogKey(t.def));
      event.stopPropagation();
    };

    node.addEventListener("dragstart", onDragStart);
    return () => {
      node.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  const TileComponent = tile.component;

  return (
    <div className="drawer-tile-preview flex h-full min-h-0 w-full flex-1 flex-col touch-manipulation">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="flex items-center justify-center h-10">
          {/* <DimensionBadge w={tile.def.w} h={tile.def.h} /> */}
        </div>
        <div className="drawer-tile-scale origin-center">
          <div
            ref={slotRef}
            data-drawer-tile-slot
            data-drawer-tile-type={catalogKey(tile.def)}
            draggable
            tabIndex={0}
            className="shrink-0 cursor-grab overflow-hidden bg-background/80 outline-none ring-1 ring-border/60 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
            style={{ width: fullWidth, height: fullHeight }}
            aria-label={`${tile.def.collectionLabel} ${tile.def.w}×${tile.def.h}`}
          >
            <div className="h-full w-full">
              <TileComponent />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center h-10">
          <DimensionBadge w={tile.def.w} h={tile.def.h} />
        </div>
      </div>
    </div>
  );
}
