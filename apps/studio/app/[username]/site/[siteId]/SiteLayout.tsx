"use client";

import { useUser } from "@clerk/react";
import { Schema } from "effect";
import { useEffect, useState } from "react";

import { useValidatedParams } from "@/hooks/useValidatedParams";

import { Outlet } from "react-router";
import { SiteHeader } from "./SiteHeader";
import { useSiteStore } from "./siteStore";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.optional(Schema.String),
});

export default function PageLayout() {
  const { siteId, pageId } = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const initializePageDraft = useSiteStore((state) => state.initializePageDraft);
  const [readyRoute, setReadyRoute] = useState<{
    identityKey: string;
    siteId: string;
    pageId: string;
  } | null>(null);

  const identityKey = user?.id;
  useEffect(() => {
    if (identityKey === undefined || pageId === undefined) {
      return;
    }

    if (!useSiteStore.persist.hasHydrated()) {
      useSiteStore.persist.rehydrate();
    }

    initializePageDraft(identityKey, siteId, pageId);
    setReadyRoute({ identityKey, siteId, pageId });
  }, [initializePageDraft, pageId, siteId, identityKey]);

  const isCurrentRouteReady =
    readyRoute !== null &&
    readyRoute.identityKey === identityKey &&
    readyRoute.siteId === siteId &&
    readyRoute.pageId === pageId;

  return isCurrentRouteReady ? (
    <div className="flex h-screen flex-col overflow-hidden">
      <SiteHeader />

      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  ) : null;
}
