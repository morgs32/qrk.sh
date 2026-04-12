"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { EmblaCarouselType } from "embla-carousel";
import { X } from "lucide-react";
import { collectionsHash } from "@/components/home/tiles/collectionsHash";
import { catalogKey } from "@/components/home/tiles/types";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TileCarouselNav } from "./TileCarouselNav";
import { TileDrawerTileDetail } from "./TileDrawerTileDetail";
import { TilePreview } from "./TilePreview";

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

export function TileDrawer(props: {
  open: boolean;
  tileId: string | null;
  onBackToCatalog: () => void;
  onClose: () => void;
}) {
  const { open, tileId, onBackToCatalog, onClose } = props;
  const [query, setQuery] = useState("");
  const showTileDetail = Boolean(open && tileId);

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

  return (
    <div
      role="dialog"
      aria-label="Workspace drawer"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed top-16 bottom-0 left-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-r border-border bg-background shadow-[4px_0_20px_-6px_rgb(0_0_0/0.07),2px_0_10px_-4px_rgb(0_0_0/0.04)] transition-transform duration-300 ease-out md:w-1/2 dark:shadow-[4px_0_20px_-6px_rgb(0_0_0/0.2),2px_0_10px_-4px_rgb(0_0_0/0.1)]",
        open ? "translate-x-0" : "-translate-x-full pointer-events-none select-none",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {showTileDetail && tileId ? (
          <TileDrawerTileDetail tileId={tileId} onBack={onBackToCatalog} onClose={onClose} />
        ) : (
          <>
            <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Tiles</div>
                  <div className="text-xs text-muted-foreground">
                    Browse tiles by collection. Drag-and-drop from the drawer will return with
                    native HTML5 DnD.
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer"
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
                  filteredCollections.map((collection) => {
                    const maxH = Math.max(...collection.tiles.map((t) => t.def.h));
                    return (
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
                            className="flex w-full flex-col"
                          >
                            {/*
                              Slide min-height must match TilePreview slot: half-viewport ÷ 8 cols = 50vw/8 per grid unit.
                              (Using 12vw/2 here clipped slides vs preview and looked empty.)
                            */}
                            <div
                              className="flex min-h-0 w-full flex-col"
                              style={
                                {
                                  height: `calc(${maxH} * 50vw / 8 + 5.75rem)`,
                                  "--drawer-collection-max-h": String(maxH),
                                } as CSSProperties
                              }
                            >
                              <CarouselContent
                                viewportClassName="relative min-h-0 w-full min-w-0 flex-1 basis-0 overflow-hidden"
                                className="min-h-0 items-stretch"
                              >
                                {collection.tiles.map((tile) => (
                                  <CarouselItem
                                    key={catalogKey(tile.def)}
                                    data-drawer-slide-grid-h={tile.def.h}
                                    className="relative py-10"
                                    style={{
                                      minHeight: `calc(${tile.def.h} * 50vw / 8)`,
                                    }}
                                  >
                                    <TilePreview tile={tile} />
                                  </CarouselItem>
                                ))}
                              </CarouselContent>
                              <TileCarouselNav tiles={collection.tiles} />
                            </div>
                          </Carousel>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
