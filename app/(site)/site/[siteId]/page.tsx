"use client";

/**
 * Site directory (`app/(site)/site/[siteId]/`): workspace UI for `/site/[siteId]` only —
 * hero + grid column, drawers, toolbar, and nuqs hooks live in this file; sibling modules
 * (`Grid`, `TileDrawer`, etc.) stay colocated in this folder. Shared tile catalog, seed layout,
 * and stores used by both `/` (`HomeGrid`) and the site stay under `components/home/`.
 */
import { useCallback, useEffect, useRef } from "react";
import { HeroCopy } from "@/components/home/HeroCopy";
import { BottomToolbar } from "./BottomToolbar";
import { Grid } from "./Grid";
import { ProseDrawer } from "./ProseDrawer";
import { TileDrawer } from "./TileDrawer";
import { useDrawerSearchParam } from "./useDrawerSearchParam";
import { useTileIdSearchParam } from "./useTileIdSearchParam";

export default function HomePage() {
  const [drawer, setDrawer] = useDrawerSearchParam();
  const [tileId, setTileId] = useTileIdSearchParam();

  const isTileDrawerOpen = drawer === "edit-tiles";
  const isProseDrawerOpen = drawer === "edit-text";

  const setIsTileDrawerOpen = useCallback(
    (open: boolean) => {
      if (open) {
        void setDrawer("edit-tiles");
      } else {
        void setDrawer(null);
        void setTileId(null);
      }
    },
    [setDrawer, setTileId],
  );

  const closeTileDrawer = useCallback(() => {
    void setDrawer(null);
    void setTileId(null);
  }, [setDrawer, setTileId]);

  const closeProseDrawer = useCallback(() => {
    void setDrawer(null);
  }, [setDrawer]);

  const openProseDrawer = useCallback(() => {
    void setTileId(null);
    void setDrawer("edit-text");
  }, [setDrawer, setTileId]);

  const backToTileCatalog = useCallback(() => {
    void setTileId(null);
  }, [setTileId]);

  const isTileDrawerOpenRef = useRef(isTileDrawerOpen);

  useEffect(() => {
    isTileDrawerOpenRef.current = isTileDrawerOpen;
  }, [isTileDrawerOpen]);

  useEffect(() => {
    if (!isTileDrawerOpen && !isProseDrawerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void setDrawer(null);
        void setTileId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTileDrawerOpen, isProseDrawerOpen, setDrawer, setTileId]);

  useEffect(() => {
    const allowBackgroundScroll = (event: Event) => {
      if (!isTileDrawerOpenRef.current) {
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
            <Grid />
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4">
        <div className="pointer-events-auto">
          <BottomToolbar
            addTilesOpen={isTileDrawerOpen}
            editTextOpen={isProseDrawerOpen}
            onTilesToolbarClick={() => void setIsTileDrawerOpen(!isTileDrawerOpen)}
            onEditTextClick={() => void (isProseDrawerOpen ? closeProseDrawer() : openProseDrawer())}
          />
        </div>
      </div>

      <TileDrawer
        open={isTileDrawerOpen}
        tileId={tileId ?? null}
        onBackToCatalog={backToTileCatalog}
        onClose={closeTileDrawer}
      />
      <ProseDrawer open={isProseDrawerOpen} onClose={closeProseDrawer} />
    </>
  );
}
