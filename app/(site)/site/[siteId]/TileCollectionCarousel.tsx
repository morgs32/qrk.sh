"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { EmblaCarouselType } from "embla-carousel";
import type { ICollection, ICollectionTile } from "@/components/home/tiles/types";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { TileCarouselNav } from "./TileCarouselNav";
import { TilePreview } from "./TilePreview";

/** When true, Embla should not handle drag / focus for this interaction (drawer tile DnD, nav, etc.). */
function drawerCarouselInteractionShouldSkipEmbla(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest("[data-tile-drawer-tile-slot]") ||
    target.closest("[data-tile-drawer-carousel-nav]"),
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

function defaultTileSort(a: ICollectionTile, b: ICollectionTile): number {
  return a.def.order - b.def.order;
}

export function TileCollectionCarousel(props: {
  collection: ICollection;
  tileSortFn?: (a: ICollectionTile, b: ICollectionTile) => number;
}) {
  const { collection, tileSortFn = defaultTileSort } = props;
  const tiles = useMemo(
    () => Object.values(collection.tiles).sort(tileSortFn),
    [collection, tileSortFn],
  );
  const maxH = tiles.length > 0 ? Math.max(...tiles.map((t) => t.def.h)) : 1;

  return (
    <>
      <div className="sticky top-0 z-[11] bg-muted/80 px-6 py-2.5 backdrop-blur-sm dark:bg-muted/50">
        <div className="text-sm font-semibold">{collection.collectionLabel}</div>
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
              {tiles.map((tile) => (
                <CarouselItem
                  key={tile.def.name}
                  data-tile-drawer-slide-grid-h={tile.def.h}
                  className="relative py-10"
                  style={{
                    minHeight: `calc(${tile.def.h} * 50vw / 8)`,
                  }}
                >
                  <TilePreview tile={tile} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <TileCarouselNav tiles={tiles} />
          </div>
        </Carousel>
      </div>
    </>
  );
}
