"use client";

import { Schema } from "effect";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { ArrowLeft, File, Globe, Plus, RectangleHorizontal } from "lucide-react";
import { WallPreviewToolbar } from "@qrk.sh/library/WallPreviewToolbar";

import { useValidatedParams } from "@/hooks/useValidatedParams";

import { ToolbarSeparator } from "./ToolbarSeparator";
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
    <motion.div
      className="[grid-area:1/1]"
      layout
      layoutId="site-bottom-toolbar-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : toolbarPresenceTransition}
    >
      <WallPreviewToolbar
        aria-label="Page controls"
        className="rounded-sm border-border/80 bg-background shadow-md"
      >
        <ToolbarButton
          label="Exit"
          icon={<ArrowLeft className="h-3.5 w-3.5" />}
          tooltip="Exit"
          link={{ to: "/$username", params: { username } }}
          className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
        />

        <ToolbarSeparator />

        <ToolbarButton
          label="Bricks"
          icon={<Plus className="h-3.5 w-3.5" />}
          link={{ to: "/$username/site/$siteId/page/$pageId/modules", params: hrefParams }}
          className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
        />

        <ToolbarSeparator />

        <ToolbarButton
          label="Set breakpoints"
          icon={<RectangleHorizontal className="h-3.5 w-3.5" />}
          tooltip="Set breakpoints"
          link={{
            to: "/$username/site/$siteId/page/$pageId/breakpoints",
            params: hrefParams,
          }}
          className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
        />

        <ToolbarSeparator />

        <ToolbarButton
          label="Page settings"
          icon={<File className="h-3.5 w-3.5" />}
          tooltip="Page settings"
          link={{
            to: "/$username/site/$siteId/page/$pageId/page-settings",
            params: hrefParams,
          }}
          className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
        />

        <ToolbarSeparator />

        <ToolbarButton
          label="Site settings"
          icon={<Globe className="h-3.5 w-3.5" />}
          tooltip="Site settings"
          link={{
            to: "/$username/site/$siteId/page/$pageId/site-settings",
            params: hrefParams,
          }}
          className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
        />
      </WallPreviewToolbar>
    </motion.div>
  );
}
