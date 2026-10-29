"use client";

import { Link, useMatches, useNavigate, useSearch } from "@tanstack/react-router";
import { Result, Schema } from "effect";
import { isEqual } from "es-toolkit";
import { ArrowLeft, FileText, Globe, X } from "lucide-react";
import { useLiveQuery } from "@zerospin/react";
import { makeIdSchema, makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { makeEffectSchema } from "@zerospin/shapes";
import { modulesHash } from "../../../../../../../modules/lib/modulesHash";
import { brickV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { pageSnapshotV2 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV2";
import { makePageSnapshotV2 } from "@qrk.sh/zerospin/src/aggregates/user/snapshots/makePageSnapshotV2";

import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(Site),
  pageId: makeIdSchema(Page),
  moduleId: Schema.optional(Schema.String),
  brickId: Schema.optional(Schema.String),
});

export function DrawerHeader() {
  const params = useValidatedParams(ParamsSchema);
  const routeId = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const navigate = useNavigate();
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const session = UserUI.useSession();
  const isSiteSettings = routeId === "/$username/site/$siteId/page/$pageId/_drawer/site-settings";
  const isPageSettings = routeId === "/$username/site/$siteId/page/$pageId/_drawer/page-settings";
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
          walls: { with: { placements: true } },
        },
      }),
  });
  const { data: publishedSnapshot } = useLiveQuery({
    session,
    key: page?.publishedSnapshotId,
    query: (db, id) =>
      db.query.pageSnapshot.findFirst({ where: { id: { eq: id ?? "psn_missing" } } }),
  });
  const decodedBrickId = Schema.decodeUnknownResult(makeIdSchema(brickV2))(params.brickId);
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

  const savedContent =
    page === undefined
      ? null
      : makePageSnapshotV2({
          page,
          bricks: page.bricks,
          walls: page.walls,
          placements: page.walls.flatMap((wall) => wall.placements),
        });
  const canPublishPage = site?.isPublished === true && page?.isPublished === false;
  const canPublishUpdates =
    site?.isPublished === true &&
    page?.isPublished === true &&
    savedContent !== null &&
    publishedSnapshot !== undefined &&
    !isEqual(savedContent, publishedSnapshot.content);
  const decodedModule = Schema.decodeUnknownResult(
    makeEffectSchema({ moduleId: brickV2.attributes.moduleId }),
  )({ moduleId: params.brickId === undefined ? params.moduleId : brick?.moduleId });
  const moduleId = Result.isSuccess(decodedModule) ? decodedModule.success.moduleId : undefined;
  const moduleLabel = moduleId === undefined ? undefined : modulesHash[moduleId].label;

  return (
    <header className="flex h-full min-w-0 shrink-0 items-center gap-4 overflow-x-auto border-b border-zinc-200 whitespace-nowrap px-4 pr-16">
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
                search={{ breakpoint: search.breakpoint }}
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
                search={{ breakpoint: search.breakpoint }}
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
        {canPublishPage || canPublishUpdates ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const snapshotId = session.runSync(makeId(PageSnapshot));
              stageAggregateSessionCommand({
                session,
                contractName: "publishPage",
                payload: { pageId: params.pageId, snapshotId },
              });
            }}
          >
            {canPublishPage ? "Publish Page" : "Publish Updates"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 cursor-pointer"
          aria-label="Close drawer"
          onClick={() => {
            void navigate({
              to: "/$username/site/$siteId/page/$pageId",
              params,
              search: { breakpoint: search.breakpoint },
              resetScroll: false,
            });
          }}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
