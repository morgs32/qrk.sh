'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { PortfolioGrid } from '@/components/home/PortfolioGrid';
import { homepageTiles } from './tiles';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerClose, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { sizeToDimensions, usePortfolioGridStore } from '@/lib/stores/portfolio-grid-store';

type WorkItem = {
  name: string;
  category: string;
};

type HomeShellProps = {
  workItems: WorkItem[];
};

export function HomeShell({ workItems }: HomeShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const setDraggingTypeId = usePortfolioGridStore((state) => state.setDraggingTypeId);
  type HomepageTile = (typeof homepageTiles)[number];

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
      <div className="flex h-screen pt-16">
        <div className="fixed left-0 top-16 flex h-[calc(100vh-4rem)] w-1/2 flex-col justify-center bg-background px-6">
          <h1 className="text-[clamp(4rem,15vw,10rem)] font-bold leading-none tracking-tight">
            Hello
          </h1>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
            We are a Sydney-based design studio specialising in branding and
            wayfinding.
          </p>
        </div>

        <div className="ml-auto h-[calc(100vh-4rem)] w-1/2 min-w-0 overflow-y-auto">
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

      <Drawer
        direction="left"
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        modal={false}
        dismissible={false}
        noBodyStyles
        disablePreventScroll
      >
        <DrawerContent
          aria-label="Workspace drawer"
          data-vaul-no-drag
          data-vaul="no-drag"
          overlayClassName="hidden"
          className="top-16 bottom-0 left-0 z-40 h-[calc(100vh-4rem)] w-full border-r border-border bg-background/95 p-6 shadow-2xl backdrop-blur-sm md:w-1/2"
        >
          <div className="flex h-full w-full flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Tiles</div>
                <div className="text-xs text-muted-foreground">
                  Drag a tile onto the grid to add a new instance.
                </div>
              </div>

              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close drawer">
                  <X className="size-4" />
                </Button>
              </DrawerClose>
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

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {filteredCollections.length === 0 ? (
                <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                  No tiles match “{query.trim()}”.
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {filteredCollections.map((collection) => (
                    <div key={collection.collectionId} className="space-y-2">
                      <div className="text-sm font-semibold">{collection.label}</div>
                      <div className="flex flex-col gap-2">
                        {collection.tiles.map((tile) => {
                          const dims = sizeToDimensions(tile.size);

                          return (
                            <div
                              key={tile.typeId}
                              className="group cursor-grab select-none rounded-md px-2 py-3 hover:bg-muted/40 active:cursor-grabbing"
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData(
                                  'application/x-qrk-tile-type',
                                  tile.typeId
                                );
                                event.dataTransfer.setData('text/plain', tile.typeId);
                                event.dataTransfer.setData('text', tile.typeId);
                                event.dataTransfer.effectAllowed = 'copy';
                                setDraggingTypeId(tile.typeId);
                              }}
                              onDragEnd={() => setDraggingTypeId(null)}
                              aria-label={`Drag ${collection.label} ${dims.w}×${dims.h}`}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="mt-1">
                                    <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                      {dims.w}×{dims.h}
                                    </span>
                                  </div>
                                </div>

                                <div className="shrink-0">
                                  <div className="size-20 overflow-hidden">
                                    <div className="h-full w-full scale-[0.72] origin-center transition-transform group-hover:scale-[0.76]">
                                      <tile.Component />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

