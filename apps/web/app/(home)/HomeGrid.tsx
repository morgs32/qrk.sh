"use client";

import { useEffect, useMemo, useState } from "react";
import type { CarouselApi } from "@/components/ui/carousel";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { collectionsHash } from "@qrk.sh/bricks";

const ROWS = [
  ["swatch", "icon", "image", "figma"],
  ["text-brick"],
] as const;

const AUTOPLAY_DELAY_MS = 3000;
const AUTOPLAY_STAGGER_MS = 600;

export function HomeGrid() {
  const [api0, setApi0] = useState<CarouselApi>();
  const [api1, setApi1] = useState<CarouselApi>();

  useEffect(() => {
    if (!api0) return;
    const interval = window.setInterval(() => api0.scrollNext(), AUTOPLAY_DELAY_MS);
    return () => window.clearInterval(interval);
  }, [api0]);

  useEffect(() => {
    if (!api1) return;
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      interval = window.setInterval(() => api1.scrollNext(), AUTOPLAY_DELAY_MS);
    }, AUTOPLAY_STAGGER_MS);
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [api1]);

  const rowTiles = useMemo(() => {
    return ROWS.map((row) => {
      return row.map((collectionName) => {
        const collection = collectionsHash[collectionName];
        return {
          collectionName,
          Tile: collection.variants.default.sizes["4x4"].component,
        };
      });
    });
  }, []);

  return (
    <>
      <div className="w-full" data-testid="grid-layout">
        <div className="flex flex-col">
          <Carousel
            setApi={setApi0}
            opts={{ loop: true, align: "start" }}
            className="w-full"
            aria-label="Home tiles row 1"
          >
            <CarouselContent className="-ml-0">
              {rowTiles[0].map(({ collectionName, Tile }) => {
                return (
                  <CarouselItem key={collectionName} className="basis-1/2 pl-0">
                    <div className="w-full aspect-square">
                      <Tile />
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
          </Carousel>

          <Carousel
            setApi={setApi1}
            dir="rtl"
            opts={{ loop: true, align: "start", direction: "rtl" }}
            className="w-full"
            aria-label="Home tiles row 2"
          >
            <CarouselContent className="-ml-0">
              {rowTiles[1].map(({ collectionName, Tile }) => {
                return (
                  <CarouselItem key={collectionName} className="basis-1/2 pl-0">
                    <div className="w-full aspect-square">
                      <Tile />
                    </div>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
          </Carousel>
        </div>
      </div>
    </>
  );
}
