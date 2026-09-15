import { BrickBreakpointProvider } from "../../BrickBreakpointProvider";
import { useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router";
import { RotateCcw, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "../../components/ui/drawer";

import { SandboxGrid } from "../SandboxGrid";
import { useGridStore } from "../useGridStore";

export default function SandboxLayout() {
  const gridRegionRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const savedWidth = useGridStore((state) => state.selectedWidth);
  const selectedWidth =
    savedWidth !== null && savedWidth <= availableWidth
      ? savedWidth
      : ([1440, 1024, 640, 375].find((preset) => preset <= availableWidth) ?? null);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useLayoutEffect(() => {
    const region = gridRegionRef.current;
    if (!region) return;

    // Measure the region, not the narrowed preview, so larger fitting choices stay enabled.
    const observer = new ResizeObserver(() => {
      const width = region.getBoundingClientRect().width;
      setAvailableWidth(width);
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

  const groups = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background pl-4 pr-6">
        <Link to="/" className="text-sm font-medium">
          Brick groups
        </Link>
      </header>
      <div className="min-h-0 flex-1">
        <div className="qrk-bricks flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden font-mono text-sm leading-5 text-zinc-900">
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <BrickBreakpointProvider>
      {() => (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} modal={false}>
          <main className="min-h-screen">
            {isDesktop ? (
              <section
                aria-label="Bricks panel"
                className="fixed inset-y-0 left-0 z-60 h-dvh w-1/2 overflow-hidden border-r border-zinc-300 bg-white"
              >
                {groups}
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
                {groups}
              </DrawerContent>
            )}
            <div
              aria-hidden="true"
              className="pointer-events-none fixed inset-y-0 right-0 flex w-full justify-center lg:w-1/2"
            >
              <div
                hidden={selectedWidth === null}
                className="h-full bg-white"
                style={{ width: selectedWidth ?? 375 }}
              />
            </div>
            <div
              ref={gridRegionRef}
              data-testid="grid-region"
              className="relative min-w-0 pt-14 lg:ml-[50%] lg:w-1/2 lg:pt-0"
            >
              {availableWidth > 0 && availableWidth < 375 && (
                <p className="p-4 text-sm" role="status">
                  At least 375px is needed to preview the grid.
                </p>
              )}
              <div
                hidden={selectedWidth === null}
                className="mx-auto"
                style={{ width: selectedWidth ?? 375 }}
              >
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
                      bricksById: {},
                      activeBrickDrag: null,
                    });
                  }}
                >
                  <RotateCcw aria-hidden />
                </Button>
                <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
                {[375, 640, 1024, 1440].map((width) => (
                  <Button
                    key={width}
                    type="button"
                    variant={selectedWidth === width ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-2 text-xs"
                    aria-label={`${width}px grid width`}
                    aria-pressed={selectedWidth === width}
                    disabled={width > availableWidth}
                    onClick={() => useGridStore.setState({ selectedWidth: width })}
                  >
                    {width}
                  </Button>
                ))}
              </div>
            </div>
          </main>
        </Drawer>
      )}
    </BrickBreakpointProvider>
  );
}
