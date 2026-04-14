"use client";

import { X } from "lucide-react";

import { ComposeDrawerTiptap } from "./ComposeDrawerTiptap";
import { Button } from "@/components/ui/button";

export function Compose(props: { onClose: () => void }) {
  const { onClose } = props;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Compose</div>
            <div className="text-xs text-muted-foreground">
              Rich text blocks with formatting. Content is kept in the compose store.
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
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="px-6 py-6 pb-8">
          <ComposeDrawerTiptap />
        </div>
      </div>
    </div>
  );
}
