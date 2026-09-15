import { modulesHash } from "@qrk.sh/library";
import { useBrickBreakpoint } from "@qrk.sh/library/BrickBreakpointProvider";
import { ArrowLeft } from "lucide-react";
import { Tabs } from "radix-ui";
import { href, Link, useParams } from "react-router";

import { CodeText } from "../[username]/site/[siteId]/page/[pageId]/BrickGroup/CodeText";
import { MetadataField } from "../[username]/site/[siteId]/page/[pageId]/BrickGroup/MetadataField";

import { BRICK_DRAG_MIME, useBrickDrawerStore } from "@/components/home/useBrickDrawerStore";

/** Bottom drawer is ~half viewport; previews cap at half of that (quarter screen). */
const PREVIEW_MAX_HEIGHT = "25vh";
const PREVIEW_GRID_COLS = 8;

export default function BrickGroupRoute() {
  const { breakpoint, gridWidth } = useBrickBreakpoint();
  const params = useParams();
  const { username, siteId, pageId } = params;
  if (!username || !siteId || !pageId) throw new Error("Missing editor route params");
  const { groupName } = params;

  const module = Object.values(modulesHash).find((candidate) => candidate.id === groupName);

  if (!module) {
    return (
      <div className="p-6" data-testid="module-not-found">
        <h1>Module not found</h1>
        <Link
          to={href("/:username/site/:siteId/page/:pageId/brick-group", {
            username,
            siteId,
            pageId,
          })}
        >
          All modules
        </Link>
      </div>
    );
  }

  const BrickComponent = module.component;
  const w = module.def[breakpoint].w;
  const h = module.def[breakpoint].h;
  const fullW = Math.round((gridWidth / PREVIEW_GRID_COLS) * w);
  const fullH = Math.round((gridWidth / PREVIEW_GRID_COLS) * h);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-6">
      <div className="px-6 pt-6">
        <Link
          to={href("/:username/site/:siteId/page/:pageId/brick-group", {
            username,
            siteId,
            pageId,
          })}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>All modules</span>
        </Link>
        <dl className="mt-5 grid max-w-[500px] grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <MetadataField label="Module name">{module.label}</MetadataField>
          <MetadataField label="Module ID" className="text-right">
            <CodeText>{module.id}</CodeText>
          </MetadataField>
          <MetadataField label="Module description" className="col-span-2">
            {module.description}
          </MetadataField>
        </dl>
      </div>
      <div className="mt-8 flex flex-col gap-10">
        <section key={module.def.moduleId}>
          <Tabs.Root value={`${module.def.moduleId}-preview`}>
            <div className="flex items-baseline justify-between gap-4 px-6">
              <div>
                <h2 className="m-0 text-2xl font-semibold">{module.def.label}</h2>
                <p className="mb-0 mt-1 text-sm text-zinc-500">{module.description}</p>
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                <Tabs.List
                  className="flex gap-2 text-sm"
                  aria-label={`${module.def.moduleId} preview`}
                >
                  <Tabs.Trigger
                    value={`${module.def.moduleId}-preview`}
                    className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-zinc-950"
                  >
                    {module.def.label}
                  </Tabs.Trigger>
                </Tabs.List>
              </div>
            </div>
            <Tabs.Content value={`${module.def.moduleId}-preview`}>
              <div className="mt-6 overflow-auto">
                <div className={w === 8 ? undefined : "ml-6"}>
                  <div
                    className="shrink-0"
                    style={{
                      width: `min(${fullW}px, calc(${w} * ${PREVIEW_MAX_HEIGHT} / ${h}))`,
                      height: `min(${fullH}px, ${PREVIEW_MAX_HEIGHT})`,
                    }}
                  >
                    <div
                      className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                      data-brick-full-view={module.def.moduleId}
                      data-brick-drawer-brick-slot
                      data-brick-drawer-module-id={module.def.moduleId}
                      draggable
                      onDragStart={(event) => {
                        useBrickDrawerStore
                          .getState()
                          .registerActiveBrickDragGridShape(w, h);
                        event.dataTransfer.setData(BRICK_DRAG_MIME, JSON.stringify(module.def));
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("text/plain", module.def.moduleId);
                      }}
                      onDragEnd={() => {
                        useBrickDrawerStore.getState().unregisterActiveBrickDragGridShape();
                      }}
                    >
                      <BrickComponent breakpoint={breakpoint} data={module.defaultData} />
                    </div>
                  </div>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </section>
      </div>
    </div>
  );
}
