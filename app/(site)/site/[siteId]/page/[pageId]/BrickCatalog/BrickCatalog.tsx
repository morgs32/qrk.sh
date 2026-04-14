"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrickCollectionCarousel } from "../BrickCollectionCarousel/BrickCollectionCarousel";
import { BrickDetail } from "../BrickDetail/BrickDetail";
import { collectionsHash } from "@/components/home/bricks/collectionsHash";

export function BrickCatalog(props: {
  brickId: string | null;
  onBackToCatalog: () => void;
  onClose: () => void;
}) {
  const { brickId, onBackToCatalog, onClose } = props;
  const [query, setQuery] = useState("");
  const showBrickDetail = Boolean(brickId);

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {showBrickDetail && brickId ? (
        <BrickDetail brickId={brickId} onBack={onBackToCatalog} onClose={onClose} />
      ) : (
        <>
          <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Bricks</div>
                <div className="text-xs text-muted-foreground">
                  Browse bricks by collection. Drag-and-drop from the drawer will return with
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
                  placeholder="Search bricks…"
                  aria-label="Search bricks"
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
            <div aria-label="Brick collections" className="flex flex-col pb-8">
              {filteredCollections.length === 0 ? (
                <div className="mx-6 rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                  No bricks match “{query.trim()}”.
                </div>
              ) : (
                filteredCollections.map((collection) => (
                  <div key={collection.collectionName} className="min-w-0">
                    <BrickCollectionCarousel collection={collection} />
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
