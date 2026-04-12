"use client";

import { useMemo, useState } from "react";
import type { EmblaCarouselType } from "embla-carousel";
import { X } from "lucide-react";
import { catalogKey, collectionsHash } from "./tiles";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { Input } from "@/components/ui/input";
import { useGridStore } from "@/components/home/useGridStore";
import { TileDrawerCarouselNav } from "./TileDrawerCarouselNav";
import { TilePreview } from "./TilePreview";

/** Fallback when the grid has not measured yet (`gridCellHeightPx` is null). */
export const DRAWER_PREVIEW_UNIT_PX = 96;

/** When true, Embla should not handle drag / focus for this interaction (drawer tile DnD, nav, etc.). */
function drawerCarouselInteractionShouldSkipEmbla(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest("[data-drawer-tile-slot]") || target.closest("[data-drawer-carousel-nav]"),
  );
}

function watchDragIgnoreDrawerChrome(
  _emblaApi: EmblaCarouselType,
  event: MouseEvent | TouchEvent,
): boolean {
  return !drawerCarouselInteractionShouldSkipEmbla(event.target);
}

function watchFocusIgnoreDrawerChrome(_emblaApi: EmblaCarouselType, event: FocusEvent): boolean {
  return !drawerCarouselInteractionShouldSkipEmbla(event.target);
}

export function TileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const gridCellHeightPx = useGridStore((state) => state.gridCellHeightPx);
  const cellUnitPx =
    gridCellHeightPx && gridCellHeightPx > 0 ? gridCellHeightPx : DRAWER_PREVIEW_UNIT_PX;

  const filteredCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ordered = Object.values(collectionsHash).map(({ tiles }) => {
      const list = Object.values(tiles).sort((a, b) => a.def.order - b.def.order);
      const first = list[0]!;
      return {
        collectionName: first.def.collectionName,
        label: first.def.collectionLabel,
        tiles: [...list],
      };
    });

    if (!q) {
      return ordered;
    }

    return ordered
      .map((collection) => {
        const matchesCollection =
          collection.label.toLowerCase().includes(q) ||
          collection.collectionName.toLowerCase().includes(q);
        const matchingTiles = collection.tiles.filter((tile) =>
          catalogKey(tile.def).toLowerCase().includes(q),
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
      className="fixed top-16 bottom-0 left-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-r border-border bg-background shadow-2xl md:w-1/2"
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
              onClick={() => setQuery("")}
              disabled={query.trim().length === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div aria-label="Tile collections" className="flex flex-col pb-8">
            {filteredCollections.length === 0 ? (
              <div className="mx-6 rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                No tiles match “{query.trim()}”.
              </div>
            ) : (
              filteredCollections.map((collection) => (
                <div key={collection.collectionName} className="min-w-0">
                  <div className="sticky top-0 z-[11] bg-muted/80 px-6 py-2.5 backdrop-blur-sm dark:bg-muted/50">
                    <div className="text-sm font-semibold">{collection.label}</div>
                  </div>
                  <div className="min-h-0 min-w-0 border-b border-border/60">
                    <Carousel
                      opts={{
                        align: "start",
                        watchDrag: watchDragIgnoreDrawerChrome,
                        watchFocus: watchFocusIgnoreDrawerChrome,
                      }}
                      className="w-full"
                    >
                      <div className="relative min-h-0 w-full">
                        <TileDrawerCarouselNav edge="start" />
                        <TileDrawerCarouselNav edge="end" />
                        <CarouselContent
                          viewportClassName="relative min-h-0 min-w-0 w-full"
                          className="items-stretch"
                        >
                          {collection.tiles.map((tile) => (
                            <CarouselItem
                              key={catalogKey(tile.def)}
                              className="flex min-h-0 flex-col items-center"
                            >
                              <TilePreview
                                tile={tile}
                                fullWidth={tile.def.w * cellUnitPx}
                                fullHeight={tile.def.h * cellUnitPx}
                              />
                            </CarouselItem>
                          ))}
                        </CarouselContent>
                      </div>
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
