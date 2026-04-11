"use client";

import { useEffect, useRef, useState } from "react";
import { HeroCopy } from "@/components/home/HeroCopy";
import { Grid } from "@/components/home/Grid";
import { TileDrawer } from "@/components/home/TileDrawer";

export function HomeShell() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isDrawerOpenRef = useRef(isDrawerOpen);

  useEffect(() => {
    isDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  useEffect(() => {
    const allowBackgroundScroll = (event: Event) => {
      if (!isDrawerOpenRef.current) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      const rightColumn = document.querySelector<HTMLElement>("[data-home-right-scroll]");
      if (rightColumn && rightColumn.contains(target)) {
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("wheel", allowBackgroundScroll, { capture: true });
    window.addEventListener("touchmove", allowBackgroundScroll, { capture: true });

    return () => {
      window.removeEventListener("wheel", allowBackgroundScroll, { capture: true } as never);
      window.removeEventListener("touchmove", allowBackgroundScroll, { capture: true } as never);
    };
  }, []);

  return (
    <>
      <div className="h-screen pt-16">
        <HeroCopy />

        <div
          data-home-right-scroll
          className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-1/2 min-w-0 overflow-y-auto"
        >
          <div className="w-full pb-24">
            <Grid onAddClick={() => setIsDrawerOpen(true)} />
          </div>
        </div>
      </div>

      <TileDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
