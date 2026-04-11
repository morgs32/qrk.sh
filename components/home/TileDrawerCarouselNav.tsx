"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCarousel } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

export function TileDrawerCarouselNav() {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();

  const railButtonClass =
    "stretched-button relative flex h-full min-h-0 w-full items-center justify-center gap-0 rounded-none border-0 bg-transparent p-0 text-[0] leading-none shadow-none hover:bg-muted/50 disabled:pointer-events-auto";

  return (
    <>
      <div data-drawer-carousel-nav className="absolute inset-y-0 left-0 z-0 w-14">
        <Button
          type="button"
          variant="ghost"
          disabled={!canScrollPrev}
          onClick={scrollPrev}
          className={cn(
            railButtonClass,
            canScrollPrev ? "cursor-pointer" : "cursor-not-allowed",
          )}
          aria-label="Previous slide"
        >
          <span className="relative z-10 inline-flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-xs dark:bg-input/30 [&_svg]:block">
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
          </span>
        </Button>
      </div>
      <div data-drawer-carousel-nav className="absolute inset-y-0 right-0 z-0 w-14">
        <Button
          type="button"
          variant="ghost"
          disabled={!canScrollNext}
          onClick={scrollNext}
          className={cn(
            railButtonClass,
            canScrollNext ? "cursor-pointer" : "cursor-not-allowed",
          )}
          aria-label="Next slide"
        >
          <span className="relative z-10 inline-flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-xs dark:bg-input/30 [&_svg]:block">
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </span>
        </Button>
      </div>
    </>
  );
}
