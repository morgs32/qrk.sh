'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { PortfolioGrid } from '@/components/home/PortfolioGrid';
import { homepageTiles } from './tiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sizeToDimensions, usePortfolioGridStore } from '@/lib/stores/portfolio-grid-store';

type WorkItem = {
  name: string;
  category: string;
};

type HomeShellProps = {
  workItems: WorkItem[];
};

const DRAWER_PREVIEW_UNIT_PX = 96;

/** Invisible drag image when we can’t snapshot the node (grid not measured yet). */
let transparentDragCanvas: HTMLCanvasElement | null = null;
function getTransparentDragCanvas(): HTMLCanvasElement {
  if (!transparentDragCanvas) {
    transparentDragCanvas = document.createElement('canvas');
    transparentDragCanvas.width = 1;
    transparentDragCanvas.height = 1;
  }
  return transparentDragCanvas;
}

type DrawerTileDragSession = {
  sourceElement: HTMLElement;
  slot: HTMLElement | null;
};

function cleanupDrawerTileDrag(session: DrawerTileDragSession) {
  session.sourceElement.style.removeProperty('opacity');
  session.sourceElement.style.removeProperty('transform');
  session.sourceElement.style.removeProperty('transform-origin');
  session.sourceElement.style.removeProperty('transition');
  session.sourceElement.style.removeProperty('overflow');
  if (session.slot) {
    session.slot.removeAttribute('data-dragging');
  }
}

