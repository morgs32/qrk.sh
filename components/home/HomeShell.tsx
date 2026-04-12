"use client";

import { useEffect, useRef } from "react";
import { parseAsBoolean, useQueryState } from "nuqs";
import { HeroCopy } from "@/components/home/HeroCopy";
import { Grid } from "@/components/home/Grid";
import { LeftBottomToolbar } from "@/components/home/LeftBottomToolbar";
import { ProseDrawer } from "@/components/home/ProseDrawer";
import { TileDrawer } from "@/components/home/TileDrawer";
import { useProseDrawerStore } from "@/components/home/useProseDrawerStore";

export function HomeShell() {
  const [isDrawerOpen, setIsDrawerOpen] = useQueryState(
    "add-tiles",
    parseAsBoolean.withDefault(false),
  );
  const isDrawerOpenRef = useRef(isDrawerOpen);
  const isProseDrawerOpen = useProseDrawerStore((s) => s.open);
  const setProseDrawerOpen = useProseDrawerStore((s) => s.setOpen);

  useEffect(() => {
    isDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void setIsDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isProseDrawerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProseDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isProseDrawerOpen, setProseDrawerOpen]);

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
            <Grid
              addTilesOpen={isDrawerOpen}
              onTilesToolbarClick={() => void setIsDrawerOpen(!isDrawerOpen)}
            />
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-0 z-30 flex w-1/2 justify-center px-4">
        <div className="pointer-events-auto">
          <LeftBottomToolbar />
        </div>
      </div>

      <TileDrawer open={isDrawerOpen} onClose={() => void setIsDrawerOpen(false)} />
      <ProseDrawer />
    </>
  );
}
