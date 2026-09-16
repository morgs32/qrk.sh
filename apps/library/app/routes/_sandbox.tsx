import { useState } from "react";
import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { RotateCcw, X } from "lucide-react";

import { BrickBreakpointProvider } from "../../components/brick/BrickBreakpointProvider";
import { Button } from "../../components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "../../components/ui/drawer";
import { BREAKPOINTS } from "../../breakpoints";
import { modulesHash } from "../../modulesHash";
import { SandboxGrid } from "../SandboxGrid";
import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/_sandbox")({
  component: Layout,
});

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const moduleId = params.moduleId;
  const brickId = params.brickId;
  const moduleLabel = moduleId ? modulesHash[moduleId]?.label : undefined;
  const drawerTitle = moduleLabel !== undefined ? `Bricks / ${moduleLabel}` : "Bricks";
  const persistedWidth = useGridStore((state) => state.selectedWidth);
  const locationKey = `${location.pathname}${location.searchStr}`;
  const [drawerOpen, setDrawerOpen] = useState(
    () => location.pathname !== "/" || location.searchStr.length > 0,
  );
  const [drawerOpenForLocationKey, setDrawerOpenForLocationKey] = useState(locationKey);
  if (locationKey !== drawerOpenForLocationKey) {
    setDrawerOpenForLocationKey(locationKey);
    if (location.pathname !== "/" || location.searchStr.length > 0) {
      setDrawerOpen(true);
    }
  }

  const groups = (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <div
        data-vaul-no-drag
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-zinc-100"
      >
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
              void navigate({ to: "/modules" });
            }
          }}
        >
          <main className="min-h-screen">
            <DrawerContent
              aria-describedby={undefined}
              className="inset-x-0 bottom-0 z-60 h-[50dvh] rounded-none border-t border-zinc-300 bg-white p-0"
              onInteractOutside={(event) => event.preventDefault()}
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <DrawerTitle className="sr-only m-0">{drawerTitle}</DrawerTitle>
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-4 py-2.5">
                <nav aria-label="Drawer breadcrumbs" className="flex min-w-0 items-center gap-2">
                  <Link to="/modules">Bricks</Link>
                  {moduleLabel !== undefined && moduleId !== undefined ? (
                    <>
                      <span aria-hidden className="text-muted-foreground">
                        /
                      </span>
                      {brickId !== undefined ? (
                        <Link
                          to="/modules/$moduleId"
                          params={{ moduleId }}
                          className="truncate"
                        >
                          {moduleLabel}
                        </Link>
                      ) : (
                        <span className="truncate">{moduleLabel}</span>
                      )}
                    </>
                  ) : null}
                </nav>
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
            <div ref={regionRef} data-testid="grid-region" className="relative min-w-0 pt-14">
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
