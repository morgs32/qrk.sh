"use client";
import { useState } from "react";

import { groupsHash } from "@qrk.sh/library";
import { useBrickBreakpoint } from "@qrk.sh/library/BrickBreakpointProvider";
import { BrickPreviewFrame } from "@qrk.sh/library/BrickPreviewFrame";
import { Schema } from "effect";
import { X } from "lucide-react";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import { href } from "react-router";

import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";
import { Button } from "@/components/ui/button";
import { Outline } from "@/components/home/outline/Outline";
import { GroupOutline } from "@/components/home/outline/GroupOutline";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function BrickGroup() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const groups = Object.values(groupsHash);
  const [selectedCatalogs, setSelectedCatalogs] = useState<Record<string, string>>({});

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Bricks</div>
            <div className="text-xs text-muted-foreground">
              Browse bricks by group. Drag a brick onto your page.
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            aria-label="Close drawer"
            onClick={() => navigate(href("/:username/site/:siteId/page/:pageId", { ...params }))}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div
        aria-label="Brick groups"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white pb-16 font-mono text-sm leading-5 text-zinc-900"
      >
        {groups.map((group) => {
          const catalogs = Object.entries(group.catalogs);
          const firstCatalogEntry = catalogs[0];

          if (!firstCatalogEntry) {
            return null;
          }

          const [firstCatalogName, firstCatalog] = firstCatalogEntry;
          const selectedCatalogName = selectedCatalogs[group.id] ?? firstCatalogName;
          const selectedCatalog = group.catalogs[selectedCatalogName] ?? firstCatalog;
          const selectedBrick = selectedCatalog;
          const BrickComponent = selectedBrick.component;

          return (
            <section key={group.id} data-group-entry={group.id}>
              <Outline.Title sticky>
                <Link
                  to={href("/:username/site/:siteId/page/:pageId/brick-group/:groupName", {
                    ...params,
                    groupName: group.id,
                  })}
                  data-group-link={group.id}
                >
                  {group.label}
                </Link>
              </Outline.Title>
              <GroupOutline
                group={group}
                renderCatalog={(catalogName, label) => (
                  <Button
                    variant="link"
                    aria-pressed={selectedCatalogName === catalogName}
                    onClick={() => {
                      setSelectedCatalogs((current) => ({
                        ...current,
                        [group.id]: catalogName,
                      }));
                    }}
                    className="h-auto rounded-none p-0 font-normal leading-inherit text-zinc-500 underline aria-pressed:text-zinc-950 aria-pressed:no-underline"
                  >
                    {label}
                  </Button>
                )}
              />
              <div className="overflow-auto bg-white py-6">
                <div className={selectedBrick.def[breakpoint].w === 8 ? undefined : "px-4"}>
                  <BrickPreviewFrame
                    w={selectedBrick.def[breakpoint].w}
                    h={selectedBrick.def[breakpoint].h}
                  >
                    <div
                      className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                      data-group-representative={`${selectedBrick.def.groupId}/${selectedBrick.def.catalogId}`}
                      data-brick-drawer-brick-slot
                      data-brick-drawer-group-name={selectedBrick.def.groupId}
                      data-brick-drawer-catalog={selectedBrick.def.catalogId}
                      draggable
                      onDragStart={(event) => {
                        useBrickDrawerStore
                          .getState()
                          .registerActiveBrickDragGridShape(
                            selectedBrick.def[breakpoint].w,
                            selectedBrick.def[breakpoint].h,
                          );
                        event.dataTransfer.setData(
                          BRICK_DRAG_MIME,
                          JSON.stringify(selectedBrick.def),
                        );
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", selectedBrick.def.catalogId);
                      }}
                      onDragEnd={() => {
                        useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
                      }}
                    >
                      <BrickComponent breakpoint={breakpoint} data={selectedCatalog.defaultData} />
                    </div>
                  </BrickPreviewFrame>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
