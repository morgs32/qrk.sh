"use client";

import { Schema } from "effect";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { File, Globe, Plus } from "lucide-react";
import { WallPreviewToolbar } from "./WallPreviewToolbar";
import { useMatches, useSearch } from "@tanstack/react-router";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";

import { useValidatedParams } from "@/hooks/useValidatedParams";

import { ToolbarButton } from "./ToolbarButton";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(Site),
  pageId: Schema.String,
});

const toolbarPresenceTransition = {
  duration: 0.3,
  ease: [0, 0, 0.2, 1] as const,
};

const pageControlClassName =
  "h-7 gap-2 rounded-full px-2 text-sm font-normal text-muted-foreground hover:text-foreground aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-sm";

export function SiteToolbar() {
  const reducedMotion = useReducedMotion();
  const params = useValidatedParams(ParamsSchema);
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const isEditingBrick = useMatches({
    select: (matches) =>
      matches.at(-1)?.routeId === "/$username/site/$siteId/page/$pageId/_sidebar/brick/$brickId",
  });
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
        navigation
        aria-label="Page controls"
        className="rounded-full border-0 bg-muted inset-ring inset-ring-border/80"
      >
        <ToolbarButton
          label="Bricks"
          aria-current={isEditingBrick ? "page" : undefined}
          icon={<Plus className="size-4" />}
          link={{
            to: "/$username/site/$siteId/page/$pageId/modules",
            params: hrefParams,
            search,
          }}
          className={pageControlClassName}
        />

        <ToolbarButton
          label="Page settings"
          icon={<File className="size-4" />}
          link={{
            to: "/$username/site/$siteId/page/$pageId/page-settings",
            params: hrefParams,
            search,
          }}
          className={pageControlClassName}
        />

        <ToolbarButton
          label="Site settings"
          icon={<Globe className="size-4" />}
          link={{
            to: "/$username/site/$siteId/page/$pageId/site-settings",
            params: hrefParams,
            search,
          }}
          className={pageControlClassName}
        />
      </WallPreviewToolbar>
    </motion.div>
  );
}
