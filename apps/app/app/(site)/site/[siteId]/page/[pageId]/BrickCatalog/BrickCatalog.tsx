"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { pagePattern } from "../../../routePatterns";

export function BrickCatalog() {
  const params = useParams<{ siteId: string; pageId: string }>();
  const router = useRouter();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Bricks</div>
            <div className="text-xs text-muted-foreground">
              Browse bricks by collection. Drag-and-drop from the drawer will return with native
              HTML5 DnD.
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            aria-label="Close drawer"
            onClick={() => router.push(pagePattern.href({ ...params }))}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div aria-label="Brick collections" className="min-h-0 flex-1" />
    </div>
  );
}
