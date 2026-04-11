'use client';

import { useMemo, useState } from 'react';
import type { EmblaCarouselType } from 'embla-carousel';
import { X } from 'lucide-react';
import { catalogKey, homepageTiles } from './tiles';
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel';
import { Input } from '@/components/ui/input';
import { useGridStore } from '@/lib/stores/grid-store';
import { TilePreview } from './TilePreview';

/** Fallback when the grid has not measured yet (`gridCellHeightPx` is null). */
export const DRAWER_PREVIEW_UNIT_PX = 96;

function watchDragIgnoreDrawerTileSlot(
  _emblaApi: EmblaCarouselType,
  event: MouseEvent | TouchEvent
): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return true;
  }
  return target.closest('[data-drawer-tile-slot]') === null;
}

export function TileDrawer({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const gridCellHeightPx = useGridStore((state) => state.gridCellHeightPx);
  const cellUnitPx =
    gridCellHeightPx && gridCellHeightPx > 0 ? gridCellHeightPx : DRAWER_PREVIEW_UNIT_PX;

  const filteredCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const collections = new Map<
      string,
      { collectionId: string; label: string; tiles: typeof homepageTiles }
    >();

    homepageTiles.forEach((tile) => {
      const entry =
        collections.get(tile.def.collectionId) ??
        {
          collectionId: tile.def.collectionId,
          label: tile.def.collectionLabel,
          tiles: []
        };

      entry.tiles.push(tile);
      collections.set(tile.def.collectionId, entry);
    });

    const ordered = Array.from(collections.values()).map((collection) => ({
      ...collection,
      tiles: [...collection.tiles].sort((a, b) => {
        const rank = (w: number, h: number) => (w === 1 && h === 1 ? 0 : w === 2 && h === 2 ? 1 : 2);
        return rank(a.def.w, a.def.h) - rank(b.def.w, b.def.h);
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
          catalogKey(tile.def).toLowerCase().includes(q)
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div aria-label="Tile collections" className="flex flex-col gap-6 pb-8 pt-4">
            {filteredCollections.length === 0 ? (
              <div className="mx-6 rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                No tiles match “{query.trim()}”.
              </div>
            ) : (
              filteredCollections.map((collection) => (
                <div key={collection.collectionId} className="min-w-0 pb-6">
                  <div className="sticky top-0 z-[11] border-b border-border/60 bg-background/95 px-6 py-2.5 backdrop-blur-sm">
                    <div className="text-sm font-semibold">{collection.label}</div>
                  </div>
                  <div className="relative min-h-0 min-w-0 border-b border-border/60 py-1 pb-4 pt-2">
                    <Carousel
                      opts={{ align: 'start', watchDrag: watchDragIgnoreDrawerTileSlot }}
                      className="w-full"
                    >
                      <CarouselContent className="items-stretch">
                        {collection.tiles.map((tile) => (
                          <CarouselItem
                            key={catalogKey(tile.def)}
                            className="relative z-0 flex flex-col items-center justify-center hover:z-[5]"
                          >
                            <TilePreview
                              tile={tile}
                              fullWidth={tile.def.w * cellUnitPx}
                              fullHeight={tile.def.h * cellUnitPx}
                            />
                          </CarouselItem>
                        ))}
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
    </div>
  );
}
