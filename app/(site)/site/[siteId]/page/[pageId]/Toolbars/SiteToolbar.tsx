"use client";

import { useMemo } from "react";
import { Cog, CogIcon, Minus, Plus, RectangleHorizontal, Type, X } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { brickCatalogPattern, pagePattern } from "../../../routePatterns";
import { BottomToolbar, ToolbarButton, ToolbarSeparator } from "./BottomToolbar";
import { cn } from "@/lib/utils";

export function SiteToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;

  const { basePath, isBrickCatalog, isCompose, bricksToolbarHref, isDefault } = useMemo(() => {
    const basePath = `/site/${siteId}/page/${pageId}`;
    const isBrickCatalog =
      pathname === `${basePath}/brick-catalog` || pathname.startsWith(`${basePath}/brick/`);
    const isCompose = pathname === `${basePath}/compose`;
    const bricksToolbarHref = isBrickCatalog
      ? pagePattern.href({ siteId, pageId })
      : brickCatalogPattern.href({ siteId, pageId });

    return {
      basePath,
      isBrickCatalog,
      isCompose,
      bricksToolbarHref,
      isDefault: !isCompose && !isBrickCatalog,
    };
  }, [pathname, siteId, pageId]);

  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4">
      <div className="pointer-events-auto">
        <BottomToolbar>
          <ToolbarButton
            tooltip={isCompose ? "Close compose" : "Compose"}
            aria-label={isCompose ? "Close compose" : "Compose"}
            onClick={() => {
              router.push(isCompose ? basePath : `${basePath}/compose`);
            }}
            className={cn(
              "h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground",
              isCompose && "text-destructive hover:text-destructive",
            )}
          >
            {isCompose ? (
              <X className="!size-4 shrink-0" strokeWidth={2} aria-hidden />
            ) : (
              <Type className="h-3.5 w-3.5" />
            )}
            {isCompose ? "Close" : "Compose"}
          </ToolbarButton>

          <ToolbarSeparator />

          <ToolbarButton
            asChild
            tooltip={isBrickCatalog ? "Close bricks drawer" : "Add bricks"}
            aria-label={isBrickCatalog ? "Close bricks drawer" : "Add bricks"}
            className={cn(
              "h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground",
              isBrickCatalog && "text-destructive hover:text-destructive",
            )}
          >
            <Link href={bricksToolbarHref}>
              {isBrickCatalog ? (
                <X className="!size-4 shrink-0" strokeWidth={2} aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {isBrickCatalog ? "Close" : "Add bricks"}
            </Link>
          </ToolbarButton>

          {isDefault && (
            <>
              <ToolbarSeparator />

              <ToolbarButton
                tooltip="Edit header"
                aria-label="Edit header"
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              >
                <Minus className="h-3.5 w-3.5" />
                Edit header
              </ToolbarButton>

              <ToolbarSeparator />

              <ToolbarButton
                tooltip="Set breakpoints"
                aria-label="Set breakpoints"
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              >
                <RectangleHorizontal className="h-3.5 w-3.5" />
                Set breakpoints
              </ToolbarButton>

              <ToolbarSeparator />

              <ToolbarButton
                tooltip="Page settings"
                aria-label="Page settings"
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              >
                <Cog className="h-3.5 w-3.5" />
                Page settings
              </ToolbarButton>

              <ToolbarSeparator />

              <ToolbarButton
                tooltip="Site settings"
                aria-label="Site settings"
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              >
                <CogIcon className="h-3.5 w-3.5" />
                Site settings
              </ToolbarButton>
            </>
          )}
        </BottomToolbar>
      </div>
    </div>
  );
}
