"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Result, Schema } from "effect";
import { isEqual } from "es-toolkit";
import { ArrowLeft, FileText, Globe, X } from "lucide-react";
import { toast } from "sonner";
import { useLiveQuery } from "@zerospin/react";
import { makeId, stageAggregateSessionCommand, ZerospinError } from "@zerospin/sdk/browser";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { makeEffectSchema } from "@zerospin/shapes";
import { modulesHash } from "@qrk.sh/library";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { pageV2 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV2";
import { siteV2 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV2";
import { pageSnapshotV1 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV1";
import { makePageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/snapshots/makePageSnapshot";

import { useZerospinUserInitializedState } from "@/components/ZerospinUser";
import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserApp } from "@/zerospin/userSession";
import { useSiteStore } from "../../../siteStore";
import { usePageStore } from "../pageStore";
import { PublishSiteDialog } from "./PublishSiteDialog";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeModelIdSchema(Site),
  pageId: makeModelIdSchema(Page),
  moduleId: Schema.optional(Schema.String),
  brickId: Schema.optional(Schema.String),
});

export function DrawerHeader() {
  const params = useValidatedParams(ParamsSchema);
  const pathname = usePathname();
  const router = useRouter();
  const session = UserApp.useInitializedSession();
  const { db } = useZerospinUserInitializedState();
  const siteDraft = useSiteStore((state) => state.site);
  const pageDraft = usePageStore((state) => state.page);
  const isSiteSettings = pathname.endsWith("/site-settings");
  const isPageSettings = pathname.endsWith("/page-settings");
  const [baseline, setBaseline] = useState(() => {
    const site = db.query.site.findFirst({ where: { id: { eq: params.siteId } } }).sync();
    const page = db.query.page
      .findFirst({ where: { id: { eq: params.pageId }, siteId: { eq: params.siteId } } })
      .sync();
    if (site === undefined || page === undefined) {
      throw new Error("The current site or page was not found");
    }
    return {
      site: {
        name: site.name ?? "",
        description: site.description ?? "",
        logoUrl: site.logoUrl ?? "",
        faviconLightUrl: site.faviconLightUrl ?? "",
        faviconDarkUrl: site.faviconDarkUrl ?? "",
      },
      page: { title: page.title ?? "", description: page.description ?? "" },
    };
  });
  const { data: site } = useLiveQuery({
    session,
    key: params.siteId,
    query: (db, id) => db.query.site.findFirst({ where: { id: { eq: id } } }),
  });
  const { data: page } = useLiveQuery({
    session,
    key: { pageId: params.pageId, siteId: params.siteId },
    query: (db, { pageId, siteId }) =>
      db.query.page.findFirst({
        where: { id: { eq: pageId }, siteId: { eq: siteId } },
        with: { wall: { with: { bricks: { with: { placements: true } } } } },
      }),
  });
  const { data: publishedSnapshot } = useLiveQuery({
    session,
    key: page?.publishedSnapshotId,
    query: (db, id) =>
      db.query.pageSnapshot.findFirst({ where: { id: { eq: id ?? "psn_missing" } } }),
  });
  const decodedBrickId = Schema.decodeUnknownResult(makeModelIdSchema(libraryModule.models.brick))(
    params.brickId,
  );
  const { data: brick } = useLiveQuery({
    session,
    key: {
      brickId: Result.isSuccess(decodedBrickId) ? decodedBrickId.success : null,
      wallId: page?.wallId,
    },
    query: (db, { brickId, wallId }) =>
      db.query.brick.findFirst({
        where: {
          id: { eq: brickId ?? "brk_missing" },
          wallId: { eq: wallId ?? "wal_missing" },
        },
      }),
  });


  const draftSite =
    siteDraft?.id === params.siteId
      ? {
          name: siteDraft.name,
          description: siteDraft.description,
          logoUrl: siteDraft.logoUrl,
          faviconLightUrl: siteDraft.faviconLightUrl,
          faviconDarkUrl: siteDraft.faviconDarkUrl,
        }
      : baseline.site;
  const draftPage =
    pageDraft?.id === params.pageId
      ? { title: pageDraft.title, description: pageDraft.description }
      : baseline.page;
  const isDirty =
    (isSiteSettings && !isEqual(draftSite, baseline.site)) ||
    (isPageSettings && !isEqual(draftPage, baseline.page));
  const savedContent =
    page?.wall === null || page?.wall === undefined
      ? null
      : makePageSnapshot({
          page,
          bricks: page.wall.bricks,
          placements: page.wall.bricks.flatMap((row) => row.placements),
        });
  const canPublishPage = site?.isPublished === true && page?.isPublished === false;
  const canPublishUpdates =
    site?.isPublished === true &&
    page?.isPublished === true &&
    savedContent !== null &&
    publishedSnapshot !== undefined &&
    !isEqual(savedContent, publishedSnapshot.content);
  const decodedModule = Schema.decodeUnknownResult(
    makeEffectSchema({ moduleId: libraryModule.models.brick.attributes.moduleId }),
  )({ moduleId: params.brickId === undefined ? params.moduleId : brick?.moduleId });
  const moduleId = Result.isSuccess(decodedModule) ? decodedModule.success.moduleId : undefined;
  const moduleLabel = moduleId === undefined ? undefined : modulesHash[moduleId].label;
  const base = `/${encodeURIComponent(params.username)}/site/${encodeURIComponent(params.siteId)}/page/${encodeURIComponent(params.pageId)}`;

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-4 py-2.5">
      {isSiteSettings || isPageSettings ? (
        <div className="flex min-w-0 items-center gap-2">
          {isSiteSettings ? (
            <Globe className="size-5 shrink-0" aria-hidden />
          ) : (
            <FileText className="size-5 shrink-0" aria-hidden />
          )}
          <h1 className="truncate text-base tracking-tight">
            {isSiteSettings ? "Site Settings" : "Page Settings"}
          </h1>
        </div>
      ) : (
        <nav aria-label="Drawer breadcrumbs" className="flex min-w-0 items-center gap-2">
          {params.brickId !== undefined ? (
            <>
              <Link
                href={`${base}/modules`}
                scroll={false}
                className="inline-flex shrink-0 items-center gap-1.5 underline underline-offset-4"
              >
                <ArrowLeft aria-hidden className="size-4" />
                New brick
              </Link>
              <span aria-hidden className="text-muted-foreground">
                /
              </span>
              <span className="truncate">
                {moduleLabel === undefined
                  ? "Update your brick"
                  : `Update your ${moduleLabel} brick`}
              </span>
            </>
          ) : (
            <>
              <span>Drag a brick onto your page</span>
              {moduleLabel === undefined ? null : (
                <>
                  <span aria-hidden className="text-muted-foreground">
                    /
                  </span>
                  <span className="truncate">{moduleLabel}</span>
                </>
              )}
            </>
          )}
        </nav>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {isDirty ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const result = isSiteSettings
                ? stageAggregateSessionCommand({
                    session,
                    contractName: "updateSiteSettings",
                    payload: {
                      id: params.siteId,
                      name: draftSite.name.length > 0 ? draftSite.name : null,
                      description: draftSite.description.length > 0 ? draftSite.description : null,
                      logoUrl: draftSite.logoUrl.length > 0 ? draftSite.logoUrl : null,
                      faviconLightUrl:
                        draftSite.faviconLightUrl.length > 0 ? draftSite.faviconLightUrl : null,
                      faviconDarkUrl:
                        draftSite.faviconDarkUrl.length > 0 ? draftSite.faviconDarkUrl : null,
                    },
                  })
                : stageAggregateSessionCommand({
                    session,
                    contractName: "updatePageSettings",
                    payload: {
                      id: params.pageId,
                      title: draftPage.title.length > 0 ? draftPage.title : null,
                      description: draftPage.description.length > 0 ? draftPage.description : null,
                    },
                  });
              if (result._tag === "Failure") {
                toast.error(new ZerospinError(result.failure).message);
                return;
              }
              setBaseline({ site: structuredClone(draftSite), page: structuredClone(draftPage) });
            }}
          >
            Save
          </Button>
        ) : null}
        {site?.isPublished === false ? <PublishSiteDialog siteId={params.siteId} /> : null}
        {canPublishPage || canPublishUpdates ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const snapshotId = session.runSync(makeId(PageSnapshot));
              const result = stageAggregateSessionCommand({
                session,
                contractName: canPublishPage ? "publishPage" : "publishPageUpdates",
                payload: { pageId: params.pageId, snapshotId },
              });
              if (result._tag === "Failure") {
                toast.error(new ZerospinError(result.failure).message);
              }
            }}
          >
            {canPublishPage ? "Publish Page" : "Publish Updates"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={isDirty ? "destructive" : "ghost"}
          size={isDirty ? "sm" : "icon"}
          className={isDirty ? "h-8 cursor-pointer" : "size-8 cursor-pointer"}
          aria-label={isDirty ? "Cancel" : "Close drawer"}
          onClick={() => {
            if (isDirty && isSiteSettings) {
              const store = useSiteStore.getState();
              store.setName(baseline.site.name);
              store.setDescription(baseline.site.description);
              store.setLogoUrl(baseline.site.logoUrl);
              store.setFaviconLightUrl(baseline.site.faviconLightUrl);
              store.setFaviconDarkUrl(baseline.site.faviconDarkUrl);
            }
            if (isDirty && isPageSettings) {
              const store = usePageStore.getState();
              store.setTitle(baseline.page.title);
              store.setDescription(baseline.page.description);
            }
            router.push(base, { scroll: false });
          }}
        >
          <X className="size-3.5" aria-hidden />
          {isDirty ? "Cancel" : null}
        </Button>
      </div>
    </header>
  );
}
