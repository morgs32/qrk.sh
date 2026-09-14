"use client";

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
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedLayouts, setSelectedLayouts] = useState<Record<string, string>>({});

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
          const variants = Object.entries(collection.variants);
          const firstVariantEntry = variants[0];

          if (!firstVariantEntry) {
            return null;
          }

          const [firstVariantName, firstVariant] = firstVariantEntry;
          const selectedVariantName =
            selectedVariants[collection.collectionName] ?? firstVariantName;
          const selectedVariant = collection.variants[selectedVariantName] ?? firstVariant;
          const layouts = Object.entries(selectedVariant.layouts);
          const firstLayout = layouts[0];

          if (!firstLayout) {
            return null;
          }

          const [firstLayoutName, firstBrick] = firstLayout;
          const selectedLayoutName = selectedLayouts[collection.collectionName] || firstLayoutName;
          const selectedBrick = selectedVariant.layouts[selectedLayoutName] ?? firstBrick;
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
                  <Tabs.Root value={selectedVariantName}>
                    <Tabs.List
                      aria-label={`${collection.collectionLabel} variants`}
                      className="flex gap-2"
                    >
                      {variants.map(([variantName]) => (
                        <Tabs.Trigger
                          key={variantName}
                          value={variantName}
                          onClick={() => {
                            setSelectedVariants((current) => ({
                              ...current,
                              [collection.collectionName]: variantName,
                            }));
                            setSelectedLayouts((current) => ({
                              ...current,
                              [collection.collectionName]: "",
                            }));
                          }}
                          className="cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2 data-[state=active]:font-medium data-[state=active]:text-zinc-950 data-[state=active]:no-underline"
                        >
                          {variantName[0].toUpperCase() + variantName.slice(1)}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                  </Tabs.Root>
                  <Tabs.Root value={selectedLayoutName}>
                    <div className="flex items-baseline gap-2">
                      <Tabs.List
                        aria-label={`${collection.collectionLabel} layouts`}
                        className="flex gap-2"
                      >
                        {layouts.map(([layoutName, brick]) => (
                          <Tabs.Trigger
                            key={layoutName}
                            value={layoutName}
                            onClick={() => {
                              setSelectedLayouts((current) => ({
                                ...current,
                                [collection.collectionName]: layoutName,
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
                <div
                  className={
                    selectedBrick.def.w === 8
                      ? "qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                      : "qrk-bricks ml-6 cursor-grab overflow-hidden active:cursor-grabbing"
                  }
                  data-collection-representative={`${selectedBrick.def.collectionName}/${selectedBrick.def.variant}/${selectedBrick.def.layout}`}
                  data-brick-drawer-brick-slot
                  data-brick-drawer-collection-name={selectedBrick.def.collectionName}
                  data-brick-drawer-variant={selectedBrick.def.variant}
                  data-brick-drawer-layout={selectedBrick.def.layout}
                  draggable
                  onDragStart={(event) => {
                    useBrickDrawerStore
                      .getState()
                      .registerActiveBrickDragGridShape(selectedBrick.def.w, selectedBrick.def.h);
                    event.dataTransfer.setData(BRICK_DRAG_MIME, JSON.stringify(selectedBrick.def));
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("text/plain", selectedBrick.def.layout);
                  }}
                  onDragEnd={() => {
                    useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
                  }}
                  style={{
                    width: `${(selectedBrick.def.w / 8) * 100}%`,
                    aspectRatio: `${selectedBrick.def.w} / ${selectedBrick.def.h}`,
                  }}
                >
                  <BrickComponent breakpoint={breakpoint} data={selectedVariant.defaultData} />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
