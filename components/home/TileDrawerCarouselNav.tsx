"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCarousel } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

export function TileDrawerCarouselNav({ edge }: { edge: "start" | "end" }) {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel();

  const isStart = edge === "start";
  const canAct = isStart ? canScrollPrev : canScrollNext;
  const onClick = isStart ? scrollPrev : scrollNext;

  return (
    <div
      data-drawer-carousel-nav
      className="relative h-full min-h-0 w-full min-w-0"
    >
      <Button
        type="button"
        variant="ghost"
        disabled={!canAct}
        onClick={onClick}
        className={cn(
          "stretched-button relative flex h-full min-h-0 w-full items-center justify-center gap-0 bg-transparent p-0 leading-none hover:bg-muted/55 dark:hover:bg-muted/35 disabled:opacity-50",
          canAct ? "cursor-pointer" : "cursor-not-allowed",
        )}
        aria-label={isStart ? "Previous slide" : "Next slide"}
      >
        <span className="relative z-10 inline-flex size-10 items-center justify-center text-foreground shadow-xs dark:bg-input/30 [&_svg]:block">
          {isStart ? (
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
          ) : (
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          )}
        </span>
      </Button>
    </div>
  );
}
