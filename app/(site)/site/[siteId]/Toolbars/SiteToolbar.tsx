"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { File, Globe, Plus, RectangleHorizontal, Type } from "lucide-react";
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

const BREAKPOINT_ROWS = [
  { prefix: "sm", minWidth: "640px", typicalDevice: "large phones / small tablets" },
  { prefix: "md", minWidth: "768px", typicalDevice: "tablets" },
  { prefix: "lg", minWidth: "1024px", typicalDevice: "small laptops" },
  { prefix: "xl", minWidth: "1280px", typicalDevice: "desktops" },
  { prefix: "2xl", minWidth: "1536px", typicalDevice: "large screens" },
] as const;

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
                  {BREAKPOINT_ROWS.map((row) => (
                    <div
                      key={row.prefix}
                      className="flex min-w-0 items-center justify-between gap-4"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default shrink-0 text-left">{row.prefix}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top">{row.typicalDevice}</TooltipContent>
                      </Tooltip>
                      <span className="shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                        {row.minWidth}
                      </span>
                    </div>
                  ))}
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
