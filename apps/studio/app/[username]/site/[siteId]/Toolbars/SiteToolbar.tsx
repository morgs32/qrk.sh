"use client";

import { Schema } from "effect";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { ArrowLeft, File, Globe, Plus, RectangleHorizontal } from "lucide-react";

import { useValidatedParams } from "@/hooks/useValidatedParams";

import { BottomToolbar, ToolbarSeparator } from "./BottomToolbar";
import { ToolbarButton } from "./ToolbarButton";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

const toolbarPresenceTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

export function SiteToolbar() {
  const reducedMotion = useReducedMotion();
  const params = useValidatedParams(ParamsSchema);
  const username = params.username;
  const siteId = params.siteId;
  const pageId = params.pageId;

  const hrefParams = useMemo(() => ({ username, siteId, pageId }), [username, siteId, pageId]);

  return (
    <div className="pointer-events-none fixed bottom-6 left-0 right-0 z-30 flex justify-center px-4">
      <div className="pointer-events-auto">
        <motion.div
          layout
          layoutId="site-bottom-toolbar-shell"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : toolbarPresenceTransition}
        >
          <BottomToolbar>
            <>
              <ToolbarButton
                label="Exit"
                icon={<ArrowLeft className="h-3.5 w-3.5" />}
                tooltip="Exit"
                href={`/${encodeURIComponent(username)}`}
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              />

              <ToolbarSeparator />

              <ToolbarButton
                label="Add bricks"
                icon={<Plus className="h-3.5 w-3.5" />}
                href={`/${encodeURIComponent(hrefParams.username)}/site/${encodeURIComponent(hrefParams.siteId)}/page/${encodeURIComponent(hrefParams.pageId)}/modules`}
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              />

              <ToolbarSeparator />

              <ToolbarButton
                label="Set breakpoints"
                icon={<RectangleHorizontal className="h-3.5 w-3.5" />}
                tooltip="Set breakpoints"
                href={`/${encodeURIComponent(hrefParams.username)}/site/${encodeURIComponent(hrefParams.siteId)}/page/${encodeURIComponent(hrefParams.pageId)}/breakpoints`}
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              />

              <ToolbarSeparator />

              <ToolbarButton
                label="Page settings"
                icon={<File className="h-3.5 w-3.5" />}
                tooltip="Page settings"
                href={`/${encodeURIComponent(hrefParams.username)}/site/${encodeURIComponent(hrefParams.siteId)}/page/${encodeURIComponent(hrefParams.pageId)}/page-settings`}
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              />

              <ToolbarSeparator />

              <ToolbarButton
                label="Site settings"
                icon={<Globe className="h-3.5 w-3.5" />}
                tooltip="Site settings"
                href={`/${encodeURIComponent(hrefParams.username)}/site/${encodeURIComponent(hrefParams.siteId)}/page/${encodeURIComponent(hrefParams.pageId)}/site-settings`}
                className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
              />
            </>
          </BottomToolbar>
        </motion.div>
      </div>
    </div>
  );
}
