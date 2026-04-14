"use client";

import { useLayoutEffect, useRef } from "react";
import { TILE_DRAG_MIME, useTileDrawerStore } from "@/components/home/useTileDrawerStore";
import { type ICollectionTile } from "@/components/home/tiles/types";
import { makeId } from "@/lib/makeId";

/** Matches site workspace: half viewport (right column `w-1/2`) ÷ 8 columns, same as `Grid` `GRID_COLS`. */
const PREVIEW_GRID_COLS = 8;

export function TilePreview({ tile }: { tile: ICollectionTile }) {
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

      const payload = tileRef.current.def;
      dt.effectAllowed = "copy";
      dt.setData(TILE_DRAG_MIME, JSON.stringify(payload));
      dt.setData("text/plain", makeId());
      useTileDrawerStore.getState().registerActiveTileDragGridShape(payload.w, payload.h);
      event.stopPropagation();
    };

    node.addEventListener("dragstart", onDragStart);
    return () => {
      node.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  const TileComponent = tile.component;

  return (
    <div className="drawer-tile-preview flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center touch-manipulation">
      <div
        ref={slotRef}
        data-tile-drawer-tile-slot
        data-tile-drawer-collection-name={tile.def.collectionName}
        data-tile-drawer-tile-name={tile.def.name}
        draggable
        tabIndex={0}
        className="shrink-0 cursor-grab overflow-hidden bg-background/80 outline-none ring-1 ring-border/60 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          width: `calc(${tile.def.w} * 50vw / ${PREVIEW_GRID_COLS})`,
          height: `calc(${tile.def.h} * 50vw / ${PREVIEW_GRID_COLS})`,
        }}
        aria-label={`${tile.def.collectionLabel} ${tile.def.w}×${tile.def.h}`}
      >
        <div className="h-full w-full">
          <TileComponent />
        </div>
      </div>
    </div>
  );
}
