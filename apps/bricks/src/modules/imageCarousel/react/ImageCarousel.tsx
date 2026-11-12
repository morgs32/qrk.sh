"use client";

import { useStateValue } from "@json-render/react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../../components/button";
import { CroppedImage } from "../../../components/CroppedImage";
import type { imageCarouselSlidesSchema } from "../definition/imageCarouselV1";

export function ImageCarousel() {
  const slides =
    useStateValue<typeof imageCarouselSlidesSchema.Type>("/slides") ?? [];
  const interval = useStateValue<number>("/interval") ?? 5;
  const [viewportRef, api] = useEmblaCarousel({ loop: true });
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const playingBeforePointerFocus = useRef<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPlaying(!media.matches);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setPlaying(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const updateSelected = useCallback(() => {
    if (api !== undefined) setSelected(api.selectedScrollSnap());
  }, [api]);
  useEffect(() => {
    if (api === undefined) return;
    updateSelected();
    api.on("select", updateSelected);
    api.on("reInit", updateSelected);
    return () => {
      api.off("select", updateSelected);
      api.off("reInit", updateSelected);
    };
  }, [api, updateSelected]);

  useEffect(() => {
    if (api === undefined || !playing || hovered || slides.length < 2) return;
    const timer = window.setInterval(() => api.scrollNext(), interval * 1000);
    return () => window.clearInterval(timer);
  }, [api, hovered, interval, playing, slides.length]);

  if (slides.length === 0)
    return (
      <div className="flex size-full min-h-48 items-center justify-center bg-muted text-sm text-muted-foreground">
        Add images to this carousel.
      </div>
    );

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Image carousel"
      className="relative h-full min-h-48 w-full overflow-hidden bg-muted"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPlaying(false);
      }}
    >
      {slides.length > 1 && (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={playing ? "Stop slide rotation" : "Start slide rotation"}
          className="absolute bottom-2 right-2 z-10"
          onPointerDown={() => {
            playingBeforePointerFocus.current = playing;
          }}
          onPointerCancel={() => {
            playingBeforePointerFocus.current = null;
          }}
          onClick={(event) => {
            setPlaying(
              !(event.detail === 0
                ? playing
                : (playingBeforePointerFocus.current ?? playing)),
            );
            playingBeforePointerFocus.current = null;
          }}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
      )}
      <div
        ref={viewportRef}
        className="size-full overflow-hidden"
        data-image-carousel-frame
      >
        <div className="flex h-full touch-pan-y">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}`}
              aria-hidden={index !== selected}
              className="relative min-w-0 flex-[0_0_100%]"
            >
              {slide.crop === null ? (
                <img
                  src={slide.imageUrl}
                  alt={slide.alt}
                  draggable={false}
                  className="absolute inset-0 size-full select-none object-cover"
                />
              ) : (
                <CroppedImage
                  src={slide.imageUrl}
                  alt={slide.alt}
                  crop={slide.crop}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      {slides.length > 1 && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2"
            onClick={() => api?.scrollPrev()}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => api?.scrollNext()}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <div
            className="absolute bottom-2 left-1/2 flex max-w-[calc(100%-5rem)] -translate-x-1/2 items-center gap-1 overflow-auto rounded-lg bg-background/90 p-1"
            role="group"
            aria-label="Choose image"
          >
            {slides.map((slide, index) => (
              <Button
                key={slide.id}
                type="button"
                variant={selected === index ? "default" : "ghost"}
                size="icon-xs"
                aria-label={`Show image ${index + 1}`}
                aria-current={selected === index ? "true" : undefined}
                onClick={() => api?.scrollTo(index)}
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-current"
                />
              </Button>
            ))}
          </div>
        </>
      )}
      <span
        className="sr-only"
        aria-live={playing && !hovered ? "off" : "polite"}
        aria-atomic="true"
      >
        Image {selected + 1} of {slides.length}
      </span>
    </div>
  );
}
