"use client";

import { useUser } from "@clerk/nextjs";
import { Schema } from "effect";
import { useEffect, useState } from "react";

import { useValidatedParams } from "@/hooks/useValidatedParams";

import { Drawers } from "./Drawers/Drawers";
import { SiteHeader } from "./SiteHeader";
import { Toolbars } from "./Toolbars/Toolbars";
import { useSiteStore } from "./siteStore";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.optional(Schema.String),
});

export default function PageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { siteId, pageId } = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const initializePageDraft = useSiteStore((state) => state.initializePageDraft);
  const [readyRoute, setReadyRoute] = useState<{
    userId: string;
    siteId: string;
    pageId: string;
  } | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (userId === undefined || pageId === undefined) {
      return;
    }

    if (!useSiteStore.persist.hasHydrated()) {
      useSiteStore.persist.rehydrate();
    }

    initializePageDraft(userId, siteId, pageId);
    setReadyRoute({ userId, siteId, pageId });
  }, [initializePageDraft, pageId, siteId, userId]);

  const isCurrentRouteReady =
    readyRoute !== null &&
    readyRoute.userId === userId &&
    readyRoute.siteId === siteId &&
    readyRoute.pageId === pageId;

  return isCurrentRouteReady ? (
    <div className="flex h-screen flex-col overflow-hidden">
      <SiteHeader />

      <div className="min-h-0 flex-1">
        <Drawers />
        {children}
        <Toolbars />
      </div>
    </div>
  ) : null;
}
