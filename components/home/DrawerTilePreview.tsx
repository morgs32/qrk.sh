'use client';

import { homepageTiles } from './tiles';

export function DrawerTilePreview({
  tile,
  fullWidth,
  fullHeight
}: {
  tile: (typeof homepageTiles)[number] & { dims: { w: number; h: number } };
  fullWidth: number;
  fullHeight: number;
}) {
  return (
    <div className="drawer-tile-preview flex w-full flex-col items-center gap-3 touch-manipulation">
      <div className="drawer-tile-scale origin-center scale-75 transition-transform duration-200 ease-out motion-reduce:transition-none [.drawer-tile-preview:has(:active)_&]:scale-100 motion-reduce:[.drawer-tile-preview:has(:active)_&]:scale-75">
        <div
          data-drawer-tile-slot
          data-drawer-tile-type={tile.typeId}
          tabIndex={0}
          className="shrink-0 overflow-hidden bg-background/80 outline-none ring-1 ring-border/60 focus-visible:ring-2 focus-visible:ring-ring"
          style={{ width: fullWidth, height: fullHeight }}
          aria-label={`${tile.collectionLabel} ${tile.dims.w}×${tile.dims.h}`}
        >
          <div className="h-full w-full">
            <tile.Component />
          </div>
        </div>
      </div>
      <span className="inline-flex rounded bg-muted px-2 py-1 text-xs font-semibold text-foreground">
        {tile.dims.w}×{tile.dims.h}
      </span>
    </div>
  );
}
