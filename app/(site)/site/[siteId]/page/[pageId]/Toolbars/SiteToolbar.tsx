"use client";

import { useMemo } from "react";
import { Cog, CogIcon, Minus, Plus, RectangleHorizontal, Type, X } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import {
  brickCatalogPattern,
  brickDetailPattern,
  composePattern,
  pathnameToMatchUrl,
} from "../../../routePatterns";
import { BottomToolbar, ToolbarButton, ToolbarSeparator } from "./BottomToolbar";

const bricksMatchPattern = [brickCatalogPattern, brickDetailPattern] as const;

export function SiteToolbar() {
  const pathname = usePathname();
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;

  const hrefParams = useMemo(() => ({ siteId, pageId }), [siteId, pageId]);

  const isDefault = useMemo(() => {
    const url = pathnameToMatchUrl(pathname);
    return (
      !composePattern.test(url) &&
      !brickCatalogPattern.test(url) &&
      !brickDetailPattern.test(url)
    );
  }, [pathname]);

  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4">
      <div className="pointer-events-auto">
        <BottomToolbar>
          <ToolbarButton
            kind="route"
            matchPattern={composePattern}
            hrefParams={hrefParams}
            activeLabel="Close"
            inactiveLabel="Compose"
            activeIcon={<X className="!size-4 shrink-0" strokeWidth={2} aria-hidden />}
            inactiveIcon={<Type className="h-3.5 w-3.5" />}
            activeDestructive
            className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
          />

          <ToolbarSeparator />

          <ToolbarButton
            kind="route"
            matchPattern={bricksMatchPattern}
            hrefParams={hrefParams}
            activeLabel="Close"
            inactiveLabel="Add bricks"
            activeIcon={<X className="!size-4 shrink-0" strokeWidth={2} aria-hidden />}
            inactiveIcon={<Plus className="h-3.5 w-3.5" />}
            activeDestructive
            className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
          />

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
