"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  File,
  Globe,
  Laptop,
  Monitor,
  Plus,
  RectangleHorizontal,
  Smartphone,
  Tablet,
  Type,
} from "lucide-react";
import { useParams } from "next/navigation";
import {
  brickCatalogPattern,
  composePattern,
  pageSettingsPattern,
  siteSettingsPattern,
} from "../routePatterns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BottomToolbar, ToolbarButton, ToolbarSeparator } from "./BottomToolbar";

const BREAKPOINT_ROWS: {
  prefix: string;
  minWidth: string;
  typicalDevice: string;
  Icon?: LucideIcon;
}[] = [
  {
    prefix: "sm",
    minWidth: "640px",
    typicalDevice: "large phones / small tablets",
    Icon: Smartphone,
  },
  { prefix: "md", minWidth: "768px", typicalDevice: "tablets", Icon: Tablet },
  { prefix: "lg", minWidth: "1024px", typicalDevice: "small laptops", Icon: Laptop },
  { prefix: "xl", minWidth: "1280px", typicalDevice: "desktops", Icon: Monitor },
  { prefix: "2xl", minWidth: "1536px", typicalDevice: "large screens", Icon: Monitor },
];

const toolbarPresenceTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

export function SiteToolbar() {
  const params = useParams<{ siteId: string; pageId: string }>();
  const siteId = params.siteId;
  const pageId = params.pageId;

  const hrefParams = useMemo(() => ({ siteId, pageId }), [siteId, pageId]);

  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4">
      <div className="pointer-events-auto">
        <motion.div
          layout
          layoutId="site-bottom-toolbar-shell"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={toolbarPresenceTransition}
        >
          <BottomToolbar>
            <ToolbarButton
              label="Compose"
              icon={<Type className="h-3.5 w-3.5" />}
              href={composePattern.href(hrefParams)}
              className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
            />

            <ToolbarSeparator />

            <ToolbarButton
              label="Add bricks"
              icon={<Plus className="h-3.5 w-3.5" />}
              href={brickCatalogPattern.href(hrefParams)}
              className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
            />

            <ToolbarSeparator />

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Set breakpoints"
                  className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
                >
                  <RectangleHorizontal className="h-3.5 w-3.5" />
                  Set breakpoints
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-72 p-3">
                <div className="flex flex-col gap-1.5 text-sm">
                  {BREAKPOINT_ROWS.map((row) => {
                    const Icon = row.Icon;
                    return (
                      <div
                        key={row.prefix}
                        className="flex min-w-0 items-center justify-between gap-4"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label={row.typicalDevice}
                                className="inline-flex shrink-0 cursor-default items-center justify-center rounded-sm border-0 bg-transparent p-0.5 text-muted-foreground outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {Icon && (
                                  <Icon
                                    className="size-3.5 shrink-0"
                                    strokeWidth={2}
                                    aria-hidden
                                  />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{row.typicalDevice}</TooltipContent>
                          </Tooltip>
                          <span className="shrink-0 text-left">{row.prefix}</span>
                        </div>
                        <span className="shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                          {row.minWidth}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <ToolbarSeparator />

            <ToolbarButton
              label="Page settings"
              icon={<File className="h-3.5 w-3.5" />}
              tooltip="Page settings"
              href={pageSettingsPattern.href(hrefParams)}
              className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
            />

            <ToolbarSeparator />

            <ToolbarButton
              label="Site settings"
              icon={<Globe className="h-3.5 w-3.5" />}
              tooltip="Site settings"
              href={siteSettingsPattern.href(hrefParams)}
              className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
            />
          </BottomToolbar>
        </motion.div>
      </div>
    </div>
  );
}
