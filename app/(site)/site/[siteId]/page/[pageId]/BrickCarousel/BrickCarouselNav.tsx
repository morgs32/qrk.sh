"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { type CarouselApi } from "@/components/ui/carousel";
import { type ICollectionBrick } from "@/components/home/bricks/types";
import { cn } from "@/lib/utils";

const maxVisibleDots = 5;
/** Dot row slide width matches `size-6` hit target per Embla slide. */
const dotSlideWidthPx = 24;
const dotGapPx = 4;

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

export function BrickCarouselNav(props: {
  bricks: ICollectionBrick[];
  /** Main Embla API from `<Carousel setApi={…}>`; nav can sit outside `<Carousel>` when this is passed. */
  api: CarouselApi | null;
}) {
  const { bricks, api } = props;
  const [selected, setSelected] = useState(0);
  const totalSlides = bricks.length;
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

  return (
    <div
      data-brick-carousel-nav
      className="z-[8] flex min-w-0 shrink-0 items-center justify-center"
      role="toolbar"
      aria-label="Brick size and slides"
    >
      <div className="flex min-w-0 items-center justify-center">
        <div
          ref={dotsEmblaRef}
          className="min-w-0 shrink-0 overflow-hidden"
          style={{ width: visibleWidth }}
        >
          <div className="flex items-center" style={{ gap: dotGapPx }}>
            {bricks.map((brick, i) => {
              const active = i === selected;
              return (
                <div
                  key={brick.def.name}
                  className="flex min-w-0 shrink-0 items-center justify-center"
                >
                  <button
                    type="button"
                    onClick={() => goToSlide(i)}
                    className="flex size-6 shrink-0 items-center justify-center p-0 transition-all duration-300 ease-out"
                    style={{
                      transform: `scale(${getScale(i, selected)})`,
                      opacity: getOpacity(i, selected),
                    }}
                    aria-label={`${brick.def.w} by ${brick.def.h}, slide ${i + 1} of ${totalSlides}`}
                    aria-current={active ? "true" : undefined}
                  >
                    <span
                      className={cn(
                        "block size-2.5 rounded-full transition-colors duration-200",
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
      </div>
    </div>
  );
}
