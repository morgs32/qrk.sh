"use client";

import { Schema } from "effect";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { ArrowLeft, File, Globe, Plus, RectangleHorizontal } from "lucide-react";
import { WallPreviewToolbar } from "../../../../../modules/lib/WallPreviewToolbar";
import { useSearch } from "@tanstack/react-router";
import { useLiveQuery } from "@zerospin/react";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";

import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";
import { PublishSiteDialog } from "../page/[pageId]/(drawer)/PublishSiteDialog";

import { ToolbarSeparator } from "./ToolbarSeparator";
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

export function SiteToolbar() {
  const reducedMotion = useReducedMotion();
  const params = useValidatedParams(ParamsSchema);
  const session = UserUI.useSession();
  const { data: site } = useLiveQuery({
    session,
    key: params.siteId,
    query: (db, id) => db.query.site.findFirst({ where: { id: { eq: id } } }),
  });
  const { breakpoint } = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
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
          link={{
            to: "/$username/site/$siteId/page/$pageId/modules",
            params: hrefParams,
            search: { breakpoint },
          }}
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
            search: { breakpoint },
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
            search: { breakpoint },
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
            search: { breakpoint },
          }}
          className="h-7 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
        />
        {site?.isPublished === false ? (
          <>
            <ToolbarSeparator />
            <PublishSiteDialog siteId={params.siteId} />
          </>
        ) : null}
      </WallPreviewToolbar>
    </motion.div>
  );
}
