"use client";

import { useUser } from "@clerk/react";
import { makeModelIdSchema } from "@zerospin/core/models/makeIdSchema";
import { useLiveQuery } from "@zerospin/react";
import { Schema } from "effect";
import { useEffect, useState } from "react";
import { Outlet } from "react-router";

import { pageV2 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV2";
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
  const initializePage = usePageStore((state) => state.initializePage);
  const pageDraftId = usePageStore((state) => state.page?.id);
  const pageDraftTitle = usePageStore((state) => state.page?.title ?? "");
  const initializeSitePageDraft = useSitePageDraftStore((state) => state.initializePageDraft);
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
  const pageTitle = pageDraftTitle !== "" ? pageDraftTitle : (page?.title ?? "");

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

  // Re-seed when the route page changes; do not refresh when draft fields update.
  if (pageId !== undefined && pageDraftId !== pageId) {
    const pageRow = db.query.page
      .findFirst({
        where: {
          id: { eq: pageId },
          siteId: { eq: siteId },
        },
      })
      .sync();

    if (pageRow === undefined) {
      throw new Error(`Page ${pageId} not found`);
    }

    if (pageRow.siteId === null) {
      throw new Error(`Page ${pageId} has no site`);
    }

    initializePage({
      id: pageRow.id,
      siteId: pageRow.siteId,
      slug: pageRow.slug,
      title: pageRow.title,
      description: pageRow.description,
      pageType: pageRow.pageType,
      article: pageRow.article,
    });
  }

  useEffect(() => {
    if (identityKey === undefined || pageId === undefined) {
      return;
    }

    if (!useSitePageDraftStore.persist.hasHydrated()) {
      useSitePageDraftStore.persist.rehydrate();
    }

    initializeSitePageDraft(identityKey, siteId, pageId);
    setReadyRoute({ identityKey, siteId, pageId });
  }, [initializeSitePageDraft, pageId, siteId, identityKey]);

  const isCurrentRouteReady =
    readyRoute !== null &&
    readyRoute.identityKey === identityKey &&
    readyRoute.siteId === siteId &&
    readyRoute.pageId === pageId &&
    siteDraftId === siteId &&
    pageDraftId === pageId;

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
