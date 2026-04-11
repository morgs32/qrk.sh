'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { homepageTiles } from './tiles';
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel';
import { Input } from '@/components/ui/input';
import { sizeToDimensions } from '@/lib/stores/portfolio-grid-store';

export const DRAWER_PREVIEW_UNIT_PX = 96;

type HomepageTile = (typeof homepageTiles)[number];
type DrawerHomepageTile = HomepageTile & {
  dims: { w: number; h: number };
};

type DrawerTilePreviewProps = {
  tile: DrawerHomepageTile;
  fullWidth: number;
  fullHeight: number;
};

function DrawerTilePreview({ tile, fullWidth, fullHeight }: DrawerTilePreviewProps) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        data-drawer-tile-slot
        data-drawer-tile-type={tile.typeId}
        tabIndex={0}
        className="shrink-0 overflow-hidden rounded-md bg-background/80 outline-none ring-1 ring-border/60 focus-visible:ring-2 focus-visible:ring-ring"
        style={{ width: fullWidth, height: fullHeight }}
        aria-label={`${tile.collectionLabel} ${tile.dims.w}×${tile.dims.h}`}
      >
        <div className="h-full w-full">
          <tile.Component />
        </div>
      </div>
      <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {tile.dims.w}×{tile.dims.h}
      </span>
    </div>
  );
}

type TileDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function TileDrawer({ open, onClose }: TileDrawerProps) {
  const [query, setQuery] = useState('');

  const filteredCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const collections = new Map<
      string,
      { collectionId: string; label: string; tiles: DrawerHomepageTile[] }
    >();

    homepageTiles.forEach((tile) => {
      const entry =
        collections.get(tile.collectionId) ??
        {
          collectionId: tile.collectionId,
          label: tile.collectionLabel,
          tiles: []
        };

      entry.tiles.push({
        ...tile,
        dims: sizeToDimensions(tile.size)
      });
      collections.set(tile.collectionId, entry);
    });

    const ordered = Array.from(collections.values()).map((collection) => ({
      ...collection,
      tiles: [...collection.tiles].sort((a, b) => {
        const order = (size: string) => (size === '1x1' ? 0 : size === '2x2' ? 1 : 2);
        return order(a.size) - order(b.size);
      })
    }));

    if (!q) {
      return ordered;
    }

    return ordered
      .map((collection) => {
        const matchesCollection =
          collection.label.toLowerCase().includes(q) ||
          collection.collectionId.toLowerCase().includes(q);
        const matchingTiles = collection.tiles.filter((tile) =>
          tile.typeId.toLowerCase().includes(q)
        );

        return matchesCollection ? collection : { ...collection, tiles: matchingTiles };
      })
      .filter((collection) => collection.tiles.length > 0);
  }, [query]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Workspace drawer"
      className="fixed top-16 bottom-0 left-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-r border-border bg-background/95 shadow-2xl backdrop-blur-sm md:w-1/2"
    >
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 flex flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold">Tiles</div>
              <div className="text-xs text-muted-foreground">
                Browse tiles by collection. Drag-and-drop from the drawer will return with native
                HTML5 DnD.
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close drawer"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tiles…"
                aria-label="Search tiles"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQuery('')}
              disabled={query.trim().length === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-6 px-6 pb-8 pt-4">
          {filteredCollections.length === 0 ? (
            <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
              No tiles match “{query.trim()}”.
            </div>
          ) : (
            filteredCollections.map((collection) => (
              <div key={collection.collectionId} className="min-w-0 space-y-2">
                <div className="text-sm font-semibold">{collection.label}</div>
                <div className="relative min-h-0 min-w-0 py-1">
                  <Carousel opts={{ align: 'start' }} className="w-full">
                    <CarouselContent className="-ml-3">
                      {collection.tiles.map((tile) => {
                        const fullWidth = tile.dims.w * DRAWER_PREVIEW_UNIT_PX;
                        const fullHeight = tile.dims.h * DRAWER_PREVIEW_UNIT_PX;
                        return (
                          <CarouselItem
                            key={tile.typeId}
                            className="min-h-0 shrink-0 grow-0 basis-full pl-3"
                          >
                            <div className="flex min-h-[min(280px,45vh)] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/10 p-6">
                              <DrawerTilePreview
                                tile={tile}
                                fullWidth={fullWidth}
                                fullHeight={fullHeight}
                              />
                            </div>
                          </CarouselItem>
                        );
                      })}
                    </CarouselContent>
                    <CarouselPrevious
                      type="button"
                      className="top-1/2 left-1 z-10 size-8 -translate-y-1/2"
                    />
                    <CarouselNext
                      type="button"
                      className="top-1/2 right-1 z-10 size-8 -translate-y-1/2"
                    />
                  </Carousel>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
