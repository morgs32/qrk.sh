import { BrickBreakpointProvider } from "../../components/brick/BrickBreakpointProvider";
import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { RotateCcw, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "../../components/ui/drawer";

import { BREAKPOINTS } from "../../breakpoints";
import { SandboxGrid } from "../SandboxGrid";
import { useGridStore } from "../useGridStore";

export default function SandboxLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const persistedWidth = useGridStore((state) => state.selectedWidth);
  const [drawerOpen, setDrawerOpen] = useState(
    () => location.pathname !== "/" || location.search.length > 0,
  );
  const [drawerOpenForLocationKey, setDrawerOpenForLocationKey] = useState(location.key);
  if (location.key !== drawerOpenForLocationKey) {
    setDrawerOpenForLocationKey(location.key);
    // Nested /modules routes render inside the drawer Outlet; open it so deep links are visible.
    if (location.pathname !== "/" || location.search.length > 0) {
      setDrawerOpen(true);
    }
  }

  const groups = (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <div data-vaul-no-drag className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-zinc-100">
        <Outlet />
      </div>
    </div>
  );

  return (
    <BrickBreakpointProvider persistedWidth={persistedWidth}>
      {({ regionRef, availableWidth, selectedWidth }) => (
        <Drawer
          open={drawerOpen}
          modal={false}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (open && location.pathname === "/") {
              navigate("/modules");
            }
          }}
        >
          <main className="min-h-screen">
            <DrawerContent
              aria-describedby={undefined}
              className="not-typeset inset-x-0 bottom-0 z-60 h-[50dvh] rounded-none border-t border-zinc-300 bg-white p-0"
              onInteractOutside={(event) => event.preventDefault()}
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <DrawerTitle className="sr-only not-typeset m-0">Bricks</DrawerTitle>
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-4 py-2.5">
                <Link to="/modules" className="font-semibold">
                  Bricks
                </Link>
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer"
                    aria-label="Close drawer"
                  >
                    <X aria-hidden />
                  </Button>
                </DrawerClose>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">{groups}</div>
            </DrawerContent>
            <div
              ref={regionRef}
              data-testid="grid-region"
              className="relative min-w-0 pt-14"
            >
              {availableWidth > 0 && availableWidth < BREAKPOINTS[0].previewWidth && (
                <p className="p-4" role="status">
                  At least {BREAKPOINTS[0].previewWidth}px is needed to preview the grid.
                </p>
              )}
              <div
                hidden={selectedWidth === null}
                className="mx-auto"
                style={{ width: selectedWidth ?? BREAKPOINTS[0].previewWidth }}
              >
                <SandboxGrid />
              </div>
            </div>
            <div className="pointer-events-none fixed inset-x-0 top-3 z-80 flex justify-center px-2 lg:bottom-6 lg:top-auto">
              <div
                role="toolbar"
                aria-label="Grid controls"
                className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center rounded-sm border border-border/80 bg-background px-1 py-1 shadow-md"
              >
                <DrawerTrigger asChild>
                  <Button
                    type="button"
                    variant={drawerOpen ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-2"
                    aria-expanded={drawerOpen}
                  >
                    Bricks
                  </Button>
                </DrawerTrigger>
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
                {BREAKPOINTS.map((row) => (
                  <Button
                    key={row.id}
                    type="button"
                    variant={selectedWidth === row.previewWidth ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 px-2"
                    aria-label={`${row.previewWidth}px grid width`}
                    aria-pressed={selectedWidth === row.previewWidth}
                    disabled={row.previewWidth > availableWidth}
                    onClick={() => useGridStore.setState({ selectedWidth: row.previewWidth })}
                  >
                    {row.previewWidth}
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
