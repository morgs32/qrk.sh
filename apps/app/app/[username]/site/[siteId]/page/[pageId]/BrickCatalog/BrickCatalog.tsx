"use client";
import { BrickPreviewFrame } from "@qrk.sh/bricks/BrickPreviewFrame";

import { useBrickBreakpoint } from "@qrk.sh/bricks/BrickBreakpointProvider";

import { Schema } from "effect";
import { useState } from "react";
import { Tabs } from "radix-ui";
import { collectionsHash } from "@qrk.sh/bricks";
import { Link } from "react-router";
import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";

import { useValidatedParams } from "@/hooks/useValidatedParams";

import { href } from "react-router";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function BrickCatalog() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const collections = Object.values(collectionsHash);
  const [selectedContents, setSelectedContents] = useState<Record<string, string>>({});
  const [selectedViews, setSelectedViews] = useState<Record<string, string>>({});

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Bricks</div>
            <div className="text-xs text-muted-foreground">
              Browse bricks by collection. Drag a brick onto your page.
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
        aria-label="Brick collections"
        className="min-h-0 flex-1 overflow-y-auto pt-8 pb-6 flex flex-col gap-10"
      >
        {collections.map((collection) => {
          const contents = Object.entries(collection.contents);
          const firstContentEntry = contents[0];

          if (!firstContentEntry) {
            return null;
          }

          const [firstContentName, firstContent] = firstContentEntry;
          const selectedContentName =
            selectedContents[collection.collectionName] ?? firstContentName;
          const selectedContent = collection.contents[selectedContentName] ?? firstContent;
          const views = Object.entries(selectedContent.views);
          const firstView = views[0];

          if (!firstView) {
            return null;
          }

          const [firstViewName, firstBrick] = firstView;
          const selectedViewName = selectedViews[collection.collectionName] || firstViewName;
          const selectedBrick = selectedContent.views[selectedViewName] ?? firstBrick;
          const BrickComponent = selectedBrick.component;

          return (
            <section
              key={collection.collectionName}
              data-collection-entry={collection.collectionName}
            >
              <div className="flex items-start justify-between gap-4 px-6">
                <div>
                  <h2 className="m-0 text-2xl font-semibold">{collection.collectionLabel}</h2>
                  <p className="mt-1 mb-0 text-sm text-zinc-500">
                    {collection.collectionDescription}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                  <Tabs.Root value={selectedContentName}>
                    <Tabs.List
                      aria-label={`${collection.collectionLabel} contents`}
                      className="flex gap-2"
                    >
                      {contents.map(([contentName]) => (
                        <Tabs.Trigger
                          key={contentName}
                          value={contentName}
                          onClick={() => {
                            setSelectedContents((current) => ({
                              ...current,
                              [collection.collectionName]: contentName,
                            }));
                            setSelectedViews((current) => ({
                              ...current,
                              [collection.collectionName]: "",
                            }));
                          }}
                          className="cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2 data-[state=active]:font-medium data-[state=active]:text-zinc-950 data-[state=active]:no-underline"
                        >
                          {contentName[0].toUpperCase() + contentName.slice(1)}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                  </Tabs.Root>
                  <Tabs.Root value={selectedViewName}>
                    <div className="flex items-baseline gap-2">
                      <Tabs.List
                        aria-label={`${collection.collectionLabel} views`}
                        className="flex gap-2"
                      >
                        {views.map(([viewName, brick]) => (
                          <Tabs.Trigger
                            key={viewName}
                            value={viewName}
                            onClick={() => {
                              setSelectedViews((current) => ({
                                ...current,
                                [collection.collectionName]: viewName,
                              }));
                            }}
                            className="cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2 data-[state=active]:font-medium data-[state=active]:text-zinc-950 data-[state=active]:no-underline"
                          >
                            {brick.def.label}
                          </Tabs.Trigger>
                        ))}
                      </Tabs.List>
                      <Link
                        to={href(
                          "/:username/site/:siteId/page/:pageId/brick-catalog/:collectionName",
                          { ...params, collectionName: collection.collectionName },
                        )}
                        data-collection-link={collection.collectionName}
                      >
                        View all
                      </Link>
                    </div>
                  </Tabs.Root>
                </div>
              </div>
              <div className="mt-6 overflow-auto">
                <div className={selectedBrick.def.w === 8 ? undefined : "ml-6"}>
                  <BrickPreviewFrame w={selectedBrick.def.w} h={selectedBrick.def.h}>
                    <div
                      className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                      data-collection-representative={`${selectedBrick.def.collectionName}/${selectedBrick.def.content}/${selectedBrick.def.view}`}
                      data-brick-drawer-brick-slot
                      data-brick-drawer-collection-name={selectedBrick.def.collectionName}
                      data-brick-drawer-content={selectedBrick.def.content}
                      data-brick-drawer-view={selectedBrick.def.view}
                      draggable
                      onDragStart={(event) => {
                        useBrickDrawerStore
                          .getState()
                          .registerActiveBrickDragGridShape(
                            selectedBrick.def.w,
                            selectedBrick.def.h,
                          );
                        event.dataTransfer.setData(
                          BRICK_DRAG_MIME,
                          JSON.stringify(selectedBrick.def),
                        );
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", selectedBrick.def.view);
                      }}
                      onDragEnd={() => {
                        useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
                      }}
                    >
                      <BrickComponent breakpoint={breakpoint} data={selectedContent.defaultData} />
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
