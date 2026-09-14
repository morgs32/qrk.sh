import { useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router";
import { RotateCcw, X } from "lucide-react";
import { OrderedTableOfContents } from "../../OrderedTableOfContents";
import { Button } from "../../ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "../../ui/drawer";

import { SandboxGrid } from "../SandboxGrid";
import { useGridStore } from "../useGridStore";

export default function SandboxLayout() {
  const gridRegionRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [selectedWidth, setSelectedWidth] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useLayoutEffect(() => {
    const region = gridRegionRef.current;
    if (!region) return;

    // Measure the region, not the narrowed preview, so larger fitting choices stay enabled.
    const observer = new ResizeObserver(() => {
      const width = region.getBoundingClientRect().width;
      setAvailableWidth(width);
      setSelectedWidth((current) => (current !== null && current > width ? null : current));
    });
    observer.observe(region);

    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const updateLayout = () => {
      setIsDesktop(desktopQuery.matches);
      setDrawerOpen(false);
    };
    desktopQuery.addEventListener("change", updateLayout);
    return () => {
      observer.disconnect();
      desktopQuery.removeEventListener("change", updateLayout);
    };
  }, []);

  const collections = (
    <OrderedTableOfContents.Container>
      <OrderedTableOfContents.Title>
        <Link to="/">Brick collections</Link>
      </OrderedTableOfContents.Title>
      <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Outlet />
      </div>
    </OrderedTableOfContents.Container>
  );

  return (
    <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} modal={false}>
      <main className="min-h-screen">
        {isDesktop ? (
          <section
            aria-label="Bricks panel"
            className="fixed inset-y-0 left-0 z-60 h-dvh w-1/2 overflow-hidden border-r border-zinc-300 bg-white shadow-[6px_0_12px_-4px_rgba(0,0,0,0.3)]"
          >
            {collections}
          </section>
        ) : (
          <DrawerContent
            aria-describedby={undefined}
            className="qrk-bricks inset-x-0 bottom-0 z-60 h-[50dvh] rounded-t-lg border-t border-zinc-300 bg-white"
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DrawerTitle className="sr-only">Bricks</DrawerTitle>
            <div className="relative flex h-8 shrink-0 items-center justify-center">
              <div className="h-1 w-10 rounded-full bg-zinc-300" />
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 size-7"
                  aria-label="Close bricks"
                >
                  <X aria-hidden />
                </Button>
              </DrawerClose>
            </div>
            {collections}
          </DrawerContent>
        )}
        <div
          ref={gridRegionRef}
          data-testid="grid-region"
          className="min-w-0 pt-14 lg:ml-[50%] lg:w-1/2 lg:pt-0"
        >
          <div className="mx-auto max-w-full" style={{ width: selectedWidth ?? "100%" }}>
            <SandboxGrid />
          </div>
        </div>
        <div className="pointer-events-none fixed inset-x-0 top-3 z-80 flex justify-center px-2 lg:bottom-6 lg:left-1/2 lg:top-auto">
          <div
            role="toolbar"
            aria-label="Grid controls"
            className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center rounded-sm border border-border/80 bg-background px-1 py-1 shadow-md"
          >
            {!isDesktop && (
              <DrawerTrigger asChild>
                <Button
                  type="button"
                  variant={drawerOpen ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2 text-xs"
                  aria-expanded={drawerOpen}
                >
                  Bricks
                </Button>
              </DrawerTrigger>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Reset grid layout"
              title="Reset grid layout"
              onClick={() => {
                useGridStore.setState({
                  layout: [
                    { i: "fixture-1", x: 0, y: 0, w: 2, h: 2 },
                    { i: "fixture-2", x: 2, y: 0, w: 2, h: 2 },
                    { i: "fixture-3", x: 4, y: 0, w: 2, h: 2 },
                    { i: "fixture-4", x: 6, y: 0, w: 2, h: 2 },
                  ],
                  bricksById: {},
                  activeBrickDrag: null,
                });
              }}
            >
              <RotateCcw aria-hidden />
            </Button>
            <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
            <Button
              type="button"
              variant={selectedWidth === null ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2 text-xs"
              aria-pressed={selectedWidth === null}
              onClick={() => setSelectedWidth(null)}
            >
              Full
            </Button>
            {[375, 768, 1024, 1440].map((width) => (
              <Button
                key={width}
                type="button"
                variant={selectedWidth === width ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2 text-xs"
                aria-label={`${width}px grid width`}
                aria-pressed={selectedWidth === width}
                disabled={width > availableWidth}
                onClick={() => setSelectedWidth(width)}
              >
                {width}
              </Button>
            ))}
          </div>
        </div>
      </main>
    </Drawer>
  );
}
