"use client";

import { Schema } from "effect";
import { motion, useReducedMotion } from "framer-motion";
import { File, Globe, Plus } from "lucide-react";
import { Link, useSearch } from "@tanstack/react-router";
import { Button } from "@qrk.sh/bricks/components/button";
import { TabsList, TabsTrigger } from "@qrk.sh/bricks/components/tabs";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { useValidatedParams } from "@/hooks/useValidatedParams";

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
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });

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
      <TabsList aria-label="Page controls" className="pointer-events-auto shadow-md">
        <TabsTrigger
          value="modules"
          nativeButton={false}
          render={
            <Button
              variant="ghost"
              nativeButton={false}
              render={
                <Link
                  to="/$username/site/$siteId/page/$pageId/modules"
                  params={params}
                  search={search}
                  resetScroll={false}
                />
              }
            />
          }
        >
          <Plus aria-hidden className="size-4" />
          Bricks
        </TabsTrigger>
        <TabsTrigger
          value="page-settings"
          nativeButton={false}
          render={
            <Button
              variant="ghost"
              nativeButton={false}
              render={
                <Link
                  to="/$username/site/$siteId/page/$pageId/page-settings"
                  params={params}
                  search={search}
                  resetScroll={false}
                />
              }
            />
          }
        >
          <File aria-hidden className="size-4" />
          Page settings
        </TabsTrigger>
        <TabsTrigger
          value="site-settings"
          nativeButton={false}
          render={
            <Button
              variant="ghost"
              nativeButton={false}
              render={
                <Link
                  to="/$username/site/$siteId/page/$pageId/site-settings"
                  params={params}
                  search={search}
                  resetScroll={false}
                />
              }
            />
          }
        >
          <Globe aria-hidden className="size-4" />
          Site settings
        </TabsTrigger>
      </TabsList>
    </motion.div>
  );
}
