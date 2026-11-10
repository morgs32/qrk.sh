"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Link, useMatches, useNavigate, useSearch } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Result, Schema } from "effect";
import { isEqual } from "es-toolkit";
import { ArrowLeft, FileText, Globe, Layers, X } from "lucide-react";
import { useLiveQuery, useSession } from "@zerospin/react";
import { makeIdSchema, makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { modulesHash } from "../../../../../../../modules/lib/modulesHash";
import { brickV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { pageSnapshotV3 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV3";
import { makePageSnapshotV3 } from "@qrk.sh/zerospin/src/aggregates/user/snapshots/makePageSnapshotV3";

import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(Site),
  pageId: makeIdSchema(Page),
  brickId: Schema.optional(Schema.String),
});

export function DrawerHeader() {
  const params = useValidatedParams(ParamsSchema);
  const routeId = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const navigate = useNavigate();
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const session = useSession(userSessionDefinition);
  const isSiteSettings = routeId === "/$username/site/$siteId/page/$pageId/_drawer/site-settings";
  const isPageSettings = routeId === "/$username/site/$siteId/page/$pageId/_drawer/page-settings";
  const isStackDetails = routeId === "/$username/site/$siteId/page/$pageId/_drawer/stack/$stackId";
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
      : makePageSnapshotV3({
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
  const moduleLabel = brick === undefined ? undefined : modulesHash[brick.moduleId].label;

  const closeDrawer = () => {
    void navigate({
      to: "/$username/site/$siteId/page/$pageId",
      params,
      search: { breakpoint: search.breakpoint },
      resetScroll: false,
    });
  };

  useHotkey(
    "Escape",
    (event) => {
      // Child overlays consume Escape before the drawer's bubbling listener.
      if (event.defaultPrevented) return;
      event.preventDefault();
      closeDrawer();
    },
    { preventDefault: false, requireReset: true },
  );

  return (
    <header className="flex h-full min-w-0 shrink-0 items-center gap-4 overflow-x-auto border-b border-zinc-200 text-sm whitespace-nowrap pl-4 pr-2">
      {isSiteSettings || isPageSettings || isStackDetails ? (
        <div className="flex min-w-0 items-center gap-2">
          {isSiteSettings ? (
            <Globe className="size-5 shrink-0" aria-hidden />
          ) : isPageSettings ? (
            <FileText className="size-5 shrink-0" aria-hidden />
          ) : (
            <Layers className="size-5 shrink-0" aria-hidden />
          )}
          <h1 className="truncate text-sm tracking-tight">
            {isSiteSettings ? "Site Settings" : isPageSettings ? "Page Settings" : "Stack Details"}
          </h1>
        </div>
      ) : (
        <nav aria-label="Drawer breadcrumbs" className="flex min-w-0 items-center gap-2">
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
            </>
          )}
        </nav>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {isSiteSettings ? <div id="site-settings-header-actions" /> : null}
        {isPageSettings ? <div id="page-settings-header-actions" /> : null}
        {params.brickId !== undefined ? (
          <div id="brick-editor-header-actions" className="empty:hidden" />
        ) : null}
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
        {params.brickId !== undefined && brick !== undefined ? (
          <Dialog.Root key={brick.id}>
            <Dialog.Trigger
              render={
                <Button type="button" variant="ghost" size="sm" className="text-destructive" />
              }
            >
              Delete brick
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/30" />
              <Dialog.Popup className="fixed left-1/2 top-1/2 z-[101] grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 text-foreground shadow-xl outline-none">
                <Dialog.Title className="text-lg font-medium">Delete Brick?</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  This deletes the shared Brick and its Placements at all four breakpoints, then
                  removes empty Rows, Stacks, and Sections.
                </Dialog.Description>
                <div className="flex justify-end gap-2">
                  <Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      const result = stageAggregateSessionCommand({
                        session,
                        contractName: "deleteBrick",
                        payload: { brickId: brick.id },
                      });
                      if (result._tag !== "Success") return;
                      closeDrawer();
                    }}
                  >
                    Delete Brick
                  </Button>
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 cursor-pointer hover:bg-transparent hover:text-red-500 dark:hover:bg-transparent"
          aria-label="Close drawer"
          onClick={closeDrawer}
        >
          <X className="size-5" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
