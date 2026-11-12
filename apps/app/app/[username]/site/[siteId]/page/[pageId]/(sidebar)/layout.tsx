"use client";

import { useContext, useEffect, useState, type ReactNode } from "react";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { File, Globe, Pencil, Plus, X } from "lucide-react";
import { Button } from "@qrk.sh/bricks/components/button";
import { Select } from "@base-ui/react/select";
import { SelectContent, SelectItem, SelectTrigger } from "@qrk.sh/bricks/components/select";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Schema } from "effect";
import { isEqual, omit } from "es-toolkit";
import { useLiveQuery, useSession } from "@zerospin/react";
import { makeId, makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { pageV1 as Page } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 as Site } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { pageSnapshotV9 as PageSnapshot } from "@qrk.sh/zerospin/src/aggregates/user/models/pageSnapshot/PageSnapshotV9";
import { makePageSnapshotV9 } from "@qrk.sh/zerospin/src/aggregates/user/snapshots/makePageSnapshotV9";
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
  children: ReactNode;
  isSitePublished: boolean;
  sidebarWidth: number;
  onClose: () => void;
}) {
  const { children, isSitePublished, sidebarWidth, onClose } = props;
  const [showPageControls, setShowPageControls] = useState(false);
  useEffect(() => {
    // Match the lg breakpoint used by WorkspaceSidebar.
    const mobileViewport = window.matchMedia("(width < 64rem)");
    const update = () => setShowPageControls(mobileViewport.matches);
    mobileViewport.addEventListener("change", update);
    update();
    return () => mobileViewport.removeEventListener("change", update);
  }, []);
  const params = useValidatedParams(ParamsSchema);
  const autosave = useContext(BrickAutosaveContext);
  if (autosave === null) throw new Error("Brick autosave requires the Page layout");
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
      : makePageSnapshotV9({
          preferredRowSizing: true,
          preferredStackSizing: true,
          page,
          bricks: page.bricks,
          walls: page.walls,
          placements: page.walls.flatMap((wall) => wall.placements),
        });
  const canPublishPage = isSitePublished && page?.isPublished === false;
  const comparableContents =
    savedContent !== null && publishedSnapshot !== undefined
      ? [savedContent, publishedSnapshot.content].map((content) => ({
          ...content,
          walls: content.walls.map((wall) => ({
            ...wall,
            sections: wall.sections.map((section) => ({
              ...section,
              stacks: section.stacks.map((stack) => ({
                ...stack,
                widthWeight: stack.widthWeight ?? 1,
                rows: stack.rows.map((row) => omit(row, ["preferredWidth"])),
              })),
            })),
          })),
        }))
      : null;
  const canPublishUpdates =
    isSitePublished &&
    page?.isPublished === true &&
    comparableContents !== null &&
    !isEqual(comparableContents[0], comparableContents[1]);

  useHotkey(
    "Escape",
    (event) => {
      // Editor overlays and text selection get first use of Escape.
      if (event.defaultPrevented) return;
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        focused.closest("[data-wall-inline-editor]") !== null &&
        (focused instanceof HTMLInputElement ||
          focused instanceof HTMLTextAreaElement ||
          focused.isContentEditable)
      ) {
        focused.blur();
      }
      event.preventDefault();
      onClose();
    },
    { preventDefault: false, requireReset: true },
  );

  const isBrickDetails = routeId === "/$username/site/$siteId/page/$pageId/_sidebar/brick/$brickId";
  const tab = isBrickDetails
    ? "edit-brick"
    : routeId === "/$username/site/$siteId/page/$pageId/_sidebar/page-settings"
      ? "page-settings"
      : routeId === "/$username/site/$siteId/page/$pageId/_sidebar/site-settings"
        ? "site-settings"
        : "modules";
  const sections = [
    { value: "modules", label: "Bricks", Icon: Plus },
    { value: "page-settings", label: "Page settings", Icon: File },
    { value: "site-settings", label: "Site settings", Icon: Globe },
  ];
  if (isBrickDetails) sections.push({ value: "edit-brick", label: "Edit brick", Icon: Pencil });
  const items = sections.map(({ value, label, Icon }) => ({
    value,
    label: (
      <>
        <Icon aria-hidden className="size-3.5" />
        {label}
      </>
    ),
  }));

  const selectSection = (value: string | null) => {
    if (value === "modules" || value === "page-settings" || value === "site-settings") {
      void navigate({
        to: `/$username/site/$siteId/page/$pageId/${value}`,
        params,
        search: (previous) => ({
          ...previous,
          selected: isBrickDetails ? undefined : previous.selected,
        }),
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
              payload: {
                pageId: params.pageId,
                snapshotId,
                preferredRowSizing: true,
                preferredStackSizing: true,
              },
            });
          }}
        >
          Publish
        </Button>
      ) : null}
      {tab === "site-settings" || tab === "page-settings" ? <div id={`${tab}-save-slot`} /> : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Close sidebar"
        onClick={onClose}
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
  return (
    <WorkspaceSidebar
      sidebarWidth={tab === "page-settings" || tab === "site-settings" ? 300 : sidebarWidth}
      controls={
        <>
          {showPageControls ? (
            <Select.Root items={items} value={tab} onValueChange={selectSection}>
              <SelectTrigger aria-label="Page controls" className="w-fit">
                <Select.Value />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="start">
                {items.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select.Root>
          ) : null}
          <h2 className="hidden text-xs font-medium lg:block">
            {isBrickDetails ? (
              <span id="edit-brick-title-slot" />
            ) : (
              sections.find(({ value }) => value === tab)?.label
            )}
          </h2>
          {actions}
        </>
      }
    >
      {children}
    </WorkspaceSidebar>
  );
}
