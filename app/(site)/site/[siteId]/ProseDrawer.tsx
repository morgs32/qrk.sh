"use client";

import { X } from "lucide-react";

import { ProseDrawerTiptap } from "./ProseDrawerTiptap";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {

  return (
    <div
      role="dialog"
      aria-label="Text editor"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "fixed top-16 right-0 bottom-0 z-40 flex h-[calc(100vh-4rem)] w-full min-h-0 flex-col border-l border-border bg-background shadow-[-4px_0_20px_-6px_rgb(0_0_0/0.07),-2px_0_10px_-4px_rgb(0_0_0/0.04)] transition-transform duration-300 ease-out md:w-1/2 dark:shadow-[-4px_0_20px_-6px_rgb(0_0_0/0.2),-2px_0_10px_-4px_rgb(0_0_0/0.1)]",
        open ? "translate-x-0" : "pointer-events-none translate-x-full select-none",
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold">Text</div>
              <div className="text-xs text-muted-foreground">
                Rich text blocks with formatting. Content is kept in the prose drawer store.
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
            <ProseDrawerTiptap />
          </div>
        </div>
      </div>
    </div>
  );
}
