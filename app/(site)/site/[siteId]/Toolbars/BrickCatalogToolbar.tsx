"use client";

import { X, ZoomOut } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { pagePattern } from "../routePatterns";

import { BottomToolbar, ToolbarButton, ToolbarSeparator } from "./BottomToolbar";

/** Figma: https://www.figma.com/design/x1KYuaPaEo89CE715oUD4I/qrk.sh?node-id=46-459 */
export function BrickCatalogToolbar() {
  const params = useParams<{ siteId: string; pageId: string }>();
  const router = useRouter();

  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4">
      <div className="pointer-events-auto" role="toolbar" aria-label="Brick catalog">
        <BottomToolbar className="rounded-full border-border/80 bg-background px-1.5 py-1 shadow-md">
          <ToolbarButton
            label="Zoom out"
            icon={<ZoomOut className="h-3.5 w-3.5" strokeWidth={2} />}
            onClick={() => {}}
            className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
          />

          <ToolbarSeparator />

          <ToolbarButton
            tooltip="Close"
            aria-label="Close"
            onClick={() => router.push(pagePattern.href({ ...params }))}
            className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </ToolbarButton>
        </BottomToolbar>
      </div>
    </div>
  );
}
