"use client";
import { useState } from "react";

import { catalogsHash } from "@qrk.sh/bricks";
import { useBrickBreakpoint } from "@qrk.sh/bricks/BrickBreakpointProvider";
import { BrickPreviewFrame } from "@qrk.sh/bricks/BrickPreviewFrame";
import { Schema } from "effect";
import { X } from "lucide-react";
import { Tabs } from "radix-ui";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import { href } from "react-router";

import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";
import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: Schema.String,
  pageId: Schema.String,
});

export function BrickCatalog() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useValidatedParams(ParamsSchema);
  const navigate = useNavigate();
  const catalogs = Object.values(catalogsHash);
  const [selectedRegistries, setSelectedRegistries] = useState<Record<string, string>>({});

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border/60 bg-background/95 px-6 pb-5 pt-6 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold">Bricks</div>
            <div className="text-xs text-muted-foreground">
              Browse bricks by catalog. Drag a brick onto your page.
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
        aria-label="Brick catalogs"
        className="min-h-0 flex-1 overflow-y-auto pt-8 pb-6 flex flex-col gap-10"
      >
        {catalogs.map((catalog) => {
          const registries = Object.entries(catalog.registries);
          const firstRegistryEntry = registries[0];

          if (!firstRegistryEntry) {
            return null;
          }

          const [firstRegistryName, firstRegistry] = firstRegistryEntry;
          const selectedRegistryName = selectedRegistries[catalog.catalogName] ?? firstRegistryName;
          const selectedRegistry = catalog.registries[selectedRegistryName] ?? firstRegistry;
          const selectedBrick = selectedRegistry;
          const BrickComponent = selectedBrick.component;

          return (
            <section key={catalog.catalogName} data-catalog-entry={catalog.catalogName}>
              <div className="flex items-start justify-between gap-4 px-6">
                <div>
                  <h2 className="m-0 text-2xl font-semibold">{catalog.catalogLabel}</h2>
                  <p className="mt-1 mb-0 text-sm text-zinc-500">{catalog.catalogDescription}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                  <Tabs.Root value={selectedRegistryName}>
                    <Tabs.List
                      aria-label={`${catalog.catalogLabel} registries`}
                      className="flex gap-2"
                    >
                      {registries.map(([registryName]) => (
                        <Tabs.Trigger
                          key={registryName}
                          value={registryName}
                          onClick={() => {
                            setSelectedRegistries((current) => ({
                              ...current,
                              [catalog.catalogName]: registryName,
                            }));
                          }}
                          className="cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2 data-[state=active]:font-medium data-[state=active]:text-zinc-950 data-[state=active]:no-underline"
                        >
                          {registryName[0].toUpperCase() + registryName.slice(1)}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                  </Tabs.Root>
                </div>
              </div>
              <div className="mt-6 overflow-auto">
                <div className={selectedBrick.def[breakpoint].w === 8 ? undefined : "ml-6"}>
                  <BrickPreviewFrame
                    w={selectedBrick.def[breakpoint].w}
                    h={selectedBrick.def[breakpoint].h}
                  >
                    <div
                      className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                      data-catalog-representative={`${selectedBrick.def.catalogName}/${selectedBrick.def.registry}`}
                      data-brick-drawer-brick-slot
                      data-brick-drawer-catalog-name={selectedBrick.def.catalogName}
                      data-brick-drawer-registry={selectedBrick.def.registry}
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
                        event.dataTransfer.setData("text/plain", selectedBrick.def.registry);
                      }}
                      onDragEnd={() => {
                        useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
                      }}
                    >
                      <BrickComponent breakpoint={breakpoint} data={selectedRegistry.defaultData} />
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
