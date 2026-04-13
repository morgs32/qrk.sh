"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TileCollectionCarousel } from "./TileCollectionCarousel";
import { TileDrawerTileDetail } from "./TileDrawerTileDetail";
import { collectionsHash } from "./tiles/collectionsHash";

export function TileDrawer(props: {
  open: boolean;
  tileId: string | null;
  onBackToCatalog: () => void;
  onClose: () => void;
}) {
  const { open, tileId, onBackToCatalog, onClose } = props;
  const [query, setQuery] = useState("");
  const showTileDetail = Boolean(open && tileId);

  const filteredCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = Object.values(collectionsHash);
    if (!q) {
      return all;
    }
    return all.filter(
      (collection) =>
        collection.collectionName.toLowerCase().includes(q) ||
        collection.collectionLabel.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div
      role="dialog"
      aria-label="Workspace drawer"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed top-16 bottom-0 left-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-r border-border bg-background shadow-[4px_0_20px_-6px_rgb(0_0_0/0.07),2px_0_10px_-4px_rgb(0_0_0/0.04)] transition-transform duration-300 ease-out md:w-1/2 dark:shadow-[4px_0_20px_-6px_rgb(0_0_0/0.2),2px_0_10px_-4px_rgb(0_0_0/0.1)]",
        open ? "translate-x-0" : "-translate-x-full pointer-events-none select-none",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {showTileDetail && tileId ? (
          <TileDrawerTileDetail tileId={tileId} onBack={onBackToCatalog} onClose={onClose} />
        ) : (
          <>
            <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Tiles</div>
                  <div className="text-xs text-muted-foreground">
                    Browse tiles by collection. Drag-and-drop from the drawer will return with
                    native HTML5 DnD.
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer"
                  aria-label="Close drawer"
                  onClick={onClose}
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
                  onClick={() => setQuery("")}
                  disabled={query.trim().length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <div aria-label="Tile collections" className="flex flex-col pb-8">
                {filteredCollections.length === 0 ? (
                  <div className="mx-6 rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                    No tiles match “{query.trim()}”.
                  </div>
                ) : (
                  filteredCollections.map((collection) => (
                    <div key={collection.collectionName} className="min-w-0">
                      <TileCollectionCarousel collection={collection} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
