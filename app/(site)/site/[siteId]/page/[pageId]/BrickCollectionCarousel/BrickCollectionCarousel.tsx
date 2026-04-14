"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { EmblaCarouselType } from "embla-carousel";
import type { ICollection, ICollectionBrick } from "@/components/home/bricks/types";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { BrickCarouselNav } from "./BrickCarouselNav";
import { BrickPreview } from "./BrickPreview";

/** When true, Embla should not handle drag / focus for this interaction (drawer brick DnD, nav, etc.). */
function drawerCarouselInteractionShouldSkipEmbla(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest("[data-brick-drawer-brick-slot]") ||
    target.closest("[data-brick-drawer-carousel-nav]"),
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

function defaultBrickSort(a: ICollectionBrick, b: ICollectionBrick): number {
  return a.def.order - b.def.order;
}

export function BrickCollectionCarousel(props: {
  collection: ICollection;
  brickSortFn?: (a: ICollectionBrick, b: ICollectionBrick) => number;
}) {
  const { collection, brickSortFn = defaultBrickSort } = props;
  const bricks = useMemo(
    () => Object.values(collection.bricks).sort(brickSortFn),
    [collection, brickSortFn],
  );
  const maxH = bricks.length > 0 ? Math.max(...bricks.map((b) => b.def.h)) : 1;

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
            Slide min-height must match BrickPreview slot: half-viewport / 8 cols = 50vw/8 per grid unit.
            (Using 12vw/2 here clipped slides vs preview and looked empty.)
          */}
          <div
            className="group flex min-h-0 w-full flex-col"
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
              {bricks.map((brick) => (
                <CarouselItem
                  key={brick.def.name}
                  data-brick-drawer-slide-grid-h={brick.def.h}
                  className="relative py-10"
                  style={{
                    minHeight: `calc(${brick.def.h} * 50vw / 8)`,
                  }}
                >
                  <BrickPreview brick={brick} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <BrickCarouselNav bricks={bricks} />
          </div>
        </Carousel>
      </div>
    </>
  );
}
