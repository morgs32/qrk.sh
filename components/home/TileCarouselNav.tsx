"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCarousel } from "@/components/ui/carousel";
import { type ICollectionTile } from "@/components/home/tiles/types";
import { cn } from "@/lib/utils";

const maxVisibleDots = 5;
/** Dot row slide width matches `size-8` hit target per Embla slide. */
const dotSlideWidthPx = 32;
const dotGapPx = 8;

function getScale(index: number, selected: number) {
  const distance = Math.abs(index - selected);
  if (distance === 0) return 1;
  if (distance === 1) return 0.75;
  if (distance === 2) return 0.5;
  return 0.35;
}

function getOpacity(index: number, selected: number) {
  const distance = Math.abs(index - selected);
  if (distance === 0) return 1;
  if (distance === 1) return 0.8;
  if (distance === 2) return 0.5;
  return 0.3;
}

export function TileCarouselNav({ tiles }: { tiles: ICollectionTile[] }) {
  const { api, scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();
  const [selected, setSelected] = useState(0);
  const totalSlides = tiles.length;
  const visibleWidth = maxVisibleDots * dotSlideWidthPx + (maxVisibleDots - 1) * dotGapPx;

  const [dotsEmblaRef, dotsEmblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: false,
    loop: false,
    watchDrag: false,
  });

  useEffect(() => {
    if (!api) {
      return;
    }
    const onSelect = () => {
      setSelected(api.selectedScrollSnap());
    };
    onSelect();
    api.on("reInit", onSelect);
    api.on("select", onSelect);
    return () => {
      api.off("reInit", onSelect);
      api.off("select", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!dotsEmblaApi) return;
    dotsEmblaApi.reInit();
  }, [dotsEmblaApi, totalSlides]);

  useEffect(() => {
    if (!dotsEmblaApi) return;
    dotsEmblaApi.scrollTo(selected);
  }, [dotsEmblaApi, selected]);

  const goToSlide = useCallback(
    (index: number) => {
      api?.scrollTo(index);
    },
    [api],
  );

  const chevronBtn =
    "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0";

  const currentTile = tiles[selected];

  return (
    <div
      data-drawer-carousel-nav
      className="sticky bottom-0 z-[8] flex w-full min-w-0 shrink-0 flex-col justify-end px-6"
      role="toolbar"
      aria-label="Tile size and slides"
    >
      <div className="flex w-full min-w-0 flex-col items-center justify-center bg-background/95 py-3 backdrop-blur-sm dark:bg-background/90">
        {currentTile ? (
          <p
            className="mb-2 text-center text-sm font-semibold tabular-nums text-foreground"
            aria-live="polite"
          >
            {currentTile.def.label}
          </p>
        ) : null}
        <div className="flex max-w-full min-w-0 items-center gap-3 rounded-full border border-border/60 bg-muted/50 py-2 pl-2 pr-2 dark:bg-muted/30">
          <button
            type="button"
            className={chevronBtn}
            disabled={!canScrollPrev}
            onClick={scrollPrev}
            aria-label="Previous slide"
          >
            <ChevronLeft className="size-5 shrink-0" aria-hidden />
          </button>

          <div
            ref={dotsEmblaRef}
            className="min-w-0 shrink-0 overflow-hidden"
            style={{ width: visibleWidth }}
          >
            <div className="flex items-center" style={{ gap: dotGapPx }}>
              {tiles.map((tile, i) => {
                const active = i === selected;
                return (
                  <div
                    key={tile.def.name}
                    className="flex min-w-0 shrink-0 items-center justify-center"
                  >
                    <button
                      type="button"
                      onClick={() => goToSlide(i)}
                      className="flex size-8 shrink-0 items-center justify-center p-0 transition-all duration-300 ease-out"
                      style={{
                        transform: `scale(${getScale(i, selected)})`,
                        opacity: getOpacity(i, selected),
                      }}
                      aria-label={`${tile.def.w} by ${tile.def.h}, slide ${i + 1} of ${totalSlides}`}
                      aria-current={active ? "true" : undefined}
                    >
                      <span
                        className={cn(
                          "block size-3 rounded-full transition-colors duration-200",
                          active
                            ? "bg-foreground"
                            : "bg-muted-foreground/70 hover:bg-muted-foreground",
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className={chevronBtn}
            disabled={!canScrollNext}
            onClick={scrollNext}
            aria-label="Next slide"
          >
            <ChevronRight className="size-5 shrink-0" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
