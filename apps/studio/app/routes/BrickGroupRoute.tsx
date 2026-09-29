import { useCallback, useState } from "react";

import { modulesHash } from "@qrk.sh/library";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { makeEffectSchema } from "@zerospin/schema";
import { Result, Schema } from "effect";
import { useWallViewport } from "@qrk.sh/library/WallViewportProvider";
import { BREAKPOINTS, minGridUnits } from "@qrk.sh/library/breakpoints";
import { GridItemPreview } from "@qrk.sh/library/GridItemPreview";
import { MeasuredBrickWrapper } from "@qrk.sh/library/MeasuredBrickWrapper";
import { brickDragStore } from "@qrk.sh/library/GridStore";
import { ArrowLeft } from "lucide-react";
import { Tabs } from "radix-ui";
import { href, Link, useParams } from "react-router";

import { CodeText } from "../[username]/site/[siteId]/page/[pageId]/BrickGroup/CodeText";
import { MetadataField } from "../[username]/site/[siteId]/page/[pageId]/BrickGroup/MetadataField";

import { BRICK_DRAG_MIME } from "@/components/home/useBrickDrawerStore";

export default function BrickGroupRoute() {
  const { activeBreakpoint } = useWallViewport();
  const breakpoint = activeBreakpoint ?? "sm";
  const params = useParams();
  const { username, siteId, pageId } = params;
  if (!username || !siteId || !pageId) throw new Error("Missing editor route params");
  const { groupName } = params;

  const decoded = Schema.decodeUnknownResult(
    makeEffectSchema({ moduleId: libraryModule.models.brick.attributes.moduleId }),
  )({ moduleId: groupName });

  if (Result.isFailure(decoded)) {
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

  const brickModule = modulesHash[decoded.success.moduleId];
  return (
    <BrickGroupRouteBody
      brickModule={brickModule}
      breakpoint={breakpoint}
      pageId={pageId}
      siteId={siteId}
      username={username}
    />
  );
}

function BrickGroupRouteBody(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  breakpoint: "sm" | "md" | "lg" | "xl";
  username: string;
  siteId: string;
  pageId: string;
}) {
  const { brickModule, breakpoint, username, siteId, pageId } = props;
  const BrickComponent = brickModule.component;
  const view = brickModule.viewFor(breakpoint);
  const [measuredUnits, setMeasuredUnits] = useState<
    Partial<Record<(typeof BREAKPOINTS)[number]["id"], { w: number; h: number }>>
  >({});
  const onSizeChange = useCallback(
    (
      targetBreakpoint: (typeof BREAKPOINTS)[number]["id"],
      dimensions: { widthPx: number; heightPx: number },
    ) => {
      const entry = BREAKPOINTS.find((row) => row.id === targetBreakpoint);
      if (entry === undefined) return;
      const nextW = Math.min(8, minGridUnits(entry.gridItemWidth, dimensions.widthPx));
      const nextH = minGridUnits(entry.gridItemWidth, dimensions.heightPx);
      setMeasuredUnits((current) => {
        const measured = current[targetBreakpoint];
        if (measured?.w === nextW && measured.h === nextH) return current;
        return { ...current, [targetBreakpoint]: { w: nextW, h: nextH } };
      });
    },
    [],
  );

  const sizes = BREAKPOINTS.map((entry) => {
    const entryView = brickModule.viewFor(entry.id);
    const measured = measuredUnits[entry.id];
    return entryView.w !== undefined && entryView.h !== undefined
      ? { w: entryView.w, h: entryView.h }
      : measured === undefined
        ? undefined
        : {
            w: Math.min(8, Math.max(measured.w, entryView.minW ?? 1)),
            h: Math.max(measured.h, entryView.minH ?? 1),
          };
  });
  const placementSizes =
    sizes[0] && sizes[1] && sizes[2] && sizes[3]
      ? { sm: sizes[0], md: sizes[1], lg: sizes[2], xl: sizes[3] }
      : null;
  const activeSize = placementSizes?.[breakpoint];
  const w = activeSize?.w ?? view.minW ?? 1;
  const h = activeSize?.h ?? view.minH ?? 1;
  const brickDefForDrag =
    placementSizes === null
      ? null
      : {
          ...brickModule.def,
          w,
          h,
          placementSizes,
          state: structuredClone(brickModule.defaultState),
          spec: structuredClone(view.spec),
        };

  const surface = (
    <div
      className="size-full qrk-bricks brick-drag-surface cursor-grab overflow-hidden active:cursor-grabbing"
      data-brick-full-view={brickModule.def.moduleId}
      data-brick-drawer-brick-slot
      data-brick-drawer-module-id={brickModule.def.moduleId}
      draggable={brickDefForDrag !== null}
      onDragStart={(event) => {
        if (brickDefForDrag === null) {
          event.preventDefault();
          return;
        }
        brickDragStore.getState().setBrickDef(structuredClone(brickDefForDrag));
        event.dataTransfer.setData(BRICK_DRAG_MIME, JSON.stringify(brickDefForDrag));
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", brickModule.def.moduleId);
      }}
      onDragEnd={() => {
        brickDragStore.getState().setBrickDef(null);
      }}
    >
      <div className="brick-drag-content size-full">
        <BrickComponent breakpoint={breakpoint} state={brickModule.defaultState} spec={view.spec} />
      </div>
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
                <div className={w === 8 ? "relative" : "relative ml-6"}>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute overflow-hidden"
                    style={{ width: 0, height: 0 }}
                  >
                    {BREAKPOINTS.map((entry) => {
                      const entryView = brickModule.viewFor(entry.id);
                      if (entryView.w !== undefined && entryView.h !== undefined) return null;
                      return (
                        <MeasuredBrickWrapper
                          key={entry.id}
                          onChange={(dimensions) => onSizeChange(entry.id, dimensions)}
                        >
                          <BrickComponent
                            breakpoint={entry.id}
                            state={brickModule.defaultState}
                            spec={entryView.spec}
                          />
                        </MeasuredBrickWrapper>
                      );
                    })}
                  </div>
                  <GridItemPreview breakpoint={breakpoint} w={w} h={h}>
                    {surface}
                  </GridItemPreview>
                </div>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </section>
      </div>
    </div>
  );
}
