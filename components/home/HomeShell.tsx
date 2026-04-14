"use client";

import { useCallback, useEffect, useRef } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { HeroCopy } from "@/components/home/HeroCopy";
import { BottomToolbar } from "@/components/home/BottomToolbar";
import { Grid } from "@/components/home/Grid";
import { ProseDrawer } from "@/components/home/ProseDrawer";
import { TileDrawer } from "@/components/home/TileDrawer";
import { parseHomeDrawerPathname } from "@/components/home/useActiveDrawer";

export function HomeShell() {
  const pathname = usePathname();
  const router = useRouter();
  const { siteId } = useParams<{ siteId: string }>();
  const siteBase = `/site/${siteId}`;
  const { isTileDrawerOpen, tileId, isProseDrawerOpen } = parseHomeDrawerPathname(pathname);

  const setIsTileDrawerOpen = useCallback(
    (open: boolean) => {
      if (open) {
        router.push(`${siteBase}/edit-tiles`);
      } else {
        router.push(siteBase);
      }
    },
    [router, siteBase],
  );

  const closeTileDrawer = useCallback(() => {
    router.push(siteBase);
  }, [router, siteBase]);

  const closeProseDrawer = useCallback(() => {
    router.push(siteBase);
  }, [router, siteBase]);

  const openProseDrawer = useCallback(() => {
    router.push(`${siteBase}/edit-text`);
  }, [router, siteBase]);

  const backToTileCatalog = useCallback(() => {
    router.push(`${siteBase}/edit-tiles`);
  }, [router, siteBase]);

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
        router.push(siteBase);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTileDrawerOpen, isProseDrawerOpen, router, siteBase]);

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
        tileId={tileId}
        onBackToCatalog={backToTileCatalog}
        onClose={closeTileDrawer}
      />
      <ProseDrawer open={isProseDrawerOpen} onClose={closeProseDrawer} />
    </>
  );
}
