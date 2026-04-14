"use client";

import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TileDrawerTileDetail(props: {
  tileId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const { tileId, onBack, onClose } = props;

  return (
    <>
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-pointer gap-2 px-2"
            aria-label="Back to tile catalog"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

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
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-6">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="tile-drawer-tile-detail-title">
          {tileId}
        </h1>
      </div>
    </>
  );
}
