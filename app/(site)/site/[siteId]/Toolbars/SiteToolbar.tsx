"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import {
  File,
  Globe,
  Plus,
  RectangleHorizontal,
  Type,
} from "lucide-react";
import { useParams } from "next/navigation";
import {
  brickCatalogPattern,
  breakpointsPattern,
  composePattern,
  pageSettingsPattern,
  siteSettingsPattern,
} from "../routePatterns";
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

            <ToolbarButton
              label="Set breakpoints"
              icon={<RectangleHorizontal className="h-3.5 w-3.5" />}
              tooltip="Set breakpoints"
              href={breakpointsPattern.href(hrefParams)}
              className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
            />

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
