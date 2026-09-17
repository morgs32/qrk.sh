import { useCallback, useState } from "react";

import { modulesHash } from "@qrk.sh/library";
import { useBrickBreakpoint } from "@qrk.sh/library/BrickBreakpointProvider";
import { BrickPreview } from "@qrk.sh/library/BrickPreview";
import type { IModuleBrickDef } from "@qrk.sh/library";
import { ArrowLeft } from "lucide-react";
import { Tabs } from "radix-ui";
import { href, Link, useParams } from "react-router";

import { CodeText } from "../[username]/site/[siteId]/page/[pageId]/BrickGroup/CodeText";
import { MetadataField } from "../[username]/site/[siteId]/page/[pageId]/BrickGroup/MetadataField";

import { BRICK_DRAG_MIME } from "@/components/home/useBrickDrawerStore";
import { useBricksStoreApi } from "@qrk.sh/library/GridStore";

export default function BrickGroupRoute() {
  const { breakpoint } = useBrickBreakpoint();
  const params = useParams();
  const bricksStore = useBricksStoreApi();
  const { username, siteId, pageId } = params;
  if (!username || !siteId || !pageId) throw new Error("Missing editor route params");
  const { groupName } = params;

  const brickModule = Object.values(modulesHash).find((candidate) => candidate.id === groupName);

  if (!brickModule) {
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

  return (
    <BrickGroupRouteBody
      brickModule={brickModule}
      breakpoint={breakpoint}
      bricksStore={bricksStore}
      pageId={pageId}
      siteId={siteId}
      username={username}
    />
  );
}

function BrickGroupRouteBody(props: {
  brickModule: (typeof modulesHash)[string];
  breakpoint: "sm" | "md" | "lg" | "xl";
  bricksStore: ReturnType<typeof useBricksStoreApi>;
  username: string;
  siteId: string;
  pageId: string;
}) {
  const { brickModule, breakpoint, bricksStore, username, siteId, pageId } = props;
  const BrickComponent = brickModule.component;
  const declared = brickModule.def[breakpoint];
  const declaredW = declared.w;
  const declaredH = declared.h;
  const hasDeclaredSize = declaredW !== undefined && declaredH !== undefined;
  const [measuredUnits, setMeasuredUnits] = useState<{ w: number; h: number }>();
  const onGridUnits = useCallback((size: { w: number; h: number }) => {
    setMeasuredUnits((current) => {
      if (current?.w === size.w && current?.h === size.h) return current;
      return size;
    });
  }, []);

  const w = hasDeclaredSize ? declaredW : (measuredUnits?.w ?? 1);
  const h = hasDeclaredSize ? declaredH : (measuredUnits?.h ?? 1);
  const brickDefForDrag: IModuleBrickDef = {
    ...brickModule.def,
    [breakpoint]: { w, h },
  };

  const surface = (
    <div
      className="size-full qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
      data-brick-full-view={brickModule.def.moduleId}
      data-brick-drawer-brick-slot
      data-brick-drawer-module-id={brickModule.def.moduleId}
      draggable
      onDragStart={(event) => {
        bricksStore.getState().setActiveBrickDrag(structuredClone(brickDefForDrag));
        event.dataTransfer.setData(BRICK_DRAG_MIME, JSON.stringify(brickDefForDrag));
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", brickModule.def.moduleId);
      }}
      onDragEnd={() => {
        bricksStore.getState().setActiveBrickDrag(null);
      }}
    >
      <BrickComponent breakpoint={breakpoint} data={brickModule.defaultData} />
    </div>
  );

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
          <MetadataField label="Module name">{brickModule.label}</MetadataField>
          <MetadataField label="Module ID" className="text-right">
            <CodeText>{brickModule.id}</CodeText>
          </MetadataField>
          <MetadataField label="Module description" className="col-span-2">
            {brickModule.description}
          </MetadataField>
        </dl>
      </div>
      <div className="mt-8 flex flex-col gap-10">
        <section key={brickModule.def.moduleId}>
          <Tabs.Root value={`${brickModule.def.moduleId}-preview`}>
            <div className="flex items-baseline justify-between gap-4 px-6">
              <div>
                <h2 className="m-0 text-2xl">{brickModule.label}</h2>
                <p className="mb-0 mt-1 text-sm text-zinc-500">{brickModule.description}</p>
              </div>
              <div className="flex shrink-0 items-baseline gap-2">
                <Tabs.List
                  className="flex gap-2 text-sm"
                  aria-label={`${brickModule.def.moduleId} preview`}
                >
                  <Tabs.Trigger
                    value={`${brickModule.def.moduleId}-preview`}
                    className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-zinc-950"
                  >
                    {brickModule.label}
                  </Tabs.Trigger>
                </Tabs.List>
              </div>
            </div>
            <Tabs.Content value={`${brickModule.def.moduleId}-preview`}>
              <div className="mt-6 overflow-auto">
                <div className={w === 8 ? undefined : "ml-6"}>
                  {hasDeclaredSize ? (
                    <BrickPreview w={declaredW} h={declaredH}>
                      {surface}
                    </BrickPreview>
                  ) : (
                    <BrickPreview
                      breakpoint={breakpoint}
                      measure={
                        <BrickComponent breakpoint={breakpoint} data={brickModule.defaultData} />
                      }
                      onGridUnits={onGridUnits}
                    >
                      {surface}
                    </BrickPreview>
                  )}
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </section>
      </div>
    </div>
  );
}