export function HomeShell({ workItems }: HomeShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const setDraggingTypeId = usePortfolioGridStore((state) => state.setDraggingTypeId);
  type HomepageTile = (typeof homepageTiles)[number];
  const isDrawerOpenRef = useRef(isDrawerOpen);
  const drawerDragSessionRef = useRef<DrawerTileDragSession | null>(null);

  useEffect(() => {
    isDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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

      // If the event originated in the right-hand scroll column, prevent downstream
      // scroll-lock handlers (e.g. Radix RemoveScroll) from seeing it.
      const rightColumn = document.querySelector<HTMLElement>('[data-home-right-scroll]');
      if (rightColumn && rightColumn.contains(target)) {
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener('wheel', allowBackgroundScroll, { capture: true });
    window.addEventListener('touchmove', allowBackgroundScroll, { capture: true });

    return () => {
      window.removeEventListener('wheel', allowBackgroundScroll, { capture: true } as never);
      window.removeEventListener('touchmove', allowBackgroundScroll, { capture: true } as never);
    };
  }, []);

  const filteredCollections = (() => {
    const q = query.trim().toLowerCase();
    const collections = new Map<
      string,
      { collectionId: string; label: string; tiles: HomepageTile[] }
    >();

    homepageTiles.forEach((tile) => {
      const entry =
        collections.get(tile.collectionId) ??
        {
          collectionId: tile.collectionId,
          label: tile.collectionLabel,
          tiles: []
        };

      entry.tiles.push(tile);
      collections.set(tile.collectionId, entry);
    });

    const ordered = Array.from(collections.values()).map((collection) => ({
      ...collection,
      tiles: [...collection.tiles].sort((a, b) => {
        const order = (size: string) => (size === '1x1' ? 0 : size === '2x2' ? 1 : 2);
        return order(a.size) - order(b.size);
      })
    }));

    if (!q) {
      return ordered;
    }

    return ordered
      .map((collection) => {
        const matchesCollection =
          collection.label.toLowerCase().includes(q) ||
          collection.collectionId.toLowerCase().includes(q);
        const matchingTiles = collection.tiles.filter(
          (tile) => tile.typeId.toLowerCase().includes(q)
        );

        return matchesCollection
          ? collection
          : { ...collection, tiles: matchingTiles };
      })
      .filter((collection) => collection.tiles.length > 0);
  })();

  return (
    <>
      <div className="h-screen pt-16">
        <div className="fixed left-0 top-16 flex h-[calc(100vh-4rem)] w-1/2 flex-col justify-center bg-background px-6">
          <h1 className="text-[clamp(4rem,15vw,10rem)] font-bold leading-none tracking-tight">
            Hello
          </h1>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
            We are a Sydney-based design studio specialising in branding and
            wayfinding.
          </p>
        </div>

        <div
          data-home-right-scroll
          className="fixed right-0 top-16 h-[calc(100vh-4rem)] w-1/2 min-w-0 overflow-y-auto"
        >
          <PortfolioGrid />

          <div className="bg-[#F0EDE8] px-6 py-16">
            <h2 className="mb-12 text-6xl font-bold">Work</h2>
            <div className="space-y-4">
              {workItems.map((item, index) => (
                <Link
                  key={index}
                  href="#"
                  className="block transition-opacity hover:opacity-70"
                >
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.category}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30">
        <div className="flex justify-end px-6 md:ml-[50%]">
          <Button
            type="button"
            size="icon"
            onClick={() => setIsDrawerOpen(true)}
            className="pointer-events-auto size-12 rounded-full shadow-lg"
            aria-label="Open drawer"
          >
            <Plus className="size-5" />
          </Button>
        </div>
      </div>

      {isDrawerOpen ? (
        <div
          role="dialog"
          aria-label="Workspace drawer"
          className="fixed top-16 bottom-0 left-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-r border-border bg-background/95 shadow-2xl backdrop-blur-sm md:w-1/2"
        >
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="sticky top-0 z-10 flex flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pt-6 pb-5 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Tiles</div>
                  <div className="text-xs text-muted-foreground">
                    Drag a tile onto the grid to add a new instance.
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close drawer"
                  onClick={() => setIsDrawerOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search tiles…"
                    aria-label="Search tiles"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setQuery('')}
                  disabled={query.trim().length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-6 px-6 pb-8 pt-4">
              {filteredCollections.length === 0 ? (
                <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                  No tiles match “{query.trim()}”.
                </div>
              ) : (
                filteredCollections.map((collection) => (
                  <div key={collection.collectionId} className="min-w-0 space-y-2">
                    <div className="text-sm font-semibold">{collection.label}</div>
                    <div className="-mx-1 flex flex-row flex-nowrap gap-3 overflow-x-auto overscroll-x-contain px-1 pb-1">
                      {collection.tiles.map((tile) => {
                          const dims = sizeToDimensions(tile.size);
                          const previewWidth = dims.w * DRAWER_PREVIEW_UNIT_PX;
                          const previewHeight = dims.h * DRAWER_PREVIEW_UNIT_PX;

                          return (
                            <div
                              key={tile.typeId}
                              className="flex shrink-0 flex-col items-start gap-2"
                            >
                              <div
                                data-drawer-tile-slot
                                style={{
                                  width: previewWidth,
                                  height: previewHeight
                                }}
                                className="shrink-0 rounded-md bg-muted/20 ring-1 ring-transparent transition-[background-color,box-shadow] data-[dragging=true]:bg-muted/35 data-[dragging=true]:ring-border/50"
                              >
                                <div
                                  data-drawer-tile-type={tile.typeId}
                                  className="h-full w-full cursor-grab select-none overflow-hidden rounded-md outline-none hover:bg-muted/40 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
                                  draggable
                                  onDragStart={(event) => {
                                    const prev = drawerDragSessionRef.current;
                                    if (prev) {
                                      cleanupDrawerTileDrag(prev);
                                      drawerDragSessionRef.current = null;
                                    }

                                    setDraggingTypeId(tile.typeId);
                                    event.dataTransfer.setData(
                                      'application/x-qrk-tile-type',
                                      tile.typeId
                                    );
                                    event.dataTransfer.setData('text/plain', tile.typeId);
                                    event.dataTransfer.setData('text', tile.typeId);
                                    event.dataTransfer.effectAllowed = 'copy';

                                    const sourceEl = event.currentTarget as HTMLElement;
                                    const slot = sourceEl.closest(
                                      '[data-drawer-tile-slot]'
                                    ) as HTMLElement | null;

                                    const cellPx =
                                      usePortfolioGridStore.getState().gridCellHeightPx;

                                    if (cellPx != null && cellPx > 0) {
                                      const ghostW = dims.w * cellPx;
                                      const ghostH = dims.h * cellPx;
                                      const scaleX = ghostW / previewWidth;
                                      const scaleY = ghostH / previewHeight;

                                      sourceEl.style.transition = 'none';
                                      sourceEl.style.overflow = 'visible';
                                      sourceEl.style.transformOrigin = 'center center';
                                      sourceEl.style.transform = `scale(${scaleX}, ${scaleY})`;
                                      void sourceEl.offsetHeight;

                                      const painted = sourceEl.getBoundingClientRect();
                                      const offsetX = Math.round(
                                        Math.min(
                                          Math.max(event.clientX - painted.left, 0),
                                          painted.width
                                        )
                                      );
                                      const offsetY = Math.round(
                                        Math.min(
                                          Math.max(event.clientY - painted.top, 0),
                                          painted.height
                                        )
                                      );

                                      event.dataTransfer.setDragImage(
                                        sourceEl,
                                        offsetX,
                                        offsetY
                                      );

                                      sourceEl.style.removeProperty('transform');
                                      sourceEl.style.removeProperty('transform-origin');
                                      sourceEl.style.removeProperty('transition');
                                      sourceEl.style.removeProperty('overflow');
                                      sourceEl.style.opacity = '0';
                                      slot?.setAttribute('data-dragging', 'true');

                                      drawerDragSessionRef.current = {
                                        sourceElement: sourceEl,
                                        slot
                                      };
                                    } else {
                                      event.dataTransfer.setDragImage(
                                        getTransparentDragCanvas(),
                                        0,
                                        0
                                      );
                                    }
                                  }}
                                  onDragEnd={() => {
                                    setDraggingTypeId(null);
                                    const session = drawerDragSessionRef.current;
                                    drawerDragSessionRef.current = null;
                                    if (session) {
                                      cleanupDrawerTileDrag(session);
                                    }
                                  }}
                                  aria-label={`Drag ${collection.label} ${dims.w}×${dims.h}`}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <div className="h-full w-full">
                                    <tile.Component />
                                  </div>
                                </div>
                              </div>
                              <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {dims.w}×{dims.h}
                              </span>
                            </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

