"use client";

import { useEffect, useMemo, useState } from "react";
import type { EmblaCarouselType } from "embla-carousel";
import type { ICollection, ICollectionBrick } from "@qrk.sh/bricks";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { SoftButton } from "@/components/ui/soft-button";
import { BrickCarouselNoBricksError } from "./BrickCarouselError";
import { BrickCarouselNav } from "./BrickCarouselNav";
import { BrickPreview } from "./BrickPreview";

/** Same as `BrickPreview` / site grid: half viewport ÷ 8 columns. */
const PREVIEW_GRID_COLS = 8;

/** When true, Embla should not handle drag / focus for this interaction (drawer brick DnD, nav, etc.). */
function drawerCarouselInteractionShouldSkipEmbla(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest("[data-brick-drawer-brick-slot]") || target.closest("[data-brick-carousel-nav]"),
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

export function BrickCarousel(props: {
  collection: ICollection;
  brickSortFn?: (a: ICollectionBrick, b: ICollectionBrick) => number;
}) {
  const { collection, brickSortFn = defaultBrickSort } = props;
  const bricks = useMemo(
    () => Object.values(collection.bricks).sort(brickSortFn),
    [collection, brickSortFn],
  );

  if (bricks.length <= 0) {
    throw new BrickCarouselNoBricksError(collection.collectionName);
  }

  const maxH = Math.max(...bricks.map((b) => b.def.h));
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!carouselApi) {
      return;
    }
    const onSelect = () => {
      setSelectedIndex(carouselApi.selectedScrollSnap());
    };
    onSelect();
    carouselApi.on("reInit", onSelect);
    carouselApi.on("select", onSelect);
    return () => {
      carouselApi.off("reInit", onSelect);
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi]);

  return (
    <>
      <div className="sticky top-0 z-[11]">
        <div className="bg-muted/80 px-6 py-2.5 backdrop-blur-sm dark:bg-muted/50">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <div className="min-w-0 truncate text-sm font-semibold">
              {collection.collectionLabel}
            </div>
            <BrickCarouselNav api={carouselApi} bricks={bricks} />
            <div className="min-w-0 justify-self-end text-right text-sm font-medium tabular-nums text-muted-foreground">
              {bricks[selectedIndex]?.def.label}
            </div>
          </div>
        </div>
        <div className="bg-transparent h-8"></div>
      </div>

      {/*
          Slide min-height must match BrickPreview slot: half-viewport / 8 cols = 50vw/8 per grid unit.
          (Using 12vw/2 here clipped slides vs preview and looked empty.)
          Carousel root is `relative` (see components/ui/carousel.tsx); height pins the slide strip.
        */}
      <Carousel
        setApi={setCarouselApi}
        opts={{
          align: "start",
          watchDrag: watchDragIgnoreDrawerChrome,
          watchFocus: watchFocusIgnoreDrawerChrome,
        }}
        className="z-10 flex h-full min-h-0 w-full flex-col"
        style={{ height: `calc(${maxH} * 50vw / 8)` }}
      >
        <div className="absolute top-1/2 left-0 z-30 ml-8 -translate-y-1/2">
          <SoftButton
            data-brick-carousel-nav
            aria-label="Previous slide"
            disabled={!carouselApi?.canScrollPrev()}
            onClick={() => carouselApi?.scrollPrev()}
          >
            <ChevronLeft
              className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-white/90 drop-shadow-md"
              aria-hidden
            />
          </SoftButton>
        </div>
        <CarouselContent
          viewportClassName="relative h-full min-h-0 w-full min-w-0 flex-1 basis-0 overflow-hidden"
          className="h-full min-h-0 items-stretch"
        >
          {bricks.map((brick) => (
            <CarouselItem
              key={brick.def.name}
              data-brick-drawer-slide-grid-h={brick.def.h}
              className="relative flex h-full min-h-0 flex-col items-center justify-center"
              style={{
                minHeight: `calc(${brick.def.h} * 50vw / 8)`,
              }}
            >
              <div className="flex min-h-0 w-full flex-shrink-0 flex-col items-center justify-center">
                <div
                  className="relative shrink-0"
                  style={{
                    width: `calc(${brick.def.w} * 50vw / ${PREVIEW_GRID_COLS})`,
                    height: `calc(${brick.def.h} * 50vw / ${PREVIEW_GRID_COLS})`,
                  }}
                >
                  <BrickPreview brick={brick} />
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="absolute top-1/2 right-0 z-30 mr-8 -translate-y-1/2">
          <SoftButton
            data-brick-carousel-nav
            aria-label="Next slide"
            disabled={!carouselApi?.canScrollNext()}
            onClick={() => carouselApi?.scrollNext()}
          >
            <ChevronRight
              className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-white/90 drop-shadow-md"
              aria-hidden
            />
          </SoftButton>
        </div>
      </Carousel>
      <div className="sticky top-0 z-[12] bg-transparent h-8" />
    </>
  );
}
