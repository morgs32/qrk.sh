"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCarousel } from "@/components/ui/carousel";
import { catalogKey, type ICollectionTile } from "@/components/home/tiles/types";
import { cn } from "@/lib/utils";

export function TileDrawerCarouselDimensionNav({ tiles }: { tiles: ICollectionTile[] }) {
  const { api, scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();
  const [selected, setSelected] = useState(0);

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

  const arrowBtn =
    "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-muted/40 p-0 text-foreground outline-none transition-colors hover:bg-muted/55 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 dark:bg-muted/25 dark:hover:bg-muted/35 [&_svg]:pointer-events-none [&_svg]:shrink-0";

  return (
    <div
      data-drawer-carousel-nav
      className="sticky bottom-0 z-[12] flex min-h-[calc(var(--drawer-collection-max-h,1)*12.5vw/2)] w-full min-w-0 shrink-0 flex-col justify-end px-6"
      role="toolbar"
      aria-label="Tile size and slides"
    >
      <div className="flex w-full min-w-0 items-center justify-center gap-2 bg-background/95 py-3 backdrop-blur-sm dark:bg-background/90">
        <button
          type="button"
          className={cn(arrowBtn, "shrink-0")}
          disabled={!canScrollPrev}
          onClick={scrollPrev}
          aria-label="Previous slide"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
        </button>

        <div className="flex max-w-full min-w-0 flex-wrap items-center justify-center gap-2">
          {tiles.map((tile, i) => {
            const active = i === selected;
            return (
              <button
                key={catalogKey(tile.def)}
                type="button"
                onClick={() => api?.scrollTo(i)}
                aria-label={`${tile.def.w} by ${tile.def.h}, slide ${i + 1} of ${tiles.length}`}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors",
                  active
                    ? "bg-muted text-foreground ring-1 ring-border/60"
                    : "bg-muted/40 text-foreground hover:bg-muted/55 dark:bg-muted/25 dark:hover:bg-muted/35",
                )}
              >
                {tile.def.w}×{tile.def.h}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={cn(arrowBtn, "shrink-0")}
          disabled={!canScrollNext}
          onClick={scrollNext}
          aria-label="Next slide"
        >
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </button>
      </div>
    </div>
  );
}
