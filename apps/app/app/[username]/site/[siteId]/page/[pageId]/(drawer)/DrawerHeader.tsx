"use client";

import { Link, useMatches, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Result, Schema } from "effect";
import { isEqual } from "es-toolkit";
import { ArrowLeft, FileText, Globe, X } from "lucide-react";
import { useLiveQuery } from "@zerospin/react";
import { makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { makeModelIdSchema } from "@zerospin/core/models/make/makeModelIdSchema";
import { makeEffectSchema } from "@zerospin/shapes";
import { modulesHash } from "@qrk.sh/library/modulesHash";
import { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";
import { BREAKPOINTS } from "@qrk.sh/library/breakpoints";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { pageV3 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV3";
import { siteV3 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV3";
import { pageSnapshotV2 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV2";
import { makePageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/snapshots/makePageSnapshot";

import { useZerospinUserInitializedState } from "@/components/ZerospinUser";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";
import { useSiteStore } from "../../../siteStore";
import { ToolbarButton } from "../../../Toolbars/ToolbarButton";
import { usePageStore } from "../pageStore";
import { PublishSiteDialog } from "./PublishSiteDialog";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeModelIdSchema(Site),
  pageId: makeModelIdSchema(Page),
  moduleId: Schema.optional(Schema.String),
  brickId: Schema.optional(Schema.String),
});

export function DrawerHeader(props: {
  open: boolean;
  cardStyle: boolean;
  onCardStyleChange: (value: boolean) => void;
}) {
  const { open, cardStyle, onCardStyleChange } = props;
  const params = useValidatedParams(ParamsSchema);
  const routeId = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const navigate = useNavigate();
  const { availableWidth, activeBreakpoint, setSelectedBreakpoint } = useWallViewport();
  const session = UserUI.useSession();
  const { db } = useZerospinUserInitializedState();
  const siteDraft = useSiteStore((state) => state.site);
  const pageDraft = usePageStore((state) => state.page);
  const isSiteSettings = routeId === "/$username/site/$siteId/page/$pageId/_drawer/site-settings";
  const isPageSettings = routeId === "/$username/site/$siteId/page/$pageId/_drawer/page-settings";
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
        cardStyle: site.cardStyle,
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
        with: {
          bricks: true,
          walls: {
            with: {
              sections: { with: { stacks: { with: { rows: { with: { placements: true } } } } } },
            },
          },
        },
      }),
  });
  const { data: publishedSnapshot } = useLiveQuery({
    session,
    key: page?.publishedSnapshotId,
    query: (db, id) =>
      db.query.pageSnapshot.findFirst({ where: { id: { eq: id ?? "psn_missing" } } }),
  });
  const decodedBrickId = Schema.decodeUnknownResult(makeModelIdSchema(brickV1))(params.brickId);
  const { data: brick } = useLiveQuery({
    session,
    key: {
      brickId: Result.isSuccess(decodedBrickId) ? decodedBrickId.success : null,
      pageId: params.pageId,
    },
    query: (db, { brickId, pageId }) =>
      db.query.brick.findFirst({
        where: {
          id: { eq: brickId ?? "brk_missing" },
          pageId: { eq: pageId },
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
          cardStyle: siteDraft.cardStyle,
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
    page === undefined
      ? null
      : makePageSnapshot({
          page,
          bricks: page.bricks,
          walls: page.walls,
          sections: page.walls.flatMap((wall) => wall.sections),
          stacks: page.walls.flatMap((wall) => wall.sections.flatMap((section) => section.stacks)),
          rows: page.walls.flatMap((wall) =>
            wall.sections.flatMap((section) => section.stacks.flatMap((stack) => stack.rows)),
          ),
          placements: page.walls.flatMap((wall) =>
            wall.sections.flatMap((section) =>
              section.stacks.flatMap((stack) => stack.rows.flatMap((row) => row.placements)),
            ),
          ),
        });
  const canPublishPage = site?.isPublished === true && page?.isPublished === false;
  const canPublishUpdates =
    site?.isPublished === true &&
    page?.isPublished === true &&
    savedContent !== null &&
    publishedSnapshot !== undefined &&
    !isEqual(savedContent, publishedSnapshot.content);
  const decodedModule = Schema.decodeUnknownResult(
    makeEffectSchema({ moduleId: brickV1.attributes.moduleId }),
  )({ moduleId: params.brickId === undefined ? params.moduleId : brick?.moduleId });
  const moduleId = Result.isSuccess(decodedModule) ? decodedModule.success.moduleId : undefined;
  const moduleLabel = moduleId === undefined ? undefined : modulesHash[moduleId].label;

  return (
    <header
      data-testid="drawer-navbar"
      className="flex h-full min-w-0 shrink-0 items-center gap-4 overflow-x-auto whitespace-nowrap px-4 pr-16"
    >
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
        <nav aria-label="Drawer breadcrumbs" className="flex shrink-0 items-center gap-2">
          {params.brickId !== undefined ? (
            <>
              <Link
                to="/$username/site/$siteId/page/$pageId/modules"
                params={params}
                resetScroll={false}
                className="inline-flex shrink-0 items-center gap-1.5 underline underline-offset-4"
              >
                <ArrowLeft aria-hidden className="size-4" />
                Bricks
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
              <Link
                to="/$username/site/$siteId/page/$pageId/modules"
                params={params}
                resetScroll={false}
                className="underline underline-offset-4"
              >
                Bricks
              </Link>
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
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {!isSiteSettings && !isPageSettings ? (
          <TooltipProvider>
            <div
              role="group"
              aria-label="Preview breakpoint"
              className="mr-1 flex items-center rounded-md border border-input p-0.5"
            >
              {BREAKPOINTS.map((row) => (
                <ToolbarButton
                  key={row.id}
                  tooltip={`${row.id} (${row.previewWidth}px)`}
                  aria-label={`${row.id} preview width`}
                  aria-pressed={activeBreakpoint === row.id}
                  disabled={row.previewWidth > availableWidth}
                  onClick={() => setSelectedBreakpoint(row.id)}
                  className={
                    activeBreakpoint === row.id
                      ? "h-7 px-2 text-[13px] font-normal text-foreground"
                      : "h-7 px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
                  }
                >
                  {row.id}
                </ToolbarButton>
              ))}
            </div>
          </TooltipProvider>
        ) : null}
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={cardStyle}
            onChange={(event) => onCardStyleChange(event.target.checked)}
          />
          Cards
        </label>
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
                      cardStyle: draftSite.cardStyle,
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
              if (result._tag === "Failure") return;
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
              stageAggregateSessionCommand({
                session,
                contractName: canPublishPage ? "publishPage" : "publishPageUpdates",
                payload: { pageId: params.pageId, snapshotId },
              });
            }}
          >
            {canPublishPage ? "Publish Page" : "Publish Updates"}
          </Button>
        ) : null}
        {open ? (
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
                store.setCardStyle(baseline.site.cardStyle);
              }
              if (isDirty && isPageSettings) {
                const store = usePageStore.getState();
                store.setTitle(baseline.page.title);
                store.setDescription(baseline.page.description);
              }
              void navigate({
                to: "/$username/site/$siteId/page/$pageId",
                params,
                resetScroll: false,
              });
            }}
          >
            <X className="size-3.5" aria-hidden />
            {isDirty ? "Cancel" : null}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
