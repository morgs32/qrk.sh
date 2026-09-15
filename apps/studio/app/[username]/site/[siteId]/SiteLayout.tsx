"use client";

import { useUser } from "@clerk/react";
import { makeModelIdSchema } from "@zerospin/core/models/makeIdSchema";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";
import { useEffect, useState } from "react";
import { Outlet } from "react-router";

import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV2 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV2";

import { useZerospinUserInitializedState, ZerospinUser } from "@/components/ZerospinUser";
import { useValidatedParams } from "@/hooks/useValidatedParams";

import { SiteHeader } from "./SiteHeader";
import { usePageStore } from "./page/[pageId]/pageStore";
import { useSitePageDraftStore } from "./sitePageDraftStore";
import { useSiteStore } from "./siteStore";

const ParamsSchema = Schema.Struct({
  siteId: makeModelIdSchema(Site),
  pageId: Schema.optional(makeModelIdSchema(Page)),
});

export default function PageLayout() {
  const { siteId, pageId } = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const { db } = useZerospinUserInitializedState();
  const initializeSite = useSiteStore((state) => state.initializeSite);
  const siteDraftId = useSiteStore((state) => state.site?.id);
  const siteName = useSiteStore((state) => state.site?.name ?? "");
  const initializeSitePageDraft = useSitePageDraftStore((state) => state.initializePageDraft);
  const initializeArticlePageDraft = usePageStore((state) => state.initializePageDraft);
  const [readyRoute, setReadyRoute] = useState<{
    identityKey: string;
    siteId: string;
    pageId: string;
  } | null>(null);

  const identityKey = user?.id;

  const { data: page } = useLiveQuery(ZerospinUser, {
    deps: [pageId, siteId],
    query: (queryDb) =>
      queryDb.query.page.findFirst({
        where: {
          id: { eq: pageId === undefined ? "pag_" : pageId },
          siteId: { eq: siteId },
        },
      }),
  });
  const pageTitle = page?.title ?? "";

  // Re-seed when the route site changes; do not refresh when draft fields update.
  if (siteDraftId !== siteId) {
    const site = db.query.site
      .findFirst({
        where: { id: { eq: siteId } },
      })
      .sync();

    if (site === undefined) {
      throw new Error(`Site ${siteId} not found`);
    }

    initializeSite({
      id: site.id,
      name: site.name,
      description: site.description,
      slug: site.slug,
      userId: site.userId,
      logoUrl: site.logoUrl,
      faviconLightUrl: site.faviconLightUrl,
      faviconDarkUrl: site.faviconDarkUrl,
    });
  }

  useEffect(() => {
    if (identityKey === undefined || pageId === undefined) {
      return;
    }

    if (!useSitePageDraftStore.persist.hasHydrated()) {
      useSitePageDraftStore.persist.rehydrate();
    }

    if (!usePageStore.persist.hasHydrated()) {
      usePageStore.persist.rehydrate();
    }

    initializeSitePageDraft(identityKey, siteId, pageId);
    initializeArticlePageDraft(identityKey, siteId, pageId);
    setReadyRoute({ identityKey, siteId, pageId });
  }, [initializeArticlePageDraft, initializeSitePageDraft, pageId, siteId, identityKey]);

  const isCurrentRouteReady =
    readyRoute !== null &&
    readyRoute.identityKey === identityKey &&
    readyRoute.siteId === siteId &&
    readyRoute.pageId === pageId &&
    siteDraftId === siteId;

  return isCurrentRouteReady ? (
    <div className="flex h-screen flex-col overflow-hidden">
      <title>
        {pageTitle === ""
          ? `[Editing] ${siteName}`
          : `[Editing] ${siteName} - ${pageTitle}`}
      </title>
      <SiteHeader />

      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  ) : null;
}
