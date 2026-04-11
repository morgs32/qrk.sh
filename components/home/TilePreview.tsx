'use client';

import { useCallback, type DragEvent } from 'react';
import { useGridStore } from '@/components/home/useGridStore';
import { catalogKey, type ICollectionTile } from './tiles';

const TILE_DRAG_MIME = 'application/x-qrk-tile-def';

function serializeTileDef(tile: ICollectionTile) {
  return JSON.stringify(tile.def);
}

export function TilePreview({
  tile,
  fullWidth,
  fullHeight
}: {
  tile: ICollectionTile;
  fullWidth: number;
  fullHeight: number;
}) {
  const setExternalDraggingTileDef = useGridStore(
    (state) => state.setExternalDraggingTileDef
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const payload = serializeTileDef(tile);
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData(TILE_DRAG_MIME, payload);
      event.dataTransfer.setData('text/plain', catalogKey(tile.def));
      setExternalDraggingTileDef(tile.def);
    },
    [setExternalDraggingTileDef, tile]
  );

  const handleDragEnd = useCallback(() => {
    setExternalDraggingTileDef(null);
  }, [setExternalDraggingTileDef]);

  const TileComponent = tile.component;

  return (
    <div className="drawer-tile-preview flex w-full flex-col items-center gap-3 touch-manipulation">
      <div className="drawer-tile-scale origin-center scale-75 transition-transform duration-200 ease-out motion-reduce:transition-none [.drawer-tile-preview:has(:active)_&]:scale-100 motion-reduce:[.drawer-tile-preview:has(:active)_&]:scale-75">
        <div
          data-drawer-tile-slot
          data-drawer-tile-type={catalogKey(tile.def)}
          draggable
          tabIndex={0}
          className="shrink-0 cursor-grab overflow-hidden bg-background/80 outline-none ring-1 ring-border/60 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
          style={{ width: fullWidth, height: fullHeight }}
          aria-label={`${tile.def.collectionLabel} ${tile.def.w}×${tile.def.h}`}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="h-full w-full">
            <TileComponent />
          </div>
        </div>
      </div>
      <span className="inline-flex rounded bg-muted px-2 py-1 text-xs font-semibold text-foreground">
        {tile.def.w}×{tile.def.h}
      </span>
    </div>
  );
}
