"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCarousel } from "@/components/ui/carousel";

export function TileDrawerCarouselNav({ edge }: { edge: "start" | "end" }) {
  const { scrollPrev, scrollNext } = useCarousel();

  const isStart = edge === "start";
  const onClick = isStart ? scrollPrev : scrollNext;

  return (
    <div
      data-drawer-carousel-nav
      className="relative h-full min-h-0 w-full border border-border/50 bg-muted/40 dark:bg-muted/25"
    >
      <button
        type="button"
        onClick={onClick}
        className="relative flex h-full min-h-0 w-full cursor-pointer items-center justify-center gap-0 border-0 bg-transparent p-0 text-sm font-medium leading-none outline-none transition-colors hover:bg-muted/55 focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-muted/35 [&_svg]:pointer-events-none [&_svg]:shrink-0"
        aria-label={isStart ? "Previous slide" : "Next slide"}
      >
        <span className="relative z-10 inline-flex size-10 items-center justify-center border-0 bg-transparent text-foreground shadow-none dark:bg-transparent [&_svg]:block">
          {isStart ? (
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
          ) : (
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          )}
        </span>
      </button>
    </div>
  );
}
