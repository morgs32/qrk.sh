"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { Cog, CogIcon, Plus, RectangleHorizontal, Type } from "lucide-react";
import { useParams } from "next/navigation";
import { brickCatalogPattern, composePattern } from "../routePatterns";
import { BottomToolbar, ToolbarButton, ToolbarSeparator } from "./BottomToolbar";

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
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={toolbarPresenceTransition}
      className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4"
    >
      <div className="pointer-events-auto">
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
        </BottomToolbar>
      </div>
    </motion.div>
  );
}
