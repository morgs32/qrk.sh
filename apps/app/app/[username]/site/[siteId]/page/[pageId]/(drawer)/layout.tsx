"use client";

import { useContext, type RefCallback } from "react";
import { useMatches, useNavigate, useSearch } from "@tanstack/react-router";
import { File, Globe, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Schema } from "effect";
import { isEqual } from "es-toolkit";
import { useLiveQuery, useSession } from "@zerospin/react";
import { makeId, makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { pageSnapshotV4 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV4";
import { makePageSnapshotV4 } from "@qrk.sh/zerospin/src/aggregates/user/snapshots/makePageSnapshotV4";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { BrickAutosaveContext } from "../BrickAutosaveContext";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(Site),
  pageId: makeIdSchema(Page),
});

export default function WorkspacePanelControls(props: {
  sidebar: boolean;
  bodyRef: RefCallback<HTMLDivElement>;
  isSitePublished: boolean;
  onClose: () => void;
}) {
  const { sidebar, bodyRef, isSitePublished, onClose } = props;
  const params = useValidatedParams(ParamsSchema);
  const autosave = useContext(BrickAutosaveContext);
  if (autosave === null) throw new Error("Brick autosave requires the Page layout");
  const { breakpoint } = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const routeId = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const navigate = useNavigate();
  const session = useSession(userSessionDefinition);
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

  const savedContent =
    page === undefined
      ? null
      : makePageSnapshotV4({
          page,
          bricks: page.bricks,
          walls: page.walls,
          placements: page.walls.flatMap((wall) => wall.placements),
        });
  const canPublishPage = isSitePublished && page?.isPublished === false;
  const canPublishUpdates =
    isSitePublished &&
    page?.isPublished === true &&
    savedContent !== null &&
    publishedSnapshot !== undefined &&
    !isEqual(savedContent, publishedSnapshot.content);

  useHotkey(
    "Escape",
    (event) => {
      // Child overlays consume Escape before the drawer's bubbling listener.
      if (event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    },
    { preventDefault: false, requireReset: true },
  );

  const isBrickDetails = routeId === "/$username/site/$siteId/page/$pageId/_drawer/brick/$brickId";
  const tab = isBrickDetails
    ? "edit-brick"
    : routeId === "/$username/site/$siteId/page/$pageId/_drawer/page-settings"
      ? "page-settings"
      : routeId === "/$username/site/$siteId/page/$pageId/_drawer/site-settings"
        ? "site-settings"
        : "modules";
  const sections = [
    { value: "modules", label: "Bricks", Icon: Plus },
    { value: "page-settings", label: "Page settings", Icon: File },
    { value: "site-settings", label: "Site settings", Icon: Globe },
  ];
  if (isBrickDetails) sections.push({ value: "edit-brick", label: "Edit brick", Icon: Pencil });

  const selectSection = (value: string) => {
    if (value === "modules" || value === "page-settings" || value === "site-settings") {
      void navigate({
        to: `/$username/site/$siteId/page/$pageId/${value}`,
        params,
        search: { breakpoint },
        resetScroll: false,
      });
    }
  };
  const compactControlClassName =
    "h-7 gap-1 px-2 py-1 text-xs leading-none font-medium shadow-none";
  const actions = (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      {canPublishPage || canPublishUpdates ? (
        <Button
          type="button"
          size="sm"
          className="font-bold"
          onClick={() => {
            if (!autosave.flushPageEditors()) return;
            const snapshotId = session.runSync(makeId(PageSnapshot));
            stageAggregateSessionCommand({
              session,
              contractName: "publishPage",
              payload: { pageId: params.pageId, snapshotId, preferredRowSizing: true },
            });
          }}
        >
          Publish
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="cursor-pointer hover:bg-transparent hover:text-red-500 dark:hover:bg-transparent"
        aria-label={sidebar ? "Close sidebar" : "Close drawer"}
        onClick={onClose}
      >
        <X className="size-5" aria-hidden />
      </Button>
    </div>
  );
  if (sidebar) {
    return (
      <WorkspaceSidebar
        bodyRef={bodyRef}
        controls={
          <>
            <Select value={tab} onValueChange={selectSection}>
              <SelectTrigger
                aria-label="Page controls"
                size="sm"
                className={`${compactControlClassName} min-w-0 border-0 bg-secondary text-secondary-foreground hover:bg-secondary/80 data-[size=sm]:h-7 dark:bg-secondary dark:hover:bg-secondary/80 [&>svg]:size-3.5`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {sections.map(({ value, label, Icon }) => (
                  <SelectItem key={value} value={value} className="text-xs">
                    <Icon aria-hidden className="size-3.5" />
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {actions}
          </>
        }
      />
    );
  }

  return (
    <Tabs
      value={tab}
      activationMode="manual"
      onValueChange={selectSection}
      className="h-full min-h-0 gap-0 overflow-hidden bg-background"
      style={{ viewTransitionName: "app-drawer" }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <TabsList variant="line" aria-label="Page controls" className="h-11">
            {sections.map(({ value, label, Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon aria-hidden />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {actions}
      </header>
      <TabsContent
        ref={bodyRef}
        value={tab}
        className="mt-0 flex min-h-0 flex-col overflow-y-auto"
      />
    </Tabs>
  );
}
